"""Benchmark router exposing scientific evaluation endpoints for WorldForge Bench."""

from __future__ import annotations

import time
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

import worldforge_bench
from worldforge_bench.agents import (
    AGENTS,
    DoNothingAgent,
    HeuristicAgent,
    LookupAgent,
    RandomAgent,
    get_agent,
)
from worldforge_bench.benchmark import (
    aggregate,
    generalisation_gap,
    leaderboard,
    run_episode,
    run_suite,
)
from worldforge_bench.config import DEFAULT_CONFIG, Config
from worldforge_bench.env import Simulation
router = APIRouter(tags=["benchmark"])

# Canonical agent aliases
AGENT_ALIASES: dict[str, str] = {
    "donothing": "donothing",
    "do_nothing": "donothing",
    "donothingagent": "donothing",
    "random": "random",
    "randomagent": "random",
    "lookup": "lookup",
    "lookupagent": "lookup",
    "heuristic": "heuristic",
    "heuristicagent": "heuristic",
    "hebbian": "hebbian",
    "hebbianagent": "hebbian",
    "bdh": "hebbian",
}

TRAIN_SEEDS: list[int] = [1, 2, 3, 4, 5]
HELDOUT_SEEDS: list[int] = [101, 102, 103, 104, 105]


# ---------------------------------------------------------------------------
# Request & Response Models
# ---------------------------------------------------------------------------


class BenchmarkRunRequest(BaseModel):
    seed: int = Field(
        ...,
        description="Random seed for deterministic world generation (e.g. training seeds 1-5, held-out seeds 101-105).",
    )
    agent_type: str = Field(
        ...,
        description="Agent policy type: 'donothing', 'random', 'lookup', or 'heuristic'.",
    )
    max_steps: int = Field(
        ...,
        gt=0,
        description="Maximum simulation ticks to execute.",
    )
    decision_interval: int = Field(
        168,
        gt=0,
        description="Ticks between agent decisions (default 168 = 1 sim week).",
    )
    include_step_logs: bool = Field(
        True,
        description="Whether to include detailed step logs in the response.",
    )
    max_log_entries: int = Field(
        100,
        ge=1,
        le=1000,
        description="Maximum number of step logs to return.",
    )


class SuiteRunRequest(BaseModel):
    agent_types: list[str] = Field(
        default=["donothing", "random", "lookup", "heuristic"],
        description="List of agent types to evaluate.",
    )
    seeds: list[int] = Field(
        default=[1, 2, 3, 4, 5],
        description="List of seeds to execute across agents.",
    )
    horizon_years: float = Field(
        0.5,
        gt=0.0,
        le=20.0,
        description="Simulation horizon in years for each episode.",
    )


class ActionLog(BaseModel):
    ok: bool
    action: str
    message: str
    cost: float = 0.0


class StepPerformanceLog(BaseModel):
    tick: int
    step: int
    actions_taken: int
    action_results: list[ActionLog]
    generated_kw: float
    delivered_kw: float
    curtailed_kw: float
    loss_kw: float
    price: float
    cash: float
    equity_value: float
    reliability: float
    events: list[str] = Field(default_factory=list)


class TransmissionEfficiency(BaseModel):
    mwh_generated: float
    mwh_delivered: float
    mwh_curtailed: float
    transmission_loss_mwh: float
    delivery_efficiency: float
    loss_rate: float
    curtailment_rate: float


class ScoringMetrics(BaseModel):
    score: float
    terminal_equity: float
    starting_equity: float
    total_return: float
    cash: float
    debt: float
    enterprise_value: float
    roic: float
    lcoe: float
    capacity_factor: float
    installed_capacity_kw: float
    mean_reliability: float
    reliability_std: float
    curtailment_rate: float
    max_drawdown: float
    covenant_breaches: int
    insolvent: bool
    placements_valid: int
    placements_attempted: int
    placement_efficiency: float
    machines_built: int
    cable_cells: int
    components: dict[str, float]
    weights: dict[str, float]


class PerformanceLogs(BaseModel):
    total_ticks: int
    sim_years: float
    wall_time_seconds: float
    terminated: bool
    termination_reason: str
    summary_report: str
    step_logs: list[StepPerformanceLog] = Field(default_factory=list)


class BenchmarkRunResponse(BaseModel):
    seed: int
    seed_category: str
    agent_type: str
    max_steps: int
    scoring_metrics: ScoringMetrics
    transmission_efficiency: TransmissionEfficiency
    performance_logs: PerformanceLogs


