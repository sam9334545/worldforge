# API reference

Three ways to drive the simulation. All of them talk to the same engine, so a
run started one way can be scored the same way, and any run is reproducible from
its seed plus its ordered action log.

| Interface | Use it for | Start with |
|---|---|---|
| Python | scripted agents, notebooks, the benchmark harness | `pip install -e .` |
| JSON over stdio | language-model agents, any process | `wfbench serve` |
| HTTP | web front-ends, remote agents | `wfbench api` |

---

## 1. Python

```python
from worldforge_bench import Simulation

sim = Simulation(seed=42)
sim.advance(12)                      # into daylight, so derived fields are live
```

### Look before you build

Every placement is validated, and a refusal tells you why in words rather than
returning a bare boolean:

```python
>>> sim.can_place("hydro", 3, 3).reason
'hydro cannot be built on Grass/Dirt; that terrain allows: cable, land_solar, wind'

>>> sim.can_place("wind", 6, 11).valid
True
```

Ask what a machine *would* produce at a cell before paying for it. This is
ground truth from the same physics the engine runs, and it costs nothing:

```python
>>> sim.predict("wind", 6, 11).message
'wind at (6,11) would produce 385.7 kW now'
```

Pass your own estimate and the harness records your error, which feeds the
prediction component of the score:

```python
sim.predict("wind", 6, 11, predicted_kw=400)
```

### Build, wire, finance

```python
sim.place("wind", 6, 11,
          orientation=sim.best_orientation("wind", 6, 11),
          debt_fraction=0.45)
sim.cable([(6, 11), (6, 10), (7, 10)])     # contiguous, 4-connected
sim.reinforce(4, 9, "gravel")              # raises effective stability
sim.sign_ppa(0.5)                          # hedge half the output
sim.orient(6, 11, 270)                     # re-aim as the wind veers
sim.remove(6, 11)
```

Cable runs are **all-or-nothing**. A path that fails validation anywhere lays
nothing and spends nothing, so the world never enters a half-wired state.

### Run and score

```python
sim.advance(24 * 360 * 10)     # ten simulated years
print(sim.report())
card = sim.score()
card.score, card.terminal_equity, card.lcoe, card.mean_reliability
```

### Gym-flavoured wrapper

Reward is the change in **equity value**, in millions — not cash, not energy.

```python
from worldforge_bench import WorldForgeEnv

env = WorldForgeEnv(seed=42, auto_advance=24 * 7)
obs = env.reset()
obs, reward, done, info = env.step(
    {"type": "PLACE", "kind": "wind", "x": 6, "y": 11, "orientation": 270})
```

### Writing an agent for the harness

```python
from worldforge_bench.agents import Agent, register

@register
class MyAgent(Agent):
    name = "mine"

    def act(self, sim, obs):
        # Called every `decision_interval` ticks. Return a list of actions.
        # Never advance time yourself -- the harness does, so every agent
        # gets the same clock.
        return []
```

Then `wfbench run --agent mine --seed 42 --years 10`.

---

## 2. JSON over stdio

```bash
wfbench serve --seed 42 --years 10
```

One JSON request per line in, one response per line out. No Python integration
needed, which makes it the natural interface for a language-model agent.

```json
{"op": "observe", "include_grid": false}
{"op": "can_place", "kind": "wind", "x": 6, "y": 11}
{"op": "predict", "kind": "wind", "x": 6, "y": 11, "predicted_kw": 400}
{"op": "act", "action": {"type": "PLACE", "kind": "wind", "x": 6, "y": 11}}
{"op": "act", "action": {"type": "PLACE_CABLE", "path": [[6,11],[6,10]]}}
{"op": "advance", "ticks": 168}
{"op": "map"}
{"op": "score"}
{"op": "reset", "seed": 7}
{"op": "quit"}
```

Bad input never kills the server; it returns `{"ok": false, "message": "..."}`.

### The low-cost session driver

`tools/llm_play.py` wraps this for budgeted evaluation. It exists because the
first agent interface returned a 576-cell JSON grid on every observation and
cost 2.7–5.9M tokens per episode, which forced runs to be abandoned. It emits
compact fixed-width text instead, batches many actions into one call, and
advances many rounds per call — a complete 20-round episode now runs in about a
dozen calls.

```bash
P=tools/llm_play.py
python3 $P new    --session s1 --seed 1
python3 $P map    --session s1
python3 $P cells  --session s1 --kind wind --legal --limit 40
python3 $P batch  --session s1 --json '[{"type":"PLACE","kind":"wind","x":6,"y":11}]'
python3 $P run    --session s1 --rounds 8
python3 $P brief  --session s1
python3 $P score  --session s1
```

`cells` returns raw per-cell readings — terrain, elevation, stability, local
wind, irradiance, obstruction, river flow, head, velocity, cable presence, and
whether the kind is legal there. It ranks nothing and advises nothing; the
reasoning is left to the agent.

