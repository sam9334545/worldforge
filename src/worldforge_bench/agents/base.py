"""Agent interface.

An agent is anything with `act(sim, obs) -> list[Action]`. The harness calls it
every `decision_interval` ticks, applies whatever it returns, then advances the
clock. Agents never advance time themselves -- that keeps every agent on the
same footing and the comparison fair.
"""

from __future__ import annotations

AGENTS: dict = {}


def register(cls):
    AGENTS[cls.name] = cls
    return cls


def get_agent(name: str, **kw):
    if name not in AGENTS:
        raise KeyError(f"unknown agent '{name}'; available: {', '.join(sorted(AGENTS))}")
    return AGENTS[name](**kw)


class Agent:
    name = "base"

    def __init__(self, **kw):
        self.opts = kw

    def act(self, sim, obs) -> list:
        """Return a list of Actions (or action dicts) to apply this decision."""
        return []

    def reset(self):
        pass
