"""Static terrain property system (Sections 5 and 6, table T01-T07).

Layer A of the world model: fixed at map generation, never mutated. Overlays
change *effective* stability/permeability, tracked separately as derived state
(RULE-OVERLAY-001) -- the base table below is never written to.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class TerrainType:
    id: int
    code: str
    name: str
    elevation: int
    roughness_z0: float
    moisture_capacity: float
    permeability: float
    stability: float
    water_retention: float
    allowed_machines: frozenset
    transformable: bool
    reinforceable: bool
    is_water: bool = False


GRASS = TerrainType(0, "T01", "Grass/Dirt", 1, 0.03, 0.50, 0.55, 0.70, 0.45,
                    frozenset({"land_solar", "wind", "cable"}), True, True)
SAND = TerrainType(1, "T02", "Sand", 1, 0.01, 0.05, 0.85, 0.55, 0.05,
                   frozenset({"land_solar", "cable"}), True, True)
MUD = TerrainType(2, "T03", "Mud/Clay", 0, 0.05, 0.95, 0.10, 0.30, 0.90,
                  frozenset({"cable", "land_solar", "wind"}), True, True)
STONE = TerrainType(3, "T04", "Stone/Rock", 3, 0.20, 0.15, 0.10, 0.95, 0.10,
                    frozenset({"wind", "land_solar", "cable"}), False, False)
# Spec deviation, deliberate. The Section 6 table gives Snow stability 0.60 and
# marks it non-reinforceable, while Section 6.5 and the Final Machine
# Compatibility Matrix both say Wind is allowed on Snow/Peak. Those cannot both
# hold: Section 15 requires stability >= 0.70 for Wind, and Snow can never be
# reinforced up to it, so wind on snow would be unbuildable in every game.
# Both numbers are flagged [CONFIGURABLE]; we raise stability to 0.70 (frozen
# ground has high bearing capacity) because the compatibility matrix states the
# design intent twice and the stability figure only once.
SNOW = TerrainType(4, "T05", "Snow/Peak", 5, 0.50, 0.80, 0.05, 0.70, 0.80,
                   frozenset({"wind"}), True, False)
WATER = TerrainType(5, "T06", "Water/River", 0, 0.0002, 1.0, 0.0, 0.0, 1.0,
                    frozenset({"hydro", "floating_solar"}), False, False, is_water=True)
GRAVEL = TerrainType(6, "T07", "Gravel", 2, 0.08, 0.30, 0.60, 0.85, 0.20,
                     frozenset({"land_solar", "wind", "cable"}), False, False)

TERRAIN_TYPES: tuple[TerrainType, ...] = (GRASS, SAND, MUD, STONE, SNOW, WATER, GRAVEL)
BY_CODE = {t.code: t for t in TERRAIN_TYPES}
BY_NAME = {t.name.split("/")[0].lower(): t for t in TERRAIN_TYPES}

# Column-vector lookups, indexed by terrain id, for vectorised physics.
ELEVATION = np.array([t.elevation for t in TERRAIN_TYPES], dtype=np.float64)
ROUGHNESS = np.array([t.roughness_z0 for t in TERRAIN_TYPES], dtype=np.float64)
MOISTURE_CAP = np.array([t.moisture_capacity for t in TERRAIN_TYPES], dtype=np.float64)
PERMEABILITY = np.array([t.permeability for t in TERRAIN_TYPES], dtype=np.float64)
STABILITY = np.array([t.stability for t in TERRAIN_TYPES], dtype=np.float64)
WATER_RETENTION = np.array([t.water_retention for t in TERRAIN_TYPES], dtype=np.float64)
IS_WATER = np.array([t.is_water for t in TERRAIN_TYPES], dtype=bool)


def terrain(tid: int) -> TerrainType:
    return TERRAIN_TYPES[int(tid)]


# Overlay compatibility (Final Deliverable H): can OVERLAY[a] be placed on base b?
OVERLAY_ON = {
    "gravel": {"T01", "T02", "T03", "T04"},
    "stone": {"T03", "T05"},
}
OVERLAY_STABILITY_KEYS = ("gravel", "stone")
