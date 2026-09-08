"""Action schema (Section 26), extended with the financing decisions.

Actions are plain data. Build them directly, or parse them from the dicts an
LLM agent emits -- `Action.from_dict` accepts exactly what the JSON API sends.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

ACTION_TYPES = (
    "PLACE", "REMOVE", "REINFORCE", "PLACE_CABLE", "SET_ORIENTATION",
    "ADVANCE_TIME", "QUERY_PREDICTION", "SIGN_PPA", "NOOP",
)


@dataclass
class Action:
    type: str
    x: int | None = None
    y: int | None = None
    kind: str | None = None            # machine type for PLACE / QUERY_PREDICTION
    orientation: float | None = None
    tilt: float | None = None
    overlay: str | None = None         # gravel | stone
    path: list | None = None           # PLACE_CABLE: [[x,y], ...]
    ticks: int = 1                     # ADVANCE_TIME
    debt_fraction: float = 0.0         # PLACE: share of capex funded with debt
    fraction: float = 0.0              # SIGN_PPA: share of output to hedge
    predicted_kw: float | None = None  # QUERY_PREDICTION: the agent's own guess

    def __post_init__(self):
        if self.type not in ACTION_TYPES:
            raise ValueError(
                f"unknown action '{self.type}'; valid: {', '.join(ACTION_TYPES)}")

    @classmethod
    def from_dict(cls, d: dict) -> "Action":
        d = dict(d)
        t = d.pop("type", d.pop("action", None))
        if t is None:
            raise ValueError("action dict needs a 'type' field")
        allowed = {f for f in cls.__dataclass_fields__ if f != "type"}
        unknown = set(d) - allowed
        if unknown:
            raise ValueError(
                f"unknown field(s) for {t}: {', '.join(sorted(unknown))}; "
                f"valid: {', '.join(sorted(allowed))}")
        return cls(type=str(t).upper(), **d)

    def to_dict(self) -> dict:
        out = {"type": self.type}
        for f in self.__dataclass_fields__:
            if f == "type":
                continue
            v = getattr(self, f)
            if v not in (None, 0, 0.0, 1) or (f == "ticks" and v != 1):
                out[f] = v
        return out


@dataclass
class ActionResult:
    ok: bool
    action: str
    message: str = ""
    cost: float = 0.0
    data: dict = field(default_factory=dict)

    def __bool__(self) -> bool:
        return self.ok


# Convenience constructors -------------------------------------------------

def place(kind: str, x: int, y: int, orientation: float | None = None,
          tilt: float | None = None, debt_fraction: float = 0.0) -> Action:
    return Action("PLACE", x=x, y=y, kind=kind, orientation=orientation,
                  tilt=tilt, debt_fraction=debt_fraction)


def cable(path: list, debt_fraction: float = 0.0) -> Action:
    return Action("PLACE_CABLE", path=[list(p) for p in path],
                  debt_fraction=debt_fraction)


def orient(x: int, y: int, orientation: float, tilt: float | None = None) -> Action:
    return Action("SET_ORIENTATION", x=x, y=y, orientation=orientation, tilt=tilt)


def reinforce(x: int, y: int, overlay: str = "gravel") -> Action:
    return Action("REINFORCE", x=x, y=y, overlay=overlay)


def advance(ticks: int = 1) -> Action:
    return Action("ADVANCE_TIME", ticks=ticks)


def predict(kind: str, x: int, y: int, predicted_kw: float | None = None) -> Action:
    return Action("QUERY_PREDICTION", x=x, y=y, kind=kind, predicted_kw=predicted_kw)


def noop() -> Action:
    return Action("NOOP")
