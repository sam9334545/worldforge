"""Observation schema (Section 27). Plain JSON-serialisable dicts.

Ground truth stays available (Section 28) even where an agent's view is
restricted, so a failing run can be attributed to a specific missing capability
rather than to missing information.
"""

from __future__ import annotations

import numpy as np

from . import machines as mach
from . import terrain as T
from .physics.weather import SEASON_NAMES


def cell_view(state, cfg, x: int, y: int) -> dict:
    f = state.fields
    tt = state.terrain_at(x, y)
    m = state.machines.get((x, y))
    return {
        "x": x, "y": y,
        "terrain": tt.name, "terrain_code": tt.code,
        "elevation": float(state.elevation[y, x]),
        "roughness_z0": tt.roughness_z0,
        "base_stability": float(T.STABILITY[state.terrain[y, x]]),
        "effective_stability": round(state.effective_stability(x, y, cfg), 3),
        "permeability": round(state.effective_permeability(x, y), 3),
        "overlays": list(state.overlays_at(x, y)),
        "wind_speed_ms": round(float(f.wind_speed[y, x]), 3),
        "wind_dir_deg": round(float(f.wind_dir[y, x]), 1),
        "irradiance_w_m2": round(float(f.irradiance[y, x]), 1),
        "obstruction": round(float(f.obstruction[y, x]), 3),
        "cloud": round(float(f.cloud[y, x]), 3),
        "temperature_c": round(float(f.temperature[y, x]), 2),
        "flow_q_m3s": round(float(f.flow_q[y, x]), 3),
        "head_m": round(float(f.head[y, x]), 3),
        "velocity_ms": round(float(f.velocity[y, x]), 3),
        "has_cable": (x, y) in state.cables,
        "machine": None if m is None else {
            "kind": m.kind, "orientation": round(m.orientation, 1),
            "tilt": round(m.tilt, 1), "output_kw": round(m.output_kw, 2),
            "delivered_kw": round(m.delivered_kw, 2),
            "curtailed_kw": round(m.curtailed_kw, 2),
            "health": round(m.health, 4), "age_years": round(m.age_years, 3),
            "retired": m.retired,
        },
    }


