from typing import List

try:
    from backend.models import Cell, MachineType, PlayerState, TerrainType, WorldState
except ImportError:
    from models import Cell, MachineType, PlayerState, TerrainType, WorldState


def generate_initial_grid(width: int = 10, height: int = 10) -> List[List[Cell]]:
    """Generates a 10x10 grid of Cell objects with Grass as default,

    a 3x3 patch of Water in the center, and a Mud patch near the bottom.
    """
    grid: List[List[Cell]] = []

    for y in range(height):
        row: List[Cell] = []
        for x in range(width):
            # Default terrain: Grass
            terrain = TerrainType.Grass
            elevation = 1.0
            stability = 0.70

            # 3x3 Water patch in the center (x: 4..6, y: 4..6)
            if 4 <= x <= 6 and 4 <= y <= 6:
                terrain = TerrainType.Water
                elevation = 0.0
                stability = 0.00
            # Mud patch near the bottom (x: 2..4, y: 7..8)
            elif 2 <= x <= 4 and 7 <= y <= 8:
                terrain = TerrainType.Mud
                elevation = 0.8
                stability = 0.30

            cell = Cell(
                x=x,
                y=y,
                terrain=terrain,
                elevation=elevation,
                base_stability=stability,
                is_reinforced=False,
                machine=None,
                has_cable=False,
            )
            row.append(cell)
        grid.append(row)

    return grid


def init_world(num_players: int = 2) -> WorldState:
    """Initializes the WorldState with default simulation parameters and players."""
    players = [
        PlayerState(
            player_id=i + 1,
            coins=100000,
            grid=generate_initial_grid(),
        )
        for i in range(num_players)
    ]

    return WorldState(
        tick=0,
        day=1,
        global_wind_speed=12.0,
        season="Summer",
        players=players,
    )
