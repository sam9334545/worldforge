"""Every tunable constant in the simulation, in one place.

Section 40 of the spec: "Keep all 'unknown/uncertain' numeric constants behind a
single tunable config object rather than inlined literals, so balancing doesn't
require touching physics code."

Nothing in physics/ or economy/ may contain a bare numeric literal that a
designer would plausibly want to tune. If you find one, it belongs here.
"""

from __future__ import annotations

from dataclasses import dataclass, field, asdict, replace
from typing import Any


# --------------------------------------------------------------------------
# World / grid
# --------------------------------------------------------------------------

@dataclass(frozen=True)
class WorldConfig:
    width: int = 24
    height: int = 24
    cell_size_m: float = 100.0          # one cell edge in metres
    latitude_deg: float = 40.0          # drives the solar sinusoid

    # Map generation mix (fractions, normalised internally)
    frac_grass: float = 0.44
    frac_sand: float = 0.14
    frac_mud: float = 0.08
    frac_stone: float = 0.16
    frac_gravel: float = 0.10
    frac_water: float = 0.08
    n_demand_zones: int = 3
    n_mountain_ridges: int = 2


# --------------------------------------------------------------------------
# Time (Section 19)
# --------------------------------------------------------------------------

@dataclass(frozen=True)
class TimeConfig:
    hours_per_tick: float = 1.0
    ticks_per_day: int = 24
    days_per_season: int = 90
    days_per_year: int = 360
    horizon_years: float = 10.0


# --------------------------------------------------------------------------
# Solar (Section 8, E1-E3)
# --------------------------------------------------------------------------

@dataclass(frozen=True)
class SolarConfig:
    i_max_w_m2: float = 1000.0          # peak clear-sky irradiance
    k_atten: float = 0.75               # cloud attenuation coefficient
    shadow_range_cells: int = 4         # terrain obstruction ray-cast range
    axial_tilt_deg: float = 23.44


# --------------------------------------------------------------------------
# Wind (Section 9, E6)
# --------------------------------------------------------------------------

@dataclass(frozen=True)
class WindConfig:
    z0_ref_m: float = 0.03              # reference roughness (grass)
    roughness_alpha: float = 0.11       # exponent in (z0_ref/z0)^alpha
    elevation_bonus_per_level: float = 0.06
    elevation_bonus_cap: float = 0.35
    shadow_range_cells: int = 4         # R_orographic
    shadow_strength: float = 0.10       # speed loss per elevation level, per cell of range
    air_density_kg_m3: float = 1.225


# --------------------------------------------------------------------------
# Water cycle + rivers (Sections 11-12, E7/E10/E11/E14-E16)
# --------------------------------------------------------------------------

@dataclass(frozen=True)
class WaterConfig:
    k_evap: float = 0.012               # base evaporation rate (m of water per tick at T_factor=1)
    k_infiltration: float = 0.030
    channel_width_m: float = 12.0
    channel_depth_m: float = 2.5
    basin_capacity_m: float = 4.0       # waterLevel above which a cell overflows
    baseflow_m3s: float = 8.0           # spring-fed minimum river flow
    runoff_to_flow_gain: float = 0.9    # m of runoff per cell -> m3/s contributed
    head_per_elevation_m: float = 6.0   # hydraulic head per elevation level of drop


# --------------------------------------------------------------------------
# Weather / seasons (Section 20)
# --------------------------------------------------------------------------