def observe(engine, include_grid: bool = True, radius: int | None = None,
            centre: tuple | None = None) -> dict:
    """Full observation. `radius`/`centre` give a partially-observable window
    for the harder levels; omit them for full observability."""
    st = engine.state
    cfg = engine.cfg
    b = engine.finance.books
    pv = engine.valuation()
    mkt = engine.market

    obs = {
        "tick": st.tick,
        "clock": {
            "hour": st.hour, "day": st.day, "year": st.year,
            "season": SEASON_NAMES[st.season],
            "horizon_years": cfg.time.horizon_years,
            "progress": round(st.tick / (cfg.time.horizon_years
                                         * cfg.time.days_per_year
                                         * cfg.time.ticks_per_day), 4),
        },
        "weather": {
            "global_wind_speed_ms": round(st.global_wind_speed, 3),
            "global_wind_dir_deg": round(st.global_wind_dir, 1),
            "sun_elevation_deg": round(st.sun_elevation, 2),
            "sun_azimuth_deg": round(st.sun_azimuth, 2),
            "mean_cloud": round(float(np.mean(st.fields.cloud)), 3),
            "mean_temperature_c": round(float(np.mean(st.fields.temperature)), 2),
        },
        "market": {
            "price": round(mkt.price_history[-1], 2) if mkt.price_history else None,
            "price_mean_24h": (round(sum(mkt.price_history[-24:])
                                     / len(mkt.price_history[-24:]), 2)
                               if mkt.price_history else None),
            "price_history_24h": [round(p, 2) for p in mkt.price_history[-24:]],
            "carbon_price": round(mkt.carbon_price(st), 2),
            "merit_order": [{"unit": n, "marginal_cost": round(c, 2), "capacity_kw": cap}
                            for c, n, cap in mkt.merit_order(mkt.carbon_price(st))],
            "ppa_strike_on_offer": round(mkt.ppa_strike(), 2),
            "commodity_index": round(engine.commodities.index, 4),
            "capex_now": {k: round(engine.commodities.capex(k, cfg), 0)
                          for k in ("land_solar", "floating_solar", "wind", "hydro", "cable")},
        },
        "finance": {
            "cash": round(b.cash, 2),
            "debt": round(b.debt, 2),
            "book_equity": round(b.book_equity, 2),
            "equity_value": round(pv.equity_value, 2),
            "enterprise_value": round(pv.enterprise_value, 2),
            "leverage": round(b.leverage, 4),
            "wacc": round(pv.wacc, 5),
            "cost_of_debt": round(engine.finance.cost_of_debt(), 5),
            "debt_headroom": round(engine.finance.max_new_debt(), 2),
            "lcoe": round(pv.lcoe, 2),
            "capacity_factor": round(pv.portfolio_capacity_factor, 4),
            "installed_capacity_kw": round(pv.installed_capacity_kw, 1),
            "covenant_breaches": b.covenant_breaches,
            "max_drawdown": round(b.max_drawdown, 4),
            "hedged_fraction": round(engine.finance.hedged_fraction(st.tick)[0], 3),
            "cum_revenue": round(b.cum_revenue, 2),
            "cum_capex": round(b.cum_capex, 2),
            "cum_mwh_delivered": round(b.cum_mwh_delivered, 3),
        },
        "grid": {
            "zones": [{"id": z.id, "tier": z.tier, "centre": z.centre,
                       "cells": z.cells,
                       "demand_kw": round(z.demand_kw, 1),
                       "served_kw": round(z.served_kw, 1),
                       "unserved_kw": round(z.unserved_kw, 1)}
                      for z in st.demand_zones],
            "cable_cells": sorted(st.cables.keys()),
            "cable_utilisation": {str(k): round(c.utilisation, 3)
                                  for k, c in st.cables.items() if c.flow_kw > 0},
            "machines": [{"pos": m.pos, "kind": m.kind,
                          "orientation": round(m.orientation, 1),
                          "output_kw": round(m.output_kw, 2),
                          "delivered_kw": round(m.delivered_kw, 2),
                          "curtailed_kw": round(m.curtailed_kw, 2),
                          "health": round(m.health, 4)}
                         for m in st.active_machines()],
        },
        "terminated": engine.terminated,
        "termination_reason": engine.termination_reason,
    }

    if include_grid:
        cells = []
        if radius is not None and centre is not None:
            cx, cy = centre
            xs = range(max(0, cx - radius), min(st.width, cx + radius + 1))
            ys = range(max(0, cy - radius), min(st.height, cy + radius + 1))
        else:
            xs, ys = range(st.width), range(st.height)
        for y in ys:
            for x in xs:
                cells.append(cell_view(st, cfg, x, y))
        obs["cells"] = cells
        obs["grid_shape"] = {"width": st.width, "height": st.height}

    return obs


def ascii_map(state, cfg) -> str:
    """Compact terrain + build view. The fastest way to see what went wrong."""
    glyph = {0: ".", 1: ",", 2: "~", 3: "^", 4: "A", 5: "=", 6: ":"}
    mglyph = {"land_solar": "S", "floating_solar": "F", "wind": "W", "hydro": "H"}
    zone_cells = {c for z in state.demand_zones for c in z.cells}

    rows = ["    " + "".join(str(x % 10) for x in range(state.width))]
    for y in range(state.height):
        row = [f"{y:3d} "]
        for x in range(state.width):
            m = state.machines.get((x, y))
            if m and not m.retired:
                row.append(mglyph.get(m.kind, "?"))
            elif (x, y) in zone_cells:
                row.append("D")
            elif (x, y) in state.cables:
                row.append("+")
            else:
                row.append(glyph[int(state.terrain[y, x])])
        rows.append("".join(row))
    legend = ("  . grass  , sand  ~ mud  ^ stone  A snow  = water  : gravel\n"
              "  S solar  F float  W wind  H hydro  + cable  D demand zone")
    return "\n".join(rows) + "\n" + legend
