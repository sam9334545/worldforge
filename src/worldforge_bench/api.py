"""HTTP API. One physics implementation, many front-ends.

The reference TypeScript build shipped its own simulation, which drifted from
the specification in ways that were invisible from the UI -- turbine
orientation never entered the power calculation, transmission loss used
straight-line distance rather than the cable path, and hydraulic head was
derived from a cell's x-coordinate. Rather than maintain a second engine and
keep it in sync, this server exposes the Python engine and lets the front-end be
a pure viewer.

`GET /sessions/{id}/world` deliberately emits the exact `CellState[][]` shape the
existing React renderer already consumes, so the viewport, inspectors and HUD
work against real physics without being rewritten.

    pip install -e '.[api]'
    wfbench api --port 8000
"""

# NOTE: deliberately no `from __future__ import annotations`. FastAPI resolves
# request-model annotations with get_type_hints(), which cannot see Pydantic
# models defined inside create_app() once annotations are strings -- the body
# model silently degrades to a query parameter and every POST returns 422.
# Requires Python >= 3.10 for the `X | None` syntax used below, which pyproject
# already mandates.

import math
import uuid
from typing import Any

from .actions import Action
from .config import DEFAULT_CONFIG, Config
from .engine import Engine
from .observation import ascii_map
from .placement import can_place, can_reinforce
from .scoring import score_run
from .physics.weather import SEASON_NAMES
from . import terrain as T

# Python kind <-> TypeScript MachineType
KIND_TO_TS = {
    "land_solar": "LandSolar",
    "floating_solar": "FloatSolar",
    "wind": "WindTurbine",
    "hydro": "HydroTurbine",
    "cable": "Cable",
}
TS_TO_KIND = {v: k for k, v in KIND_TO_TS.items()}
OVERLAY_TO_TS = {"gravel": "Gravel", "stone": "Stone"}


class SessionStore:
    """In-memory sessions. Deliberately not persistent: a session is a run, and
    a run is reproducible from its seed and action log."""

    def __init__(self):
        self._sessions: dict[str, Engine] = {}

    def create(self, seed: int, cfg: Config) -> tuple[str, Engine]:
        sid = uuid.uuid4().hex[:12]
        eng = Engine(seed, cfg)
        # Prime derived fields so the first render shows a live world rather
        # than zeros, without advancing the clock.
        from .physics import sun as _sun, wind as _wind
        st = eng.state
        st.sun_elevation, st.sun_azimuth = _sun.solar_position(st.day, st.hour, cfg)
        _sun.update_irradiance(st, cfg)
        _wind.update_wind(st, cfg)
        self._sessions[sid] = eng
        return sid, eng

    def get(self, sid: str) -> Engine | None:
        return self._sessions.get(sid)

    def drop(self, sid: str) -> bool:
        return self._sessions.pop(sid, None) is not None

    def ids(self) -> list[str]:
        return list(self._sessions)


def terrain_block(tt: T.TerrainType) -> dict[str, Any]:
    return {
        "id": tt.code,
        "name": tt.name,
        "elevation": tt.elevation,
        "roughnessZ0": tt.roughness_z0,
        "moistureCapacity": tt.moisture_capacity,
        "permeability": tt.permeability,
        "stability": tt.stability,
        "waterRetention": tt.water_retention,
        "allowedOverlays": [OVERLAY_TO_TS[o] for o in ("gravel", "stone")
                            if tt.code in T.OVERLAY_ON[o]],
        "forbiddenOverlays": [],
        "allowedMachines": sorted(KIND_TO_TS[k] for k in tt.allowed_machines),
        "transformable": tt.transformable,
        "reinforceable": tt.reinforceable,
    }