# ---------------------------------------------------------------------------
# Helper Functions
# ---------------------------------------------------------------------------


def resolve_agent_name(raw_name: str) -> str:
    cleaned = raw_name.strip().lower()
    if cleaned in AGENT_ALIASES:
        return AGENT_ALIASES[cleaned]
    if cleaned in AGENTS:
        return cleaned
    available = ", ".join(sorted(AGENTS.keys()))
    raise HTTPException(
        status_code=400,
        detail=f"Unknown agent type '{raw_name}'. Available types: {available}",
    )


def categorize_seed(seed: int) -> str:
    if seed in TRAIN_SEEDS:
        return "training"
    if seed in HELDOUT_SEEDS:
        return "held_out"
    return "custom"


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/agents")
def list_benchmark_agents():
    """List all available benchmark agents and their documentation."""
    agent_docs = {
        "donothing": "DoNothing baseline: holds starting cash, makes no placements, acts as safety/wealth floor.",
        "random": "Random stochastic baseline: makes random exploratory valid placements using the seed.",
        "lookup": "Lookup baseline: memorized terrain-to-machine fixed map ignoring weather/prices/state.",
        "heuristic": "Heuristic reasoning agent: full world-model reasoning across sun, wind, topography, demand, and finance.",
        "hebbian": "Hebbian fast-weights agent (BDH paradigm): local gradient-free associative memory across site features and realized outcomes.",
    }
    return {
        "available_agents": sorted(AGENTS.keys()),
        "descriptions": agent_docs,
    }


@router.get("/seeds")
def list_benchmark_seeds():
    """List standard training and held-out evaluation seeds."""
    return {
        "training_seeds": TRAIN_SEEDS,
        "held_out_seeds": HELDOUT_SEEDS,
        "description": "Physical constants are fixed; only the map seed varies. Comparing train vs held-out seeds measures generalization gap.",
    }


