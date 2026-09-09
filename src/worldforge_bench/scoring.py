"""Benchmark scoring (Section 28, reweighted so wealth leads).

Raw metrics are always logged independently of the composite, so a researcher
can see WHICH capability failed rather than only that the total was low.

Normalisation anchors are documented constants, not magic. A score of 0 on a
component means "no better than doing nothing"; 100 means "at or above the
reference ceiling". Components are clipped to [0,1] before weighting, so one
runaway metric cannot mask failure everywhere else.

If an agent never issues QUERY_PREDICTION, the prediction weight is
redistributed across the other components rather than scored as zero -- not
using an optional diagnostic action is not itself a failure.
"""

from __future__ import annotations

import statistics
from dataclasses import dataclass, field


@dataclass
class ScoreCard:
    seed: int = 0
    ticks: int = 0
    years: float = 0.0

    # raw metrics (always reported)
    terminal_equity: float = 0.0
    starting_equity: float = 0.0
    total_return: float = 0.0
    cash: float = 0.0
    debt: float = 0.0
    enterprise_value: float = 0.0
    mwh_delivered: float = 0.0
    mwh_generated: float = 0.0
    mwh_curtailed: float = 0.0
    curtailment_rate: float = 0.0
    mean_reliability: float = 0.0
    reliability_std: float = 0.0
    roic: float = 0.0
    lcoe: float = 0.0
    capacity_factor: float = 0.0
    installed_capacity_kw: float = 0.0
    irr: float | None = None
    max_drawdown: float = 0.0
    covenant_breaches: int = 0
    insolvent: bool = False
    placements_valid: int = 0
    placements_attempted: int = 0
    placement_efficiency: float = 0.0
    prediction_error: float | None = None
    mean_capture_price: float = 0.0
    machines_built: int = 0
    cable_cells: int = 0
    termination_reason: str = ""

    # normalised components, 0..1
    components: dict = field(default_factory=dict)
    weights: dict = field(default_factory=dict)
    score: float = 0.0

    def summary(self) -> str:
        lines = [
            f"WorldForge benchmark - seed {self.seed}",
            f"  ran {self.ticks:,} ticks ({self.years:.2f} sim-years) - {self.termination_reason}",
            "",
            "  WEALTH",
            f"    terminal equity value   ${self.terminal_equity:>15,.0f}",
            f"    starting equity         ${self.starting_equity:>15,.0f}",
            f"    total return            {self.total_return:>15.1%}",
            f"    cash / debt             ${self.cash:>15,.0f} / ${self.debt:,.0f}",
            f"    enterprise value        ${self.enterprise_value:>15,.0f}",
            f"    IRR                     {'n/a' if self.irr is None else f'{self.irr:>15.2%}'}",
            "",
            "  ENERGY",
            f"    delivered               {self.mwh_delivered:>15,.0f} MWh",
            f"    generated               {self.mwh_generated:>15,.0f} MWh",
            f"    curtailed               {self.mwh_curtailed:>15,.0f} MWh ({self.curtailment_rate:.1%})",
            f"    installed capacity      {self.installed_capacity_kw:>15,.0f} kW",
            f"    capacity factor         {self.capacity_factor:>15.1%}",
            f"    LCOE                    ${self.lcoe:>15,.2f}/MWh",
            f"    mean capture price      ${self.mean_capture_price:>15,.2f}/MWh",
            "",
            "  OPERATIONS",
            f"    mean reliability        {self.mean_reliability:>15.1%} (sd {self.reliability_std:.3f})",
            f"    ROIC                    {self.roic:>15.1%}",
            f"    max drawdown            {self.max_drawdown:>15.1%}",
            f"    covenant breaches       {self.covenant_breaches:>15d}",
            f"    placements              {self.placements_valid:>10d}/{self.placements_attempted} valid",
            f"    machines / cable cells  {self.machines_built:>10d} / {self.cable_cells}",
        ]
        if self.prediction_error is not None:
            lines.append(f"    mean prediction error   {self.prediction_error:>15.1%}")
        if self.insolvent:
            lines.append("    ** INSOLVENT **")
        lines += ["", "  COMPONENTS (weighted)"]
        for k, v in self.components.items():
            w = self.weights.get(k, 0.0)
            bar = "#" * int(round(v * 24))
            lines.append(f"    {k:<20s} {v:5.3f} x {w:4.2f}  |{bar:<24s}|")
        lines += ["", f"  SCORE  {self.score:.1f} / 100"]
        return "\n".join(lines)

    def to_dict(self) -> dict:
        d = {k: v for k, v in self.__dict__.items()}
        return d


