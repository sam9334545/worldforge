"""Water cycle and river flow (Sections 11-12, equations E7, E10, E11, E14-E16).

Mass balance is an invariant, not an aspiration: for every land cell and every
tick, precipitation + snowmelt == evaporation + infiltration + runoff + storage
delta. engine.py asserts this when audit mode is on.
"""

from __future__ import annotations

import numpy as np

from .. import terrain as T

G = 9.81
RHO_WATER = 1000.0


class FlowRouter:
    """Precomputed drainage graph.

    Elevation is static (Layer A), so the downhill routing never changes and is
    built once at map generation. Ties break N>E>S>W (RULE-WATER-002), which is
    what keeps runoff routing reproducible.
    """

    def __init__(self, state):
        h, w = state.height, state.width
        self.h, self.w = h, w
        self.downstream = np.full((h, w, 2), -1, dtype=np.int32)

        surf = state.elevation
        for y in range(h):
            for x in range(w):
                best = None
                best_elev = surf[y, x]
                for nx, ny in state.neighbours4(x, y):   # already N>E>S>W
                    if surf[ny, nx] < best_elev - 1e-12:
                        best_elev = surf[ny, nx]
                        best = (nx, ny)
                if best is not None:
                    self.downstream[y, x] = best

        # Descending-elevation order is a valid topological order for a graph
        # where every edge strictly decreases elevation.
        order = np.argsort(-surf, axis=None, kind="stable")
        self.order = [(int(i % w), int(i // w)) for i in order]

        # Flat (source, destination) steps, split by land/water, precomputed
        # once. The tick loop then walks plain Python ints over 1-D arrays
        # instead of doing 2-D numpy indexing per cell -- same result, far less
        # per-tick overhead.
        is_water = T.IS_WATER[state.terrain]
        self.land_steps = []
        self.water_steps = []
        for (x, y) in self.order:
            flat = y * w + x
            dx, dy = self.downstream[y, x]
            dst = -1 if dx < 0 else int(dy) * w + int(dx)
            if is_water[y, x]:
                dst_is_water = dst >= 0 and bool(is_water[dst // w, dst % w])
                self.water_steps.append((flat, dst if dst_is_water else -1))
            else:
                self.land_steps.append((flat, dst))
        self.water_flat = np.array([f for f, _ in self.water_steps], dtype=np.int64)

    def is_sink(self, x: int, y: int) -> bool:
        return self.downstream[y, x, 0] < 0


def update_water_cycle(state, cfg, router: FlowRouter) -> dict:
    """Evaporation / infiltration / runoff per cell, then river routing.

    Returns an audit dict for the mass-balance test.
    """
    f = state.fields
    h, w = state.height, state.width

    perm = T.PERMEABILITY[state.terrain].copy()
    for (x, y), ovs in state.overlays.items():
        if "gravel" in ovs:
            perm[y, x] = min(1.0, perm[y, x] + 0.15)
    cap = T.MOISTURE_CAP[state.terrain]
    is_water = T.IS_WATER[state.terrain]

    # Water available at the surface this tick.
    available = f.precipitation + f.soil_moisture

    # E7 evaporation. Temperature factor is a smooth ramp, 0 at freezing.
    t_factor = np.clip((f.temperature + 5.0) / 30.0, 0.0, 2.0)
    evap = cfg.water.k_evap * t_factor * (1.0 - f.humidity) * available
    evap = np.minimum(evap, available)

    remaining = available - evap

    # E10 infiltration, bounded by how much the soil can still hold.
    headroom = np.clip(cap - f.soil_moisture, 0.0, None)
    infil = np.minimum(remaining, perm * cfg.water.k_infiltration)
    infil = np.minimum(infil, headroom)
    infil = np.where(is_water, 0.0, infil)

    # E11 runoff is the mass-balance remainder -- never computed independently.
    runoff = np.clip(remaining - infil, 0.0, None)

    f.soil_moisture = np.clip(f.soil_moisture + infil - evap * 0.25, 0.0, cap)
    f.runoff = runoff

    audit = {
        "available": float(available.sum()),
        "evap": float(evap.sum()),
        "infil": float(infil.sum()),
        "runoff": float(runoff.sum()),
    }

    _route_rivers(state, cfg, router, runoff)
    return audit


def _route_rivers(state, cfg, router: FlowRouter, runoff: np.ndarray) -> None:
    """E14: accumulate land runoff downhill, then propagate Q through water
    cells in topological order. E15 gives velocity, E16 the head."""
    f = state.fields
    h, w = state.height, state.width
    is_water = T.IS_WATER[state.terrain]

    carried = (runoff * cfg.water.runoff_to_flow_gain).ravel()

    # One pass, high ground first, so every cell's upstream is already resolved.
    for src, dst in router.land_steps:
        if dst >= 0:
            carried[dst] += carried[src]
        carried[src] = 0.0                 # a sink with dst < 0 simply pools

    # River Q: baseflow + local inflow + everything upstream. Tributaries sum
    # at the confluence because upstream cells are visited first.
    q = np.zeros(h * w, dtype=np.float64)
    q[router.water_flat] = cfg.water.baseflow_m3s
    for src, dst in router.water_steps:
        q[src] += carried[src]
        if dst >= 0:
            q[dst] += q[src]

    q = q.reshape(h, w)
    f.flow_q = q

    # E15 velocity = Q / (width x depth), capped at channel capacity.
    area = np.maximum(state.channel_width * state.channel_depth, 1e-6)
    f.velocity = np.where(is_water, np.clip(q / area, 0.0, 12.0), 0.0)

    # Water level rises with flow, bounded by basin capacity (overflow rule).
    f.water_level = np.where(
        is_water,
        np.clip(q / (state.channel_width * 6.0), 0.0, cfg.water.basin_capacity_m),
        0.0,
    )

    # E16 head: the surface drop across this cell, upstream face to downstream.
    surf = state.elevation * cfg.water.head_per_elevation_m + f.water_level
    flat_surf = surf.ravel()
    head = np.zeros(h * w, dtype=np.float64)
    for src, dst in router.water_steps:
        if dst >= 0:                       # a lake / stagnant cell has no head
            head[src] = max(0.0, flat_surf[src] - flat_surf[dst])
    f.head = head.reshape(h, w)


def hydro_power_kw(q_m3s: float, head_m: float, efficiency: float, cfg) -> float:
    """E17: P = rho * g * Q * H * eta. Hard floors on Q and H (RULE-HYDRO-001)
    stop a near-dry riverbed from being farmed, and there is no division."""
    spec = cfg.machines.hydro
    if q_m3s < spec.q_min_m3s or head_m < spec.h_min_m:
        return 0.0
    return (RHO_WATER * G * q_m3s * head_m * efficiency) / 1000.0
