# Running WorldForge Bench

Everything here runs on a laptop CPU. No GPU, no training, no network.

## Install

```bash
cd worldforge-bench
pip install -e .
```

The only runtime dependency is `numpy`. For the tests, `pip install -e '.[dev]'`.

Verify:

```bash
wfbench map --seed 42
```

## The five things worth running first

### 1. See a world

```bash
wfbench map --seed 7
```

```
    012345678901234567890123
  0 ....~~~~..~~..........,,
  3 .......,,.===........D..
 20 .....:^^^^AAAA^:..~.....
 21 ..D..^AAAAA^^^:~~.....D.
  . grass  , sand  ~ mud  ^ stone  A snow  = water  : gravel
  S solar  F float  W wind  H hydro  + cable  D demand zone
```

Change the seed and the layout changes completely. The physics does not.

### 2. Run an agent for ten simulated years

```bash
wfbench run --agent heuristic --seed 42 --years 10
```

Takes about a minute (86,400 hourly ticks). Prints a full scorecard: equity
value, IRR, LCOE, capacity factor, capture price, reliability, drawdown, and
the weighted score components.

Swap `--agent` for `donothing`, `random`, or `lookup`. Add `--show-map` to see
what it built, `--json` for machine-readable output.

### 3. Reproduce the leaderboard

```bash
wfbench bench --agents donothing,lookup,random,heuristic --seeds 1-5 --years 10 \
  --out runs/leaderboard.json
```

About 20 minutes for all 20 episodes. Expected result:

| agent | score | equity | return | GWh | ROIC | LCOE |
|---|---|---|---|---|---|---|
| heuristic | 51.4 ±3.9 | $52.7M | +111% | 517 | +118% | $37.5 |
| donothing | 16.3 ±0.0 | $25.0M | 0% | 0 | — | — |
| random | 15.6 ±5.9 | $26.7M | +7% | 332 | +43% | $87.3 |
| lookup | 9.0 ±2.0 | $16.2M | −35% | 84 | +28% | $167.1 |

The line to read is `lookup` **below** `donothing`. The memorising agent — a
fixed terrain→machine table at a fixed orientation — destroys a third of its
capital. It is worse than doing nothing. That is the benchmark working.

### 4. Check it generalises

```bash
wfbench generalise --agent heuristic --train 1-5 --held-out 101-105 --years 10
```

Same physics, unseen layouts. A relative gap over 25% is flagged as layout
memorisation rather than rule learning.

### 5. Watch the price move

```bash
wfbench market --seed 42 --days 3
```

Prices clear against residual demand. Build more and you push yourself down the
merit order — this is the mechanic the whole benchmark rests on.

## Interactive

```bash
wfbench play --seed 42
```

```
[t=0 $25,000,000] > map
[t=0 $25,000,000] > inspect 6 11
[t=0 $25,000,000] > predict wind 6 11
[t=0 $25,000,000] > place wind 6 11 270
[t=0 $25,000,000] > cable 6 11 13 6
[t=0 $25,000,000] > adv 720
[t=720 $24,910,412] > score
```

`predict` before `place` is the habit worth building: it tells you what a
machine would actually produce there, before you pay for it.

## Python

```python
from worldforge_bench import Simulation

sim = Simulation(seed=42)
sim.advance(12)                       # into daylight, so fields are live

print(sim.can_place("wind", 6, 11).reason)
print(sim.predict("wind", 6, 11).message)

sim.place("wind", 6, 11,
          orientation=sim.best_orientation("wind", 6, 11),
          debt_fraction=0.45)
sim.cable([(6, 11), (6, 10), (7, 10)])
sim.sign_ppa(0.5)

sim.advance(24 * 360 * 10)
print(sim.report())
```

Gym-flavoured, reward = change in equity value in $m:

```python
from worldforge_bench import WorldForgeEnv

env = WorldForgeEnv(seed=42, auto_advance=24 * 7)
obs = env.reset()
obs, reward, done, info = env.step(
    {"type": "PLACE", "kind": "wind", "x": 6, "y": 11, "orientation": 270})
```

## Driving it from an LLM agent

```bash
wfbench serve --seed 42 --years 10
```

Line-delimited JSON on stdin/stdout. One request per line, one response per
line — no Python integration needed.

```json
{"op": "observe", "include_grid": false}
{"op": "can_place", "kind": "wind", "x": 6, "y": 11}
{"op": "predict", "kind": "wind", "x": 6, "y": 11, "predicted_kw": 400}
{"op": "act", "action": {"type": "PLACE", "kind": "wind", "x": 6, "y": 11}}
{"op": "act", "action": {"type": "PLACE_CABLE", "path": [[6,11],[6,10]]}}
{"op": "advance", "ticks": 168}
{"op": "score"}
```

A worked loop is in `examples/llm_agent_loop.py`.

Passing your own `predicted_kw` to `predict` records your accuracy, which feeds
the prediction component of the score. It is the cleanest probe of whether an
agent understands the causal structure, independent of its building skill.

## Examples

```bash
python examples/quickstart.py               # site, wire, run three years
python examples/orientation_and_wiring.py   # prove the mechanics are real
python examples/llm_agent_loop.py           # drive it over JSON
```

`orientation_and_wiring.py` is the one to run if you are sceptical that the
controls matter:

```
    yaw offset      output    vs aligned
           0 deg     172.2 kW        1.000
          30 deg     149.1 kW        0.866
          60 deg      86.1 kW        0.500
          90 deg       0.0 kW        0.000
```

## Tests

```bash
pytest -q          # 41 tests, about a minute
```

These are the spec's Top 20 test cases as executable checks — water mass
balance and energy conservation on every tick, determinism by state hash,
wind-shadow direction, turbine cut-in/cut-out, hydro floors without
divide-by-zero, specific placement-failure reasons, reinforcement tiers, cable
congestion, and `test_20_reasoning_beats_the_lookup_table`.

Run the anti-memorisation check alone:

```bash
pytest tests/test_benchmark.py::test_20_reasoning_beats_the_lookup_table -q
```

If that ever fails, the environment is rewarding memorisation and results
should not be trusted until it is fixed.

## Writing your own agent

```python
from worldforge_bench.agents import Agent, register

@register
class MyAgent(Agent):
    name = "mine"

    def act(self, sim, obs):
        # Called every `decision_interval` ticks. Return a list of actions.
        # Never advance time yourself — the harness does, so every agent
        # gets the same clock.
        return []
```

Then `wfbench run --agent mine --seed 42 --years 10`.

Read `obs["market"]["price_history_24h"]` and `obs["finance"]` before you
build. The two mistakes that cost the most are ignoring your own price impact,
and building generation you cannot wire to a demand zone.

## Tuning

Every constant lives in one object, so rebalancing never touches physics code:

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

## The paper

`paper/` holds the LaTeX source (gitignored). Build it:

```bash
cd paper && mkdir -p build && tectonic -X compile main.tex --outdir build
```

`paper/make_results.py` regenerates the results table straight from
`runs/leaderboard.json`, so the paper cannot drift from what the code produced.
Re-run it after any benchmark run.

`paper/neurips_style.sty` is a local reimplementation of the NeurIPS layout for
offline drafting. **Replace it with the official style file before submitting.**
