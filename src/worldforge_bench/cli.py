"""Command-line interface.

    wfbench map      --seed 42
    wfbench run      --agent heuristic --seed 42 --years 10
    wfbench bench    --agents donothing,lookup,random,heuristic --seeds 1-10
    wfbench generalise --agent heuristic --train 1-5 --held-out 101-105
    wfbench inspect  --seed 42 -x 6 -y 11
    wfbench market   --seed 42 --days 3
    wfbench play     --seed 42
    wfbench serve
"""

from __future__ import annotations

import argparse
import json
import sys

from .actions import Action
from .agents import AGENTS
from .benchmark import (aggregate, generalisation_gap, leaderboard,
                        run_episode, to_json)
from .config import DEFAULT_CONFIG
from .env import Simulation
from .observation import ascii_map, cell_view


def _seeds(spec: str) -> list:
    out = []
    for part in spec.split(","):
        part = part.strip()
        if "-" in part and not part.startswith("-"):
            lo, hi = part.split("-", 1)
            out.extend(range(int(lo), int(hi) + 1))
        elif part:
            out.append(int(part))
    return out


def _cfg(args):
    cfg = DEFAULT_CONFIG
    over = {}
    if getattr(args, "years", None) is not None:
        over["time"] = {"horizon_years": args.years}
    if getattr(args, "width", None):
        over["world"] = {"width": args.width, "height": args.height or args.width}
    return cfg.with_overrides(**over) if over else cfg


# -- commands --------------------------------------------------------------

def cmd_map(args):
    sim = Simulation(args.seed, _cfg(args))
    sim.advance(12)
    print(f"seed {args.seed}   {sim.engine.state.width}x{sim.engine.state.height}")
    print(sim.map())


def cmd_run(args):
    def progress(done, total):
        if not args.quiet:
            pct = done / total
            bar = "#" * int(pct * 30)
            print(f"\r  [{bar:<30}] {pct:5.1%}", end="", file=sys.stderr)

    rec, card, sim = run_episode(
        args.agent, args.seed, cfg=_cfg(args),
        decision_interval=args.interval,
        progress=None if args.quiet else progress)
    if not args.quiet:
        print("", file=sys.stderr)
    if args.json:
        print(json.dumps(card.to_dict(), indent=2, default=str))
    else:
        print(card.summary())
        if args.show_map:
            print()
            print(sim.map())


def cmd_bench(args):
    agents = [a.strip() for a in args.agents.split(",") if a.strip()]
    seeds = _seeds(args.seeds)
    for a in agents:
        if a not in AGENTS:
            raise SystemExit(f"unknown agent '{a}'; available: {', '.join(sorted(AGENTS))}")

    records = []
    total = len(agents) * len(seeds)
    n = 0
    for name in agents:
        for seed in seeds:
            n += 1
            print(f"  [{n}/{total}] {name} seed {seed} ...", end="", flush=True,
                  file=sys.stderr)
            rec, _c, _s = run_episode(name, seed, cfg=_cfg(args),
                                      decision_interval=args.interval)
            records.append(rec)
            print(f" score {rec.score:5.1f}  ({rec.wall_seconds:.1f}s)", file=sys.stderr)

    agg = aggregate(records)
    print()
    print(leaderboard(agg))
    if args.out:
        to_json(records, args.out)
        print(f"\nwrote {len(records)} run records to {args.out}")


def cmd_generalise(args):
    train_seeds, held_seeds = _seeds(args.train), _seeds(args.held_out)
    train, held = [], []
    for seed in train_seeds:
        r, _c, _s = run_episode(args.agent, seed, cfg=_cfg(args),
                                decision_interval=args.interval)
        train.append(r)
        print(f"  train  seed {seed:4d}  score {r.score:5.1f}", file=sys.stderr)
    for seed in held_seeds:
        r, _c, _s = run_episode(args.agent, seed, cfg=_cfg(args),
                                decision_interval=args.interval)
        held.append(r)
        print(f"  held   seed {seed:4d}  score {r.score:5.1f}", file=sys.stderr)

    gap = generalisation_gap(train, held)
    print()
    for agent, g in gap.items():
        print(f"{agent}:  train {g['train_score']:.1f}   held-out {g['held_out_score']:.1f}"
              f"   gap {g['gap']:+.1f} ({g['relative_gap']:+.1%})")
        if g["relative_gap"] > 0.25:
            print("  -> gap exceeds 25%: this agent looks like it fitted the layout, "
                  "not the rules.")


