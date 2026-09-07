# WorldForge Bench

A deterministic simulation benchmark for AI world-model formation, built on the
*Grid Energy Ecosystem* specification. An agent is given a procedurally
generated terrain and a balance sheet, and has ten simulated years to build an
energy business worth more than the money it started with.

The objective is **equity value**, not energy. Building a lot of generation is
easy; building generation that is worth more than it cost is not.

```bash
pip install -e .
wfbench map --seed 42
wfbench run --agent heuristic --seed 42 --years 10
wfbench bench --agents donothing,lookup,random,heuristic --seeds 1-10
```

---

## Why the objective is wealth

A benchmark that scores total MWh rewards an agent for carpeting the map. This
one prices energy the way a grid actually does, so that strategy defeats
itself.

Every tick the electricity price **clears against a residual demand curve**
served by a background thermal fleet in merit order. Renewables bid at zero
marginal cost, so the agent's own output pushes residual demand down the merit
order and lowers the price it earns:

```
agent supply      0 kW  ->  $79.10/MWh   (marginal unit: ccgt)
agent supply  5,000 kW  ->  $75.25/MWh   (marginal unit: lignite)
agent supply 20,000 kW  ->  $ 9.00/MWh   (marginal unit: nuclear)
agent supply 30,000 kW  ->  $ -3.12/MWh  (oversupplied)
agent supply 60,000 kW  ->  $-25.00/MWh  (price floor)
```

This is real — it is why solar-heavy grids see midday prices collapse. The
consequences the agent has to reason about all follow from it:

- **Cannibalisation.** The tenth solar farm earns far less per MWh than the
  first, and a portfolio of nothing but solar competes with itself at noon.
  Diversifying across wind, hydro and solar is worth real money.
- **Scarcity rents.** As the reserve margin thins the price climbs steeply
  toward the cap. Demand grows ~2.2%/year against a fixed thermal fleet, so
  capacity still standing in year 10 is worth far more than capacity sold in
  year 2. Short-horizon strategies leave this on the table.
- **Negative prices.** Oversupply pays you to stop.
- **A rising carbon price** lifts thermal marginal costs over the decade, so
  the merit order learned in year 1 is not the merit order of year 10.

Capital goods move too: an AR(1) commodity index, a congestion premium when you
order many machines at once, and a Wright's-law learning curve (−16% per
doubling of cumulative installs) pulling the other way.

## Why the objective is *value*, not cash

```
equity value = PV(future cash flows of built assets) + cash − debt
```

Each asset is discounted at **its own realised capture price** — its lifetime
revenue over its lifetime MWh — not at the market average. So when an agent
floods the market and depresses the midday price, the DCF of every solar asset
it already owns falls with it. Cannibalisation lands on the balance sheet,
which is where a developer would feel it.

The financing is a real set of books, so wealth can go *down*:

- Capex can be part-funded with debt up to a leverage cap. The credit spread
  widens with leverage, so the marginal dollar of debt costs more than the
  average one and "borrow the maximum" is not optimal.
- A DSCR covenant is tested quarterly on trailing-twelve-month figures after a
  construction grace period. Breaching costs cash and blocks new borrowing —
  an agent that levers into a bad year is locked out exactly when it wants to
  build.
- Depreciation shields tax and losses carry forward, so reported profit and
  cash flow are different numbers.
- Cash below the insolvency floor **terminates the run**. Bankruptcy is an
  absorbing state, not a bad score.

## Every control has to matter

The three mechanics the spec cares most about are load-bearing here, and each
has a test that would fail if it became decorative.

**Turbine orientation** enters output as `cos(yaw misalignment)`, clipped hard
at zero:

```
wind from 275 deg, local speed 6.04 m/s
  yaw offset   0 deg ->  385.7 kW
  yaw offset  30 deg ->  334.1 kW   (= 0.866 x)
  yaw offset  60 deg ->  192.9 kW   (= 0.500 x)
  yaw offset  90 deg ->    0.0 kW
```

