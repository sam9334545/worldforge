from enum import Enum
from typing import List, Optional
from pydantic import BaseModel


class TerrainType(str, Enum):
    Grass = "Grass"
    Sand = "Sand"
    Mud = "Mud"
    Stone = "Stone"
    Water = "Water"
    Snow = "Snow"
    Gravel = "Gravel"


class MachineType(str, Enum):
    Solar = "Solar"
    Wind = "Wind"
    Hydro = "Hydro"
    Storage = "Storage"


class Cell(BaseModel):
    x: int
    y: int
    terrain: TerrainType
    elevation: float
    base_stability: float
    is_reinforced: bool = False
    machine: Optional[MachineType] = None
    has_cable: bool = False


class PlayerState(BaseModel):
    player_id: int
    coins: int
    grid: List[List[Cell]]


class WorldState(BaseModel):
    tick: int
    day: int
    global_wind_speed: float
    season: str
    players: List[PlayerState]