def cmd_inspect(args):
    sim = Simulation(args.seed, _cfg(args))
    sim.advance(args.ticks)
    view = cell_view(sim.engine.state, sim.engine.cfg, args.x, args.y)
    print(json.dumps(view, indent=2))
    print("\nplacement legality here:")
    for kind in ("land_solar", "floating_solar", "wind", "hydro", "cable"):
        r = sim.can_place(kind, args.x, args.y)
        print(f"  {kind:<15} {'VALID' if r.valid else 'INVALID'}  {r.reason}")


def cmd_market(args):
    sim = Simulation(args.seed, _cfg(args))
    ticks = args.days * sim.engine.cfg.time.ticks_per_day
    print(f"{'tick':>6}{'hr':>4}{'season':>8}{'demand kW':>12}{'price $/MWh':>13}"
          f"{'marginal':>11}{'reserve':>9}")
    for i in range(ticks):
        r = sim.engine.tick()
        if i % max(1, args.every) == 0:
            st = sim.engine.state
            m = sim.engine.market
            from .physics.weather import SEASON_NAMES
            mt = m.price_history[-1] if m.price_history else 0
            print(f"{st.tick:>6}{st.hour:>4}{SEASON_NAMES[st.season]:>8}"
                  f"{r.demand_kw:>12,.0f}{mt:>13,.2f}"
                  f"{'':>11}{'':>9}")


