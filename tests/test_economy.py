"""Market, finance and valuation behaviour."""

import pytest

from worldforge_bench.config import DEFAULT_CONFIG as CFG
from worldforge_bench.economy.market import CommodityMarket, ElectricityMarket
from worldforge_bench.economy.valuation import irr, value_asset
from worldforge_bench.engine import Engine
from worldforge_bench.prng import Prng
from worldforge_bench.world import Machine


def test_price_falls_as_own_supply_rises():
    """Value cannibalisation: the agent's own output lowers the price it earns.

    This is the central incentive of the benchmark. If it ever stops holding,
    'build more solar' becomes a free lunch and the objective is broken.
    """
    e = Engine(42)
    e.tick()
    prices = []
    for supply in (0, 4000, 8000, 12000, 20000, 30000):
        m = ElectricityMarket(CFG)
        m.price_history = []
        prices.append(m.clear(e.state, supply, Prng(5)).price)
    assert prices == sorted(prices, reverse=True), f"price not monotone: {prices}"
    assert prices[-1] < prices[0]


def test_oversupply_produces_negative_prices():
    e = Engine(42)
    e.tick()
    m = ElectricityMarket(CFG)
    tick = m.clear(e.state, agent_supply_kw=500_000, prng=Prng(1))
    assert tick.price < 0
    assert tick.price >= CFG.market.price_floor


def test_scarcity_lifts_price_above_marginal_cost():
    """A thin reserve margin prices well above the marginal unit's fuel cost."""
    from worldforge_bench.economy.market import MarketTick
    m = ElectricityMarket(CFG)
    fleet_kw = sum(u[1] for u in CFG.market.thermal_fleet)
    carbon = CFG.market.carbon_price_start

    comfortable = m._clear_once(fleet_kw * 0.55, 0.0, carbon, MarketTick())
    thin = m._clear_once(fleet_kw * 0.985, 0.0, carbon, MarketTick())
    assert thin > comfortable
    assert thin > 310.0, f"expected a scarcity premium, got {thin}"

    beyond = m._clear_once(fleet_kw * 1.2, 0.0, carbon, MarketTick())
    assert beyond == CFG.market.price_cap


def test_carbon_price_rises_over_the_horizon():
    e = Engine(42)
    m = ElectricityMarket(CFG)
    start = m.carbon_price(e.state)
    e.state.tick = int(10 * CFG.time.days_per_year * CFG.time.ticks_per_day)
    assert m.carbon_price(e.state) > start * 1.5


def test_learning_curve_lowers_capex_congestion_raises_it():
    cm = CommodityMarket(CFG)
    base = cm.capex("wind", CFG)
    for _ in range(20):
        cm.cumulative_installs["wind"] = cm.cumulative_installs.get("wind", 0) + 1
    assert cm.capex("wind", CFG) < base

    cm2 = CommodityMarket(CFG)
    before = cm2.capex("wind", CFG)
    cm2.congestion += CFG.commodity.congestion_per_order * 4
    assert cm2.capex("wind", CFG) > before


def test_cannibalisation_shows_up_in_asset_value():
    """The same physical asset is worth less when its capture price falls."""
    high = Machine(kind="wind", x=1, y=1, age_years=3.0)
    high.lifetime_mwh = 20_000.0
    high.lifetime_revenue = high.lifetime_mwh * 70.0

    low = Machine(kind="wind", x=1, y=1, age_years=3.0)
    low.lifetime_mwh = 20_000.0
    low.lifetime_revenue = low.lifetime_mwh * 35.0

    v_high = value_asset(high, CFG, 0.09, 60.0).present_value
    v_low = value_asset(low, CFG, 0.09, 60.0).present_value
    assert v_low < v_high


def test_leverage_widens_the_credit_spread():
    from worldforge_bench.economy.finance import FinanceEngine
    f = FinanceEngine(CFG)
    cheap = f.cost_of_debt()
    f.fund_capex(10_000_000, 0, debt_fraction=1.0)
    assert f.cost_of_debt() > cheap
    assert f.books.leverage > 0


def test_debt_is_capped_by_the_leverage_limit():
    from worldforge_bench.economy.finance import FinanceEngine
    f = FinanceEngine(CFG)
    for _ in range(30):
        f.fund_capex(2_000_000, 0, debt_fraction=1.0)
    assert f.books.leverage <= CFG.finance.max_leverage + 1e-6


def test_irr_returns_none_when_undefined():
    assert irr([-100.0, -100.0, -100.0]) is None
    assert irr([-100.0, 60.0, 60.0]) is not None


def test_equity_can_fall_unlike_the_reference_netWorth():
    """The reference build defines netWorth from CUMULATIVE generation, which
    can only rise. Here, buying a bad asset must be able to destroy value."""
    e = Engine(42)
    start = e.valuation().equity_value
    # Buy hydro on the worst possible site we can legally reach, unwired.
    placed = False
    for y in range(e.state.height):
        for x in range(e.state.width):
            if e.apply({"type": "PLACE", "kind": "land_solar", "x": x, "y": y}).ok:
                placed = True
                break
        if placed:
            break
    assert placed
    e.run(24 * 60)
    assert e.valuation().equity_value < start, "unwired asset should destroy value"
