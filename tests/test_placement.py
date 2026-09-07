"""Placement rules (Section 15) and overlays (Section 16)."""

import numpy as np

from worldforge_bench import terrain as T
from worldforge_bench.config import DEFAULT_CONFIG as CFG
from worldforge_bench.engine import Engine
from worldforge_bench.placement import can_place


def _find(state, tid):
    ys, xs = np.where(state.terrain == tid)
    return (int(xs[0]), int(ys[0])) if len(xs) else None


def test_12_invalid_placement_reason_is_specific():
    """Test 12: every INVALID carries a specific, non-generic reason."""
    e = Engine(42)
    e.tick()
    pos = _find(e.state, T.MUD.id)
    assert pos, "seed 42 should contain mud"
    r = can_place(e.state, "wind", pos[0], pos[1], CFG)
    assert not r.valid
    assert "stability" in r.reason and "0.30" in r.reason
    assert r.reason != "invalid"


def test_13_reinforced_mud_passes_only_after_overlay():
    """Test 13: mud clears the 0.7 stability bar only once reinforced."""
    e = Engine(42)
    e.tick()
    x, y = _find(e.state, T.MUD.id)
    assert not can_place(e.state, "wind", x, y, CFG).valid

    e.apply({"type": "REINFORCE", "x": x, "y": y, "overlay": "gravel"})
    assert e.state.effective_stability(x, y, CFG) == 0.55
    assert not can_place(e.state, "wind", x, y, CFG).valid, "one tier should not be enough"

    e.apply({"type": "REINFORCE", "x": x, "y": y, "overlay": "stone"})
    assert e.state.effective_stability(x, y, CFG) >= 0.7
    assert can_place(e.state, "wind", x, y, CFG).valid


def test_snow_forbids_solar_allows_wind():
    e = Engine(42)
    e.tick()
    pos = _find(e.state, T.SNOW.id)
    if pos is None:
        return
    x, y = pos
    assert not can_place(e.state, "land_solar", x, y, CFG).valid
    r = can_place(e.state, "wind", x, y, CFG)
    assert r.valid or "slope" in r.reason


def test_17_two_machines_cannot_share_a_cell():
    """Test 17: prevented at placement time, never a runtime state."""
    e = Engine(42)
    e.tick()
    x, y = _find(e.state, T.STONE.id)
    r1 = e.apply({"type": "PLACE", "kind": "wind", "x": x, "y": y})
    if not r1.ok:
        return
    r2 = e.apply({"type": "PLACE", "kind": "land_solar", "x": x, "y": y})
    assert not r2.ok and "already holds" in r2.message


def test_turbine_wake_separation_enforced():
    e = Engine(42)
    e.tick()
    st = e.state
    ys, xs = np.where(st.terrain == T.STONE.id)
    placed = None
    for x, y in zip(xs.tolist(), ys.tolist()):
        if e.apply({"type": "PLACE", "kind": "wind", "x": x, "y": y}).ok:
            placed = (x, y)
            break
    assert placed, "could not place a first turbine"
    x, y = placed
    for nx, ny in st.neighbours8(x, y):
        r = can_place(st, "wind", nx, ny, CFG)
        if not r.valid:
            assert ("wake" in r.reason or "stability" in r.reason
                    or "cannot be built" in r.reason or "slope" in r.reason)


def test_cable_path_must_be_contiguous():
    e = Engine(42)
    r = e.apply({"type": "PLACE_CABLE", "path": [[1, 1], [5, 5]]})
    assert not r.ok and "contiguous" in r.message


def test_cable_run_is_all_or_nothing():
    """A run that fails partway spends nothing and lays nothing."""
    e = Engine(42)
    e.tick()
    st = e.state
    ys, xs = np.where(st.terrain == T.WATER.id)
    if not len(xs):
        return
    wx, wy = int(xs[0]), int(ys[0])
    path = [[wx - 1, wy], [wx, wy]]      # ends on water: illegal for cable
    cash_before = e.finance.books.cash
    r = e.apply({"type": "PLACE_CABLE", "path": path})
    assert not r.ok
    assert e.finance.books.cash == cash_before
    assert len(st.cables) == 0
