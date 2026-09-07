"""End-to-end harness behaviour, including the anti-memorisation check."""

import pytest

from worldforge_bench.agents import AGENTS
from worldforge_bench.benchmark import aggregate, generalisation_gap, run_episode

SHORT = 2.0     # sim-years; long enough for capital to start paying back


def test_all_registered_agents_run_without_error():
    for name in sorted(AGENTS):
        rec, card, _sim = run_episode(name, seed=3, horizon_years=0.25)
        assert rec.agent == name
        assert 0.0 <= card.score <= 100.0


def test_20_reasoning_beats_the_lookup_table():
    """Final Deliverable I, test 20 -- the core anti-memorisation probe.

    An agent using only a fixed terrain -> machine lookup table, with a fixed
    orientation and no view of wind, sun, price or its own books, must score
    materially below one that reasons from the current state. If this ever
    fails, the environment is rewarding memorisation and the benchmark is not
    measuring world-model formation.
    """
    seeds = [5, 6]
    lookup = [run_episode("lookup", s, horizon_years=SHORT)[0].score for s in seeds]
    reason = [run_episode("heuristic", s, horizon_years=SHORT)[0].score for s in seeds]

    mean_lookup = sum(lookup) / len(lookup)
    mean_reason = sum(reason) / len(reason)
    assert mean_reason > mean_lookup, (
        f"lookup table ({mean_lookup:.1f}) matched or beat reasoning "
        f"({mean_reason:.1f}) -- scoring is rewarding memorisation")


def test_doing_nothing_is_a_floor_not_a_win():
    """Holding cash must be safe but unrewarding: it should beat bankruptcy and
    lose to competent building."""
    nothing = run_episode("donothing", 5, horizon_years=SHORT)[0]
    good = run_episode("heuristic", 5, horizon_years=SHORT)[0]
    assert nothing.score < good.score
    assert nothing.terminal_equity == pytest.approx(25_000_000.0, rel=1e-6)


def test_aggregate_and_generalisation_gap_shapes():
    train = [run_episode("heuristic", s, horizon_years=0.25)[0] for s in (1, 2)]
    held = [run_episode("heuristic", s, horizon_years=0.25)[0] for s in (101, 102)]
    agg = aggregate(train)
    assert agg["heuristic"]["n"] == 2
    gap = generalisation_gap(train, held)
    assert "heuristic" in gap
    assert set(gap["heuristic"]) == {"train_score", "held_out_score", "gap",
                                     "relative_gap"}


def test_scorecard_components_are_bounded():
    _rec, card, _sim = run_episode("heuristic", 9, horizon_years=0.5)
    for name, v in card.components.items():
        assert 0.0 <= v <= 1.0, f"component {name} out of range: {v}"
    assert abs(sum(card.weights.values()) - 1.0) < 1e-6
