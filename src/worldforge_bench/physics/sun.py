"""Sun / solar model (Section 8, equations E1-E3).

Panel azimuth and tilt are load-bearing here: cos(incidence) is computed from
the real sun vector against the real panel normal, so pointing a panel wrongly
costs you output. It is never a flat terrain bonus.
"""

from __future__ import annotations

import math

import numpy as np

ELEVATION_UNIT_M = 30.0     # metres of relief per elevation level


def solar_position(day_of_year: int, hour: float, cfg) -> tuple[float, float]:
    """Return (elevation_deg, azimuth_deg). Standard solar geometry,
    [PHYSICS-BASED, simplified] -- no equation of time, no refraction."""
    lat = math.radians(cfg.world.latitude_deg)
    days_per_year = cfg.time.days_per_year

    decl = math.radians(cfg.solar.axial_tilt_deg) * math.sin(
        2.0 * math.pi * (day_of_year - 80.0) / days_per_year
    )
    hour_angle = math.radians(15.0 * (hour - 12.0))

    sin_elev = (math.sin(lat) * math.sin(decl)
                + math.cos(lat) * math.cos(decl) * math.cos(hour_angle))
    sin_elev = max(-1.0, min(1.0, sin_elev))
    elev = math.asin(sin_elev)

    cos_elev = math.cos(elev)
    if abs(cos_elev) < 1e-9:
        azimuth = 180.0
    else:
        cos_az = (math.sin(decl) - math.sin(elev) * math.sin(lat)) / (cos_elev * math.cos(lat))
        cos_az = max(-1.0, min(1.0, cos_az))
        azimuth = math.degrees(math.acos(cos_az))
        if hour_angle > 0:                 # afternoon -> west of south
            azimuth = 360.0 - azimuth
    return math.degrees(elev), azimuth


def base_irradiance(sun_elevation_deg: float, cfg) -> float:
    """E1: I = I_max * max(0, sin(elevation)). Zero at night, never negative."""
    return cfg.solar.i_max_w_m2 * max(0.0, math.sin(math.radians(sun_elevation_deg)))


def terrain_obstruction(state, sun_elev_deg: float, sun_az_deg: float, cfg) -> np.ndarray:
    """Deterministic ray-cast on the elevation grid (Section 8).

    Walks up-sun from every cell; a neighbour blocks it if that neighbour rises
    above the sun ray's height at that distance. Returns 1.0 (clear) .. 0.0.
    """
    h, w = state.height, state.width
    out = np.ones((h, w), dtype=np.float64)
    if sun_elev_deg <= 0.0:
        return out                      # night: obstruction is moot, I is already 0

    # Unit step toward the sun. Azimuth 0=N, 90=E, 180=S, 270=W; y grows south.
    az = math.radians(sun_az_deg)
    step_x = math.sin(az)
    step_y = -math.cos(az)

    tan_elev = math.tan(math.radians(max(sun_elev_deg, 1.0)))
    cell_m = cfg.world.cell_size_m
    elev = state.elevation

    for d in range(1, cfg.solar.shadow_range_cells + 1):
        dx = int(round(step_x * d))
        dy = int(round(step_y * d))
        if dx == 0 and dy == 0:
            continue
        shifted = np.roll(np.roll(elev, -dy, axis=0), -dx, axis=1)
        # Cells rolled in from the far edge are not real neighbours -> mask them.
        if dy > 0:
            shifted[-dy:, :] = -np.inf
        elif dy < 0:
            shifted[:-dy, :] = -np.inf
        if dx > 0:
            shifted[:, -dx:] = -np.inf
        elif dx < 0:
            shifted[:, :-dx] = -np.inf

        # Height the ray has climbed by distance d, in elevation levels.
        ray_rise = (d * cell_m * tan_elev) / ELEVATION_UNIT_M
        blocking = shifted - (elev + ray_rise)          # >0 means it blocks
        shade = np.clip(blocking, 0.0, 2.0) / 2.0       # soft edge over 2 levels
        out = np.minimum(out, 1.0 - shade)

    return np.clip(out, 0.0, 1.0)


def cloud_attenuation(cloud_field: np.ndarray, cfg) -> np.ndarray:
    """Multiplied into effective irradiance, never applied as a terrain penalty."""
    return np.clip(1.0 - cloud_field * cfg.solar.k_atten, 0.0, 1.0)


def incidence_factor(sun_elev_deg: float, sun_az_deg: float,
                     panel_az_deg: float, panel_tilt_deg: float) -> float:
    """cos of the angle between the sun vector and the panel normal.

    [PHYSICS-BASED]. Clipped at 0 -- a panel facing away produces nothing, never
    a negative number. This is what makes SET_ORIENTATION matter for solar.
    """
    if sun_elev_deg <= 0.0:
        return 0.0
    elev = math.radians(sun_elev_deg)
    tilt = math.radians(panel_tilt_deg)
    delta_az = math.radians(sun_az_deg - panel_az_deg)
    cos_inc = (math.cos(tilt) * math.sin(elev)
               + math.sin(tilt) * math.cos(elev) * math.cos(delta_az))
    return max(0.0, cos_inc)


# Obstruction is quantised to this many degrees before caching. The shadow
# field is a step function of the ray geometry anyway (it rounds the ray step to
# whole cells), so sub-degree resolution buys nothing.
_OBSTRUCTION_BUCKET_DEG = 1.0


def update_irradiance(state, cfg) -> None:
    """Writes state.fields.irradiance (the per-cell effective irradiance before
    the panel-incidence term, which is per-machine).

    The obstruction ray-cast depends only on static elevation and the sun's
    position, and the sun repeats its arc daily, so results are memoised per
    (elevation, azimuth) bucket.
    """
    i0 = base_irradiance(state.sun_elevation, cfg)
    if i0 <= 0.0:
        # Night: no rays to cast, and irradiance is zero regardless.
        state.fields.obstruction = np.ones((state.height, state.width))
        state.fields.irradiance = np.zeros((state.height, state.width))
        return

    b = _OBSTRUCTION_BUCKET_DEG
    key = (round(state.sun_elevation / b), round(state.sun_azimuth / b))
    cache = state.caches.setdefault("obstruction", {})
    if key not in cache:
        if len(cache) > 4096:
            cache.clear()
        cache[key] = terrain_obstruction(state, key[0] * b, key[1] * b, cfg)
    obstruction = cache[key]

    atten = cloud_attenuation(state.fields.cloud, cfg)
    state.fields.obstruction = obstruction
    state.fields.irradiance = i0 * obstruction * atten
