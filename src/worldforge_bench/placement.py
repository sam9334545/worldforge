"""CAN_PLACE (Section 15). Fail-fast, first failing check is the returned reason.

Invalid states are prevented here rather than resolved at runtime (Section 35),
so the engine never has to reconcile two machines on one cell. Every INVALID
carries a specific, human-readable reason -- generic failures are a bug.
"""

from __future__ import annotations

from dataclasses import dataclass

from . import terrain as T


@dataclass(frozen=True)
class PlacementResult:
    valid: bool
    reason: str = ""

    def __bool__(self) -> bool:
        return self.valid


VALID = PlacementResult(True, "ok")


def _invalid(msg: str) -> PlacementResult:
    return PlacementResult(False, msg)


def can_place(state, kind: str, x: int, y: int, cfg) -> PlacementResult:
    if not state.in_bounds(x, y):
        return _invalid(f"({x},{y}) is outside the {state.width}x{state.height} grid")

    if kind == "cable":
        return _can_place_cable(state, x, y, cfg)

    if (x, y) in state.machines and not state.machines[(x, y)].retired:
        existing = state.machines[(x, y)].kind
        return _invalid(f"cell ({x},{y}) already holds a {existing}")

    tt = state.terrain_at(x, y)

    # 1. Terrain compatibility
    if kind not in tt.allowed_machines:
        allowed = ", ".join(sorted(tt.allowed_machines)) or "nothing"
        return _invalid(
            f"{kind} cannot be built on {tt.name}; that terrain allows: {allowed}")

    # 2/3. Effective stability, after any reinforcement overlay
    spec = cfg.machines.get(kind)
    if spec.min_stability > 0.0:
        eff = state.effective_stability(x, y, cfg)
        if eff < spec.min_stability - 1e-9:
            base = float(T.STABILITY[state.terrain[y, x]])
            ovs = state.overlays_at(x, y)
            extra = f" (base {base:.2f} + overlays {ovs})" if ovs else f" (unreinforced {tt.name})"
            return _invalid(
                f"{kind} requires stability >= {spec.min_stability:.2f}, "
                f"cell has {eff:.2f}{extra}")

    # 4. Water compatibility
    if kind == "hydro":
        q = float(state.fields.flow_q[y, x])
        if q < cfg.machines.hydro.q_min_m3s:
            return _invalid(
                f"hydro requires flow >= {cfg.machines.hydro.q_min_m3s} m3/s, "
                f"cell has {q:.2f}")
    if kind == "floating_solar":
        vel = float(state.fields.velocity[y, x])
        if vel > cfg.machines.v_float_max_ms:
            return _invalid(
                f"floating solar requires velocity <= {cfg.machines.v_float_max_ms} m/s, "
                f"cell has {vel:.2f} (fast river would destabilise the platform)")

    # 5. Slope / clearance
    elev = state.elevation[y, x]
    neighbour_elevs = [state.elevation[ny, nx] for nx, ny in state.neighbours8(x, y)]
    if neighbour_elevs:
        max_drop = max(abs(elev - e) for e in neighbour_elevs)
        if max_drop > cfg.machines.max_slope_levels:
            return _invalid(
                f"slope too steep at ({x},{y}): {max_drop:.0f} elevation levels "
                f"to a neighbour, limit is {cfg.machines.max_slope_levels}")

    # 6. Turbine wake separation
    if kind == "wind":
        r = cfg.machines.wake_radius_cells
        for (mx, my), m in state.machines.items():
            if m.retired or m.kind != "wind":
                continue
            if abs(mx - x) <= r and abs(my - y) <= r:
                return _invalid(
                    f"wind turbine at ({mx},{my}) is within the wake radius "
                    f"of {r} cells; turbines would shadow each other")

    # 7. Hydro density on one water segment
    if kind == "hydro":
        d = cfg.machines.hydro_density_cells
        for (mx, my), m in state.machines.items():
            if m.retired or m.kind != "hydro":
                continue
            if abs(mx - x) + abs(my - y) < d:
                return _invalid(
                    f"hydro turbine at ({mx},{my}) is within {d} cells; they would "
                    f"compete for the same head and flow")

    return VALID


def _can_place_cable(state, x: int, y: int, cfg) -> PlacementResult:
    if (x, y) in state.cables:
        return _invalid(f"cell ({x},{y}) already has cable")
    tt = state.terrain_at(x, y)
    if "cable" not in tt.allowed_machines:
        return _invalid(f"cable cannot cross {tt.name}")
    eff = state.effective_stability(x, y, cfg)
    if eff < cfg.machines.cable.min_stability - 1e-9:
        return _invalid(
            f"cable requires stability >= {cfg.machines.cable.min_stability:.2f}, "
            f"cell has {eff:.2f}")
    return VALID


def can_reinforce(state, x: int, y: int, overlay: str, cfg) -> PlacementResult:
    if not state.in_bounds(x, y):
        return _invalid(f"({x},{y}) is outside the grid")
    if overlay not in T.OVERLAY_ON:
        return _invalid(f"unknown overlay '{overlay}'; try: gravel, stone")
    tt = state.terrain_at(x, y)
    if tt.code not in T.OVERLAY_ON[overlay]:
        return _invalid(f"{overlay} cannot overlay {tt.name}")
    if overlay in state.overlays_at(x, y):
        return _invalid(f"({x},{y}) already has a {overlay} overlay")
    return VALID
