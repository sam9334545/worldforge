"""Seasons, temperature, cloud cover and the global wind vector (Section 20).

v1 scope note: clouds are a per-cell AR(1) cover field rather than the tracked
cloud *entities* of Section 7, and snow/orographic rain-shadow are deferred.
Everything else in the chain is unchanged, so upgrading to cloud entities later
only replaces this module.

Weather is autocorrelated, not white noise: cover and wind follow AR(1)
processes, so the agent can actually learn to forecast rather than only react.
"""

from __future__ import annotations

import math

import numpy as np

SEASON_NAMES = ("Spring", "Summer", "Autumn", "Winter")


def season_of_day(day_of_year: int, cfg) -> int:
    return int((day_of_year // cfg.time.days_per_season) % 4)


def update_weather(state, cfg, prng) -> None:
    """Advances the global weather scalars and the per-cell fields."""
    s = state.season
    wc = cfg.weather

    # --- global wind: AR(1) on speed, random walk on bearing -------------
    target = wc.base_wind_ms[s]
    shock = prng.normal(0.0, wc.wind_volatility * target)
    state.global_wind_speed = float(np.clip(
        wc.wind_persistence * state.global_wind_speed
        + (1.0 - wc.wind_persistence) * target + shock,
        0.0, 32.0,
    ))
    # Ornstein-Uhlenbeck on the bearing: pulled toward the season's prevailing
    # direction, with noise. Shortest-arc difference so it never winds up.
    prevailing = wc.prevailing_wind_dir[s]
    delta = ((prevailing - state.global_wind_dir + 180.0) % 360.0) - 180.0
    state.global_wind_dir = float(
        (state.global_wind_dir
         + wc.wind_dir_reversion * delta
         + prng.normal(0.0, wc.wind_dir_noise_deg)) % 360.0
    )

    # --- temperature: seasonal baseline + diurnal swing + altitude lapse --
    diurnal = 6.0 * math.sin(2.0 * math.pi * (state.hour - 9.0) / 24.0)
    base_t = wc.base_temp_c[s] + diurnal + prng.normal(0.0, 1.2)
    state.fields.temperature = base_t - state.elevation * wc.lapse_rate_c_per_level

    # --- cloud cover: AR(1) about the seasonal mean ----------------------
    mean_cloud = wc.base_cloud[s]
    innovation = prng.normal(0.0, wc.cloud_volatility)
    prev = float(np.mean(state.fields.cloud)) if state.fields.cloud.any() else mean_cloud
    level = np.clip(wc.cloud_persistence * prev
                    + (1.0 - wc.cloud_persistence) * mean_cloud + innovation, 0.0, 1.0)
    # Spatial texture, fixed per tick, so cover is patchy rather than uniform.
    texture = prng.field((state.height, state.width), -0.18, 0.18)
    state.fields.cloud = np.clip(level + texture, 0.0, 1.0)

    state.fields.humidity = np.clip(
        wc.base_humidity[s] + 0.30 * (state.fields.cloud - mean_cloud), 0.05, 1.0
    )

    # --- precipitation: thick cloud rains, scaled by season ---------------
    rain_ready = np.clip(state.fields.cloud - 0.55, 0.0, None)
    state.fields.precipitation = (rain_ready * wc.rain_multiplier[s] * 0.02)
