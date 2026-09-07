"""Random builder. Picks legal-ish cells at random and builds until broke.

Useful as a noise floor: if a scoring change lets this agent near the heuristic
agent's score, the scoring is broken.
"""

from __future__ import annotations

from ..actions import Action
from ..prng import Prng
from .base import Agent, register

KINDS = ("land_solar", "wind", "hydro", "floating_solar")


@register
class RandomAgent(Agent):
    name = "random"

    def __init__(self, seed: int = 0, build_prob: float = 0.35, **kw):
        super().__init__(**kw)
        self.prng = Prng(seed + 9871)
        self.build_prob = build_prob

    def act(self, sim, obs):
        actions = []
        if not self.prng.chance(self.build_prob):
            return actions
        st = sim.engine.state
        for _ in range(3):
            x = self.prng.integers(0, st.width)
            y = self.prng.integers(0, st.height)
            kind = KINDS[self.prng.integers(0, len(KINDS))]
            if sim.can_place(kind, x, y):
                actions.append(Action("PLACE", x=x, y=y, kind=kind,
                                      orientation=self.prng.uniform(0, 360)))
                # Wire it to a zone with a naive L-path.
                zone = min(st.demand_zones,
                           key=lambda z: abs(z.centre[0] - x) + abs(z.centre[1] - y))
                path = _l_path(sim, (x, y), zone.centre)
                if path:
                    actions.append(Action("PLACE_CABLE", path=path))
                break
        return actions


def _l_path(sim, start, end):
    st = sim.engine.state
    (x0, y0), (x1, y1) = start, end
    cells = []
    x, y = x0, y0
    while x != x1:
        x += 1 if x1 > x else -1
        cells.append((x, y))
    while y != y1:
        y += 1 if y1 > y else -1
        cells.append((x, y))
    out = []
    for c in cells:
        if c in st.cables:
            out.append(list(c))
            continue
        if not sim.can_place("cable", c[0], c[1]):
            return None
        out.append(list(c))
    return out or None
