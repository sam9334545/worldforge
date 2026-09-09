"""Session driver for language-model agents, built for low interaction cost.

State is pickled between invocations so each command is a standalone process.
The round schedule is enforced here, not trusted to the agent: every model gets
the same clock and the same number of decisions.

Token efficiency is a design goal. The earlier JSON-grid observation cost
millions of cached tokens per episode and forced runs to be cut short, so every
command here emits compact fixed-width text, `batch` submits many actions in one
call, and `run` advances many rounds in one call. A full episode is ~15 calls.

    python llm_play.py new    --session S --seed 1
    python llm_play.py brief  --session S
    python llm_play.py map    --session S
    python llm_play.py cells  --session S --kind wind [--legal] [--limit N]
    python llm_play.py batch  --session S --json '[{...},{...}]'
    python llm_play.py run    --session S --rounds N
    python llm_play.py score  --session S
"""

from __future__ import annotations

import argparse
import json
import pathlib
import pickle
import sys

from worldforge_bench.actions import Action
from worldforge_bench.config import DEFAULT_CONFIG
from worldforge_bench.env import Simulation

SESSION_DIR = pathlib.Path(__file__).resolve().parent / ".sessions"
KINDS = ("land_solar", "floating_solar", "wind", "hydro")


def path(name):
    SESSION_DIR.mkdir(parents=True, exist_ok=True)
    return SESSION_DIR / f"{name}.pkl"


def load(name):
    p = path(name)
    if not p.exists():
        sys.exit(f"ERR no session '{name}'; run `new` first")
    return pickle.load(open(p, "rb"))


def save(name, blob):
    pickle.dump(blob, open(path(name), "wb"))


def m(v):
    return f"{v/1e6:.2f}M"


def brief(sim, blob) -> str:
    """One compact status block. No per-cell grid."""
    o = sim.observe(include_grid=False)
    st, f, mk = sim.engine.state, o["finance"], o["market"]
    lines = [
        f"round {blob['round']}/{blob['rounds']}  tick {st.tick}  "
        f"y{o['clock']['year']} d{o['clock']['day']} {o['clock']['season']} "
        f"h{o['clock']['hour']}",
        f"cash {m(f['cash'])} debt {m(f['debt'])} equity {m(f['equity_value'])} "
        f"headroom {m(f['debt_headroom'])} lev {f['leverage']:.2f}",
        f"price {mk['price']} 24h_avg {mk['price_mean_24h']} ppa_offer "
        f"{mk['ppa_strike_on_offer']} carbon {mk['carbon_price']}",
        f"installed {f['installed_capacity_kw']:.0f}kW cf {f['capacity_factor']:.2f} "
        f"delivered {f['cum_mwh_delivered']/1000:.1f}GWh lcoe {f['lcoe']} "
        f"hedged {f['hedged_fraction']:.2f}",
        f"wind {st.global_wind_speed:.1f}m/s from {st.global_wind_dir:.0f}deg  "
        f"sun_elev {st.sun_elevation:.0f}deg sun_az {st.sun_azimuth:.0f}deg  "
        f"cloud {o['weather']['mean_cloud']:.2f}",
        "capex " + " ".join(f"{k}={v/1000:.0f}k" for k, v in mk["capex_now"].items()),
    ]
    for z in o["grid"]["zones"]:
        lines.append(f"zone{z['id']} {z['tier']} centre{tuple(z['centre'])} "
                     f"demand {z['demand_kw']:.0f}kW served {z['served_kw']:.0f}kW")
    mach = o["grid"]["machines"]
    lines.append(f"machines {len(mach)} cable_cells {len(o['grid']['cable_cells'])}")
    for mm in mach[:40]:
        lines.append(f"  {mm['kind']:<14}{str(tuple(mm['pos'])):<9}"
                     f"or{mm['orientation']:>4.0f} out {mm['output_kw']:>7.1f}kW "
                     f"deliv {mm['delivered_kw']:>7.1f} curt {mm['curtailed_kw']:>6.1f}")
    if len(mach) > 40:
        lines.append(f"  ... {len(mach)-40} more")
    return "\n".join(lines)


def cells(sim, kind, legal_only, limit) -> str:
    """Compact per-cell table: raw field values, no ranking, no advice."""
    st = sim.engine.state
    fl = st.fields
    rows = []
    for y in range(st.height):
        for x in range(st.width):
            chk = sim.can_place(kind, x, y) if kind else None
            if legal_only and chk is not None and not chk.valid:
                continue
            rows.append((
                x, y, st.terrain_at(x, y).name.split("/")[0][:6],
                float(st.elevation[y, x]),
                sim.engine.state.effective_stability(x, y, sim.engine.cfg),
                float(fl.wind_speed[y, x]), float(fl.irradiance[y, x]),
                float(fl.obstruction[y, x]), float(fl.flow_q[y, x]),
                float(fl.head[y, x]), float(fl.velocity[y, x]),
                "y" if (x, y) in st.cables else "n",
                "Y" if (chk is None or chk.valid) else "n",
            ))
    out = [f"cells kind={kind or 'any'} legal_only={legal_only} shown={min(len(rows),limit)}/{len(rows)}",
           "   x  y terr   elev stab  wind    irr  obst   flowQ  head   vel cab ok"]
    for r in rows[:limit]:
        out.append(f"{r[0]:>4}{r[1]:>3} {r[2]:<6}{r[3]:>5.0f}{r[4]:>5.2f}"
                   f"{r[5]:>6.2f}{r[6]:>7.0f}{r[7]:>6.2f}{r[8]:>8.2f}{r[9]:>6.2f}"
                   f"{r[10]:>6.2f}{r[11]:>4}{r[12]:>3}")
    if len(rows) > limit:
        out.append(f"... {len(rows)-limit} more (raise --limit)")
    return "\n".join(out)


