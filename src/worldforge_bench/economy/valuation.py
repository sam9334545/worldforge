"""Portfolio valuation: DCF, LCOE, IRR, capacity factor.

Wealth in this benchmark is equity VALUE, not cash. That distinction is the
whole point of the objective:

  equity value = PV(future cash flows of built assets) + cash - debt

An agent that spends every dollar on good assets looks poor on cash and rich on
value. An agent that hoards cash earns nothing. An agent that builds badly-sited
or badly-oriented assets converts cash into something worth less than it paid.

Each asset is valued at its OWN realised capture price -- lifetime revenue over
lifetime MWh -- not at the average market price. So when an agent floods the
market with solar and depresses the midday price, the DCF of every solar asset
it already owns falls with it. Cannibalisation shows up on the balance sheet,
which is exactly where a real developer would feel it.
"""

from __future__ import annotations

from dataclasses import dataclass

from ..machines import nameplate_kw

# Priors used only until an asset has enough operating history to speak for
# itself. Roughly representative real-world capacity factors.
PRIOR_CAPACITY_FACTOR = {
    "land_solar": 0.17,
    "floating_solar": 0.18,
    "wind": 0.32,
    "hydro": 0.48,
}
PRIOR_CAPTURE_PRICE = 55.0

# Strength of the prior, in operating hours. The realised numbers are blended
# against the prior with weight hours/(hours + PRIOR_STRENGTH_HOURS), so a new
# asset starts near its prior and converges on its own record.
#
# This shrinkage is NOT cosmetic. With a hard switch ("use the prior until a
# month of history, then the realised number"), an asset that is never wired up
# keeps its optimistic prior for a full month and is valued ABOVE what it cost
# -- so an agent could raise its equity by buying generators and never
# connecting them. Shrinkage closes that: an asset delivering nothing is marked
# down from its first day.
PRIOR_STRENGTH_HOURS = 24 * 30


@dataclass
class AssetValuation:
    pos: tuple
    kind: str
    age_years: float
    remaining_years: float
    capacity_factor: float
    capture_price: float
    annual_mwh: float
    annual_net_cash: float
    present_value: float


@dataclass
class PortfolioValuation:
    enterprise_value: float = 0.0
    cash: float = 0.0
    debt: float = 0.0
    equity_value: float = 0.0
    book_equity: float = 0.0
    wacc: float = 0.0
    lcoe: float = 0.0
    portfolio_capacity_factor: float = 0.0
    installed_capacity_kw: float = 0.0
    assets: list = None

    def __post_init__(self):
        if self.assets is None:
            self.assets = []


def _asset_hours(machine, cfg) -> float:
    return machine.age_years * cfg.time.days_per_year * cfg.time.ticks_per_day


def value_asset(machine, cfg, wacc: float, fallback_price: float) -> AssetValuation:
    spec = cfg.machines.get(machine.kind)
    plate = nameplate_kw(machine.kind, cfg)
    hours = _asset_hours(machine, cfg)

    # Realised performance, shrunk toward the prior by how much history exists.
    # lifetime_mwh counts DELIVERED energy, so an asset that generates but
    # cannot reach a demand zone scores a realised capacity factor of zero.
    prior_cf = PRIOR_CAPACITY_FACTOR.get(machine.kind, 0.2)
    weight = hours / (hours + PRIOR_STRENGTH_HOURS) if hours > 0 else 0.0

    if plate > 0 and hours > 0:
        realised_cf = machine.lifetime_mwh / max(1e-9, plate / 1000.0 * hours)
        realised_cf = max(0.0, min(1.0, realised_cf))
    else:
        realised_cf = prior_cf
    cf = weight * realised_cf + (1.0 - weight) * prior_cf

    prior_price = fallback_price if fallback_price > 0 else PRIOR_CAPTURE_PRICE
    if machine.lifetime_mwh > 1.0:
        realised_capture = machine.lifetime_revenue / machine.lifetime_mwh
        capture = weight * realised_capture + (1.0 - weight) * prior_price
    else:
        capture = prior_price

    hours_per_year = cfg.time.days_per_year * cfg.time.ticks_per_day
    annual_mwh = plate / 1000.0 * hours_per_year * cf
    annual_net = (annual_mwh * (capture - spec.opex_per_mwh)) - spec.opex_per_year

    remaining = max(0.0, spec.lifespan_years - machine.age_years)
    horizon = min(remaining, cfg.finance.dcf_horizon_years)

    # Discount, degrading output each year the asset ages.
    pv = 0.0
    r = max(wacc, 0.005)
    for t in range(1, int(horizon) + 1):
        degradation = (1.0 - spec.degradation_per_year) ** (machine.age_years + t)
        cash = (annual_mwh * degradation * (capture - spec.opex_per_mwh)) - spec.opex_per_year
        pv += cash / ((1.0 + r) ** t)

    # Terminal value only where the asset outlives the DCF horizon.
    if remaining > cfg.finance.dcf_horizon_years:
        g = cfg.finance.terminal_growth
        if r > g:
            tail = annual_net * (1.0 - spec.degradation_per_year) ** horizon
            pv += (tail * (1.0 + g) / (r - g)) / ((1.0 + r) ** horizon)

    return AssetValuation(
        pos=machine.pos, kind=machine.kind, age_years=machine.age_years,
        remaining_years=remaining, capacity_factor=cf, capture_price=capture,
        annual_mwh=annual_mwh, annual_net_cash=annual_net,
        present_value=max(0.0, pv),
    )