def score_run(engine) -> ScoreCard:
    cfg = engine.cfg
    sc = cfg.scoring
    b = engine.finance.books
    pv = engine.valuation()
    st = engine.state
    per_year = cfg.time.ticks_per_day * cfg.time.days_per_year

    card = ScoreCard(
        seed=engine.seed,
        ticks=st.tick,
        years=st.tick / per_year,
        terminal_equity=pv.equity_value,
        starting_equity=cfg.finance.starting_cash,
        cash=b.cash,
        debt=b.debt,
        enterprise_value=pv.enterprise_value,
        mwh_delivered=b.cum_mwh_delivered,
        mwh_generated=b.cum_mwh_generated,
        mwh_curtailed=b.cum_mwh_curtailed,
        lcoe=pv.lcoe,
        capacity_factor=pv.portfolio_capacity_factor,
        installed_capacity_kw=pv.installed_capacity_kw,
        max_drawdown=b.max_drawdown,
        covenant_breaches=b.covenant_breaches,
        insolvent=b.insolvent,
        placements_valid=engine.placements_valid,
        placements_attempted=engine.placements_attempted,
        machines_built=len(st.active_machines()),
        cable_cells=len(st.cables),
        termination_reason=engine.termination_reason or "still running",
        irr=engine.portfolio_irr(),
    )

    card.total_return = ((card.terminal_equity - card.starting_equity)
                         / max(card.starting_equity, 1.0))
    card.curtailment_rate = (card.mwh_curtailed / card.mwh_generated
                             if card.mwh_generated > 1e-9 else 0.0)
    if engine.reliability_series:
        card.mean_reliability = statistics.fmean(engine.reliability_series)
        card.reliability_std = (statistics.pstdev(engine.reliability_series)
                                if len(engine.reliability_series) > 1 else 0.0)
    card.roic = ((b.cum_revenue - b.cum_opex - b.cum_interest - b.cum_tax)
                 / b.cum_capex) if b.cum_capex > 1e-9 else 0.0
    card.placement_efficiency = (card.placements_valid / card.placements_attempted
                                 if card.placements_attempted else 1.0)
    if engine.prediction_errors:
        card.prediction_error = statistics.fmean(engine.prediction_errors)
    card.mean_capture_price = (b.cum_revenue / b.cum_mwh_delivered
                               if b.cum_mwh_delivered > 1e-6 else 0.0)

    # ---- normalised components -----------------------------------------
    clip = lambda v: max(0.0, min(1.0, v))

    # Wealth: 0 at "kept your money", 1 at the ceiling multiple of starting equity.
    ceiling = sc.wealth_ceiling_multiple * card.starting_equity
    wealth = (card.terminal_equity - card.starting_equity) / max(
        ceiling - card.starting_equity, 1.0)

    # Energy: share of the system demand the agent actually served.
    total_demand_mwh = (sum(z.base_demand_kw for z in st.demand_zones)
                        * cfg.time.hours_per_tick * max(st.tick, 1) / 1000.0)
    energy = card.mwh_delivered / max(total_demand_mwh, 1.0)

    reliability = card.mean_reliability - sc.reliability_variance_penalty * card.reliability_std
    capital_efficiency = card.roic / 1.5          # 150% lifetime ROIC = full marks
    risk = 1.0 - sc.drawdown_penalty_scale * card.max_drawdown - 0.05 * card.covenant_breaches
    if card.insolvent:
        risk = 0.0

    components = {
        "wealth": clip(wealth),
        "energy": clip(energy),
        "reliability": clip(reliability),
        "capital_efficiency": clip(capital_efficiency),
        "risk": clip(risk),
        "placement": clip(card.placement_efficiency),
    }
    weights = {
        "wealth": sc.w_wealth, "energy": sc.w_energy,
        "reliability": sc.w_reliability,
        "capital_efficiency": sc.w_capital_efficiency,
        "risk": sc.w_risk, "placement": sc.w_placement,
    }
    if card.prediction_error is not None:
        components["prediction"] = clip(1.0 - card.prediction_error)
        weights["prediction"] = sc.w_prediction
    else:
        # Redistribute the unused prediction weight proportionally.
        total = sum(weights.values())
        weights = {k: v / total for k, v in weights.items()}

    card.components = components
    card.weights = weights
    card.score = 100.0 * sum(components[k] * weights[k] for k in components)
    return card
