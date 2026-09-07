"""Energy network / wiring (Section 17, equation E18).

What makes wiring a real decision here:

  * Transmission loss uses the length of the ACTUAL cable path walked, found by
    BFS over the cable graph -- not straight-line distance to the zone. A
    winding detour costs more than a clean run, so layout matters.
  * Capacity is enforced per SEGMENT along that path. Two farms sharing one
    trunk congest it and get curtailed; the fix is a fatter or parallel route.
  * A generator with no cable on or beside it injects nothing when grid
    connection is required. Energy generated but not delivered is logged
    separately from energy delivered (Section 35).

Loss uses the compounding form 1 - (1 - k)^d rather than E18's linear d*k. The
linear form goes negative past 1/k cells; this one is bounded in [0,1) and
agrees with E18 to first order for small k. Documented deviation.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field


@dataclass
class DispatchResult:
    generated_kw: float = 0.0
    delivered_kw: float = 0.0
    loss_kw: float = 0.0
    curtailed_kw: float = 0.0
    unconnected_kw: float = 0.0
    congestion_curtailed_kw: float = 0.0
    per_zone: dict = field(default_factory=dict)      # zone_id -> served kw
    segment_flows: dict = field(default_factory=dict) # (x,y) -> kw
    conserved: bool = True

    def check_conservation(self, tol: float = 1e-6) -> bool:
        residual = self.generated_kw - (self.delivered_kw + self.loss_kw + self.curtailed_kw)
        self.conserved = abs(residual) <= max(tol, abs(self.generated_kw) * 1e-9)
        return self.conserved


class GridNetwork:
    """Cable graph, rebuilt whenever the player changes the wiring."""

    def __init__(self, state, cfg):
        self.cfg = cfg
        self.cables = set(state.cables.keys())
        self.zone_paths: dict[int, dict] = {}     # zone_id -> {cable cell: path to zone}
        self._build(state)

    def _build(self, state) -> None:
        """BFS out from each demand zone across the cable graph, keeping the
        predecessor tree so we can recover the real routed path."""
        for zone in state.demand_zones:
            prev: dict = {}
            dist: dict = {}
            q = deque()
            # Seed: any cable on or orthogonally adjacent to a zone cell.
            for (zx, zy) in zone.cells:
                for cx, cy in [(zx, zy)] + list(state.neighbours4(zx, zy)):
                    if (cx, cy) in self.cables and (cx, cy) not in dist:
                        dist[(cx, cy)] = 1
                        prev[(cx, cy)] = None
                        q.append((cx, cy))
            while q:
                cur = q.popleft()
                cx, cy = cur
                for nx, ny in state.neighbours4(cx, cy):
                    if (nx, ny) in self.cables and (nx, ny) not in dist:
                        dist[(nx, ny)] = dist[cur] + 1
                        prev[(nx, ny)] = cur
                        q.append((nx, ny))
            self.zone_paths[zone.id] = {"dist": dist, "prev": prev}

    def _path_to_zone(self, cell, zone_id) -> list | None:
        tree = self.zone_paths.get(zone_id)
        if not tree or cell not in tree["dist"]:
            return None
        path = [cell]
        cur = cell
        while tree["prev"].get(cur) is not None:
            cur = tree["prev"][cur]
            path.append(cur)
        return path

    def _injection_points(self, state, machine) -> list:
        """Cable cells a machine can feed into: its own cell, or a neighbour."""
        pts = []
        if machine.pos in self.cables:
            pts.append(machine.pos)
        for nx, ny in state.neighbours4(machine.x, machine.y):
            if (nx, ny) in self.cables:
                pts.append((nx, ny))
        return pts

    # ------------------------------------------------------------------

    def dispatch(self, state, cfg, outputs: dict) -> DispatchResult:
        """Route each generator's output to demand zones over the real wiring."""
        res = DispatchResult()
        loss_per_cell = cfg.machines.cable.loss_per_cell

        remaining_demand = {z.id: z.demand_kw for z in state.demand_zones}
        for z in state.demand_zones:
            z.served_kw = 0.0
            res.per_zone[z.id] = 0.0

        seg_flow = {c: 0.0 for c in self.cables}
        capacity = {c: state.cables[c].capacity_kw for c in self.cables}

        # Fixed iteration order keeps dispatch reproducible.
        machines = sorted(state.active_machines(), key=lambda m: (m.y, m.x))

        for m in machines:
            gen = outputs.get(m.pos, 0.0)
            m.output_kw = gen
            m.delivered_kw = 0.0
            m.loss_kw = 0.0
            m.curtailed_kw = 0.0
            res.generated_kw += gen
            if gen <= 0.0:
                continue

            remaining = gen

            if not cfg.grid.require_cable_connection:
                # Early-level mode: direct delivery, distance = Manhattan.
                options = []
                for z in state.demand_zones:
                    zx, zy = z.centre
                    d = abs(m.x - zx) + abs(m.y - zy)
                    options.append((1.0 - (1.0 - loss_per_cell) ** d, z.id))
                options.sort()
                for lossfrac, zid in options:
                    if remaining <= 0 or remaining_demand[zid] <= 0:
                        continue
                    inject = min(remaining, remaining_demand[zid] / max(1e-9, 1 - lossfrac))
                    delivered = inject * (1 - lossfrac)
                    remaining -= inject
                    remaining_demand[zid] -= delivered
                    res.per_zone[zid] += delivered
                    res.delivered_kw += delivered
                    res.loss_kw += inject - delivered
                    m.delivered_kw += delivered
                    m.loss_kw += inject - delivered
                res.curtailed_kw += remaining
                m.curtailed_kw = remaining
                continue

            # --- grid-connected mode -------------------------------------
            inj_points = self._injection_points(state, m)
            if not inj_points:
                res.curtailed_kw += remaining
                res.unconnected_kw += remaining
                m.curtailed_kw = remaining
                continue

            # Every (injection point, zone) route this machine could use,
            # cheapest loss first.
            routes = []
            for pt in inj_points:
                for z in state.demand_zones:
                    path = self._path_to_zone(pt, z.id)
                    if path is None:
                        continue
                    d = len(path)
                    routes.append((1.0 - (1.0 - loss_per_cell) ** d, z.id, path))
            if not routes:
                res.curtailed_kw += remaining
                res.unconnected_kw += remaining
                m.curtailed_kw = remaining
                continue
            routes.sort(key=lambda r: (r[0], r[1]))

            blocked_by_congestion = 0.0
            for lossfrac, zid, path in routes:
                if remaining <= 1e-9:
                    break
                if remaining_demand[zid] <= 1e-9:
                    continue
                headroom = min(capacity[c] - seg_flow[c] for c in path)
                if headroom <= 1e-9:
                    blocked_by_congestion = remaining
                    continue
                want = min(remaining, remaining_demand[zid] / max(1e-9, 1 - lossfrac))
                inject = min(want, headroom)
                delivered = inject * (1 - lossfrac)

                for c in path:
                    seg_flow[c] += inject

                remaining -= inject
                remaining_demand[zid] -= delivered
                res.per_zone[zid] += delivered
                res.delivered_kw += delivered
                res.loss_kw += inject - delivered
                m.delivered_kw += delivered
                m.loss_kw += inject - delivered
                blocked_by_congestion = 0.0

            res.curtailed_kw += remaining
            m.curtailed_kw = remaining
            if blocked_by_congestion > 0:
                res.congestion_curtailed_kw += min(remaining, blocked_by_congestion)

        for c, flow in seg_flow.items():
            state.cables[c].flow_kw = flow
            state.cables[c].utilisation = flow / max(1e-9, capacity[c])
        res.segment_flows = seg_flow

        for z in state.demand_zones:
            z.served_kw = res.per_zone[z.id]
            z.unserved_kw = max(0.0, z.demand_kw - z.served_kw)

        res.check_conservation()
        return res