def cell_payload(eng: Engine, x: int, y: int,
                 include_terrain: bool = True) -> dict[str, Any]:
    """Emits the renderer's `CellState` shape exactly."""
    st, cfg, f = eng.state, eng.cfg, eng.state.fields
    tt = st.terrain_at(x, y)
    mach = st.machines.get((x, y))
    cab = st.cables.get((x, y))
    r = lambda v, n=3: round(float(v), n)

    machine = None
    if mach is not None and not mach.retired:
        spec = cfg.machines.get(mach.kind)
        per_year = cfg.time.ticks_per_day * cfg.time.days_per_year
        machine = {
            "id": f"m-{x}-{y}",
            "type": KIND_TO_TS[mach.kind],
            "x": x, "y": y,
            "orientation": r(mach.orientation, 1),
            "tilt": r(mach.tilt, 1),
            "capacity": spec.rated_power_kw or 0.0,
            "efficiency": spec.efficiency or spec.panel_efficiency,
            "health": r(mach.health, 4),
            "ageTicks": int(mach.age_years * per_year),
            "lifespanTicks": int(spec.lifespan_years * per_year),
            "maintenanceCostPerTick": r(spec.opex_per_year / per_year, 4),
            "buildCost": r(mach.capex_paid, 2),
            "isOperating": not mach.retired and mach.health > 0,
        }

    cable = None
    if cab is not None:
        cable = {
            "id": f"c-{x}-{y}",
            "x": x, "y": y,
            "connectedTo": [{"x": nx, "y": ny} for nx, ny in st.neighbours4(x, y)
                            if (nx, ny) in st.cables],
            "capacity": cab.capacity_kw,
            "currentThroughput": r(cab.flow_kw, 2),
            "lossPerCell": cfg.machines.cable.loss_per_cell,
        }

    out = {
        "x": x, "y": y,
        "overlays": [OVERLAY_TO_TS.get(o, o) for o in st.overlays_at(x, y)],
        "dynamic": {
            "windSpeed": r(f.wind_speed[y, x]),
            "windDirection": r(f.wind_dir[y, x], 1),
            "windShadowFactor": 1.0,
            "effectiveIrradiance": r(f.irradiance[y, x], 1),
            "terrainObstruction": r(f.obstruction[y, x]),
            "cloudAttenuation": r(1.0 - f.cloud[y, x] * cfg.solar.k_atten),
            "temperature": r(f.temperature[y, x], 2),
            "humidity": r(f.humidity[y, x]),
            "surfaceWater": r(f.soil_moisture[y, x]),
            "evaporation": 0.0,
            "infiltration": 0.0,
            "runoff": r(f.runoff[y, x], 4),
            "snowDepth": 0.0,
            "snowmelt": 0.0,
            "waterLevel": r(f.water_level[y, x]),
            "flowRateQ": r(f.flow_q[y, x]),
            "flowDirection": None,
            "velocity": r(f.velocity[y, x]),
            "channelWidth": r(st.channel_width[y, x], 1),
            "channelDepth": r(st.channel_depth[y, x], 1),
            "head": r(f.head[y, x]),
        },
        "machine": machine,
        "cable": cable,
        "derived": {
            "effectiveStability": r(st.effective_stability(x, y, cfg)),
            "effectivePermeability": r(st.effective_permeability(x, y)),
            "powerGenerated": r(mach.output_kw, 2) if mach else 0.0,
            "powerDelivered": r(mach.delivered_kw, 2) if mach else 0.0,
            "transmissionLoss": r(mach.loss_kw, 2) if mach else 0.0,
            "curtailedPower": r(mach.curtailed_kw, 2) if mach else 0.0,
        },
    }
    if include_terrain:
        out["baseTerrain"] = terrain_block(tt)
    return out


def _event_type(msg: str) -> str:
    m = msg.lower()
    if "covenant" in m:
        return "MACHINE_DEGRADATION"
    if "scarcity" in m or "negative price" in m:
        return "DEMAND_SPIKE"
    if "end of life" in m:
        return "MACHINE_DEGRADATION"
    if "insolvent" in m:
        return "TURBINE_SHUTDOWN"
    return "SEASONAL_CHANGE"


def _event_severity(msg: str) -> str:
    m = msg.lower()
    if "insolvent" in m or "breached" in m:
        return "critical"
    if "scarcity" in m or "negative" in m or "end of life" in m:
        return "warning"
    return "info"