Wind direction mean-reverts to a seasonal prevailing bearing (OU process,
sd ≈ 12°), so aiming turbines is a skill that *pays* rather than a coin flip —
and re-yawing as the prevailing wind veers between seasons is worth doing.

**Wiring** is a real network. Transmission loss uses the length of the actual
cable path found by BFS over the cable graph, not straight-line distance, so
layout matters. Capacity is enforced **per segment** along that path — two
farms sharing one trunk congest it and get curtailed, and the fix is a fatter
or parallel route. A generator with no cable on or beside it delivers nothing;
that energy is logged as `unconnected` and earns zero.

**Hydraulic head** comes from the drainage graph (`E16`: upstream surface
elevation minus downstream), so siting hydro where the river actually falls is
what produces power.

Panel azimuth and tilt enter solar output through a real `cos(incidence)`
against the sun vector, so orientation matters there too.

## Anti-memorisation

The spec's Section 41 warns against surface heuristics like "sand means solar"
and "mountain means wind". Both are false in this model by construction: no
terrain carries an energy multiplier, and a leeward mountain cell has *worse*
wind than flat ground because of the wind-shadow term.

A `lookup` agent ships with the benchmark that does nothing but consult a fixed
terrain → machine table at a fixed orientation. It exists to be beaten, and
`test_20_reasoning_beats_the_lookup_table` fails the build if it ever isn't.

Held-out generalisation is a first-class command — same physics, new seed:

```bash
wfbench generalise --agent heuristic --train 1-5 --held-out 101-105
```

A relative gap above 25% is flagged as evidence the agent fitted the layout
rather than the rules.

---

## The Python API

```python
from worldforge_bench import Simulation

sim = Simulation(seed=42)

# Site from the physics, not from terrain type.
print(sim.can_place("wind", 6, 11).reason)
print(sim.predict("wind", 6, 11).message)

sim.place("wind", 6, 11, orientation=sim.best_orientation("wind", 6, 11),
          debt_fraction=0.45)
sim.cable([(6, 11), (6, 10), (7, 10)])
sim.sign_ppa(0.5)

sim.advance(24 * 365)
print(sim.report())
```

Gym-flavoured, where reward is the change in equity value in $m:

```python
from worldforge_bench import WorldForgeEnv

env = WorldForgeEnv(seed=42, auto_advance=24 * 7)
obs = env.reset()
obs, reward, done, info = env.step({"type": "PLACE", "kind": "wind",
                                    "x": 6, "y": 11, "orientation": 270})
```

### Actions

| Action | Fields |
|---|---|
| `PLACE` | `kind`, `x`, `y`, `orientation?`, `tilt?`, `debt_fraction?` |
| `PLACE_CABLE` | `path` (contiguous 4-connected cells), `debt_fraction?` |
| `SET_ORIENTATION` | `x`, `y`, `orientation`, `tilt?` |
| `REINFORCE` | `x`, `y`, `overlay` (`gravel`\|`stone`) |
| `REMOVE` | `x`, `y` |
| `SIGN_PPA` | `fraction` |
| `QUERY_PREDICTION` | `kind`, `x`, `y`, `predicted_kw?` |
| `ADVANCE_TIME` | `ticks` |

`QUERY_PREDICTION` returns ground truth for the causal-reasoning tests. Pass
your own `predicted_kw` and the harness scores your accuracy against it.

Cable runs are **all-or-nothing**: a path that fails validation anywhere lays
nothing and spends nothing, so the world never enters a half-wired state.

### JSON API for LLM agents

```bash
wfbench serve --seed 42
```

Line-delimited JSON on stdin/stdout, so any process can drive the simulation as
a tool:

```json
{"op": "observe", "include_grid": false}
{"op": "can_place", "kind": "wind", "x": 6, "y": 11}
{"op": "act", "action": {"type": "PLACE", "kind": "wind", "x": 6, "y": 11}}
{"op": "advance", "ticks": 168}
{"op": "score"}
```

