"""Physics invariants. Numbered against Final Deliverable I (Top 20 Test Cases)."""

import math

import numpy as np
import pytest

from worldforge_bench import terrain as T
from worldforge_bench.config import DEFAULT_CONFIG as CFG
from worldforge_bench.engine import Engine
from worldforge_bench.machines import wind_output_kw
from worldforge_bench.physics.sun import base_irradiance, incidence_factor, solar_position
from worldforge_bench.physics.water import hydro_power_kw
from worldforge_bench.physics.wind import yaw_efficiency
from worldforge_bench.world import Machine


def test_01_mass_balance_every_tick():
    """Test 1: rainfall = infiltration + runoff + evaporation, every tick."""
    e = Engine(42)
    for _ in range(200):
        r = e.tick()
        assert r.mass_balanced, f"water mass balance broke at tick {r.tick}"


def test_06_solar_zero_at_night_never_negative():
    """Test 6: sunElevation <= 0 -> output exactly 0, never negative."""
    for hour in (0, 1, 2, 22, 23):
        elev, _az = solar_position(day_of_year=350, hour=hour, cfg=CFG)
        assert base_irradiance(elev, CFG) == 0.0
    # And a panel facing away in daylight clips to zero, not negative.
    elev, az = solar_position(172, 12, CFG)
    assert incidence_factor(elev, az, panel_az_deg=(az + 180) % 360,
                            panel_tilt_deg=89.0) == 0.0


def test_07_08_turbine_cut_in_and_cut_out():
    """Tests 7 and 8: hard zero below cut-in and above cut-out."""
    e = Engine(42)
    m = Machine(kind="wind", x=1, y=1, orientation=270.0)
    e.state.fields.wind_dir[1, 1] = 270.0

    spec = CFG.machines.wind
    e.state.fields.wind_speed[1, 1] = spec.cut_in_ms - 0.1
    assert wind_output_kw(m, e.state, CFG) == 0.0

    e.state.fields.wind_speed[1, 1] = spec.cut_out_ms + 0.1
    assert wind_output_kw(m, e.state, CFG) == 0.0

    e.state.fields.wind_speed[1, 1] = spec.rated_ms
    assert wind_output_kw(m, e.state, CFG) > 0.0


def test_turbine_output_saturates_at_rated():
    """Standard turbine curve: output clips at rated power, however hard it blows."""
    e = Engine(42)
    m = Machine(kind="wind", x=1, y=1, orientation=270.0)
    e.state.fields.wind_dir[1, 1] = 270.0
    spec = CFG.machines.wind
    for v in (13.0, 18.0, 24.0):
        e.state.fields.wind_speed[1, 1] = v
        assert wind_output_kw(m, e.state, CFG) <= spec.rated_power_kw + 1e-9


def test_14_orientation_follows_cosine_law():
    """Yaw misalignment costs exactly cos(delta), clipped at zero.

    This is the mechanic that was decorative in the reference TypeScript build:
    orientation must change the number.
    """
    e = Engine(42)
    m = Machine(kind="wind", x=1, y=1, orientation=270.0)
    e.state.fields.wind_dir[1, 1] = 270.0
    e.state.fields.wind_speed[1, 1] = 9.0

    aligned = wind_output_kw(m, e.state, CFG)
    assert aligned > 0

    for offset in (30.0, 45.0, 60.0):
        m.orientation = (270.0 + offset) % 360.0
        got = wind_output_kw(m, e.state, CFG)
        expected = aligned * math.cos(math.radians(offset))
        assert got == pytest.approx(expected, rel=1e-9)

    for offset in (90.0, 120.0, 180.0):
        m.orientation = (270.0 + offset) % 360.0
        assert wind_output_kw(m, e.state, CFG) == 0.0


def test_yaw_efficiency_is_symmetric_and_wraps():
    assert yaw_efficiency(10.0, 350.0) == pytest.approx(yaw_efficiency(350.0, 10.0))
    assert yaw_efficiency(0.0, 360.0) == pytest.approx(1.0)
    assert yaw_efficiency(0.0, 20.0) == pytest.approx(math.cos(math.radians(20)))


def test_09_hydro_floors_no_divide_by_zero():
    """Test 9: Q below Q_min gives exactly 0, and never divides by zero."""
    spec = CFG.machines.hydro
    assert hydro_power_kw(0.0, 10.0, spec.efficiency, CFG) == 0.0
    assert hydro_power_kw(spec.q_min_m3s - 0.01, 10.0, spec.efficiency, CFG) == 0.0
    assert hydro_power_kw(10.0, spec.h_min_m - 0.01, spec.efficiency, CFG) == 0.0
    assert hydro_power_kw(10.0, 10.0, spec.efficiency, CFG) > 0.0


def test_11_river_flow_never_negative():
    """Test 11: flow is non-negative everywhere, always."""
    e = Engine(42)
    for _ in range(150):
        e.tick()
        assert np.all(e.state.fields.flow_q >= 0.0)
        assert np.all(e.state.fields.head >= 0.0)
        assert np.all(e.state.fields.velocity >= 0.0)


def test_04_wind_shadow_leeward_is_worse_than_windward():
    """Test 4: a turbine leeward of high ground makes less than one windward,
    at identical global wind. 'Mountain = good wind' must be false in general.
    """
    from worldforge_bench.physics.wind import shadow_factor
    e = Engine(42)
    e.tick()
    st = e.state
    shadow = shadow_factor(st, 270.0, CFG)   # wind from the west

    # Find a cell with high ground to its west.
    found = False
    for y in range(st.height):
        for x in range(3, st.width):
            if st.elevation[y, x - 2] - st.elevation[y, x] >= 2.0:
                assert shadow[y, x] < 1.0, "leeward cell got no wind-shadow penalty"
                found = True
                break
        if found:
            break
    assert found, "no leeward cell in this map to test"
    assert np.all(shadow <= 1.0) and np.all(shadow >= 0.0)


def test_solar_obstruction_bounded():
    e = Engine(42)
    for _ in range(48):
        e.tick()
        ob = e.state.fields.obstruction
        assert np.all(ob >= 0.0) and np.all(ob <= 1.0)
        assert np.all(e.state.fields.irradiance >= 0.0)
