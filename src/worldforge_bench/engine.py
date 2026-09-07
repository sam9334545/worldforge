"""Simulation engine. Implements the tick order of Section 24.

The ordering argument, restated: each step reads only state that was either
fixed before the tick began (Layer A) or already recomputed earlier in THIS
tick. Rivers resolve after evaporation/precipitation/infiltration; machine
outputs after every environmental field; the market after every physical
output; the books after the market. Nothing reads forward.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field

import numpy as np

from . import machines as mach
from . import terrain as T
from .actions import Action, ActionResult
from .config import DEFAULT_CONFIG, Config
from .economy.finance import FinanceEngine
from .economy.market import CommodityMarket, ElectricityMarket
from .economy.valuation import irr, value_portfolio
from .generator import generate
from .network import GridNetwork
from .physics import sun as sun_mod
from .physics import water as water_mod
from .physics import weather as weather_mod
from .physics import wind as wind_mod
from .physics.water import FlowRouter
from .placement import can_place, can_reinforce
from .world import Cable, Machine


@dataclass
class TickResult:
    tick: int = 0
    generated_kw: float = 0.0
    delivered_kw: float = 0.0
    curtailed_kw: float = 0.0
    loss_kw: float = 0.0
    unconnected_kw: float = 0.0
    price: float = 0.0
    demand_kw: float = 0.0
    revenue: float = 0.0
    opex: float = 0.0
    free_cash_flow: float = 0.0
    cash: float = 0.0
    equity_value: float = 0.0
    reliability: float = 1.0
    events: list = field(default_factory=list)
    conserved: bool = True
    mass_balanced: bool = True


class Engine:
    """One world, one run. Deterministic in (seed, config, action log)."""

    def __init__(self, seed: int = 42, cfg: Config | None = None):
        self.cfg = cfg or DEFAULT_CONFIG
        self.seed = int(seed)
        self.state = generate(self.seed, self.cfg)
        self.prng = __import__("worldforge_bench.prng", fromlist=["Prng"]).Prng(self.seed + 1)
        self.router = FlowRouter(self.state)
        self.market = ElectricityMarket(self.cfg)
        self.commodities = CommodityMarket(self.cfg)
        self.finance = FinanceEngine(self.cfg)
        self.network = GridNetwork(self.state, self.cfg)

        self.action_log: list = []
        self.history: list = []
        self.annual_cashflows: list = [-0.0]
        self._year_cash = 0.0
        self.prediction_errors: list = []
        self.placements_attempted = 0
        self.placements_valid = 0
        self.terminated = False
        self.termination_reason = ""
        self.reliability_series: list = []
        # The DCF is expensive and moves slowly; cash and debt move every tick.
        # So revalue the ASSETS daily and recompute equity from live cash/debt
        # every tick. Same equity number, a fraction of the work.
        self._ev_cache: float = 0.0
        self._ev_cache_tick: int = -1

        # Prime the hydrology so tick 1 sees a real river, not zeros.
        water_mod.update_water_cycle(self.state, self.cfg, self.router)

    # ------------------------------------------------------------------
    # Actions
    # ------------------------------------------------------------------

    def apply(self, action: Action | dict) -> ActionResult:
        if isinstance(action, dict):
            action = Action.from_dict(action)
        self.action_log.append(action.to_dict())

        handler = {
            "PLACE": self._do_place,
            "REMOVE": self._do_remove,
            "REINFORCE": self._do_reinforce,
            "PLACE_CABLE": self._do_cable,
            "SET_ORIENTATION": self._do_orient,
            "ADVANCE_TIME": self._do_advance,
            "QUERY_PREDICTION": self._do_predict,
            "SIGN_PPA": self._do_ppa,
            "NOOP": lambda a: ActionResult(True, "NOOP", "ok"),
        }[action.type]
        return handler(action)

    def _do_place(self, a: Action) -> ActionResult:
        self.placements_attempted += 1
        if a.kind is None or a.x is None or a.y is None:
            return ActionResult(False, "PLACE", "PLACE needs kind, x and y")
        if a.kind == "cable":
            return ActionResult(False, "PLACE", "use PLACE_CABLE for cable")

        check = can_place(self.state, a.kind, a.x, a.y, self.cfg)
        if not check:
            return ActionResult(False, "PLACE", check.reason)

        cost = self.commodities.capex(a.kind, self.cfg)
        ok, why = self.finance.fund_capex(cost, self.state.tick, a.debt_fraction)
        if not ok:
            return ActionResult(False, "PLACE", why, cost=cost)

        orientation = (a.orientation if a.orientation is not None
                       else mach.best_orientation(a.kind, self.state, a.x, a.y, self.cfg))
        tilt = a.tilt if a.tilt is not None else abs(self.cfg.world.latitude_deg) * 0.75

        m = Machine(kind=a.kind, x=a.x, y=a.y,
                    orientation=float(orientation) % 360.0, tilt=float(tilt),
                    commissioned_tick=self.state.tick, capex_paid=cost)
        self.state.machines[(a.x, a.y)] = m
        self._ev_cache_tick = -1
        self.commodities.record_order(a.kind)
        self.placements_valid += 1
        self._year_cash -= cost
        return ActionResult(True, "PLACE",
                            f"built {a.kind} at ({a.x},{a.y}) facing {m.orientation:.0f} deg",
                            cost=cost,
                            data={"orientation": m.orientation, "tilt": m.tilt})

    def _do_remove(self, a: Action) -> ActionResult:
        key = (a.x, a.y)
        if key in self.state.machines:
            m = self.state.machines.pop(key)
            self._ev_cache_tick = -1
            return ActionResult(True, "REMOVE", f"removed {m.kind} at ({a.x},{a.y})")
        if key in self.state.cables:
            self.state.cables.pop(key)
            self.network = GridNetwork(self.state, self.cfg)
            return ActionResult(True, "REMOVE", f"removed cable at ({a.x},{a.y})")
        return ActionResult(False, "REMOVE", f"nothing to remove at ({a.x},{a.y})")

    def _do_reinforce(self, a: Action) -> ActionResult:
        overlay = a.overlay or "gravel"
        check = can_reinforce(self.state, a.x, a.y, overlay, self.cfg)
        if not check:
            return ActionResult(False, "REINFORCE", check.reason)
        cost = self.commodities.overlay_capex(overlay, self.cfg)
        ok, why = self.finance.fund_capex(cost, self.state.tick, a.debt_fraction)
        if not ok:
            return ActionResult(False, "REINFORCE", why, cost=cost)
        self.state.overlays.setdefault((a.x, a.y), []).append(overlay)
        self._year_cash -= cost
        new_stab = self.state.effective_stability(a.x, a.y, self.cfg)
        return ActionResult(True, "REINFORCE",
                            f"{overlay} laid at ({a.x},{a.y}); effective stability now {new_stab:.2f}",
                            cost=cost, data={"stability": new_stab})

    def _do_cable(self, a: Action) -> ActionResult:
        if not a.path:
            return ActionResult(False, "PLACE_CABLE", "PLACE_CABLE needs a path of cells")
        cells = [(int(p[0]), int(p[1])) for p in a.path]

        # Validate the whole run before spending anything -- partial wiring that
        # silently half-succeeds is exactly the kind of state we refuse to enter.
        for (x, y) in cells:
            if (x, y) in self.state.cables:
                continue
            check = can_place(self.state, "cable", x, y, self.cfg)
            if not check:
                return ActionResult(False, "PLACE_CABLE",
                                    f"cable path fails at ({x},{y}): {check.reason}")
        for i in range(1, len(cells)):
            (px, py), (cx, cy) = cells[i - 1], cells[i]
            if abs(px - cx) + abs(py - cy) != 1:
                return ActionResult(False, "PLACE_CABLE",
                                    f"path is not contiguous between ({px},{py}) and ({cx},{cy}); "
                                    f"cable runs must be 4-connected")

        new_cells = [c for c in cells if c not in self.state.cables]
        unit = self.commodities.capex("cable", self.cfg)
        cost = unit * len(new_cells)
        ok, why = self.finance.fund_capex(cost, self.state.tick, a.debt_fraction)
        if not ok:
            return ActionResult(False, "PLACE_CABLE", why, cost=cost)

        for (x, y) in new_cells:
            self.state.cables[(x, y)] = Cable(
                x=x, y=y, capacity_kw=self.cfg.machines.cable.capacity_kw,
                commissioned_tick=self.state.tick, capex_paid=unit)
        self.commodities.record_order("cable")
        self.network = GridNetwork(self.state, self.cfg)
        self._year_cash -= cost
        return ActionResult(True, "PLACE_CABLE",
                            f"laid {len(new_cells)} cable segment(s)", cost=cost)

    def _do_orient(self, a: Action) -> ActionResult:
        m = self.state.machines.get((a.x, a.y))
        if m is None:
            return ActionResult(False, "SET_ORIENTATION", f"no machine at ({a.x},{a.y})")
        before = mach.machine_output_kw(m, self.state, self.cfg)
        if a.orientation is not None:
            m.orientation = float(a.orientation) % 360.0
        if a.tilt is not None:
            m.tilt = float(max(0.0, min(90.0, a.tilt)))
        after = mach.machine_output_kw(m, self.state, self.cfg)
        return ActionResult(True, "SET_ORIENTATION",
                            f"{m.kind} at ({a.x},{a.y}) now faces {m.orientation:.0f} deg "
                            f"(tilt {m.tilt:.0f}); output {before:.1f} -> {after:.1f} kW",
                            data={"output_before_kw": before, "output_after_kw": after})

    def _do_advance(self, a: Action) -> ActionResult:
        results = [self.tick() for _ in range(max(1, int(a.ticks)))]
        last = results[-1]
        return ActionResult(True, "ADVANCE_TIME",
                            f"advanced {len(results)} tick(s) to tick {last.tick}",
                            data={"ticks": len(results),
                                  "equity_value": last.equity_value,
                                  "price": last.price})

    def _do_predict(self, a: Action) -> ActionResult:
        """Ground truth for the causal-reasoning tests (Section 31). Computes
        what a machine of that kind would produce here, right now, without
        building it or touching the world."""
        if a.kind is None or a.x is None or a.y is None:
            return ActionResult(False, "QUERY_PREDICTION",
                                "QUERY_PREDICTION needs kind, x and y")
        probe = Machine(kind=a.kind, x=a.x, y=a.y,
                        orientation=(a.orientation if a.orientation is not None
                                     else mach.best_orientation(a.kind, self.state, a.x, a.y, self.cfg)),
                        tilt=a.tilt if a.tilt is not None else abs(self.cfg.world.latitude_deg) * 0.75)
        actual = mach.machine_output_kw(probe, self.state, self.cfg)

        data = {"actual_kw": actual}
        if a.predicted_kw is not None:
            denom = max(actual, mach.nameplate_kw(a.kind, self.cfg) * 0.05, 1.0)
            err = abs(a.predicted_kw - actual) / denom
            self.prediction_errors.append(min(1.0, err))
            data["predicted_kw"] = a.predicted_kw
            data["relative_error"] = err
        return ActionResult(True, "QUERY_PREDICTION",
                            f"{a.kind} at ({a.x},{a.y}) would produce {actual:.1f} kW now",
                            data=data)

    def _do_ppa(self, a: Action) -> ActionResult:
        strike = self.market.ppa_strike()
        ok, why = self.finance.sign_ppa(strike, a.fraction, self.state.tick)
        if not ok:
            return ActionResult(False, "SIGN_PPA", why)
        return ActionResult(True, "SIGN_PPA",
                            f"hedged {a.fraction:.0%} of output at ${strike:.2f}/MWh "
                            f"for {self.cfg.market.ppa_tenor_years:.0f} years",
                            data={"strike": strike})

    # ------------------------------------------------------------------
    # The tick (Section 24)
    # ------------------------------------------------------------------

    def tick(self) -> TickResult:
        if self.terminated:
            return self.history[-1] if self.history else TickResult()

        cfg = self.cfg
        st = self.state
        res = TickResult()

        # 1. Advance the clock.
        st.tick += 1
        st.hour = st.tick % cfg.time.ticks_per_day
        st.day = (st.tick // cfg.time.ticks_per_day) % cfg.time.days_per_year
        st.year = st.tick // (cfg.time.ticks_per_day * cfg.time.days_per_year)
        st.season = weather_mod.season_of_day(st.day, cfg)
        res.tick = st.tick

        # 2-5. Seasonal parameters, temperature, cloud, global wind.
        weather_mod.update_weather(st, cfg, self.prng)
        self.commodities.step(self.prng)

        # 2b. Sun position and the irradiance field.
        st.sun_elevation, st.sun_azimuth = sun_mod.solar_position(st.day, st.hour, cfg)
        sun_mod.update_irradiance(st, cfg)

        # 6. Local, terrain-modified wind.
        wind_mod.update_wind(st, cfg)

        # 7, 12-14. Evaporation, infiltration, runoff, river routing.
        audit = water_mod.update_water_cycle(st, cfg, self.router)
        residual = audit["available"] - (audit["evap"] + audit["infil"] + audit["runoff"])
        res.mass_balanced = abs(residual) < max(1e-6, audit["available"] * 1e-9)

        # 15. Machine outputs.
        outputs = {m.pos: mach.machine_output_kw(m, st, cfg) for m in st.active_machines()}

        # 17. Demand for this tick (needed before dispatch, so zones know their target).
        demand_total = self.market.system_demand_kw(st, self.prng)
        zone_base = sum(z.base_demand_kw for z in st.demand_zones) or 1.0
        for z in st.demand_zones:
            z.demand_kw = demand_total * (z.base_demand_kw / zone_base)
        res.demand_kw = demand_total

        # 16. Transmission over the actual wiring.
        dispatch = self.network.dispatch(st, cfg, outputs)
        res.generated_kw = dispatch.generated_kw
        res.delivered_kw = dispatch.delivered_kw
        res.curtailed_kw = dispatch.curtailed_kw
        res.loss_kw = dispatch.loss_kw
        res.unconnected_kw = dispatch.unconnected_kw
        res.conserved = dispatch.conserved

        # 18. Market clearing, then revenue.
        mtick = self.market.clear(st, dispatch.delivered_kw, self.prng)
        res.price = mtick.price

        hours = cfg.time.hours_per_tick
        mwh_delivered = dispatch.delivered_kw * hours / 1000.0
        mwh_generated = dispatch.generated_kw * hours / 1000.0

        hedge_frac, strike = self.finance.hedged_fraction(st.tick)
        contracted_mwh = mwh_delivered * hedge_frac
        merchant_mwh = mwh_delivered - contracted_mwh
        contracted_rev = contracted_mwh * strike
        merchant_rev = merchant_mwh * mtick.price
        revenue = contracted_rev + merchant_rev
        effective_price = revenue / mwh_delivered if mwh_delivered > 1e-9 else mtick.price

        # Attribute revenue per machine, so each asset carries its own realised
        # capture price into the valuation.
        opex = 0.0
        per_year = cfg.time.ticks_per_day * cfg.time.days_per_year
        for m in st.active_machines():
            spec = cfg.machines.get(m.kind)
            m_mwh = m.delivered_kw * hours / 1000.0
            m.lifetime_mwh += m_mwh
            m.lifetime_revenue += m_mwh * effective_price
            opex += spec.opex_per_year / per_year
            opex += (m.output_kw * hours / 1000.0) * spec.opex_per_mwh
        for c in st.cables.values():
            opex += cfg.machines.cable.opex_per_year / per_year

        res.revenue = revenue
        res.opex = opex

        # 19. Books.
        tf = self.finance.accrue(st.tick, revenue, merchant_rev, contracted_rev, opex)
        res.free_cash_flow = tf.free_cash_flow
        res.cash = self.finance.books.cash
        self._year_cash += tf.free_cash_flow

        b = self.finance.books
        b.cum_mwh_generated += mwh_generated
        b.cum_mwh_delivered += mwh_delivered
        b.cum_mwh_curtailed += dispatch.curtailed_kw * hours / 1000.0

        if tf.covenant_breached:
            res.events.append(f"DSCR covenant breached ({tf.dscr:.2f} < "
                              f"{cfg.finance.dscr_covenant}); ${cfg.finance.covenant_breach_penalty:,.0f} penalty")
        if mtick.scarcity:
            res.events.append(f"scarcity pricing: ${mtick.price:.0f}/MWh, "
                              f"reserve margin {mtick.reserve_margin:.1%}")
        if mtick.negative:
            res.events.append(f"negative price ${mtick.price:.2f}/MWh: system oversupplied")

        # 19b. Ageing and degradation.
        year_frac = 1.0 / per_year
        for m in st.active_machines():
            spec = cfg.machines.get(m.kind)
            m.age_years += year_frac
            m.health = max(0.0, (1.0 - spec.degradation_per_year) ** m.age_years)
            if m.age_years >= spec.lifespan_years:
                m.retired = True
                m.health = 0.0
                res.events.append(f"{m.kind} at {m.pos} reached end of life; output now 0")

        # 20-21. Valuation, reliability, snapshot.
        stale = (st.tick - self._ev_cache_tick) >= cfg.time.ticks_per_day
        if stale or self._ev_cache_tick < 0:
            pv = value_portfolio(st, self.finance, cfg, effective_price, with_lcoe=False)
            self._ev_cache = pv.enterprise_value
            self._ev_cache_tick = st.tick
        equity_value = self._ev_cache + b.cash - b.debt
        res.equity_value = equity_value
        self.finance.track_drawdown(equity_value)

        served = sum(z.served_kw for z in st.demand_zones)
        demanded = sum(z.demand_kw for z in st.demand_zones)
        res.reliability = served / demanded if demanded > 1e-9 else 1.0
        self.reliability_series.append(res.reliability)

        # Annual cash-flow series, for the IRR.
        if st.tick % per_year == 0:
            self.annual_cashflows.append(self._year_cash)
            self._year_cash = 0.0

        if b.insolvent:
            self.terminated = True
            self.termination_reason = (
                f"insolvent at tick {st.tick}: cash ${b.cash:,.0f} fell below the "
                f"${cfg.finance.insolvency_cash_floor:,.0f} floor")
            res.events.append(self.termination_reason)

        horizon_ticks = cfg.time.horizon_years * per_year
        if st.tick >= horizon_ticks:
            self.terminated = True
            self.termination_reason = f"reached the {cfg.time.horizon_years:.0f}-year horizon"

        self.history.append(res)
        return res

    # ------------------------------------------------------------------

    def run(self, ticks: int) -> list:
        out = []
        for _ in range(ticks):
            if self.terminated:
                break
            out.append(self.tick())
        return out

    def valuation(self):
        price = self.market.price_history[-1] if self.market.price_history else 55.0
        return value_portfolio(self.state, self.finance, self.cfg, price)

    def portfolio_irr(self) -> float | None:
        """IRR on the annual cash-flow series, with terminal equity as the exit
        value in the final year -- otherwise every run still holding assets
        would look like it never got its money back."""
        flows = list(self.annual_cashflows[1:])      # drop the priming zero
        if self._year_cash != 0.0:
            flows.append(self._year_cash)            # partial final year
        if len(flows) < 2:
            return None
        flows[-1] += self.valuation().equity_value   # exit at fair value
        flows.insert(0, -self.cfg.finance.starting_cash)
        return irr(flows)

    def state_hash(self) -> str:
        """Determinism fingerprint (Section 36). Same seed + same action log
        must give the same digest."""
        h = hashlib.sha256()
        st = self.state
        h.update(f"{st.tick}|{st.seed}|".encode())
        for arr in (st.terrain, np.round(st.elevation, 6),
                    np.round(st.fields.wind_speed, 6),
                    np.round(st.fields.irradiance, 6),
                    np.round(st.fields.flow_q, 6)):
            h.update(np.ascontiguousarray(arr).tobytes())
        for pos in sorted(st.machines):
            m = st.machines[pos]
            h.update(f"{pos}{m.kind}{m.orientation:.4f}{m.tilt:.4f}"
                     f"{m.output_kw:.4f}{m.health:.6f}".encode())
        for pos in sorted(st.cables):
            h.update(f"{pos}{st.cables[pos].flow_kw:.4f}".encode())
        b = self.finance.books
        h.update(f"{b.cash:.4f}{b.debt:.4f}{b.gross_ppe:.4f}".encode())
        return h.hexdigest()[:16]
