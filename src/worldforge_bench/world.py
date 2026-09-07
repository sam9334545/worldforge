"""WorldState (Section 25) with the five layers of Section 3 kept strictly separate.

  A. static   -- terrain ids, elevation. Fixed at generation.
  B. dynamic  -- weather/hydrology fields, rewritten every tick.
  C. objects  -- machines, cables, overlays placed by the player.
  D. derived  -- per-tick physical results (irradiance, local wind, outputs).
  E. economic -- ledger/market, computed only after D.

No layer may be read backwards (E never feeds D, D never feeds A/B). The tick
order in engine.py is what enforces this.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from . import terrain as T


@dataclass
class Machine:
    """Layer C. A placed generator, plus its own static and dynamic sub-state."""
    kind: str                 # land_solar | floating_solar | wind | hydro
    x: int
    y: int
    orientation: float = 180.0   # yaw bearing 0-359 (wind: rotor axis; solar: azimuth faced)
    tilt: float = 30.0           # panel tilt from horizontal, solar only
    commissioned_tick: int = 0
    age_years: float = 0.0
    health: float = 1.0
    capex_paid: float = 0.0
    retired: bool = False
    # derived, rewritten each tick
    output_kw: float = 0.0
    delivered_kw: float = 0.0
    curtailed_kw: float = 0.0
    loss_kw: float = 0.0
    lifetime_mwh: float = 0.0
    lifetime_revenue: float = 0.0

    @property
    def pos(self) -> tuple[int, int]:
        return (self.x, self.y)


@dataclass
class Cable:
    """Layer C. One segment of the wiring network."""
    x: int
    y: int
    capacity_kw: float
    commissioned_tick: int = 0
    capex_paid: float = 0.0
    # derived
    flow_kw: float = 0.0
    utilisation: float = 0.0


@dataclass
class DemandZone:
    id: int
    cells: list[tuple[int, int]]
    base_demand_kw: float
    tier: str = "urban"
    # derived per tick
    demand_kw: float = 0.0
    served_kw: float = 0.0
    unserved_kw: float = 0.0

    @property
    def centre(self) -> tuple[int, int]:
        xs = [c[0] for c in self.cells]
        ys = [c[1] for c in self.cells]
        return (int(round(sum(xs) / len(xs))), int(round(sum(ys) / len(ys))))


@dataclass
class Fields:
    """Layer B + D. Every per-cell array, shape (height, width)."""
    wind_speed: np.ndarray
    wind_dir: np.ndarray
    temperature: np.ndarray
    cloud: np.ndarray
    humidity: np.ndarray
    soil_moisture: np.ndarray
    water_level: np.ndarray
    flow_q: np.ndarray
    velocity: np.ndarray
    irradiance: np.ndarray
    obstruction: np.ndarray
    head: np.ndarray
    runoff: np.ndarray
    precipitation: np.ndarray

    @classmethod
    def zeros(cls, h: int, w: int) -> "Fields":
        z = lambda: np.zeros((h, w), dtype=np.float64)
        return cls(z(), z(), z(), z(), z(), z(), z(), z(), z(), z(),
                   np.ones((h, w)), z(), z(), z())


@dataclass
class WorldState:
    seed: int
    width: int
    height: int

    # Layer A -- static
    terrain: np.ndarray            # int ids into T.TERRAIN_TYPES
    elevation: np.ndarray          # float, from terrain + ridge generation
    channel_width: np.ndarray
    channel_depth: np.ndarray

    # Layer C -- player objects
    overlays: dict = field(default_factory=dict)      # (x,y) -> list[str]
    machines: dict = field(default_factory=dict)      # (x,y) -> Machine
    cables: dict = field(default_factory=dict)        # (x,y) -> Cable
    demand_zones: list = field(default_factory=list)

    # Layer B/D -- fields
    fields: Fields = None

    # Clock
    tick: int = 0
    hour: int = 0
    day: int = 0
    season: int = 0                # 0 Spring 1 Summer 2 Autumn 3 Winter
    year: int = 0

    # Global weather scalars (Layer B)
    global_wind_speed: float = 8.0
    global_wind_dir: float = 270.0
    sun_elevation: float = 0.0
    sun_azimuth: float = 180.0

    # Memo tables for fields that are pure functions of a slowly-changing
    # scalar (wind bearing, sun position) over static elevation. Physics
    # unchanged; this only avoids recomputing an identical array.
    caches: dict = field(default_factory=dict)

    def __post_init__(self):
        if self.fields is None:
            self.fields = Fields.zeros(self.height, self.width)

    # -- helpers ----------------------------------------------------------

    def in_bounds(self, x: int, y: int) -> bool:
        return 0 <= x < self.width and 0 <= y < self.height

    def terrain_at(self, x: int, y: int) -> T.TerrainType:
        return T.terrain(self.terrain[y, x])

    def overlays_at(self, x: int, y: int) -> list[str]:
        return self.overlays.get((x, y), [])

    def effective_stability(self, x: int, y: int, cfg) -> float:
        """RULE-OVERLAY-001: base stability plus reinforcement, recomputed every
        time -- the base terrain table is never mutated."""
        base = float(T.STABILITY[self.terrain[y, x]])
        bonus = 0.0
        for ov in self.overlays_at(x, y):
            if ov == "gravel":
                bonus += cfg.machines.gravel_stability_bonus
            elif ov == "stone":
                bonus += cfg.machines.stone_stability_bonus
        return min(cfg.machines.stability_cap, base + bonus)

    def effective_permeability(self, x: int, y: int) -> float:
        base = float(T.PERMEABILITY[self.terrain[y, x]])
        if "gravel" in self.overlays_at(x, y):
            base = min(1.0, base + 0.15)
        return base

    def is_water(self, x: int, y: int) -> bool:
        return bool(T.IS_WATER[self.terrain[y, x]])

    def neighbours4(self, x: int, y: int):
        # Fixed order N>E>S>W -- RULE-WATER-002 deterministic tie-break.
        for dx, dy in ((0, -1), (1, 0), (0, 1), (-1, 0)):
            nx, ny = x + dx, y + dy
            if self.in_bounds(nx, ny):
                yield nx, ny

    def neighbours8(self, x: int, y: int):
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dx == 0 and dy == 0:
                    continue
                nx, ny = x + dx, y + dy
                if self.in_bounds(nx, ny):
                    yield nx, ny

    def active_machines(self):
        return [m for m in self.machines.values() if not m.retired]
