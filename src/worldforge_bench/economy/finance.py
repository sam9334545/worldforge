"""Project finance: balance sheet, debt, tax, depreciation (Section 18, extended).

The spec's economy is `netWorth = cumulative profit - build costs`. That is
replaced by a real set of books, because "maximise wealth" is only a meaningful
objective if wealth can go down:

  * Capex can be part-funded with debt, up to a leverage limit. Debt is cheap
    relative to equity, so leverage lifts returns -- and amplifies losses.
  * The credit spread widens with leverage, so the marginal cost of debt rises
    as you gear up. There is an optimum, and it is not "borrow the maximum".
  * A DSCR covenant is tested QUARTERLY on trailing-twelve-month figures,
    after a construction grace period -- the way real project debt works. A bad
    hour is not a default; a bad year is. Breaching costs cash and blocks new
    borrowing, so an agent that levers into a bad year gets locked out of the
    market exactly when it wants to build.
  * Depreciation shields tax; losses carry forward. Reported profit and cash
    flow are different numbers, and the agent has to care about the second one.
  * Cash below the insolvency floor terminates the run. Bankruptcy is a real
    absorbing state, not a negative score.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field


@dataclass
class Loan:
    principal: float
    rate: float
    drawn_tick: int
    tenor_years: float
    outstanding: float = 0.0

    def __post_init__(self):
        if self.outstanding == 0.0:
            self.outstanding = self.principal


@dataclass
class PPAContract:
    strike: float
    fraction: float
    signed_tick: int
    tenor_years: float

    def active(self, tick: int, ticks_per_year: float) -> bool:
        return (tick - self.signed_tick) < self.tenor_years * ticks_per_year


@dataclass
class Books:
    cash: float = 0.0
    gross_ppe: float = 0.0              # capitalised build cost
    accumulated_depreciation: float = 0.0
    debt: float = 0.0
    loans: list = field(default_factory=list)
    ppas: list = field(default_factory=list)

    # cumulative P&L
    cum_revenue: float = 0.0
    cum_opex: float = 0.0
    cum_interest: float = 0.0
    cum_tax: float = 0.0
    cum_depreciation: float = 0.0
    cum_capex: float = 0.0
    cum_penalties: float = 0.0
    tax_loss_carryforward: float = 0.0

    # rolling operational stats
    cum_mwh_generated: float = 0.0
    cum_mwh_delivered: float = 0.0
    cum_mwh_curtailed: float = 0.0

    covenant_breaches: int = 0
    insolvent: bool = False
    peak_equity: float = 0.0
    max_drawdown: float = 0.0

    @property
    def net_ppe(self) -> float:
        return max(0.0, self.gross_ppe - self.accumulated_depreciation)

    @property
    def book_equity(self) -> float:
        return self.cash + self.net_ppe - self.debt

    @property
    def leverage(self) -> float:
        denom = self.debt + max(self.book_equity, 1.0)
        return self.debt / denom if denom > 0 else 0.0


@dataclass
class TickFinancials:
    revenue: float = 0.0
    merchant_revenue: float = 0.0
    contracted_revenue: float = 0.0
    opex: float = 0.0
    ebitda: float = 0.0
    depreciation: float = 0.0
    ebit: float = 0.0
    interest: float = 0.0
    tax: float = 0.0
    net_income: float = 0.0
    principal_repaid: float = 0.0
    free_cash_flow: float = 0.0
    dscr: float = 0.0
    covenant_breached: bool = False


class FinanceEngine:
    def __init__(self, cfg):
        self.cfg = cfg
        self.fc = cfg.finance
        self.books = Books(cash=self.fc.starting_cash)
        self.ticks_per_year = cfg.time.ticks_per_day * cfg.time.days_per_year
        self.test_interval = int(self.fc.dscr_test_every_days * cfg.time.ticks_per_day)
        self.grace_ticks = int(self.fc.dscr_grace_years * self.ticks_per_year)
        # Rolling trailing-twelve-month windows for the covenant test.
        self._ttm_ebitda = deque(maxlen=int(self.ticks_per_year))
        self._ttm_service = deque(maxlen=int(self.ticks_per_year))
        self.last_dscr = float("inf")

    # -- capital ---------------------------------------------------------

    def cost_of_debt(self) -> float:
        """Spread widens with leverage, so the marginal dollar of debt is dearer
        than the average one."""
        return self.fc.cost_of_debt_base + self.fc.credit_spread_per_leverage * self.books.leverage

    def cost_of_equity(self) -> float:
        return self.fc.risk_free_rate + self.fc.asset_beta * self.fc.equity_risk_premium

    def wacc(self) -> float:
        b = self.books
        e = max(b.book_equity, 1.0)
        d = b.debt
        v = d + e
        return (e / v) * self.cost_of_equity() + (d / v) * self.cost_of_debt() * (1 - self.fc.tax_rate)

    def max_new_debt(self) -> float:
        """Headroom to the leverage cap. Zero while a covenant is breached."""
        if self.books.covenant_breaches > 0 and self._recent_breach:
            return 0.0
        b = self.books
        cap = self.fc.max_leverage
        equity = max(b.book_equity, 1.0)
        # solve  (D + x) / (D + x + E) <= cap
        allowed_total = cap * equity / max(1e-9, 1.0 - cap)
        return max(0.0, allowed_total - b.debt)

    _recent_breach: bool = False

    def fund_capex(self, amount: float, tick: int, debt_fraction: float = 0.0) -> tuple[bool, str]:
        """Pay for a build. Returns (ok, reason)."""
        b = self.books
        debt_fraction = max(0.0, min(1.0, debt_fraction))
        wanted_debt = amount * debt_fraction
        available_debt = min(wanted_debt, self.max_new_debt())
        equity_part = amount - available_debt

        if equity_part > b.cash:
            return False, (f"insufficient cash: need ${equity_part:,.0f} of equity "
                           f"(debt headroom ${self.max_new_debt():,.0f}), have ${b.cash:,.0f}")

        if available_debt > 0:
            loan = Loan(principal=available_debt, rate=self.cost_of_debt(),
                        drawn_tick=tick, tenor_years=self.fc.debt_tenor_years)
            b.loans.append(loan)
            b.debt += available_debt
            b.cash += available_debt

        b.cash -= amount
        b.gross_ppe += amount
        b.cum_capex += amount
        return True, "ok"

    # -- operating -------------------------------------------------------

    def accrue(self, tick: int, revenue: float, merchant: float, contracted: float,
               opex: float) -> TickFinancials:
        """One tick of P&L and cash flow. Everything is pro-rated per tick, so
        the books are correct at any cadence."""
        b = self.books
        fc = self.fc
        per_year = self.ticks_per_year
        tf = TickFinancials(revenue=revenue, merchant_revenue=merchant,
                            contracted_revenue=contracted, opex=opex)

        tf.ebitda = revenue - opex

        # Straight-line depreciation for tax, pro-rated per tick.
        if b.gross_ppe > b.accumulated_depreciation:
            dep = b.gross_ppe / fc.depreciation_years / per_year
            dep = min(dep, b.gross_ppe - b.accumulated_depreciation)
        else:
            dep = 0.0
        tf.depreciation = dep
        b.accumulated_depreciation += dep
        b.cum_depreciation += dep

        tf.ebit = tf.ebitda - dep

        # Interest and principal on each loan.
        interest = 0.0
        principal = 0.0
        for loan in b.loans:
            if loan.outstanding <= 0:
                continue
            i = loan.outstanding * loan.rate / per_year
            p = loan.principal / loan.tenor_years / per_year
            p = min(p, loan.outstanding)
            loan.outstanding -= p
            interest += i
            principal += p
        tf.interest = interest
        tf.principal_repaid = principal
        b.debt = sum(l.outstanding for l in b.loans)

        # Tax with loss carryforward.
        taxable = tf.ebit - interest
        if taxable < 0:
            b.tax_loss_carryforward += -taxable
            tf.tax = 0.0
        else:
            shield = min(b.tax_loss_carryforward, taxable)
            b.tax_loss_carryforward -= shield
            tf.tax = (taxable - shield) * fc.tax_rate
        tf.net_income = taxable - tf.tax

        # Cash.
        tf.free_cash_flow = tf.ebitda - interest - principal - tf.tax
        b.cash += tf.free_cash_flow

        b.cum_revenue += revenue
        b.cum_opex += opex
        b.cum_interest += interest
        b.cum_tax += tf.tax

        # DSCR covenant: trailing-twelve-month cover, tested quarterly, after
        # the construction grace period. One bad hour is not a default.
        debt_service = interest + principal
        self._ttm_ebitda.append(tf.ebitda)
        self._ttm_service.append(debt_service)

        ttm_service = sum(self._ttm_service)
        ttm_ebitda = sum(self._ttm_ebitda)
        tf.dscr = (ttm_ebitda / ttm_service) if ttm_service > 1e-9 else float("inf")
        self.last_dscr = tf.dscr

        is_test_tick = (tick > self.grace_ticks
                        and self.test_interval > 0
                        and tick % self.test_interval == 0)
        if is_test_tick and ttm_service > 1e-9 and tf.dscr < fc.dscr_covenant:
            tf.covenant_breached = True
            self._recent_breach = True
            b.covenant_breaches += 1
            b.cash -= fc.covenant_breach_penalty
            b.cum_penalties += fc.covenant_breach_penalty
        elif is_test_tick:
            # A passed test clears the borrowing block.
            self._recent_breach = False

        if b.cash < fc.insolvency_cash_floor:
            b.insolvent = True
        return tf

    def track_drawdown(self, equity_value: float) -> None:
        b = self.books
        b.peak_equity = max(b.peak_equity, equity_value)
        if b.peak_equity > 0:
            dd = (b.peak_equity - equity_value) / b.peak_equity
            b.max_drawdown = max(b.max_drawdown, min(1.0, dd))

    # -- contracts -------------------------------------------------------

    def hedged_fraction(self, tick: int) -> tuple[float, float]:
        """Total hedged share of output and its weighted strike price."""
        active = [p for p in self.books.ppas if p.active(tick, self.ticks_per_year)]
        if not active:
            return 0.0, 0.0
        frac = min(self.cfg.market.ppa_max_fraction, sum(p.fraction for p in active))
        total = sum(p.fraction for p in active)
        strike = sum(p.strike * p.fraction for p in active) / max(total, 1e-9)
        return frac, strike

    def sign_ppa(self, strike: float, fraction: float, tick: int) -> tuple[bool, str]:
        current, _ = self.hedged_fraction(tick)
        if current + fraction > self.cfg.market.ppa_max_fraction + 1e-9:
            return False, (f"cannot hedge {fraction:.0%}: already at {current:.0%}, "
                           f"cap is {self.cfg.market.ppa_max_fraction:.0%}")
        self.books.ppas.append(PPAContract(strike=strike, fraction=fraction,
                                           signed_tick=tick,
                                           tenor_years=self.cfg.market.ppa_tenor_years))
        return True, "ok"