@router.post("/run", response_model=BenchmarkRunResponse)
def run_benchmark(req: BenchmarkRunRequest):
    """Execute a single agent benchmark evaluation with full observation-action loop."""
    agent_name = resolve_agent_name(req.agent_type)
    seed = req.seed
    max_steps = req.max_steps
    interval = req.decision_interval

    # Instantiate deterministic simulation
    cfg = DEFAULT_CONFIG
    sim = Simulation(seed=seed, cfg=cfg)

    # Initialize agent (stochastic agents get the seed for reproducibility)
    agent_kwargs = {"seed": seed} if agent_name == "random" else {}
    agent = get_agent(agent_name, **agent_kwargs)

    t0 = time.time()
    done = 0
    step_logs: list[StepPerformanceLog] = []

    # Step-by-step observation-action loop
    while done < max_steps and not sim.terminated:
        obs = sim.observe(include_grid=False)
        actions = agent.act(sim, obs)
        action_results: list[ActionLog] = []

        for act in actions:
            res = sim.act(act)
            action_results.append(
                ActionLog(
                    ok=res.ok,
                    action=str(res.action),
                    message=str(res.message),
                    cost=float(res.cost),
                )
            )

        step_ticks = min(interval, max_steps - done)
        tick_results = sim.advance(step_ticks)
        done += step_ticks

        if req.include_step_logs:
            last_tick_res = tick_results[-1] if tick_results else None
            if last_tick_res:
                step_logs.append(
                    StepPerformanceLog(
                        tick=sim.tick,
                        step=done,
                        actions_taken=len(actions),
                        action_results=action_results,
                        generated_kw=round(float(last_tick_res.generated_kw), 2),
                        delivered_kw=round(float(last_tick_res.delivered_kw), 2),
                        curtailed_kw=round(float(last_tick_res.curtailed_kw), 2),
                        loss_kw=round(float(last_tick_res.loss_kw), 2),
                        price=round(float(last_tick_res.price), 2),
                        cash=round(float(last_tick_res.cash), 2),
                        equity_value=round(float(last_tick_res.equity_value), 2),
                        reliability=round(float(last_tick_res.reliability), 4),
                        events=[str(e) for e in last_tick_res.events],
                    )
                )

    wall_time = round(time.time() - t0, 4)

    # Downsample step logs if exceeding requested max_log_entries
    if len(step_logs) > req.max_log_entries:
        step_stride = len(step_logs) / float(req.max_log_entries)
        sampled_indices = {int(i * step_stride) for i in range(req.max_log_entries)}
        sampled_indices.add(len(step_logs) - 1)
        step_logs = [log for i, log in enumerate(step_logs) if i in sampled_indices]

    # Compute final score and metrics
    card: ScoreCard = sim.score()

    # Transmission efficiency metrics
    mwh_gen = card.mwh_generated
    mwh_del = card.mwh_delivered
    mwh_cur = card.mwh_curtailed
    loss_mwh = max(0.0, mwh_gen - mwh_del - mwh_cur)
    delivery_eff = (mwh_del / mwh_gen) if mwh_gen > 1e-9 else 1.0
    loss_rate = (loss_mwh / mwh_gen) if mwh_gen > 1e-9 else 0.0

    tx_efficiency = TransmissionEfficiency(
        mwh_generated=round(mwh_gen, 4),
        mwh_delivered=round(mwh_del, 4),
        mwh_curtailed=round(mwh_cur, 4),
        transmission_loss_mwh=round(loss_mwh, 4),
        delivery_efficiency=round(delivery_eff, 4),
        loss_rate=round(loss_rate, 4),
        curtailment_rate=round(card.curtailment_rate, 4),
    )

    scoring_metrics = ScoringMetrics(
        score=round(card.score, 2),
        terminal_equity=round(card.terminal_equity, 2),
        starting_equity=round(card.starting_equity, 2),
        total_return=round(card.total_return, 4),
        cash=round(card.cash, 2),
        debt=round(card.debt, 2),
        enterprise_value=round(card.enterprise_value, 2),
        roic=round(card.roic, 4),
        lcoe=round(card.lcoe, 2),
        capacity_factor=round(card.capacity_factor, 4),
        installed_capacity_kw=round(card.installed_capacity_kw, 2),
        mean_reliability=round(card.mean_reliability, 4),
        reliability_std=round(card.reliability_std, 4),
        curtailment_rate=round(card.curtailment_rate, 4),
        max_drawdown=round(card.max_drawdown, 4),
        covenant_breaches=int(card.covenant_breaches),
        insolvent=bool(card.insolvent),
        placements_valid=int(card.placements_valid),
        placements_attempted=int(card.placements_attempted),
        placement_efficiency=round(card.placement_efficiency, 4),
        machines_built=int(card.machines_built),
        cable_cells=int(card.cable_cells),
        components={k: round(v, 4) for k, v in card.components.items()},
        weights={k: round(v, 4) for k, v in card.weights.items()},
    )

    perf_logs = PerformanceLogs(
        total_ticks=sim.tick,
        sim_years=round(card.years, 4),
        wall_time_seconds=wall_time,
        terminated=sim.terminated,
        termination_reason=card.termination_reason or ("max_steps reached" if not sim.terminated else "terminated"),
        summary_report=card.summary(),
        step_logs=step_logs,
    )

    return BenchmarkRunResponse(
        seed=seed,
        seed_category=categorize_seed(seed),
        agent_type=agent_name,
        max_steps=max_steps,
        scoring_metrics=scoring_metrics,
        transmission_efficiency=tx_efficiency,
        performance_logs=perf_logs,
    )


@router.post("/suite")
def run_benchmark_suite(req: SuiteRunRequest):
    """Run an evaluation suite across multiple agents and seeds with aggregation."""
    resolved_agents = [resolve_agent_name(a) for a in req.agent_types]
    records = run_suite(
        resolved_agents,
        req.seeds,
        horizon_years=req.horizon_years,
    )
    agg = aggregate(records)
    lb_text = leaderboard(agg)
    return {
        "agents": resolved_agents,
        "seeds": req.seeds,
        "horizon_years": req.horizon_years,
        "aggregation": agg,
        "leaderboard": lb_text,
        "records_count": len(records),
    }


@router.get("/generalization-gap")
def evaluate_generalization_gap(
    horizon_years: float = Query(0.25, gt=0.0, le=5.0, description="Horizon years per episode"),
):
    """Evaluate generalization gap between standard train (1-5) and held-out (101-105) seeds."""
    agent_names = ["donothing", "lookup", "heuristic"]
    train_records = run_suite(agent_names, TRAIN_SEEDS, horizon_years=horizon_years)
    held_records = run_suite(agent_names, HELDOUT_SEEDS, horizon_years=horizon_years)

    gap = generalisation_gap(train_records, held_records)
    train_agg = aggregate(train_records)
    held_agg = aggregate(held_records)

    return {
        "train_seeds": TRAIN_SEEDS,
        "held_out_seeds": HELDOUT_SEEDS,
        "horizon_years": horizon_years,
        "generalization_gap": gap,
        "train_aggregate": train_agg,
        "held_out_aggregate": held_agg,
    }
