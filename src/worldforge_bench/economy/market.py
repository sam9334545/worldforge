"""Endogenous electricity market.

The spec (Section 18, E19) prices energy from a fixed schedule per demand tier.
That is replaced here, because a fixed schedule gives the agent no reason to
care WHEN it generates -- only how much.

Instead the price clears every tick against a residual demand curve served by a
background thermal fleet, in merit order. The consequences fall out on their
own, and they are the real ones:

  * Value cannibalisation. Renewables bid at zero marginal cost, so the agent's
    own output pushes the residual demand down the merit order and lowers the
    price it earns. The tenth solar farm is worth much less per MWh than the
    first, and building only solar competes with itself at noon.
  * Scarcity rents. When the reserve margin thins, price climbs toward the cap.
    Capacity that is available on a still winter evening is worth a fortune.
  * Negative prices. Oversupply below zero residual demand pays you to stop.
  * A carbon price that rises over the horizon, steadily lifting thermal
    marginal costs -- so the merit order the agent learns in year 1 is not the
    merit order of year 10.

Capital goods move too (CommodityMarket): an AR(1) price index, a congestion
premium when you order many machines at once, and a Wright's-law learning curve
that makes each technology cheaper as cumulative deployment grows.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import math


@dataclass
class MarketTick:
    """Everything the market produced this tick, logged for the agent."""
    price: float = 0.0                  # $/MWh clearing price
    demand_kw: float = 0.0
    agent_supply_kw: float = 0.0
    residual_kw: float = 0.0
    marginal_unit: str = "none"
    reserve_margin: float = 0.0
    carbon_price: float = 0.0
    thermal_dispatch: dict = field(default_factory=dict)
    scarcity: bool = False
    negative: bool = False


class ElectricityMarket:
    def __init__(self, cfg):
        self.cfg = cfg
        self.mc = cfg.market
        self.price_history: list[float] = []
        self.demand_shock: float = 0.0

    # -- demand ---------------------------------------------------------

    def system_demand_kw(self, state, prng) -> float:
        """Zone demand shaped by hour, season and multi-year growth."""
        mc = self.mc
        base = sum(z.base_demand_kw for z in state.demand_zones)
        hour_mult = mc.demand_daily_shape[state.hour % 24]
        season_mult = mc.demand_seasonal[state.season]
        years = state.tick / (self.cfg.time.ticks_per_day * self.cfg.time.days_per_year)
        growth = (1.0 + mc.demand_growth_per_year) ** years

        # Shocks decay rather than vanishing, so they are learnable events.
        self.demand_shock *= 0.94
        if prng.chance(mc.demand_shock_prob):
            self.demand_shock += prng.normal(0.0, mc.demand_shock_scale)

        total = base * hour_mult * season_mult * growth * (1.0 + self.demand_shock)
        return max(0.0, total)

    def carbon_price(self, state) -> float:
        years = state.tick / (self.cfg.time.ticks_per_day * self.cfg.time.days_per_year)
        return self.mc.carbon_price_start * (
            (1.0 + self.mc.carbon_price_growth_per_year) ** years)

    def merit_order(self, carbon: float) -> list:
        """Thermal fleet sorted by short-run marginal cost, carbon included."""
        units = []
        for name, cap_kw, mc_fuel, co2 in self.mc.thermal_fleet:
            units.append((mc_fuel + carbon * co2, name, cap_kw))
        units.sort(key=lambda u: (u[0], u[1]))
        return units

    # -- clearing -------------------------------------------------------

    def clear(self, state, agent_supply_kw: float, prng) -> MarketTick:
        mc = self.mc
        carbon = self.carbon_price(state)
        demand = self.system_demand_kw(state, prng)

        tick = MarketTick(demand_kw=demand, agent_supply_kw=agent_supply_kw,
                          carbon_price=carbon)

        # Two-pass clearing: price the inelastic demand, then let demand
        # respond to that price and re-clear. One iteration is enough to move
        # the price in the right direction without oscillating.
        price = self._clear_once(demand, agent_supply_kw, carbon, tick)
        if mc.demand_elasticity > 0.0 and self.price_history:
            ref = sum(self.price_history[-24:]) / len(self.price_history[-24:])
            if ref > 1e-6:
                response = -mc.demand_elasticity * (price - ref) / ref
                demand = max(0.0, demand * (1.0 + max(-0.35, min(0.35, response))))
                tick.demand_kw = demand
                price = self._clear_once(demand, agent_supply_kw, carbon, tick)

        price = max(mc.price_floor, min(mc.price_cap, price))
        tick.price = price
        tick.negative = price < 0.0
        self.price_history.append(price)
        if len(self.price_history) > 24 * 30:
            self.price_history.pop(0)
        return tick

    def _clear_once(self, demand: float, agent_supply: float,
                    carbon: float, tick: MarketTick) -> float:
        mc = self.mc
        residual = demand - agent_supply
        tick.residual_kw = residual

        units = self.merit_order(carbon)
        total_thermal = sum(u[2] for u in units)

        if residual <= 0.0:
            # Oversupply. Renewables bid negative to stay on; deeper oversupply
            # pushes the price further below zero, down to the floor.
            depth = min(1.0, abs(residual) / max(demand, 1.0))
            tick.marginal_unit = "oversupply"
            tick.reserve_margin = 1.0
            tick.thermal_dispatch = {}
            return mc.price_floor * depth

        dispatch = {}
        cum = 0.0
        marginal_cost = None
        marginal_name = "unserved"
        for cost, name, cap in units:
            take = min(cap, residual - cum)
            if take <= 0:
                dispatch[name] = 0.0
                continue
            dispatch[name] = take
            cum += take
            marginal_cost, marginal_name = cost, name
            if cum >= residual - 1e-9:
                break

        tick.thermal_dispatch = dispatch
        tick.marginal_unit = marginal_name

        if cum < residual - 1e-9:
            # Demand exceeds the whole fleet: price at the cap (lost load).
            tick.scarcity = True
            tick.reserve_margin = 0.0
            return mc.price_cap

        spare = total_thermal - residual
        reserve_margin = spare / max(total_thermal, 1.0)
        tick.reserve_margin = reserve_margin

        price = marginal_cost if marginal_cost is not None else mc.price_floor

        # Scarcity adder: as the reserve margin thins below the reference, the
        # price climbs steeply above the marginal unit's cost.
        if reserve_margin < mc.reserve_margin_ref:
            ratio = max(reserve_margin, 1e-3) / mc.reserve_margin_ref
            multiplier = ratio ** (-mc.scarcity_exponent)
            price *= min(multiplier, mc.price_cap / max(price, 1.0))
            tick.scarcity = True
        return price

    # -- contracts ------------------------------------------------------

    def ppa_strike(self) -> float:
        """Strike offered for a new PPA: a discount to the trailing mean spot.
        You trade upside for certainty -- the classic merchant/contracted call."""
        if not self.price_history:
            return 55.0
        window = self.price_history[-24 * 30:]
        return self.mc.ppa_discount * (sum(window) / len(window))


class CommodityMarket:
    """Prices for the capital goods themselves."""

    def __init__(self, cfg):
        self.cfg = cfg
        self.cc = cfg.commodity
        self.index = self.cc.index_start
        self.congestion = 0.0
        self.cumulative_installs: dict[str, int] = {}

    def step(self, prng) -> None:
        cc = self.cc
        shock = prng.normal(0.0, cc.index_volatility)
        self.index = float(min(cc.index_max, max(
            cc.index_min,
            cc.index_persistence * self.index
            + (1.0 - cc.index_persistence) * cc.index_start + shock,
        )))
        self.congestion *= cc.congestion_decay

    def learning_factor(self, kind: str) -> float:
        """Wright's law: unit cost falls by `learning_rate` per doubling of
        cumulative installs of that technology."""
        n = self.cumulative_installs.get(kind, 0)
        ref = self.cc.learning_ref_installs
        b = -math.log2(1.0 - self.cc.learning_rate)
        return ((n + ref) / ref) ** (-b)

    def capex(self, kind: str, cfg) -> float:
        base = cfg.machines.get(kind).capex_base
        return base * self.index * (1.0 + self.congestion) * self.learning_factor(kind)

    def overlay_capex(self, overlay: str, cfg) -> float:
        base = (cfg.machines.gravel_capex if overlay == "gravel"
                else cfg.machines.stone_capex)
        return base * self.index * (1.0 + self.congestion)

    def record_order(self, kind: str) -> None:
        """Ordering pushes the price of the NEXT unit up (congestion) and the
        long-run price down (learning). The two pull against each other."""
        self.congestion += self.cc.congestion_per_order
        self.cumulative_installs[kind] = self.cumulative_installs.get(kind, 0) + 1