def value_portfolio(state, finance, cfg, fallback_price: float,
                    with_lcoe: bool = True) -> PortfolioValuation:
    wacc = finance.wacc()
    pv = PortfolioValuation(wacc=wacc)

    total_mwh = 0.0
    total_potential_mwh = 0.0
    for m in state.active_machines():
        av = value_asset(m, cfg, wacc, fallback_price)
        pv.assets.append(av)
        pv.enterprise_value += av.present_value
        plate = nameplate_kw(m.kind, cfg)
        pv.installed_capacity_kw += plate
        total_mwh += m.lifetime_mwh
        total_potential_mwh += plate / 1000.0 * _asset_hours(m, cfg)

    b = finance.books
    pv.cash = b.cash
    pv.debt = b.debt
    pv.book_equity = b.book_equity
    pv.equity_value = pv.enterprise_value + b.cash - b.debt
    pv.portfolio_capacity_factor = (
        total_mwh / total_potential_mwh if total_potential_mwh > 1e-9 else 0.0)
    # LCOE runs a second DCF over every asset, so it is opt-in: the tick loop
    # does not need it, scoring and observation do.
    pv.lcoe = levelised_cost(state, finance, cfg, wacc) if with_lcoe else 0.0
    return pv


def levelised_cost(state, finance, cfg, wacc: float) -> float:
    """LCOE = PV(all costs) / PV(all energy). The number a real developer quotes."""
    b = finance.books
    pv_cost = b.cum_capex + b.cum_opex + b.cum_interest
    pv_energy = b.cum_mwh_delivered

    for m in state.active_machines():
        spec = cfg.machines.get(m.kind)
        av = value_asset(m, cfg, wacc, 0.0)
        remaining = max(0.0, spec.lifespan_years - m.age_years)
        horizon = min(remaining, cfg.finance.dcf_horizon_years)
        r = max(wacc, 0.005)
        for t in range(1, int(horizon) + 1):
            degradation = (1.0 - spec.degradation_per_year) ** (m.age_years + t)
            mwh = av.annual_mwh * degradation
            cost = spec.opex_per_year + mwh * spec.opex_per_mwh
            pv_cost += cost / ((1.0 + r) ** t)
            pv_energy += mwh / ((1.0 + r) ** t)

    return pv_cost / pv_energy if pv_energy > 1e-6 else 0.0


def irr(cashflows: list, lo: float = -0.95, hi: float = 4.0, tol: float = 1e-7) -> float | None:
    """Bisection IRR on an annual cash-flow series (index 0 = t0).

    Returns None when the series never crosses zero -- an all-negative run has
    no IRR, and reporting one would be a lie.
    """
    def npv(rate: float) -> float:
        return sum(cf / ((1.0 + rate) ** t) for t, cf in enumerate(cashflows))

    f_lo, f_hi = npv(lo), npv(hi)
    if f_lo * f_hi > 0:
        return None
    for _ in range(200):
        mid = (lo + hi) / 2.0
        f_mid = npv(mid)
        if abs(f_mid) < tol:
            return mid
        if f_lo * f_mid < 0:
            hi, f_hi = mid, f_mid
        else:
            lo, f_lo = mid, f_mid
    return (lo + hi) / 2.0
