"""WorldForge Bench -- a deterministic benchmark for AI world-model formation.

    from worldforge_bench import Simulation, WorldForgeEnv
"""

from .actions import Action
from .config import DEFAULT_CONFIG, Config
from .engine import Engine
from .env import Simulation, WorldForgeEnv
from .scoring import ScoreCard, score_run

__version__ = "0.1.0"
__all__ = ["Simulation", "WorldForgeEnv", "Engine", "Action", "Config",
           "DEFAULT_CONFIG", "ScoreCard", "score_run", "__version__"]