def cmd_play(args):
    sim = Simulation(args.seed, _cfg(args))
    print("WorldForge interactive. Commands:")
    print("  map | obs | adv N | place KIND X Y [DEG] | cable X0 Y0 X1 Y1 | "
          "orient X Y DEG | reinforce X Y [gravel|stone]")
    print("  inspect X Y | predict KIND X Y | ppa FRAC | score | quit")
    while True:
        try:
            line = input(f"[t={sim.tick} ${sim.engine.finance.books.cash:,.0f}] > ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if not line:
            continue
        parts = line.split()
        cmd, rest = parts[0].lower(), parts[1:]
        try:
            if cmd in ("quit", "exit", "q"):
                break
            elif cmd == "map":
                print(sim.map())
            elif cmd == "obs":
                print(json.dumps(sim.observe(include_grid=False), indent=2)[:3000])
            elif cmd == "adv":
                sim.advance(int(rest[0]) if rest else 1)
                print(f"  tick {sim.tick}")
            elif cmd == "place":
                kind, x, y = rest[0], int(rest[1]), int(rest[2])
                deg = float(rest[3]) if len(rest) > 3 else None
                r = sim.place(kind, x, y, orientation=deg)
                print(("  OK  " if r.ok else "  ERR ") + r.message)
            elif cmd == "cable":
                x0, y0, x1, y1 = map(int, rest[:4])
                path = []
                x, y = x0, y0
                while x != x1:
                    x += 1 if x1 > x else -1
                    path.append([x, y])
                while y != y1:
                    y += 1 if y1 > y else -1
                    path.append([x, y])
                r = sim.cable([[x0, y0]] + path)
                print(("  OK  " if r.ok else "  ERR ") + r.message)
            elif cmd == "orient":
                r = sim.orient(int(rest[0]), int(rest[1]), float(rest[2]))
                print(("  OK  " if r.ok else "  ERR ") + r.message)
            elif cmd == "reinforce":
                ov = rest[2] if len(rest) > 2 else "gravel"
                r = sim.reinforce(int(rest[0]), int(rest[1]), ov)
                print(("  OK  " if r.ok else "  ERR ") + r.message)
            elif cmd == "inspect":
                print(json.dumps(cell_view(sim.engine.state, sim.engine.cfg,
                                           int(rest[0]), int(rest[1])), indent=2))
            elif cmd == "predict":
                r = sim.predict(rest[0], int(rest[1]), int(rest[2]))
                print("  " + r.message)
            elif cmd == "ppa":
                r = sim.sign_ppa(float(rest[0]))
                print(("  OK  " if r.ok else "  ERR ") + r.message)
            elif cmd == "score":
                print(sim.report())
            else:
                print(f"  unknown command '{cmd}'")
        except (IndexError, ValueError) as e:
            print(f"  bad arguments: {e}")


def cmd_serve(args):
    """Line-delimited JSON over stdin/stdout, so any process -- including an
    LLM agent loop -- can drive the simulation as a tool.

    Request:  {"op": "place", "kind": "wind", "x": 3, "y": 4}
    Response: {"ok": true, "message": "...", "observation": {...}}
    """
    sim = Simulation(args.seed, _cfg(args))
    print(json.dumps({"ok": True, "message": "ready", "seed": args.seed,
                      "ops": ["observe", "map", "act", "advance", "can_place",
                              "predict", "score", "reset", "quit"]}), flush=True)
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
            op = req.get("op")
            if op == "quit":
                break
            elif op == "observe":
                out = {"ok": True, "observation": sim.observe(
                    include_grid=req.get("include_grid", True),
                    radius=req.get("radius"), centre=req.get("centre"))}
            elif op == "map":
                out = {"ok": True, "map": sim.map()}
            elif op == "act":
                r = sim.act(Action.from_dict(req["action"]))
                out = {"ok": r.ok, "message": r.message, "cost": r.cost, "data": r.data}
            elif op == "advance":
                sim.advance(int(req.get("ticks", 1)))
                out = {"ok": True, "tick": sim.tick, "terminated": sim.terminated}
            elif op == "can_place":
                r = sim.can_place(req["kind"], req["x"], req["y"])
                out = {"ok": True, "valid": r.valid, "reason": r.reason}
            elif op == "predict":
                r = sim.predict(req["kind"], req["x"], req["y"],
                                req.get("predicted_kw"))
                out = {"ok": r.ok, "message": r.message, "data": r.data}
            elif op == "score":
                out = {"ok": True, "score": sim.score().to_dict()}
            elif op == "reset":
                sim = Simulation(req.get("seed", args.seed), _cfg(args))
                out = {"ok": True, "message": "reset"}
            else:
                out = {"ok": False, "message": f"unknown op '{op}'"}
        except Exception as e:                      # never kill the server on bad input
            out = {"ok": False, "message": f"{type(e).__name__}: {e}"}
        print(json.dumps(out, default=str), flush=True)


# -- parser ----------------------------------------------------------------

def build_parser():
    p = argparse.ArgumentParser(prog="wfbench",
                                description="Grid Energy Ecosystem benchmark")
    sub = p.add_subparsers(dest="cmd", required=True)

    def common(sp, years_default=None):
        sp.add_argument("--seed", type=int, default=42)
        sp.add_argument("--years", type=float, default=years_default)
        sp.add_argument("--width", type=int)
        sp.add_argument("--height", type=int)
        sp.add_argument("--interval", type=int, default=24 * 7,
                        help="ticks between agent decisions")

    sp = sub.add_parser("map", help="print the terrain map")
    common(sp); sp.set_defaults(func=cmd_map)

    sp = sub.add_parser("run", help="run one agent on one seed")
    common(sp)
    sp.add_argument("--agent", default="heuristic", choices=sorted(AGENTS))
    sp.add_argument("--json", action="store_true")
    sp.add_argument("--quiet", action="store_true")
    sp.add_argument("--show-map", action="store_true")
    sp.set_defaults(func=cmd_run)

    sp = sub.add_parser("bench", help="run a suite and print a leaderboard")
    common(sp)
    sp.add_argument("--agents", default="donothing,lookup,random,heuristic")
    sp.add_argument("--seeds", default="1-5")
    sp.add_argument("--out")
    sp.set_defaults(func=cmd_bench)

    sp = sub.add_parser("generalise", help="train vs held-out map comparison")
    common(sp)
    sp.add_argument("--agent", default="heuristic", choices=sorted(AGENTS))
    sp.add_argument("--train", default="1-5")
    sp.add_argument("--held-out", dest="held_out", default="101-105")
    sp.set_defaults(func=cmd_generalise)

    sp = sub.add_parser("inspect", help="dump one cell and its placement legality")
    common(sp)
    sp.add_argument("-x", type=int, required=True)
    sp.add_argument("-y", type=int, required=True)
    sp.add_argument("--ticks", type=int, default=12)
    sp.set_defaults(func=cmd_inspect)

    sp = sub.add_parser("market", help="watch the price clear over time")
    common(sp)
    sp.add_argument("--days", type=int, default=2)
    sp.add_argument("--every", type=int, default=1)
    sp.set_defaults(func=cmd_market)

    sp = sub.add_parser("play", help="interactive session")
    common(sp); sp.set_defaults(func=cmd_play)

    sp = sub.add_parser("serve", help="line-delimited JSON API on stdin/stdout")
    common(sp); sp.set_defaults(func=cmd_serve)
    return p


def main(argv=None):
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    main()