def _prime(sim, cfg):
    """Populate the derived fields at t=0 without advancing the clock.

    Runs the same physics the tick loop runs, so an agent can inspect local
    wind, irradiance and river flow before spending its first round. It only
    writes derived state; no counters move and no economics run.
    """
    from worldforge_bench.physics import sun as _sun
    from worldforge_bench.physics import wind as _wind
    st = sim.engine.state
    st.sun_elevation, st.sun_azimuth = _sun.solar_position(st.day, st.hour, cfg)
    _sun.update_irradiance(st, cfg)
    _wind.update_wind(st, cfg)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["new", "brief", "map", "cells", "act", "batch",
                                    "run", "step", "score", "status"])
    ap.add_argument("--session", required=True)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--rounds", type=int, default=1)
    ap.add_argument("--total-rounds", type=int, default=20)
    ap.add_argument("--years", type=float, default=10.0)
    ap.add_argument("--kind", choices=KINDS + ("cable",))
    ap.add_argument("--legal", action="store_true")
    ap.add_argument("--limit", type=int, default=40)
    ap.add_argument("--json", dest="payload")
    a = ap.parse_args()

    if a.cmd == "new":
        cfg = DEFAULT_CONFIG.with_overrides(time={"horizon_years": a.years})
        sim = Simulation(a.seed, cfg)
        _prime(sim, cfg)
        per_year = cfg.time.ticks_per_day * cfg.time.days_per_year
        total = int(a.years * per_year)
        blob = {"sim": sim, "round": 0, "rounds": a.total_rounds,
                "ticks_per_round": total // a.total_rounds, "acts": 0, "rejected": 0}
        save(a.session, blob)
        print(f"OK session={a.session} seed={a.seed} rounds={a.total_rounds} "
              f"days_per_round={blob['ticks_per_round']/24:.0f} years={a.years}")
        print(brief(sim, blob))
        return

    blob = load(a.session)
    sim = blob["sim"]

    if a.cmd == "map":
        print(sim.map())
    elif a.cmd == "brief":
        print(brief(sim, blob))
    elif a.cmd == "status":
        print(f"round {blob['round']}/{blob['rounds']} tick {sim.tick} "
              f"acts {blob['acts']} rejected {blob['rejected']} "
              f"terminated {sim.terminated}")
    elif a.cmd == "cells":
        print(cells(sim, a.kind, a.legal, a.limit))
    elif a.cmd in ("act", "batch"):
        if not a.payload:
            sys.exit("ERR needs --json")
        payload = json.loads(a.payload)
        items = payload if isinstance(payload, list) else [payload]
        ok = err = 0
        for i, d in enumerate(items, 1):
            try:
                action = Action.from_dict(d)
                if action.type == "ADVANCE_TIME":
                    print(f"{i} ERR time advances only via `run`")
                    err += 1
                    continue
                r = sim.act(action)
            except Exception as e:
                print(f"{i} ERR {type(e).__name__}: {e}")
                err += 1
                blob["rejected"] += 1
                continue
            blob["acts"] += 1
            if r.ok:
                ok += 1
                print(f"{i} OK {r.message}"
                      + (f" cost={r.cost/1000:.0f}k" if r.cost else ""))
            else:
                err += 1
                blob["rejected"] += 1
                print(f"{i} ERR {r.message}")
        save(a.session, blob)
        print(f"-- {ok} ok, {err} rejected; cash {m(sim.engine.finance.books.cash)}")
    elif a.cmd in ("run", "step"):
        n = a.rounds if a.cmd == "run" else 1
        for _ in range(n):
            if blob["round"] >= blob["rounds"] or sim.terminated:
                break
            sim.advance(blob["ticks_per_round"])
            blob["round"] += 1
            o = sim.observe(include_grid=False)
            f = o["finance"]
            print(f"r{blob['round']:>2}/{blob['rounds']} {o['clock']['season']:<6} "
                  f"y{o['clock']['year']} cash {m(f['cash'])} eq {m(f['equity_value'])} "
                  f"price {o['market']['price']:>7} deliv "
                  f"{f['cum_mwh_delivered']/1000:>7.1f}GWh cf {f['capacity_factor']:.2f}")
        save(a.session, blob)
        if sim.terminated:
            print(f"TERMINATED {sim.engine.termination_reason}")
    elif a.cmd == "score":
        c = sim.score()
        print(c.summary())
        print(f"\nactions {blob['acts']} rejected {blob['rejected']} "
              f"rounds {blob['round']}/{blob['rounds']}")


if __name__ == "__main__":
    main()