---

## 3. HTTP

```bash
pip install -e '.[api]'
wfbench api --port 8000        # interactive docs at /docs
```

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | liveness, session count |
| `POST` | `/sessions` | create a world: `{seed, width?, height?, horizon_years?}` |
| `GET` | `/sessions` | list session ids |
| `DELETE` | `/sessions/{id}` | drop a session |
| `GET` | `/sessions/{id}/world` | full state; `?include_terrain=false` for polling |
| `GET` | `/sessions/{id}/terrain` | static terrain, fetch once |
| `GET` | `/sessions/{id}/placeable` | validity masks for every buildable kind |
| `GET` | `/sessions/{id}/can_place` | `?kind=&x=&y=` — one cell, with a reason |
| `POST` | `/sessions/{id}/actions` | `{action: {...}}` |
| `POST` | `/sessions/{id}/advance` | `{ticks: N}` |
| `GET` | `/sessions/{id}/map` | ASCII terrain map |
| `GET` | `/sessions/{id}/score` | full scorecard |

```bash
SID=$(curl -sX POST localhost:8000/sessions -H 'content-type: application/json' \
        -d '{"seed":42}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["sessionId"])')

curl -sX POST localhost:8000/sessions/$SID/actions -H 'content-type: application/json' \
     -d '{"action":{"type":"PLACE","kind":"wind","x":6,"y":11,"orientation":270}}'

curl -sX POST localhost:8000/sessions/$SID/advance -H 'content-type: application/json' \
     -d '{"ticks":168}'

curl -s localhost:8000/sessions/$SID/score
```

`/world` emits the `CellState[][]` shape the React viewer consumes directly, so
a front-end renders real physics without reimplementing any of it.
`/placeable` exists so a UI cannot shade a cell buildable that the engine would
refuse — masks come from the same validator the engine enforces.

---

## Action reference

| Action | Fields |
|---|---|
| `PLACE` | `kind`, `x`, `y`, `orientation?`, `tilt?`, `debt_fraction?` |
| `PLACE_CABLE` | `path` (contiguous 4-connected cells), `debt_fraction?` |
| `SET_ORIENTATION` | `x`, `y`, `orientation`, `tilt?` |
| `REINFORCE` | `x`, `y`, `overlay` (`gravel` \| `stone`) |
| `REMOVE` | `x`, `y` |
| `SIGN_PPA` | `fraction` (share of output hedged) |
| `QUERY_PREDICTION` | `kind`, `x`, `y`, `predicted_kw?` |
| `ADVANCE_TIME` | `ticks` |

`kind` is one of `land_solar`, `floating_solar`, `wind`, `hydro`, `cable`.
Orientations are compass bearings, 0–359.

### Three things that trip people up

**Orientation matters, and it is unforgiving.** Turbine output carries a
`cos(yaw)` term that is a hard zero at and beyond 90° off the wind. A turbine
facing the wrong way produces nothing at all, not a reduced amount. Panels have
a real incidence cosine too, from tilt and azimuth against the sun vector.

**Wiring matters, and length is the routed path.** Transmission loss uses the
length of the cable path a breadth-first search actually walks, not
straight-line distance, and capacity is enforced per segment — two farms sharing
a trunk congest it and the excess is curtailed. A generator with no cable on or
beside it delivers nothing, and that energy is reported separately as
`unconnectedKw`.

**Building more can be worth less.** Price clears each tick against residual
demand served by a thermal fleet in merit order. Your own output pushes that
residual down the merit order and lowers the price you earn, so the tenth solar
farm earns far less per MWh than the first, and oversupply produces negative
prices. Each asset is discounted at its *own* realised capture price, so
cannibalisation shows up on the balance sheet.

---

## Determinism

Given a seed, a configuration and an ordered action log, the engine reproduces a
bit-identical state hash — exposed as `stateHash` on the HTTP world payload and
`engine.state_hash()` in Python. Every stochastic draw comes from a single
seeded stream advanced in a fixed order.

This is a precondition for comparing agents: without it, a score difference
might just be luck.

```python
a = Simulation(42); a.place("wind", 6, 11); a.advance(100)
b = Simulation(42); b.place("wind", 6, 11); b.advance(100)
assert a.engine.state_hash() == b.engine.state_hash()
```

---

## Configuration

Every tunable constant lives in one object, so rebalancing never touches physics
code:

```python
from worldforge_bench import Config, Simulation

cfg = Config().with_overrides(
    market={"price_cap": 500.0, "carbon_price_start": 90.0},
    finance={"starting_cash": 50_000_000.0, "max_leverage": 0.5},
    world={"width": 32, "height": 32},
)
sim = Simulation(seed=42, cfg=cfg)
```

Changing any of these makes a **new benchmark version**. Scores are only
comparable within one configuration, so serialise the config alongside results.
