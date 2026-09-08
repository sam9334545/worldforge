"""Wind field (Section 9, equation E6).

Local wind is the ambient field modified by roughness, elevation exposure and
orographic wind shadow. No terrain ever gets a flat "good wind" multiplier --
a leeward mountain cell is *worse* than flat ground, which is the point.
"""

from __future__ import annotations

import math

import numpy as np

from .. import terrain as T


def roughness_factor(state, cfg) -> np.ndarray:
    """(z0_ref / z0_cell)^alpha. Smooth ground (sand) accelerates flow slightly;
    rough ground (stone, snow) damps it. [PHYSICS-BASED, log-wind-profile idea]."""
    z0 = T.ROUGHNESS[state.terrain]
    return np.power(cfg.wind.z0_ref_m / np.maximum(z0, 1e-6), cfg.wind.roughness_alpha)


def elevation_factor(state, cfg) -> np.ndarray:
    """Higher ground is more exposed to free-stream wind. Capped, so a tall
    spike cannot produce unbounded speed (RULE-WIND-001 edge case)."""
    mean_elev = float(np.mean(state.elevation))
    bonus = (state.elevation - mean_elev) * cfg.wind.elevation_bonus_per_level
    return 1.0 + np.clip(bonus, -cfg.wind.elevation_bonus_cap, cfg.wind.elevation_bonus_cap)


def shadow_factor(state, wind_dir_deg: float, cfg) -> np.ndarray:
    """RULE-WIND-003. If higher ground sits upwind within R_orographic, this cell
    is in its wind shadow. Decays linearly with distance, zero beyond R."""
    h, w = state.height, state.width
    reduction = np.zeros((h, w), dtype=np.float64)

    # Upwind is the direction the wind comes FROM.
    rad = math.radians(wind_dir_deg)
    ux = math.sin(rad)      # points upwind in +x terms
    uy = -math.cos(rad)
    elev = state.elevation
    R = cfg.wind.shadow_range_cells

    for d in range(1, R + 1):
        dx = int(round(ux * d))
        dy = int(round(uy * d))
        if dx == 0 and dy == 0:
            continue
        upwind = np.roll(np.roll(elev, -dy, axis=0), -dx, axis=1)
        if dy > 0:
            upwind[-dy:, :] = -np.inf
        elif dy < 0:
            upwind[:-dy, :] = -np.inf
        if dx > 0:
            upwind[:, -dx:] = -np.inf
        elif dx < 0:
            upwind[:, :-dx] = -np.inf

        rise = np.clip(upwind - elev, 0.0, None)
        rise = np.where(np.isfinite(rise), rise, 0.0)
        decay = 1.0 - (d - 1) / R
        reduction += rise * cfg.wind.shadow_strength * decay

    # Combined contributions are capped so a long ridge cannot zero the wind.
    return 1.0 - np.clip(reduction, 0.0, 0.85)


def update_wind(state, cfg) -> None:
    """Writes fields.wind_speed and fields.wind_dir.

    The terrain modifiers are pure functions of static elevation and the wind
    bearing, so they are memoised: roughness and elevation exposure never
    change at all, and the wind shadow only changes when the bearing does.
    """
    cache = state.caches
    if "wind_terrain" not in cache:
        cache["wind_terrain"] = roughness_factor(state, cfg) * elevation_factor(state, cfg)

    key = round(state.global_wind_dir)
    shadows = cache.setdefault("wind_shadow", {})
    if key not in shadows:
        if len(shadows) > 512:
            shadows.clear()
        shadows[key] = shadow_factor(state, float(key), cfg)

    v = state.global_wind_speed * cache["wind_terrain"] * shadows[key]
    state.fields.wind_speed = np.clip(v, 0.0, None)
    state.fields.wind_dir = np.full((state.height, state.width),
                                    state.global_wind_dir, dtype=np.float64)


def yaw_efficiency(wind_dir_deg: float, turbine_orientation_deg: float) -> float:
    """cos(yaw misalignment), clipped at 0 (E5, Section 14).

    THIS is what makes turbine orientation matter. A turbine facing 90 degrees
    off the wind produces nothing; one facing directly away produces nothing
    rather than a negative number.
    """
    delta = abs(wind_dir_deg - turbine_orientation_deg) % 360.0
    if delta > 180.0:
        delta = 360.0 - delta
    if delta >= 90.0:
        # Exactly zero at and beyond 90 degrees. Going through math.cos here
        # would return ~6e-17 at 90, and the spec promises a hard zero.
        return 0.0
    return math.cos(math.radians(delta))
