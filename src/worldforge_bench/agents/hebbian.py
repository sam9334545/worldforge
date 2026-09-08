"""A BDH-inspired agent: Hebbian fast weights, adaptation through state alone.

This is NOT a Dragon Hatchling model. There is no network, no training run and
no learned parameters. What it borrows is the *mechanism* the BDH line argues
for, so that the architecture family is represented in the benchmark by
something other than a citation:

  * **Fast-weight associative memory.** A single weight vector over binned
    observations of a site, updated locally from realised outcomes. It is the
    agent's whole memory of what pays on this map.
  * **Adaptation through recurrent state, not parameters.** The vector starts at
    zero on every episode and every seed. Nothing carries across runs. Whatever
    the agent knows at year ten it learned by watching year one.
  * **Local, gradient-free updates.** The rule is Hebbian with decay --- co-active
    features move toward the outcome they co-occurred with. No backward pass, so
    it is on the state route rather than HRM's optimisation route.
  * **No search and no backtracking.** It ranks, commits, and never explores
    alternatives or undoes a build. This is the behavioural signature BDH is
    tested on in Sudoku-Extreme.

It is given no physics. It does not know that wind cubes, that orientation costs
a cosine, or that head matters. It sees binned readings and what its own
machines subsequently earned, and associates the two.
"""

from __future__ import annotations

import numpy as np

from ..actions import Action
from ..machines import nameplate_kw
from .base import Agent, register
from .random_agent import _l_path

KINDS = ("wind", "land_solar", "hydro", "floating_solar")


def _bin(value: float, edges: tuple) -> int:
    for i, e in enumerate(edges):
        if value < e:
            return i
    return len(edges)


class FastWeights:
    """One weight per observable feature, updated Hebbianly from outcomes.

    Deliberately tiny and legible: the point is that a few dozen locally-updated
    associations, formed inside a single episode, are enough to site
    infrastructure competently -- not that this is a good learner in general.
    """

    WIND_EDGES = (3.0, 5.5, 7.5, 9.5)
    IRR_EDGES = (50.0, 250.0, 500.0, 750.0)
    HYDRO_EDGES = (1.0, 20.0, 60.0, 120.0)
    STAB_EDGES = (0.5, 0.7, 0.9)
    DIST_EDGES = (3.0, 7.0, 12.0)

    N_KIND, N_WIND, N_IRR, N_HYD, N_STAB, N_DIST = len(KINDS), 5, 5, 5, 4, 4
    SIZE = N_KIND + N_WIND + N_IRR + N_HYD + N_STAB + N_DIST

    def __init__(self, lr: float = 0.35, decay: float = 0.02):
        self.w = np.zeros(self.SIZE, dtype=np.float64)
        self.n = np.zeros(self.SIZE, dtype=np.float64)
        self.lr = lr
        self.decay = decay

    def features(self, kind: str, wind: float, irr: float, hydro: float,
                 stab: float, dist: float) -> np.ndarray:
        x = np.zeros(self.SIZE, dtype=np.float64)
        o = 0
        x[o + KINDS.index(kind)] = 1.0;                       o += self.N_KIND
        x[o + _bin(wind, self.WIND_EDGES)] = 1.0;             o += self.N_WIND
        x[o + _bin(irr, self.IRR_EDGES)] = 1.0;               o += self.N_IRR
        x[o + _bin(hydro, self.HYDRO_EDGES)] = 1.0;           o += self.N_HYD
        x[o + _bin(stab, self.STAB_EDGES)] = 1.0;             o += self.N_STAB
        x[o + _bin(dist, self.DIST_EDGES)] = 1.0
        return x

    def score(self, x: np.ndarray) -> float:
        return float(self.w @ x)

    def confidence(self, x: np.ndarray) -> float:
        """How much evidence stands behind this association."""
        active = x > 0
        return float(self.n[active].min()) if active.any() else 0.0

    def reinforce(self, x: np.ndarray, outcome: float) -> None:
        """Hebbian update with decay: co-active features move toward the
        outcome they co-occurred with. Local, gradient-free."""
        active = x > 0
        self.w[active] += self.lr * (outcome - self.w[active])
        self.n[active] += 1.0
        self.w *= (1.0 - self.decay)


