"""Determinism and reproducibility (Section 36, Test 3).

The contract: given WORLD_SEED, the config and the ordered action log, the
engine reproduces an identical state. Without this the benchmark cannot compare
agents fairly, because a score difference could just be luck.
"""

from worldforge_bench.config import DEFAULT_CONFIG as CFG
from worldforge_bench.engine import Engine

ACTIONS = [
    {"type": "PLACE", "kind": "land_solar", "x": 2, "y": 2, "orientation": 180},
    {"type": "PLACE_CABLE", "path": [[2, 2], [3, 2], [4, 2]]},
    {"type": "ADVANCE_TIME", "ticks": 30},
    {"type": "SET_ORIENTATION", "x": 2, "y": 2, "orientation": 200},
    {"type": "ADVANCE_TIME", "ticks": 30},
    {"type": "SIGN_PPA", "fraction": 0.4},
]


def _play(seed=42):
    e = Engine(seed, CFG)
    for a in ACTIONS:
        e.apply(a)
    e.run(120)
    return e


def test_03_same_seed_and_actions_give_same_hash():
    a, b = _play(), _play()
    assert a.state_hash() == b.state_hash()
    assert a.finance.books.cash == b.finance.books.cash
    assert a.valuation().equity_value == b.valuation().equity_value


def test_different_seeds_give_different_worlds():
    a, b = _play(42), _play(43)
    assert a.state_hash() != b.state_hash()


def test_prng_stream_is_reproducible():
    a, b = Engine(7), Engine(7)
    a.run(200)
    b.run(200)
    assert a.prng.draws == b.prng.draws
    assert a.state_hash() == b.state_hash()


def test_replaying_the_action_log_reproduces_the_run():
    """The log an agent produced is enough to rebuild its world exactly."""
    original = _play(11)
    log = list(original.action_log)

    replay = Engine(11, CFG)
    for a in log:
        replay.apply(a)
    # The original ran 120 extra ticks after its log; ADVANCE_TIME entries are
    # in the log, the trailing run() is not, so mirror it.
    replay.run(120)
    assert replay.state_hash() == original.state_hash()


def test_hash_changes_when_orientation_changes():
    """Orientation is part of the state fingerprint -- if it were decorative,
    this would pass trivially and hide the bug."""
    a = Engine(42, CFG)
    a.apply({"type": "PLACE", "kind": "wind", "x": 0, "y": 0, "orientation": 270})
    a.run(10)
    h1 = a.state_hash()

    b = Engine(42, CFG)
    b.apply({"type": "PLACE", "kind": "wind", "x": 0, "y": 0, "orientation": 90})
    b.run(10)
    assert b.state_hash() != h1
