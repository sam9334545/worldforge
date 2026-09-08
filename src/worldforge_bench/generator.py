"""Procedural map generation (Section 33: same rules, freely regenerable layout).

Physical constants never vary with the seed. Only the layout does -- which is
exactly what makes the train/held-out split in the benchmark meaningful.
"""

from __future__ import annotations

import numpy as np

from . import terrain as T
from .prng import Prng
from .world import DemandZone, WorldState


def _smooth(field: np.ndarray, passes: int = 4) -> np.ndarray:
    out = field.copy()
    for _ in range(passes):
        padded = np.pad(out, 1, mode="edge")
        out = (padded[:-2, 1:-1] + padded[2:, 1:-1]
               + padded[1:-1, :-2] + padded[1:-1, 2:]
               + 4.0 * out) / 8.0
    return out


def _build_elevation(prng: Prng, h: int, w: int, n_ridges: int) -> np.ndarray:
    base = _smooth(prng.field((h, w)), passes=5)

    # Ridges give the map real windward/leeward structure to reason about.
    for _ in range(n_ridges):
        rx = prng.integers(2, max(3, w - 2))
        ry = prng.integers(2, max(3, h - 2))
        length = prng.integers(max(3, h // 3), max(4, h - 2))
        angle = prng.uniform(0, np.pi)
        dx, dy = np.cos(angle), np.sin(angle)
        for step in range(length):
            cx = int(round(rx + dx * step))
            cy = int(round(ry + dy * step))
            if not (0 <= cx < w and 0 <= cy < h):
                break
            for oy in range(-2, 3):
                for ox in range(-2, 3):
                    nx, ny = cx + ox, cy + oy
                    if 0 <= nx < w and 0 <= ny < h:
                        falloff = max(0.0, 1.0 - (abs(ox) + abs(oy)) / 3.0)
                        base[ny, nx] += 0.55 * falloff

    base = _smooth(base, passes=2)
    lo, hi = base.min(), base.max()
    norm = (base - lo) / max(hi - lo, 1e-9)
    return norm * 5.0                        # 0..5 elevation levels


def _carve_river(prng: Prng, elev: np.ndarray, terrain: np.ndarray) -> list:
    """Start high, walk strictly downhill to an edge. Forcing a monotonic
    descent is what gives downstream hydro real hydraulic head (E16)."""
    h, w = elev.shape
    start_candidates = np.dstack(np.unravel_index(
        np.argsort(-elev, axis=None)[: max(4, (h * w) // 20)], (h, w)))[0]
    sy, sx = start_candidates[prng.integers(0, len(start_candidates))]

    path = []
    x, y = int(sx), int(sy)
    guard = 0
    while guard < h * w:
        guard += 1
        path.append((x, y))
        if x in (0, w - 1) or y in (0, h - 1):
            break
        best, best_e = None, elev[y, x]
        for dx, dy in ((0, -1), (1, 0), (0, 1), (-1, 0)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and elev[ny, nx] < best_e:
                best_e, best = elev[ny, nx], (nx, ny)
        if best is None:
            # Local minimum: carve through so the river keeps descending.
            opts = [(x + dx, y + dy) for dx, dy in ((0, -1), (1, 0), (0, 1), (-1, 0))
                    if 0 <= x + dx < w and 0 <= y + dy < h and (x + dx, y + dy) not in path]
            if not opts:
                break
            best = opts[prng.integers(0, len(opts))]
            elev[best[1], best[0]] = max(0.0, elev[y, x] - 0.35)
        x, y = best

    for (px, py) in path:
        terrain[py, px] = T.WATER.id
    return path


def generate(seed: int, cfg) -> WorldState:
    prng = Prng(seed)
    w, h = cfg.world.width, cfg.world.height

    elev = _build_elevation(prng, h, w, cfg.world.n_mountain_ridges)
    terrain = np.full((h, w), T.GRASS.id, dtype=np.int32)

    # Moisture proxy decides sand vs mud on the low ground.
    moisture = _smooth(prng.field((h, w)), passes=4)
    moisture = (moisture - moisture.min()) / max(moisture.max() - moisture.min(), 1e-9)

    terrain[elev >= 4.3] = T.SNOW.id
    terrain[(elev >= 3.0) & (elev < 4.3)] = T.STONE.id
    terrain[(elev >= 2.2) & (elev < 3.0)] = T.GRAVEL.id
    low = elev < 2.2
    terrain[low & (moisture < 0.30)] = T.SAND.id
    terrain[low & (moisture > 0.70)] = T.MUD.id

    river = _carve_river(prng, elev, terrain)

    # Elevation is authoritative from here; snap it to the terrain's own band so
    # the static table and the generated relief agree.
    elev = np.round(elev).astype(np.float64)
    elev[terrain == T.WATER.id] = np.minimum(elev[terrain == T.WATER.id], 2.0)

    # Give the river a continuous descending bed. Without this, rounding
    # elevation to integers leaves long flat runs with zero head, so hydro is
    # legal-but-useless on most water cells.
    bed = elev.astype(np.float64).copy()
    if river:
        drop_per_cell = 0.35
        start = float(bed[river[0][1], river[0][0]])
        for i, (rx, ry) in enumerate(river):
            bed[ry, rx] = max(0.0, start - i * drop_per_cell)

    channel_width = np.full((h, w), cfg.water.channel_width_m)
    channel_depth = np.full((h, w), cfg.water.channel_depth_m)

    state = WorldState(
        seed=seed, width=w, height=h,
        terrain=terrain, elevation=elev, bed=bed,
        channel_width=channel_width, channel_depth=channel_depth,
    )

    # Demand zones on buildable low ground, spread apart.
    zones = []
    placed: list[tuple[int, int]] = []
    tiers = (("urban", 5200.0), ("industrial", 7400.0), ("rural", 2100.0))
    attempts = 0
    while len(zones) < cfg.world.n_demand_zones and attempts < 600:
        attempts += 1
        zx, zy = prng.integers(1, w - 1), prng.integers(1, h - 1)
        if terrain[zy, zx] in (T.WATER.id, T.SNOW.id, T.STONE.id):
            continue
        if any(abs(zx - px) + abs(zy - py) < max(4, w // 4) for px, py in placed):
            continue
        placed.append((zx, zy))
        cells = [(zx, zy)] + [(nx, ny) for nx, ny in state.neighbours4(zx, zy)][:2]
        tier, demand = tiers[len(zones) % len(tiers)]
        zones.append(DemandZone(id=len(zones), cells=cells,
                                base_demand_kw=demand, tier=tier))
    state.demand_zones = zones

    # Seed the dynamic layer so tick 1 does not read zeros.
    state.fields.soil_moisture = T.MOISTURE_CAP[terrain] * 0.35
    state.fields.cloud = np.full((h, w), cfg.weather.base_cloud[0])
    state.global_wind_speed = cfg.weather.base_wind_ms[0]
    state.global_wind_dir = 270.0
    return state
