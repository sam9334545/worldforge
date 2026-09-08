"""Machine outputs (Section 14, equations E3, E4, E5, E17).

Every output traces through the physics chain. There is no per-terrain energy
bonus anywhere in this file -- "sand = good solar" and "mountain = good wind"
are both false in this model, by construction (Section 41).
"""

from __future__ import annotations

import numpy as np

from .physics import sun as sun_mod
from .physics import water as water_mod
from .physics.wind import yaw_efficiency


def solar_output_kw(machine, state, cfg) -> float:
    """E3: P = I_eff * area * efficiency * cos(incidence) * health.

    Panel azimuth and tilt enter through cos(incidence), so orientation is a
    real decision with a real cost for getting it wrong.
    """
    spec = cfg.machines.get(machine.kind)
    i_eff = float(state.fields.irradiance[machine.y, machine.x])
    if i_eff <= 0.0:
        return 0.0

    cos_inc = sun_mod.incidence_factor(
        state.sun_elevation, state.sun_azimuth, machine.orientation, machine.tilt
    )
    if cos_inc <= 0.0:
        return 0.0

    watts = i_eff * spec.panel_area_m2 * spec.panel_efficiency * cos_inc
    out = (watts / 1000.0) * machine.health

    if machine.kind == "floating_solar":
        # Cooler water surface lifts cell efficiency slightly. Small, documented,
        # physically motivated -- not a hidden multiplier.
        t = float(state.fields.temperature[machine.y, machine.x])
        out *= 1.0 + max(0.0, (25.0 - t)) * 0.0012
    return max(0.0, out)


def wind_output_kw(machine, state, cfg) -> float:
    """E4 + E5: P = clip(0.5 * rho * A * v^3 * eta * cos(yaw), 0, rated).

    Output is hard-zero outside [cut_in, cut_out] and saturates at rated power,
    which is the standard turbine curve. The cos(yaw) term is what makes
    SET_ORIENTATION worth issuing.
    """
    spec = cfg.machines.wind
    v = float(state.fields.wind_speed[machine.y, machine.x])
    if v < spec.cut_in_ms or v > spec.cut_out_ms:
        return 0.0

    wind_dir = float(state.fields.wind_dir[machine.y, machine.x])
    yaw = yaw_efficiency(wind_dir, machine.orientation)
    if yaw <= 0.0:
        return 0.0

    swept = np.pi * (spec.rotor_diameter_m / 2.0) ** 2
    p_avail_kw = 0.5 * cfg.wind.air_density_kg_m3 * swept * (v ** 3) / 1000.0
    out = min(spec.rated_power_kw, p_avail_kw * spec.efficiency * yaw)
    return max(0.0, out * machine.health)


def hydro_output_kw(machine, state, cfg) -> float:
    """E17 with the real head from the drainage graph, not a coordinate proxy."""
    spec = cfg.machines.hydro
    q = float(state.fields.flow_q[machine.y, machine.x])
    head = float(state.fields.head[machine.y, machine.x])
    raw = water_mod.hydro_power_kw(q, head, spec.efficiency, cfg)
    return raw * machine.health


def machine_output_kw(machine, state, cfg) -> float:
    if machine.retired or machine.health <= 0.0:
        return 0.0
    if machine.kind in ("land_solar", "floating_solar"):
        return solar_output_kw(machine, state, cfg)
    if machine.kind == "wind":
        return wind_output_kw(machine, state, cfg)
    if machine.kind == "hydro":
        return hydro_output_kw(machine, state, cfg)
    return 0.0


def nameplate_kw(kind: str, cfg) -> float:
    """Rated capacity, used for capacity-factor and valuation maths."""
    spec = cfg.machines.get(kind)
    if kind in ("land_solar", "floating_solar"):
        return spec.panel_area_m2 * spec.panel_efficiency * cfg.solar.i_max_w_m2 / 1000.0
    if kind == "wind":
        return spec.rated_power_kw
    if kind == "hydro":
        return 900.0
    return 0.0


def best_orientation(machine_kind: str, state, x: int, y: int, cfg) -> float:
    """The orientation that maximises output right now.

    Exposed to agents through the API as a *hint* (and used by the heuristic
    baseline). It is deliberately the answer to the current tick only -- wind
    veers, so an agent that trusts it blindly will chase its own tail.
    """
    if machine_kind == "wind":
        return float(state.fields.wind_dir[y, x])
    if machine_kind in ("land_solar", "floating_solar"):
        # Face the equator; for a northern-hemisphere latitude that is due south.
        return 180.0 if cfg.world.latitude_deg >= 0 else 0.0
    return 180.0