def world_payload(eng: Engine, include_terrain: bool = True) -> dict[str, Any]:
    st, cfg = eng.state, eng.cfg
    b = eng.finance.books
    pv = eng.valuation()
    mkt = eng.market
    price = mkt.price_history[-1] if mkt.price_history else 0.0
    last = eng.history[-1] if eng.history else None

    return {
        "seed": st.seed,
        "width": st.width,
        "height": st.height,
        "grid": [[cell_payload(eng, x, y, include_terrain)
                  for x in range(st.width)] for y in range(st.height)],
        # `time`, `globalEnv` and `economy` are emitted in the shapes the React
        # front-end already declares, so its adapter is close to an identity map.
        "time": {
            "tick": st.tick, "hour": st.hour, "day": st.day + 1,
            "year": st.year + 1, "season": SEASON_NAMES[st.season],
            "dayOfSeason": (st.day % cfg.time.days_per_season) + 1,
        },
        "clock": {
            "tick": st.tick, "hour": st.hour, "day": st.day, "year": st.year,
            "season": SEASON_NAMES[st.season],
            "horizonYears": cfg.time.horizon_years,
        },
        "globalEnv": {
            "sunElevation": round(st.sun_elevation, 2),
            "sunAzimuth": round(st.sun_azimuth, 2),
            "baseSolarIrradiance": round(
                cfg.solar.i_max_w_m2 * max(0.0, math.sin(math.radians(st.sun_elevation))), 1),
            "globalWindSpeed": round(st.global_wind_speed, 3),
            "globalWindDirection": round(st.global_wind_dir, 1),
            "ambientTemperature": round(float(st.fields.temperature.mean()), 2),
            "ambientHumidity": round(float(st.fields.humidity.mean()), 3),
        },
        "clouds": [],
        "weather": {
            "globalWindSpeed": round(st.global_wind_speed, 3),
            "globalWindDirection": round(st.global_wind_dir, 1),
            "sunElevation": round(st.sun_elevation, 2),
            "sunAzimuth": round(st.sun_azimuth, 2),
        },
        "demandZones": [{
            "id": f"z{z.id}", "tier": z.tier, "centre": list(z.centre),
            "cells": [{"x": cx, "y": cy} for cx, cy in z.cells],
            "demandLevel": round(z.demand_kw, 1),
            "deliveredEnergy": round(z.served_kw, 1),
            "pricePerUnit": round(price, 2),
        } for z in st.demand_zones],
        "market": {
            "price": round(price, 2),
            "priceHistory24h": [round(p, 2) for p in mkt.price_history[-24:]],
            "carbonPrice": round(mkt.carbon_price(st), 2),
            "ppaStrike": round(mkt.ppa_strike(), 2),
            "capex": {KIND_TO_TS[k]: round(eng.commodities.capex(k, cfg), 0)
                      for k in KIND_TO_TS},
        },
        "economy": {
            "cash": round(b.cash, 2),
            "debt": round(b.debt, 2),
            "equityValue": round(pv.equity_value, 2),
            "enterpriseValue": round(pv.enterprise_value, 2),
            "bookEquity": round(b.book_equity, 2),
            "leverage": round(b.leverage, 4),
            "debtHeadroom": round(eng.finance.max_new_debt(), 2),
            "wacc": round(pv.wacc, 5),
            "lcoe": round(pv.lcoe, 2),
            "capacityFactor": round(pv.portfolio_capacity_factor, 4),
            "installedCapacityKw": round(pv.installed_capacity_kw, 1),
            "cumulativeRevenue": round(b.cum_revenue, 2),
            "cumulativeCost": round(b.cum_opex + b.cum_capex, 2),
            "cumulativeMwhDelivered": round(b.cum_mwh_delivered, 3),
            "covenantBreaches": b.covenant_breaches,
            "hedgedFraction": round(eng.finance.hedged_fraction(st.tick)[0], 3),
            # Front-end EconomyState field names. netWorth is equity VALUE, not
            # cumulative generation -- the reference build defined it as the
            # latter, which could only ever rise.
            "netWorth": round(pv.equity_value, 2),
            "cumulativeGenerated": round(b.cum_mwh_generated * 1000.0, 1),
            "cumulativeDelivered": round(b.cum_mwh_delivered * 1000.0, 1),
            "cumulativeCurtailed": round(b.cum_mwh_curtailed * 1000.0, 1),
            "reliabilityRatio": round(last.reliability if last else 1.0, 4),
        },
        "lastTick": None if last is None else {
            "generatedKw": round(last.generated_kw, 2),
            "deliveredKw": round(last.delivered_kw, 2),
            "curtailedKw": round(last.curtailed_kw, 2),
            "lossKw": round(last.loss_kw, 2),
            "unconnectedKw": round(last.unconnected_kw, 2),
            "reliability": round(last.reliability, 4),
            "revenue": round(last.revenue, 2),
            "events": last.events,
        },
        "events": [
            {"id": f"e-{st.tick}-{i}", "tick": st.tick,
             "type": _event_type(msg), "severity": _event_severity(msg),
             "title": msg.split(":")[0][:60], "description": msg}
            for i, msg in enumerate((last.events if last else []))
        ],
        "terminated": eng.terminated,
        "terminationReason": eng.termination_reason,
        "stateHash": eng.state_hash(),
    }