@dataclass(frozen=True)
class WeatherConfig:
    # Per season, index 0..3 = Spring, Summer, Autumn, Winter
    base_temp_c: tuple = (12.0, 24.0, 13.0, 1.0)
    base_humidity: tuple = (0.62, 0.50, 0.68, 0.72)
    base_cloud: tuple = (0.42, 0.28, 0.50, 0.58)
    cloud_volatility: float = 0.22          # sd of the AR(1) cloud-cover innovation
    cloud_persistence: float = 0.86         # AR(1) coefficient (weather is autocorrelated)
    base_wind_ms: tuple = (8.5, 6.0, 9.0, 10.5)
    wind_volatility: float = 0.16
    wind_persistence: float = 0.92
    # Direction mean-reverts to a seasonal prevailing bearing rather than
    # random-walking. A pure random walk drifts ~160 deg in a month, which
    # makes turbine orientation unlearnable; prevailing winds are the real
    # behaviour and give the agent something it can actually forecast.
    prevailing_wind_dir: tuple = (270.0, 250.0, 285.0, 300.0)
    wind_dir_reversion: float = 0.035       # pull per tick toward the prevailing bearing
    wind_dir_noise_deg: float = 3.5         # per-tick bearing noise
    rain_multiplier: tuple = (1.25, 0.60, 1.30, 0.85)
    lapse_rate_c_per_level: float = 1.4     # temperature drop per elevation level


# --------------------------------------------------------------------------
# Machines (Section 14)
# --------------------------------------------------------------------------

@dataclass(frozen=True)
class MachineSpec:
    key: str
    display: str
    capex_base: float                   # $ at reference commodity price index 1.0
    opex_per_year: float                # $ fixed O&M per year
    opex_per_mwh: float                 # $ variable O&M per MWh produced
    lifespan_years: float
    min_stability: float
    # solar
    panel_area_m2: float = 0.0
    panel_efficiency: float = 0.0
    # wind
    rated_power_kw: float = 0.0
    rotor_diameter_m: float = 0.0
    efficiency: float = 0.0             # <= Betz 0.593
    cut_in_ms: float = 0.0
    rated_ms: float = 0.0
    cut_out_ms: float = 0.0
    # hydro
    q_min_m3s: float = 0.0
    h_min_m: float = 0.0
    # cable
    capacity_kw: float = 0.0
    loss_per_cell: float = 0.0
    # shared
    degradation_per_year: float = 0.005 # fractional efficiency loss per year of age


@dataclass(frozen=True)
class MachineConfig:
    land_solar: MachineSpec = MachineSpec(
        key="land_solar", display="Land Solar", capex_base=520_000.0,
        opex_per_year=9_000.0, opex_per_mwh=1.0, lifespan_years=25.0,
        min_stability=0.70, panel_area_m2=4_000.0, panel_efficiency=0.21,
        degradation_per_year=0.005,
    )
    floating_solar: MachineSpec = MachineSpec(
        key="floating_solar", display="Floating Solar", capex_base=690_000.0,
        opex_per_year=13_000.0, opex_per_mwh=1.2, lifespan_years=22.0,
        min_stability=0.0, panel_area_m2=4_000.0, panel_efficiency=0.215,
        degradation_per_year=0.005,
    )
    wind: MachineSpec = MachineSpec(
        key="wind", display="Wind Turbine", capex_base=1_450_000.0,
        opex_per_year=38_000.0, opex_per_mwh=3.5, lifespan_years=25.0,
        min_stability=0.70, rated_power_kw=2_500.0, rotor_diameter_m=90.0,
        efficiency=0.45, cut_in_ms=3.0, rated_ms=12.0, cut_out_ms=25.0,
        degradation_per_year=0.006,
    )
    hydro: MachineSpec = MachineSpec(
        key="hydro", display="Hydro Turbine", capex_base=2_100_000.0,
        opex_per_year=42_000.0, opex_per_mwh=2.0, lifespan_years=40.0,
        min_stability=0.0, efficiency=0.85, q_min_m3s=2.0, h_min_m=1.5,
        degradation_per_year=0.003,
    )
    cable: MachineSpec = MachineSpec(
        key="cable", display="Cable", capex_base=45_000.0,
        opex_per_year=900.0, opex_per_mwh=0.0, lifespan_years=40.0,
        min_stability=0.30, capacity_kw=6_000.0, loss_per_cell=0.012,
        degradation_per_year=0.001,
    )
    # Reinforcement overlays
    gravel_capex: float = 28_000.0
    stone_capex: float = 55_000.0
    gravel_stability_bonus: float = 0.25
    stone_stability_bonus: float = 0.30
    stability_cap: float = 1.0
    v_float_max_ms: float = 0.8         # floating solar velocity ceiling
    max_slope_levels: int = 3
    wake_radius_cells: int = 2          # turbine wake exclusion
    hydro_density_cells: int = 3        # min separation on one water segment

    def get(self, key: str) -> MachineSpec:
        return {
            "land_solar": self.land_solar, "floating_solar": self.floating_solar,
            "wind": self.wind, "hydro": self.hydro, "cable": self.cable,
        }[key]

    def all(self) -> dict:
        return {k: self.get(k) for k in
                ("land_solar", "floating_solar", "wind", "hydro", "cable")}


