"""Sessions router exposing simulation engine session management and execution."""

from __future__ import annotations

from typing import Any, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from worldforge_bench.actions import Action
from worldforge_bench.api import (
    KIND_TO_TS,
    OVERLAY_TO_TS,
    TS_TO_KIND,
    SessionStore,
    cell_payload,
    terrain_block,
    world_payload,
)
from worldforge_bench.config import DEFAULT_CONFIG, Config
from worldforge_bench.engine import Engine
from worldforge_bench.observation import ascii_map
from worldforge_bench.placement import can_place, can_reinforce
from worldforge_bench.scoring import score_run

router = APIRouter(tags=["sessions"])
session_store = SessionStore()


class NewSession(BaseModel):
    seed: int = 42
    width: Optional[int] = None
    height: Optional[int] = None
    horizon_years: Optional[float] = None


class ActionBody(BaseModel):
    action: dict = Field(
        ...,
        description='Action object, e.g. {"type":"PLACE","kind":"wind","x":3,"y":4}',
    )


class AdvanceBody(BaseModel):
    ticks: int = 1


def need_session(sid: str) -> Engine:
    eng = session_store.get(sid)
    if eng is None:
        raise HTTPException(404, f"no session '{sid}'")
    return eng


@router.get("/health")
def health():
    return {"ok": True, "sessions": len(session_store.ids())}


@router.post("/sessions")
def create_session(body: NewSession):
    cfg = DEFAULT_CONFIG
    over: dict = {}
    if body.width:
        over["world"] = {
            "width": body.width,
            "height": body.height or body.width,
        }
    if body.horizon_years:
        over["time"] = {"horizon_years": body.horizon_years}
    if over:
        cfg = cfg.with_overrides(**over)
    sid, eng = session_store.create(body.seed, cfg)
    return {
        "sessionId": sid,
        "seed": body.seed,
        "width": eng.state.width,
        "height": eng.state.height,
    }


@router.get("/sessions")
def list_sessions():
    return {"sessions": session_store.ids()}


@router.delete("/sessions/{sid}")
def delete_session(sid: str):
    return {"deleted": session_store.drop(sid)}


@router.get("/sessions/{sid}/terrain")
def get_terrain(sid: str):
    eng = need_session(sid)
    st = eng.state
    return {
        "width": st.width,
        "height": st.height,
        "grid": [
            [terrain_block(st.terrain_at(x, y)) for x in range(st.width)]
            for y in range(st.height)
        ],
        "elevation": [
            [float(st.elevation[y, x]) for x in range(st.width)]
            for y in range(st.height)
        ],
    }


@router.get("/sessions/{sid}/world")
def get_world(sid: str, include_terrain: bool = True):
    return world_payload(need_session(sid), include_terrain)


@router.get("/sessions/{sid}/map")
def get_map(sid: str):
    eng = need_session(sid)
    return {"map": ascii_map(eng.state, eng.cfg)}


@router.post("/sessions/{sid}/actions")
def post_action(sid: str, body: ActionBody):
    eng = need_session(sid)
    try:
        action = Action.from_dict(body.action)
    except ValueError as e:
        raise HTTPException(400, str(e))
    r = eng.apply(action)
    return {
        "ok": r.ok,
        "action": r.action,
        "message": r.message,
        "cost": r.cost,
        "data": r.data,
    }


@router.post("/sessions/{sid}/advance")
def post_advance(sid: str, body: AdvanceBody):
    eng = need_session(sid)
    results = eng.run(max(1, int(body.ticks)))
    return {
        "ticks": len(results),
        "tick": eng.state.tick,
        "terminated": eng.terminated,
        "terminationReason": eng.termination_reason,
        "events": [e for r in results for e in r.events][-20:],
    }


@router.get("/sessions/{sid}/placeable")
def get_placeable(sid: str):
    eng = need_session(sid)
    st, cfg = eng.state, eng.cfg
    masks: dict[str, Any] = {}
    for kind, ts in KIND_TO_TS.items():
        masks[ts] = [
            [can_place(st, kind, x, y, cfg).valid for x in range(st.width)]
            for y in range(st.height)
        ]
    for overlay, ts in OVERLAY_TO_TS.items():
        masks[ts] = [
            [can_reinforce(st, x, y, overlay, cfg).valid for x in range(st.width)]
            for y in range(st.height)
        ]
    return {"width": st.width, "height": st.height, "masks": masks}


@router.get("/sessions/{sid}/can_place")
def get_can_place(sid: str, kind: str, x: int, y: int):
    eng = need_session(sid)
    k = TS_TO_KIND.get(kind, kind)
    r = can_place(eng.state, k, x, y, eng.cfg)
    return {"valid": r.valid, "reason": r.reason}


@router.get("/sessions/{sid}/score")
def get_score(sid: str):
    return score_run(need_session(sid)).to_dict()
