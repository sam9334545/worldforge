"""Agent-facing API.

Two shapes, same engine underneath:

    env = WorldForgeEnv(seed=42)          # gym-flavoured
    obs = env.reset()
    obs, reward, done, info = env.step({"type": "PLACE", "kind": "wind", ...})

    sim = Simulation(seed=42)             # direct, for scripts and the CLI
    sim.place("wind", 3, 4, orientation=270)
    sim.advance(24)
    print(sim.report())

Reward is the change in EQUITY VALUE, in millions. Not cash, not energy --
the thing the benchmark actually asks the agent to maximise.
"""

from __future__ import annotations

from .actions import Action
from .config import DEFAULT_CONFIG, Config
from .engine import Engine
from .machines import best_orientation
from .observation import ascii_map, observe
from .placement import can_place
from .scoring import score_run


class Simulation:
    def __init__(self, seed: int = 42, cfg: Config | None = None):
        self.engine = Engine(seed, cfg or DEFAULT_CONFIG)

    # -- actions --------------------------------------------------------

    def act(self, action):
        return self.engine.apply(action)

    def place(self, kind, x, y, orientation=None, tilt=None, debt_fraction=0.0):
        return self.engine.apply(Action("PLACE", x=x, y=y, kind=kind,
                                        orientation=orientation, tilt=tilt,
                                        debt_fraction=debt_fraction))

    def cable(self, path, debt_fraction=0.0):
        return self.engine.apply(Action("PLACE_CABLE",
                                        path=[list(p) for p in path],
                                        debt_fraction=debt_fraction))

    def orient(self, x, y, orientation, tilt=None):
        return self.engine.apply(Action("SET_ORIENTATION", x=x, y=y,
                                        orientation=orientation, tilt=tilt))

    def reinforce(self, x, y, overlay="gravel"):
        return self.engine.apply(Action("REINFORCE", x=x, y=y, overlay=overlay))

    def remove(self, x, y):
        return self.engine.apply(Action("REMOVE", x=x, y=y))

    def sign_ppa(self, fraction):
        return self.engine.apply(Action("SIGN_PPA", fraction=fraction))

    def predict(self, kind, x, y, predicted_kw=None):
        return self.engine.apply(Action("QUERY_PREDICTION", x=x, y=y, kind=kind,
                                        predicted_kw=predicted_kw))

    def advance(self, ticks=1):
        return self.engine.run(ticks)

    # -- queries --------------------------------------------------------

    def observe(self, **kw):
        return observe(self.engine, **kw)

    def can_place(self, kind, x, y):
        return can_place(self.engine.state, kind, x, y, self.engine.cfg)

    def best_orientation(self, kind, x, y):
        return best_orientation(kind, self.engine.state, x, y, self.engine.cfg)

    def map(self):
        return ascii_map(self.engine.state, self.engine.cfg)

    def valuation(self):
        return self.engine.valuation()

    def score(self):
        return score_run(self.engine)

    @property
    def terminated(self):
        return self.engine.terminated

    @property
    def tick(self):
        return self.engine.state.tick

    def report(self) -> str:
        return self.score().summary()


class WorldForgeEnv:
    """Gym-flavoured wrapper. Reward = change in equity value, in $m."""

    def __init__(self, seed: int = 42, cfg: Config | None = None,
                 auto_advance: int = 0):
        self.seed = seed
        self.cfg = cfg or DEFAULT_CONFIG
        self.auto_advance = auto_advance
        self.engine: Engine | None = None
        self._last_equity = 0.0

    def reset(self, seed: int | None = None) -> dict:
        self.engine = Engine(seed if seed is not None else self.seed, self.cfg)
        self._last_equity = self.engine.valuation().equity_value
        return observe(self.engine)

    def step(self, action):
        if self.engine is None:
            self.reset()
        result = self.engine.apply(action)
        if self.auto_advance:
            self.engine.run(self.auto_advance)

        equity = self.engine.valuation().equity_value
        reward = (equity - self._last_equity) / 1e6
        self._last_equity = equity

        info = {"action_ok": result.ok, "message": result.message,
                "cost": result.cost, "data": result.data,
                "equity_value": equity, "tick": self.engine.state.tick}
        return observe(self.engine), reward, self.engine.terminated, info

    def render(self) -> str:
        return ascii_map(self.engine.state, self.engine.cfg)

    def score(self):
        return score_run(self.engine)
