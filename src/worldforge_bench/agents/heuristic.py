"""A reasoning baseline: sites, orients and wires from the current world state.

This is not a clever agent. It is the standard a submitted agent should have to
beat, and it does only what the physics obviously rewards:

  1. Values every candidate site from the ACTUAL fields at that cell -- local
     wind after roughness/elevation/wind-shadow, irradiance after terrain
     obstruction, flow x head for hydro -- never from terrain type.
  2. Orients each machine to the resource: turbines into the prevailing wind,
     panels toward the equator at a latitude-appropriate tilt.
  3. Wires each build to the nearest zone it can legally reach, and stops
     building once the marginal machine would earn less than it costs.
  4. Watches its own cannibalisation: it stops adding capacity once its supply
     covers most of peak demand, because the next MWh would clear at a lower
     price than the last.
  5. Re-yaws turbines as the prevailing wind veers with the season.
"""

from __future__ import annotations

import numpy as np

from ..actions import Action
from ..machines import nameplate_kw
from .base import Agent, register
from .random_agent import _l_path


@register
class HeuristicAgent(Agent):
    name = "heuristic"

    def __init__(self, reserve_fraction: float = 0.12,
                 capacity_target: float = 1.15,
                 reyaw_every_ticks: int = 24 * 30,
                 hedge: float = 0.5, **kw):
        super().__init__(**kw)
        self.reserve_fraction = reserve_fraction
        self.capacity_target = capacity_target
        self.reyaw_every = reyaw_every_ticks
        self.hedge = hedge
        self._hedged = False
        self._last_reyaw = 0

    # -- siting ---------------------------------------------------------

    def _expected_kw(self, sim, kind, x, y):
        """Expected average output at this cell, from the live fields."""
        st = sim.engine.state
        cfg = sim.engine.cfg
        f = st.fields
        if kind == "wind":
            v = float(f.wind_speed[y, x])
            spec = cfg.machines.wind
            if v < spec.cut_in_ms:
                return 0.0
            swept = np.pi * (spec.rotor_diameter_m / 2.0) ** 2
            p = 0.5 * cfg.wind.air_density_kg_m3 * swept * v ** 3 / 1000.0
            return min(spec.rated_power_kw, p * spec.efficiency)
        if kind in ("land_solar", "floating_solar"):
            spec = cfg.machines.get(kind)
            # Clear-sky midday potential, discounted by this cell's own
            # obstruction and cloud, then by a day/night duty cycle.
            clear = cfg.solar.i_max_w_m2 * float(f.obstruction[y, x])
            clear *= (1.0 - float(f.cloud[y, x]) * cfg.solar.k_atten)
            return clear * spec.panel_area_m2 * spec.panel_efficiency / 1000.0 * 0.30
        if kind == "hydro":
            q = float(f.flow_q[y, x])
            h = float(f.head[y, x])
            spec = cfg.machines.hydro
            if q < spec.q_min_m3s or h < spec.h_min_m:
                return 0.0
            return 1000.0 * 9.81 * q * h * spec.efficiency / 1000.0
        return 0.0

    def _candidates(self, sim, obs):
        st = sim.engine.state
        cfg = sim.engine.cfg
        capex = obs["market"]["capex_now"]
        price = obs["market"]["price_mean_24h"] or 55.0
        hours_per_year = cfg.time.days_per_year * cfg.time.ticks_per_day

        out = []
        for y in range(st.height):
            for x in range(st.width):
                for kind in ("wind", "hydro", "land_solar", "floating_solar"):
                    if not sim.can_place(kind, x, y):
                        continue
                    kw = self._expected_kw(sim, kind, x, y)
                    if kw <= 1.0:
                        continue
                    spec = cfg.machines.get(kind)
                    annual_mwh = kw * hours_per_year / 1000.0
                    annual_net = (annual_mwh * (price - spec.opex_per_mwh)
                                  - spec.opex_per_year)
                    cost = capex[kind]
                    # Simple payback screen; the ranking key is return on capex.
                    if annual_net <= 0:
                        continue
                    out.append((annual_net / cost, kind, x, y, cost, kw))
        out.sort(reverse=True)
        return out

    # -- the policy -----------------------------------------------------

    def act(self, sim, obs):
        actions = []
        st = sim.engine.state
        cfg = sim.engine.cfg

        # Lock in part of the revenue early, while prices are still un-cannibalised.
        if not self._hedged and self.hedge > 0 and obs["tick"] > 24 * 14:
            self._hedged = True
            actions.append(Action("SIGN_PPA", fraction=self.hedge))

        # Re-yaw turbines as the prevailing wind veers.
        if st.tick - self._last_reyaw >= self.reyaw_every:
            self._last_reyaw = st.tick
            for m in st.active_machines():
                if m.kind != "wind":
                    continue
                target = float(st.fields.wind_dir[m.y, m.x])
                if abs((target - m.orientation + 180) % 360 - 180) > 12.0:
                    actions.append(Action("SET_ORIENTATION", x=m.x, y=m.y,
                                          orientation=target))

        # Stop adding capacity once we would mostly be competing with ourselves.
        peak_demand = sum(z.base_demand_kw for z in st.demand_zones) * 1.4
        installed = obs["finance"]["installed_capacity_kw"]
        if installed >= peak_demand * self.capacity_target:
            return actions

        cash = obs["finance"]["cash"]
        floor = cfg.finance.starting_cash * self.reserve_fraction
        budget = max(0.0, cash - floor)
        if budget <= 0:
            return actions

        built = 0
        for _rank, kind, x, y, cost, kw in self._candidates(sim, obs):
            if built >= 3 or cost > budget:
                continue
            zone = min(st.demand_zones,
                       key=lambda z: abs(z.centre[0] - x) + abs(z.centre[1] - y))
            path = _l_path(sim, (x, y), zone.centre)
            if path is None:
                continue        # unreachable by wire: not worth building
            orientation = sim.best_orientation(kind, x, y)
            tilt = abs(cfg.world.latitude_deg) * 0.75
            actions.append(Action("PLACE", x=x, y=y, kind=kind,
                                  orientation=orientation, tilt=tilt,
                                  debt_fraction=0.45))
            actions.append(Action("PLACE_CABLE", path=path, debt_fraction=0.45))
            budget -= cost
            installed += nameplate_kw(kind, cfg)
            built += 1
            if installed >= peak_demand * self.capacity_target:
                break
        return actions