def create_app(default_seed: int = 42):
    from fastapi import FastAPI, HTTPException
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel, Field

    app = FastAPI(title="WorldForge Bench API", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],          # local dev front-ends
        allow_methods=["*"],
        allow_headers=["*"],
    )
    store = SessionStore()

    class NewSession(BaseModel):
        seed: int = default_seed
        width: int | None = None
        height: int | None = None
        horizon_years: float | None = None

    class ActionBody(BaseModel):
        action: dict = Field(..., description="Action object, e.g. "
                                              '{"type":"PLACE","kind":"wind","x":3,"y":4}')

    class AdvanceBody(BaseModel):
        ticks: int = 1

    def need(sid: str) -> Engine:
        eng = store.get(sid)
        if eng is None:
            raise HTTPException(404, f"no session '{sid}'")
        return eng

    @app.get("/health")
    def health():
        return {"ok": True, "sessions": len(store.ids())}

    @app.post("/sessions")
    def new_session(body: NewSession):
        cfg = DEFAULT_CONFIG
        over: dict = {}
        if body.width:
            over["world"] = {"width": body.width,
                             "height": body.height or body.width}
        if body.horizon_years:
            over["time"] = {"horizon_years": body.horizon_years}
        if over:
            cfg = cfg.with_overrides(**over)
        sid, eng = store.create(body.seed, cfg)
        return {"sessionId": sid, "seed": body.seed,
                "width": eng.state.width, "height": eng.state.height}

    @app.get("/sessions")
    def list_sessions():
        return {"sessions": store.ids()}

    @app.delete("/sessions/{sid}")
    def delete_session(sid: str):
        return {"deleted": store.drop(sid)}

    @app.get("/sessions/{sid}/terrain")
    def get_terrain(sid: str):
        """Static terrain, fetched once. Never changes after generation, so the
        polling endpoint omits it -- it is most of the payload."""
        eng = need(sid)
        st = eng.state
        return {
            "width": st.width, "height": st.height,
            "grid": [[terrain_block(st.terrain_at(x, y)) for x in range(st.width)]
                     for y in range(st.height)],
            "elevation": [[float(st.elevation[y, x]) for x in range(st.width)]
                          for y in range(st.height)],
        }

    @app.get("/sessions/{sid}/world")
    def get_world(sid: str, include_terrain: bool = True):
        return world_payload(need(sid), include_terrain)

    @app.get("/sessions/{sid}/map")
    def get_map(sid: str):
        eng = need(sid)
        return {"map": ascii_map(eng.state, eng.cfg)}

    @app.post("/sessions/{sid}/actions")
    def post_action(sid: str, body: ActionBody):
        eng = need(sid)
        try:
            action = Action.from_dict(body.action)
        except ValueError as e:
            raise HTTPException(400, str(e))
        r = eng.apply(action)
        return {"ok": r.ok, "action": r.action, "message": r.message,
                "cost": r.cost, "data": r.data}

    @app.post("/sessions/{sid}/advance")
    def post_advance(sid: str, body: AdvanceBody):
        eng = need(sid)
        results = eng.run(max(1, int(body.ticks)))
        return {
            "ticks": len(results),
            "tick": eng.state.tick,
            "terminated": eng.terminated,
            "terminationReason": eng.termination_reason,
            "events": [e for r in results for e in r.events][-20:],
        }

    @app.get("/sessions/{sid}/placeable")
    def get_placeable(sid: str):
        """Validity masks for every buildable kind, in one call.

        The front-end used to run its own copy of the placement rules to shade
        buildable cells, which meant the UI could offer a site the engine would
        refuse -- the hydro head rule is exactly such a case. Masks come from the
        same `can_place` the engine enforces, so the two cannot disagree.
        """
        eng = need(sid)
        st, cfg = eng.state, eng.cfg
        masks: dict[str, Any] = {}
        for kind, ts in KIND_TO_TS.items():
            masks[ts] = [[can_place(st, kind, x, y, cfg).valid
                          for x in range(st.width)] for y in range(st.height)]
        for overlay, ts in OVERLAY_TO_TS.items():
            masks[ts] = [[can_reinforce(st, x, y, overlay, cfg).valid
                          for x in range(st.width)] for y in range(st.height)]
        return {"width": st.width, "height": st.height, "masks": masks}

    @app.get("/sessions/{sid}/can_place")
    def get_can_place(sid: str, kind: str, x: int, y: int):
        eng = need(sid)
        k = TS_TO_KIND.get(kind, kind)
        r = can_place(eng.state, k, x, y, eng.cfg)
        return {"valid": r.valid, "reason": r.reason}

    @app.get("/sessions/{sid}/score")
    def get_score(sid: str):
        return score_run(need(sid)).to_dict()

    # Mount scientific benchmark evaluation endpoints
    try:
        from backend.routers.benchmark import router as benchmark_router
        app.include_router(benchmark_router, prefix="/api/benchmark")
        app.include_router(benchmark_router, prefix="/benchmark")
    except Exception:
        pass

    return app


def serve(host: str = "127.0.0.1", port: int = 8000, seed: int = 42):
    import uvicorn
    uvicorn.run(create_app(seed), host=host, port=port, log_level="info")
