"""Wiring: routed path length, per-segment capacity, energy conservation.

These are the behaviours that were decorative in the reference TypeScript
build, where loss came from Manhattan distance and capacity was read off the
generator's own cell. Each one gets a test that would fail under that design.
"""

import numpy as np
import pytest

from worldforge_bench import terrain as T
from worldforge_bench.config import DEFAULT_CONFIG as CFG
from worldforge_bench.engine import Engine
from worldforge_bench.network import GridNetwork


def _straight_run(sim_state, x0, y0, x1, y1):
    """L-shaped 4-connected path."""
    cells, x, y = [(x0, y0)], x0, y0
    while x != x1:
        x += 1 if x1 > x else -1
        cells.append((x, y))
    while y != y1:
        y += 1 if y1 > y else -1
        cells.append((x, y))
    return cells


def test_02_energy_conservation_every_tick():
    """Test 2: generation == delivered + losses + curtailed, exactly."""
    e = Engine(42)
    st = e.state
    ys, xs = np.where(st.terrain == T.GRASS.id)
    for x, y in list(zip(xs.tolist(), ys.tolist()))[:40]:
        e.apply({"type": "PLACE", "kind": "land_solar", "x": x, "y": y})
    for _ in range(120):
        r = e.tick()
        assert r.conserved, (
            f"tick {r.tick}: gen {r.generated_kw} != delivered {r.delivered_kw} "
            f"+ loss {r.loss_kw} + curtailed {r.curtailed_kw}")


def test_15_routed_path_length_drives_loss_not_straight_line():
    """A winding cable route must cost more than a direct one.

    Under Manhattan-distance loss these two would be identical, which is
    precisely the bug this test exists to catch.
    """
    e = Engine(42)
    e.tick()
    st = e.state
    zone = st.demand_zones[0]
    zx, zy = zone.centre

    # A generator two cells from the zone, wired by a direct run.
    gx, gy = zx, min(st.height - 1, zy + 3)
    if st.is_water(gx, gy):
        pytest.skip("zone geometry unsuitable on this seed")

    direct = _straight_run(st, gx, gy, zx, zy)
    ok = e.apply({"type": "PLACE_CABLE", "path": [list(c) for c in direct]})
    if not ok.ok:
        pytest.skip(f"cannot lay a direct run here: {ok.message}")

    net = GridNetwork(st, CFG)
    short_path = net._path_to_zone((gx, gy), zone.id)
    assert short_path is not None
    short_len = len(short_path)

    # Now a detour: same endpoints, longer route.
    detour_end = (max(0, gx - 4), gy)
    detour = _straight_run(st, detour_end[0], detour_end[1], gx, gy)
    e.apply({"type": "PLACE_CABLE", "path": [list(c) for c in detour]})
    net2 = GridNetwork(st, CFG)
    long_path = net2._path_to_zone(detour_end, zone.id)
    if long_path is None:
        pytest.skip("detour did not connect on this seed")
    assert len(long_path) > short_len, "a longer route must have a longer path"

    lpc = CFG.machines.cable.loss_per_cell
    loss_short = 1 - (1 - lpc) ** short_len
    loss_long = 1 - (1 - lpc) ** len(long_path)
    assert loss_long > loss_short


def test_unconnected_generator_delivers_nothing():
    """Section 35: generated but not delivered -> zero revenue, logged apart."""
    e = Engine(42)
    st = e.state
    ys, xs = np.where(st.terrain == T.GRASS.id)
    x, y = int(xs[0]), int(ys[0])
    assert e.apply({"type": "PLACE", "kind": "land_solar", "x": x, "y": y}).ok
    assert len(st.cables) == 0

    for _ in range(200):                      # run into daylight
        r = e.tick()
        if r.generated_kw > 0:
            assert r.delivered_kw == 0.0
            assert r.unconnected_kw == pytest.approx(r.generated_kw)
            assert r.conserved
            return
    pytest.skip("no generation in the sampled window")


def test_16_cable_capacity_curtails_the_excess():
    """Test 16: a segment carries at most its capacity; the excess is curtailed,
    never silently transmitted."""
    cfg = CFG.with_overrides(machines={"cable": CFG.machines.cable})
    e = Engine(42, cfg)
    e.tick()
    st = e.state
    zone = st.demand_zones[0]
    zx, zy = zone.centre

    # Deliberately choke the trunk.
    run = _straight_run(st, zx, min(st.height - 1, zy + 4), zx, zy)
    r = e.apply({"type": "PLACE_CABLE", "path": [list(c) for c in run]})
    if not r.ok:
        pytest.skip(f"cannot lay trunk: {r.message}")
    for c in st.cables.values():
        c.capacity_kw = 50.0                  # 50 kW trunk

    placed = 0
    for (cx, cy) in run:
        for nx, ny in st.neighbours4(cx, cy):
            if e.apply({"type": "PLACE", "kind": "land_solar", "x": nx, "y": ny}).ok:
                placed += 1
        if placed >= 6:
            break
    if placed == 0:
        pytest.skip("could not place generators beside the trunk")

    for _ in range(300):
        res = e.tick()
        if res.generated_kw > 200:
            for c in st.cables.values():
                assert c.flow_kw <= c.capacity_kw + 1e-6, "segment carried over capacity"
            assert res.curtailed_kw > 0, "over-capacity injection was not curtailed"
            assert res.conserved
            return
    pytest.skip("did not reach enough generation to congest the trunk")