# --------------------------------------------------------------------------
# Market — the endogenous bit (see economy/market.py)
# --------------------------------------------------------------------------

@dataclass(frozen=True)
class MarketConfig:
    """Electricity price is NOT a fixed schedule. It clears each tick against a
    residual demand curve served by a background thermal fleet, so the agent's
    own build-out moves the price it earns (value cannibalisation)."""

    # Background (NPC) fleet: (name, capacity_kw, marginal_cost $/MWh, co2_t_per_mwh)
    # Sized so the fleet covers about 1.3x today's peak. Demand grows ~2.2%/yr,
    # so the reserve margin thins over the 10-year horizon and scarcity pricing
    # becomes reachable late in a run -- capacity held to year 10 is worth more
    # than capacity sold in year 2.
    thermal_fleet: tuple = (
        ("nuclear",  5_000.0,   9.0, 0.00),
        ("lignite",  6_000.0,  28.0, 1.05),
        ("ccgt",     9_000.0,  62.0, 0.38),
        ("ocgt",     5_500.0, 140.0, 0.55),
        ("peaker",   4_500.0, 310.0, 0.72),
    )
    price_cap: float = 900.0            # $/MWh scarcity cap (value of lost load proxy)
    price_floor: float = -25.0          # negative prices when renewables oversupply
    demand_elasticity: float = 0.18     # fraction of demand that responds to price
    scarcity_exponent: float = 2.2      # how sharply price spikes as reserve margin -> 0
    reserve_margin_ref: float = 0.15

    # Demand growth / shape
    demand_growth_per_year: float = 0.022
    demand_daily_shape: tuple = (       # 24 hourly multipliers, mean ~1.0
        0.68, 0.63, 0.60, 0.59, 0.62, 0.72, 0.88, 1.04, 1.12, 1.10, 1.06, 1.05,
        1.06, 1.05, 1.04, 1.06, 1.14, 1.30, 1.38, 1.32, 1.18, 1.02, 0.88, 0.76,
    )
    demand_seasonal: tuple = (0.97, 1.08, 0.99, 1.14)   # Spring/Summer/Autumn/Winter
    demand_shock_prob: float = 0.0015   # per tick chance of a demand shock
    demand_shock_scale: float = 0.30

    # Carbon
    carbon_price_start: float = 45.0    # $/tCO2, added to thermal marginal cost
    carbon_price_growth_per_year: float = 0.06

    # Contracts
    ppa_discount: float = 0.88          # PPA strike = 0.88 x trailing mean spot
    ppa_tenor_years: float = 10.0
    ppa_max_fraction: float = 0.80      # max share of output you may hedge


@dataclass(frozen=True)
class CommodityConfig:
    """Capital-goods prices move too. Building a lot raises what you pay for the
    next unit (congestion), while cumulative global deployment lowers it
    (Wright's law learning curve)."""

    index_start: float = 1.00
    index_persistence: float = 0.97     # AR(1) on the commodity price index
    index_volatility: float = 0.012
    index_min: float = 0.55
    index_max: float = 2.20
    congestion_per_order: float = 0.045 # index bump per machine ordered in one tick
    congestion_decay: float = 0.90      # bump decays back per tick
    learning_rate: float = 0.16         # cost fall per doubling of cumulative installs
    learning_ref_installs: float = 12.0