## Scoring

Composite out of 100, wealth-weighted, with every raw metric also logged
independently so a failure can be attributed to a capability rather than to a
number:

| Component | Weight | Raw metric |
|---|---|---|
| wealth | 0.40 | terminal equity value vs starting equity |
| reliability | 0.13 | mean served/demanded, penalised for variance |
| energy | 0.12 | share of system demand served |
| capital efficiency | 0.12 | lifetime ROIC |
| risk | 0.10 | max drawdown, covenant breaches, insolvency |
| prediction | 0.08 | `QUERY_PREDICTION` accuracy |
| placement | 0.05 | valid placements / attempted |

Also reported raw: IRR, LCOE, capacity factor, mean capture price,
curtailment rate, installed capacity, max drawdown.

If an agent never issues `QUERY_PREDICTION`, that weight is redistributed
rather than scored as zero — not using an optional diagnostic is not a failure.

## Testing

```bash
pytest -q      # 41 tests
```

The suite implements the spec's Top 20 test cases as executable checks: water
mass balance and energy conservation every tick, determinism by state hash,
wind-shadow and cut-in/cut-out behaviour, hydro floors with no divide-by-zero,
specific placement-failure reasons, reinforcement tiers, cable-capacity
curtailment, and the anti-memorisation probe.

## Deviations from the specification

Deliberate, and each one is commented at the site:

1. **Price is endogenous.** Section 18 prices from a fixed schedule per demand
   tier. A fixed schedule gives the agent no reason to care *when* it
   generates, so it is replaced by merit-order clearing (`economy/market.py`).
2. **Full project finance.** Section 18's `netWorth` is cumulative profit minus
   build cost. Replaced by a balance sheet with debt, tax, depreciation and DCF
   valuation, so wealth can fall.
3. **Transmission loss compounds.** `E18`'s linear `delivered = generated −
   distance × lossPerCell` goes negative past `1/k` cells. Uses
   `1 − (1−k)^d` instead: bounded in [0,1), and equal to E18 to first order.
4. **Snow stability raised 0.60 → 0.70.** The Section 6 table gives Snow
   stability 0.60 and marks it non-reinforceable, while Section 6.5 and the
   Final Machine Compatibility Matrix both say Wind is allowed on Snow. Those
   cannot both hold, since Section 15 requires 0.70 for Wind. Both figures are
   `[CONFIGURABLE]`; the compatibility matrix states the intent twice.
5. **Clouds are a field, not entities.** v1 models cloud cover as a spatially
   textured AR(1) field rather than the tracked cloud objects of Section 7.
   Snow accumulation/melt and orographic rain-shadow are deferred. Wind shadow
   *is* implemented, because it is the key spatial signal for siting.

## Layout

```
src/worldforge_bench/
  config.py          every tunable constant, in one object
  terrain.py         static property table T01-T07
  generator.py       procedural maps; physics fixed, layout seeded
  world.py           WorldState, the five separated layers
  physics/           sun, wind, water+rivers, weather
  machines.py        output equations E3, E5, E17
  placement.py       CAN_PLACE, fail-fast with specific reasons
  network.py         cable graph, routed losses, per-segment capacity
  economy/
    market.py        merit-order clearing, commodity prices
    finance.py       balance sheet, debt, tax, covenants
    valuation.py     DCF, LCOE, IRR
  engine.py          the tick, in Section 24 order
  env.py             Simulation and WorldForgeEnv
  scoring.py         composite score + raw metrics
  benchmark.py       suites, aggregation, generalisation gap
  agents/            donothing, random, lookup, heuristic
  cli.py             wfbench
```

The tick order is Section 24's, and the reason it cannot go circular is
unchanged: every step reads only state fixed before the tick began or already
recomputed earlier in the same tick. Rivers resolve after the water cycle,
machine outputs after every environmental field, the market after every
physical output, and the books after the market.