@register
class HebbianAgent(Agent):
    name = "hebbian"

    #: What the Hebbian rule is told counts as a good outcome. This is the
    #: only difference between this agent and its ablation, and it turns out to
    #: matter more than the mechanism does.
    reward = "value"

    def __init__(self, explore_rounds: int = 3, reserve_fraction: float = 0.12,
                 build_threshold: float = 0.0, seed: int = 0, **kw):
        super().__init__(**kw)
        self.fw = FastWeights()
        self.explore_rounds = explore_rounds
        self.reserve_fraction = reserve_fraction
        self.build_threshold = build_threshold
        self.rounds = 0
        self._pending: dict = {}      # (x,y) -> (features, mwh_at_build)
        self._rng = np.random.default_rng(seed + 4242)

    # -- observation ----------------------------------------------------

    def _observe(self, sim, kind, x, y):
        st = sim.engine.state
        f = st.fields
        zones = st.demand_zones
        dist = min(abs(z.centre[0] - x) + abs(z.centre[1] - y) for z in zones) \
            if zones else 0.0
        return self.fw.features(
            kind,
            float(f.wind_speed[y, x]),
            float(f.irradiance[y, x]),
            float(f.flow_q[y, x]) * float(f.head[y, x]),
            st.effective_stability(x, y, sim.engine.cfg),
            dist,
        )

    # -- learning -------------------------------------------------------

    def _reinforce_from_outcomes(self, sim):
        """Watch what the machines actually earned, and associate."""
        st = sim.engine.state
        cfg = sim.engine.cfg
        for m in st.active_machines():
            rec = self._pending.get(m.pos)
            if rec is None:
                continue
            x, mwh_at_build = rec
            plate = nameplate_kw(m.kind, cfg)
            if plate <= 0:
                continue

            if self.reward == "energy":
                # Delivered energy per unit of nameplate. A physical, monotone
                # target -- and the one this environment is built to punish.
                delivered = m.lifetime_mwh - mwh_at_build
                hours = cfg.time.days_per_year * cfg.time.ticks_per_day / 2.0
                outcome = delivered / max(1e-9, plate / 1000.0 * hours)
            else:
                # Realised revenue against what the machine cost. This is the
                # economic signal, and it already contains the price the machine
                # actually captured -- so an asset that generated into a market
                # its owner had flooded reports a poor outcome, and the
                # association weakens.
                earned = m.lifetime_revenue - mwh_at_build
                annualised = earned / max(0.25, m.age_years)
                outcome = annualised / max(1e-9, m.capex_paid) * 4.0

            self.fw.reinforce(x, float(min(1.0, max(-0.5, outcome))))
            tracked = m.lifetime_mwh if self.reward == "energy" else m.lifetime_revenue
            self._pending[m.pos] = (x, tracked)

    # -- policy ---------------------------------------------------------

    def act(self, sim, obs):
        self.rounds += 1
        self._reinforce_from_outcomes(sim)

        actions = []
        st = sim.engine.state
        cfg = sim.engine.cfg
        cash = obs["finance"]["cash"]
        budget = max(0.0, cash - cfg.finance.starting_cash * self.reserve_fraction)
        if budget <= 0 or st.tick >= cfg.time.horizon_years * 24 * 360:
            return actions

        capex = obs["market"]["capex_now"]
        candidates = []
        for y in range(st.height):
            for x in range(st.width):
                for kind in KINDS:
                    if not sim.can_place(kind, x, y):
                        continue
                    xf = self._observe(sim, kind, x, y)
                    s = self.fw.score(xf)
                    conf = self.fw.confidence(xf)
                    # Untried associations are worth probing early; later the
                    # agent trusts what it has seen.
                    if self.rounds <= self.explore_rounds and conf < 1.0:
                        s += 0.15 * self._rng.random()
                    candidates.append((s, kind, x, y, xf))

        if not candidates:
            return actions
        candidates.sort(key=lambda c: -c[0])

        built = 0
        for s, kind, x, y, xf in candidates:
            if built >= 3:
                break
            cost = capex[kind]
            if cost > budget:
                continue
            if self.rounds > self.explore_rounds and s <= self.build_threshold:
                break                      # nothing left that its memory rates
            zone = min(st.demand_zones,
                       key=lambda z: abs(z.centre[0] - x) + abs(z.centre[1] - y))
            path = _l_path(sim, (x, y), zone.centre)
            if path is None:
                continue
            actions.append(Action("PLACE", x=x, y=y, kind=kind,
                                  orientation=sim.best_orientation(kind, x, y),
                                  debt_fraction=0.40))
            actions.append(Action("PLACE_CABLE", path=path, debt_fraction=0.40))
            self._pending[(x, y)] = (xf, 0.0)
            budget -= cost
            built += 1
        return actions


@register
class HebbianEnergyAgent(HebbianAgent):
    """Ablation: the same mechanism, told to maximise delivered energy.

    Everything about this agent is identical to `hebbian` except the single
    scalar its Hebbian rule treats as a good outcome. It exists to separate the
    contribution of the mechanism from the contribution of the objective, and it
    is the cleanest demonstration in the benchmark of what a monotone target
    does: it delivers more energy than any other agent here and loses money
    doing it.
    """

    name = "hebbian-mwh"
    reward = "energy"
