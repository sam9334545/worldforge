"""The floor. Holds cash for ten years and earns nothing.

Every other agent must beat this or it is destroying value.
"""

from .base import Agent, register


@register
class DoNothingAgent(Agent):
    name = "donothing"

    def act(self, sim, obs):
        return []
