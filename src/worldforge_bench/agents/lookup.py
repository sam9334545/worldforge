"""The anti-memorisation control (Final Deliverable I, test 20).

This agent uses nothing but a fixed terrain -> machine lookup table -- the
exact surface heuristic the specification warns about: "sand means solar",
"mountain means wind". It never consults wind direction, sun angle, cloud
cover, river flow, price, or its own balance sheet.

It exists to be beaten. If it ever scores near a policy that reasons from
state, the environment is rewarding memorisation and the benchmark is not
measuring what it claims to. Treat that as a failed build.

Fairness note: an earlier version scanned cells in row-major order and so
exhausted its budget on grass before ever reaching stone, ending up with an
all-solar portfolio. That made it fail for an implementation reason rather than
for the reason under test. This version allocates its budget ACROSS the terrain
classes in its table, so it genuinely deploys the portfolio the table implies --
and fails, if it fails, because a static table is not enough.
"""

from __future__ import annotations

from ..actions import Action
from .base import Agent, register
from .random_agent import _l_path

TABLE = {
    "Sand": "land_solar",
    "Grass/Dirt": "land_solar",
    "Stone/Rock": "wind",
    "Snow/Peak": "wind",
    "Gravel": "wind",
    "Water/River": "hydro",
}

# Fixed orientation for everything, never revisited. Due south is right for
# panels at this latitude and wrong for turbines against a westerly prevailing
# wind -- which is the point: the table has no column for "which way to face".
FIXED_ORIENTATION = 180.0


@register
class LookupAgent(Agent):
    name = "lookup"

    def __init__(self, budget_fraction: float = 0.85, **kw):
        super().__init__(**kw)
        self.budget_fraction = budget_fraction
        self.done = False

    def act(self, sim, obs):
        if self.done:
            return []
        self.done = True
        st = sim.engine.state
        capex = obs["market"]["capex_now"]

        # Bucket every legal cell by the machine its terrain maps to.
        buckets: dict[str, list] = {}
        for y in range(st.height):
            for x in range(st.width):
                kind = TABLE.get(st.terrain_at(x, y).name)
                if kind is None or not sim.can_place(kind, x, y):
                    continue
                buckets.setdefault(kind, []).append((x, y))

        if not buckets:
            return []

        # Split the budget evenly across the machine classes the table implies,
        # then round-robin so no single class starves the others.
        budget = obs["finance"]["cash"] * self.budget_fraction
        kinds = sorted(buckets)
        per_kind = {k: budget / len(kinds) for k in kinds}

        actions = []
        cursor = {k: 0 for k in kinds}
        progress = True
        while progress:
            progress = False
            for kind in kinds:
                cells = buckets[kind]
                i = cursor[kind]
                if i >= len(cells):
                    continue
                cost = capex[kind]
                if cost > per_kind[kind]:
                    continue
                x, y = cells[i]
                cursor[kind] = i + 1
                per_kind[kind] -= cost
                progress = True

                actions.append(Action("PLACE", x=x, y=y, kind=kind,
                                      orientation=FIXED_ORIENTATION))
                zone = min(st.demand_zones,
                           key=lambda z: abs(z.centre[0] - x) + abs(z.centre[1] - y))
                path = _l_path(sim, (x, y), zone.centre)
                if path:
                    actions.append(Action("PLACE_CABLE", path=path))
        return actions
