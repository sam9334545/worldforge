/**
 * Authoritative Simulation-to-Visual Weather Adapter
 * Converts WorldState simulation dynamics (clouds, temperature, precipitation, wind)
 * into a clean, deterministic visual weather snapshot for the canvas renderer.
 */

import type { WorldState } from '../contracts/WorldState.ts';

export interface VisualWeatherSnapshot {
  isRaining: boolean;
  rainIntensity: number;     // 0.0 (none) to 1.0 (heavy downpour)
  isSnowing: boolean;
  snowIntensity: number;     // 0.0 (none) to 1.0 (blizzard)
  isStormy: boolean;
  windSpeed: number;         // m/s
  windDirectionRad: number;  // radians for particle drift calculations
  ambientTemperature: number;// °C
  sunElevation: number;      // degrees (-90 to +90)
  sunAzimuth: number;        // degrees (0 to 359)
  cloudCoverage: number;     // 0.0 to 1.0
}

/**
 * Derives visual weather purely from authoritative WorldState simulation contracts
 */
export function getVisualWeatherSnapshot(worldState: WorldState): VisualWeatherSnapshot {
  const { globalEnv, clouds, time } = worldState;
  const temp = globalEnv.ambientTemperature;

  // 1. Evaluate precipitation potential across active simulation clouds
  let maxPrecipitation = 0;
  let totalCloudDensity = 0;

  if (clouds && clouds.length > 0) {
    for (const cloud of clouds) {
      maxPrecipitation = Math.max(maxPrecipitation, cloud.precipitationPotential || 0);
      totalCloudDensity += cloud.cloudDensity || 0;
    }
    totalCloudDensity = totalCloudDensity / clouds.length;
  }

  // 2. Determine precipitation type and intensity based on physics
  const hasPrecipitation = maxPrecipitation > 0.15 || globalEnv.ambientHumidity > 0.70;
  const isBelowFreezing = temp <= 1.5;

  const isRaining = hasPrecipitation && !isBelowFreezing;
  const rainIntensity = isRaining ? Math.min(1.0, Math.max(0.25, maxPrecipitation + (globalEnv.ambientHumidity - 0.5) * 0.5)) : 0;

  const isSnowing = (hasPrecipitation || time.season === 'Winter') && isBelowFreezing;
  const snowIntensity = isSnowing ? Math.min(1.0, Math.max(0.3, (2.0 - temp) * 0.15 + maxPrecipitation)) : 0;

  const isStormy = maxPrecipitation > 0.45 && globalEnv.globalWindSpeed > 14.0;

  // 3. Convert wind bearing to radians
  const windDirDeg = globalEnv.globalWindDirection || 0;
  const windDirectionRad = (windDirDeg * Math.PI) / 180;

  return {
    isRaining,
    rainIntensity,
    isSnowing,
    snowIntensity,
    isStormy,
    windSpeed: globalEnv.globalWindSpeed,
    windDirectionRad,
    ambientTemperature: temp,
    sunElevation: globalEnv.sunElevation,
    sunAzimuth: globalEnv.sunAzimuth,
    cloudCoverage: Math.min(1.0, totalCloudDensity),
  };
}
