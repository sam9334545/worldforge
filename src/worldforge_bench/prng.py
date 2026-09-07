"""Single seeded PRNG stream (Section 36).

Determinism contract: given WORLD_SEED + config + the ordered action log, the
engine reproduces a bit-identical state hash. Every stochastic draw in the
simulation must come from this object, and must be drawn in the fixed order of
Section 24. Never call numpy.random directly anywhere else.
"""

from __future__ import annotations

import numpy as np


class Prng:
    __slots__ = ("_rng", "seed", "_draws")

    def __init__(self, seed: int):
        self.seed = int(seed)
        self._rng = np.random.Generator(np.random.PCG64(self.seed))
        self._draws = 0

    @property
    def draws(self) -> int:
        """Number of draws taken. Part of the determinism audit."""
        return self._draws

    def uniform(self, lo: float = 0.0, hi: float = 1.0) -> float:
        self._draws += 1
        return float(self._rng.uniform(lo, hi))

    def normal(self, mu: float = 0.0, sd: float = 1.0) -> float:
        self._draws += 1
        return float(self._rng.normal(mu, sd))

    def bounded_normal(self, mu: float, sd: float, lo: float, hi: float) -> float:
        return float(min(hi, max(lo, self.normal(mu, sd))))

    def chance(self, p: float) -> bool:
        return self.uniform() < p

    def integers(self, lo: int, hi: int) -> int:
        self._draws += 1
        return int(self._rng.integers(lo, hi))

    def field(self, shape: tuple[int, ...], lo: float = 0.0, hi: float = 1.0) -> np.ndarray:
        self._draws += 1
        return self._rng.uniform(lo, hi, size=shape)

    def choice(self, items, weights=None):
        self._draws += 1
        w = None if weights is None else np.asarray(weights, dtype=float) / float(np.sum(weights))
        idx = int(self._rng.choice(len(items), p=w))
        return items[idx]

    def spawn(self, tag: str) -> "Prng":
        """Derive an independent stream for a sub-system, deterministically."""
        h = (self.seed * 1_000_003 + (abs(hash(tag)) % 1_000_003)) % (2**63 - 1)
        return Prng(h)