# --------------------------------------------------------------------------
# Finance (economy/finance.py, economy/valuation.py)
# --------------------------------------------------------------------------

@dataclass(frozen=True)
class FinanceConfig:
    starting_cash: float = 25_000_000.0
    risk_free_rate: float = 0.03
    equity_risk_premium: float = 0.055
    asset_beta: float = 1.05
    cost_of_debt_base: float = 0.052
    credit_spread_per_leverage: float = 0.045   # spread widens with leverage
    max_leverage: float = 0.70                  # debt / (debt + equity book)
    debt_tenor_years: float = 18.0
    dscr_covenant: float = 1.25                 # breach -> penalty + no new debt
    dscr_test_every_days: float = 90.0           # tested quarterly, on trailing-year figures
    dscr_grace_years: float = 1.0                # construction period before testing starts
    covenant_breach_penalty: float = 400_000.0
    tax_rate: float = 0.24
    depreciation_years: float = 20.0            # straight-line, tax purposes
    insolvency_cash_floor: float = -2_000_000.0  # below this the run terminates
    terminal_growth: float = 0.005              # Gordon growth in the DCF tail
    dcf_horizon_years: float = 25.0
    working_capital_days: float = 30.0


# --------------------------------------------------------------------------
# Grid / transmission (Section 17)
# --------------------------------------------------------------------------

@dataclass(frozen=True)
class GridConfig:
    require_cable_connection: bool = True
    curtailment_allowed: bool = True
    storage_unlocked: bool = False
    storage_capacity_kwh: float = 0.0
    storage_round_trip: float = 0.86


# --------------------------------------------------------------------------
# Scoring (Section 28 + wealth-first weighting)
# --------------------------------------------------------------------------

@dataclass(frozen=True)
class ScoringConfig:
    w_wealth: float = 0.40              # terminal equity value (the headline objective)
    w_energy: float = 0.12              # total MWh delivered
    w_reliability: float = 0.13         # served / demanded, variance-penalised
    w_capital_efficiency: float = 0.12  # ROIC
    w_risk: float = 0.10                # drawdown / covenant discipline
    w_placement: float = 0.05           # valid placements / attempted
    w_prediction: float = 0.08          # QUERY_PREDICTION accuracy
    reliability_variance_penalty: float = 0.5
    drawdown_penalty_scale: float = 2.0
    # Normalisation anchors, in $ of terminal equity, used to map raw -> 0..100
    wealth_floor: float = 0.0           # do-nothing baseline is calibrated at runtime
    wealth_ceiling_multiple: float = 3.0


# --------------------------------------------------------------------------
# Top-level
# --------------------------------------------------------------------------

@dataclass(frozen=True)
class Config:
    world: WorldConfig = field(default_factory=WorldConfig)
    time: TimeConfig = field(default_factory=TimeConfig)
    solar: SolarConfig = field(default_factory=SolarConfig)
    wind: WindConfig = field(default_factory=WindConfig)
    water: WaterConfig = field(default_factory=WaterConfig)
    weather: WeatherConfig = field(default_factory=WeatherConfig)
    machines: MachineConfig = field(default_factory=MachineConfig)
    market: MarketConfig = field(default_factory=MarketConfig)
    commodity: CommodityConfig = field(default_factory=CommodityConfig)
    finance: FinanceConfig = field(default_factory=FinanceConfig)
    grid: GridConfig = field(default_factory=GridConfig)
    scoring: ScoringConfig = field(default_factory=ScoringConfig)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def with_overrides(self, **sections: dict) -> "Config":
        """cfg.with_overrides(market={'price_cap': 500}) -> new Config."""
        patch = {}
        for name, values in sections.items():
            current = getattr(self, name)
            patch[name] = replace(current, **values)
        return replace(self, **patch)


DEFAULT_CONFIG = Config()
