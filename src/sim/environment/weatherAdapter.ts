/**
 * Authoritative Simulation-to-Visual Weather Adapter
 * Converts WorldState simulation dynamics (clouds, temperature, precipitation, wind)
 * into a clean, deterministic visual weather snapshot for the canvas renderer.
 * 
 * Strict Rule: Visual precipitation is 100% driven by active physical simulation precipitation.
 * Calendar seasons, visual theme names, and ambient humidity never force precipitation particles
 * when actual simulation precipitation intensity is zero.
 */

import type { WorldState } from '../contracts/WorldState.ts';

export type PrecipitationType = 'none' | 'rain' | 'snow';

export interface VisualWeatherSnapshot {
  precipitationType: PrecipitationType;
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
  const { globalEnv, clouds } = worldState;
  const temp = globalEnv.ambientTemperature ?? 20;

  // 1. Evaluate precipitation potential across active simulation clouds
  let maxCloudPrecipitation = 0;
  let totalCloudDensity = 0;

  if (clouds && clouds.length > 0) {
    for (const cloud of clouds) {
      const precip = (cloud.precipitationPotential || 0) * (cloud.cloudDensity || 0);
      maxCloudPrecipitation = Math.max(maxCloudPrecipitation, precip);
      totalCloudDensity += (cloud.cloudDensity || 0);
    }
    totalCloudDensity = totalCloudDensity / clouds.length;
  }

  // Check any explicit weather signal on worldState
  const explicitPrecip = (worldState as any).weather?.precipitationIntensity ?? 0;
  const precipitationIntensity = Math.max(explicitPrecip, maxCloudPrecipitation);

  // 2. Strict Simulation-Driven Weather Mapping (No calendar/theme overrides)
  const hasActivePrecipitation = precipitationIntensity > 0;
  const isBelowFreezing = temp <= 0.0;

  const precipitationType: PrecipitationType = !hasActivePrecipitation
    ? 'none'
    : (isBelowFreezing ? 'snow' : 'rain');

  const isRaining = precipitationType === 'rain';
  const rainIntensity = isRaining ? Math.min(1.0, Math.max(0.15, precipitationIntensity)) : 0;

  const isSnowing = precipitationType === 'snow';
  const snowIntensity = isSnowing ? Math.min(1.0, Math.max(0.15, precipitationIntensity)) : 0;

  const isStormy = hasActivePrecipitation && precipitationIntensity > 0.45 && globalEnv.globalWindSpeed > 14.0;

  // 3. Convert wind bearing to radians
  const windDirDeg = globalEnv.globalWindDirection || 0;
  const windDirectionRad = (windDirDeg * Math.PI) / 180;

  return {
    precipitationType,
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
