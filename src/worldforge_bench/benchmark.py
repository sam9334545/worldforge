"""Benchmark harness: run agents over seeds, aggregate, compare.

The generalisation split (Section 33) is the reason this exists. Physical
constants are fixed; only the map seed varies. An agent that has learned the
rules scores similarly on train and held-out seeds. An agent that memorised a
layout does not, and the gap is reported explicitly.
"""

from __future__ import annotations

import json
import statistics
import time
from dataclasses import asdict, dataclass, field

from .agents import get_agent
from .config import DEFAULT_CONFIG, Config
from .env import Simulation


@dataclass
class RunRecord:
    agent: str
    seed: int
    score: float
    terminal_equity: float
    total_return: float
    mwh_delivered: float
    reliability: float
    roic: float
    lcoe: float
    capacity_factor: float
    curtailment_rate: float
    max_drawdown: float
    insolvent: bool
    machines: int
    cable_cells: int
    ticks: int
    wall_seconds: float
    components: dict = field(default_factory=dict)


def run_episode(agent_name: str, seed: int, cfg: Config | None = None,
                horizon_years: float | None = None,
                decision_interval: int = 24 * 7,
                agent_kwargs: dict | None = None,
                progress=None) -> tuple:
    cfg = cfg or DEFAULT_CONFIG
    if horizon_years is not None:
        cfg = cfg.with_overrides(time={"horizon_years": horizon_years})

    sim = Simulation(seed, cfg)
    if agent_kwargs is None:
        # Stochastic agents get the episode seed so a suite is reproducible.
        agent_kwargs = {"seed": seed} if agent_name == "random" else {}
    agent = get_agent(agent_name, **agent_kwargs)

    per_year = cfg.time.ticks_per_day * cfg.time.days_per_year
    total_ticks = int(cfg.time.horizon_years * per_year)
    t0 = time.time()

    done = 0
    while done < total_ticks and not sim.terminated:
        obs = sim.observe(include_grid=False)
        for action in agent.act(sim, obs):
            sim.act(action)
        step = min(decision_interval, total_ticks - done)
        sim.advance(step)
        done += step
        if progress:
            progress(done, total_ticks)

    card = sim.score()
    rec = RunRecord(
        agent=agent_name, seed=seed, score=card.score,
        terminal_equity=card.terminal_equity, total_return=card.total_return,
        mwh_delivered=card.mwh_delivered, reliability=card.mean_reliability,
        roic=card.roic, lcoe=card.lcoe, capacity_factor=card.capacity_factor,
        curtailment_rate=card.curtailment_rate, max_drawdown=card.max_drawdown,
        insolvent=card.insolvent, machines=card.machines_built,
        cable_cells=card.cable_cells, ticks=card.ticks,
        wall_seconds=round(time.time() - t0, 2),
        components=card.components,
    )
    return rec, card, sim


def run_suite(agent_names: list, seeds: list, **kw) -> list:
    records = []
    for name in agent_names:
        for seed in seeds:
            rec, _card, _sim = run_episode(name, seed, **kw)
            records.append(rec)
    return records


def aggregate(records: list) -> dict:
    by_agent: dict = {}
    for r in records:
        by_agent.setdefault(r.agent, []).append(r)

    out = {}
    for agent, rs in by_agent.items():
        scores = [r.score for r in rs]
        out[agent] = {
            "n": len(rs),
            "score_mean": round(statistics.fmean(scores), 2),
            "score_sd": round(statistics.pstdev(scores), 2) if len(scores) > 1 else 0.0,
            "score_min": round(min(scores), 2),
            "score_max": round(max(scores), 2),
            "equity_mean": round(statistics.fmean(r.terminal_equity for r in rs), 0),
            "return_mean": round(statistics.fmean(r.total_return for r in rs), 4),
            "mwh_mean": round(statistics.fmean(r.mwh_delivered for r in rs), 0),
            "reliability_mean": round(statistics.fmean(r.reliability for r in rs), 4),
            "roic_mean": round(statistics.fmean(r.roic for r in rs), 4),
            "lcoe_mean": round(statistics.fmean(r.lcoe for r in rs), 2),
            "curtailment_mean": round(statistics.fmean(r.curtailment_rate for r in rs), 4),
            "insolvencies": sum(1 for r in rs if r.insolvent),
        }
    return out


def generalisation_gap(train: list, held_out: list) -> dict:
    """Section 33/34. A large positive gap means the agent fitted the layout,
    not the rules."""
    ta, ha = aggregate(train), aggregate(held_out)
    out = {}
    for agent in ta:
        if agent not in ha:
            continue
        t, h = ta[agent]["score_mean"], ha[agent]["score_mean"]
        out[agent] = {
            "train_score": t, "held_out_score": h,
            "gap": round(t - h, 2),
            "relative_gap": round((t - h) / t, 4) if t else 0.0,
        }
    return out


def to_json(records: list, path: str) -> None:
    with open(path, "w") as fh:
        json.dump([asdict(r) for r in records], fh, indent=2)


def leaderboard(agg: dict) -> str:
    rows = sorted(agg.items(), key=lambda kv: -kv[1]["score_mean"])
    head = (f"{'agent':<14}{'score':>8}{'±sd':>7}{'equity($m)':>12}"
            f"{'return':>9}{'MWh':>11}{'relia':>8}{'ROIC':>8}{'LCOE':>8}{'insolv':>7}")
    lines = [head, "-" * len(head)]
    for name, a in rows:
        lines.append(
            f"{name:<14}{a['score_mean']:>8.1f}{a['score_sd']:>7.1f}"
            f"{a['equity_mean']/1e6:>12,.2f}{a['return_mean']:>9.1%}"
            f"{a['mwh_mean']:>11,.0f}{a['reliability_mean']:>8.1%}"
            f"{a['roic_mean']:>8.1%}{a['lcoe_mean']:>8.1f}{a['insolvencies']:>7d}")
    return "\n".join(lines)
