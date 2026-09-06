/**
 * Solar Model Simulation Engine
 * Section 8 & 22 of energy-ecosystem-spec.md
 * Rules: RULE-SOLAR-001
 * Equations: E1, E2, E3
 * Top 20 Test Case 6: Solar at night is exactly 0
 */

import { CONFIGURABLE_PARAMS } from '../constants.ts';
import type { CellState } from '../types.ts';

export class SolarEngine {
  /**
   * Computes sun elevation, azimuth, base solar irradiance, terrain obstruction raycasting,
   * and effective irradiance for all cells.
   */
  public static updateSolarField(
    grid: CellState[][],
    width: number,
    height: number,
    hour: number,              // 0 to 23
    solarAmplitude: number     // 0.5 (winter) to 1.0 (summer)
  ): { sunElevation: number; sunAzimuth: number; baseSolarIrradiance: number } {
    const { I_max, shadowRangeMultiplier } = CONFIGURABLE_PARAMS;

    // 1. Calculate Sun Position (Section 8)
    // Noon is at hour 12 (peak elevation)
    // Sunrise ~6:00, Sunset ~18:00 (modulated by seasonal solarAmplitude)
    const hourAngle = ((hour - 12) / 12) * Math.PI; // -pi at midnight, 0 at noon, +pi at midnight
    const maxElevationDegrees = 75.0 * solarAmplitude;

    // Sinusoidal elevation approximation: 0 at sunrise/sunset, negative at night
    const sinElev = Math.cos(hourAngle) * Math.sin((maxElevationDegrees * Math.PI) / 180);
    const sunElevation = (Math.asin(sinElev) * 180) / Math.PI;

    // Azimuth: rotates from East (90°) at sunrise, South (180°) at noon, West (270°) at sunset
    let sunAzimuth = 180.0;
    if (hour < 12) {
      sunAzimuth = 90.0 + (hour / 12.0) * 90.0;
    } else {
      sunAzimuth = 180.0 + ((hour - 12.0) / 12.0) * 90.0;
    }

    // Equation E1: Base Solar Irradiance
    const baseSolarIrradiance = sunElevation > 0 ? I_max * Math.sin((sunElevation * Math.PI) / 180) : 0;

    // 2. Terrain Obstruction Raycasting (Section 8)
    // Direction vector pointing TOWARD the sun
    const sunRad = (sunAzimuth * Math.PI) / 180;
    const sunDx = -Math.sin(sunRad);
    const sunDy = -Math.cos(sunRad);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const cell = grid[y][x];

        // Night check (RULE-SOLAR-001, Test Case 6)
        if (sunElevation <= 0) {
          cell.dynamic.effectiveIrradiance = 0;
          cell.dynamic.terrainObstruction = 0;
          continue;
        }

        const elev = cell.baseTerrain.elevation;
        let obstructionFactor = 1.0;

        // Cast ray toward sun up to shadow range
        const maxCheckDist = Math.min(width, Math.max(2, Math.ceil(5 * shadowRangeMultiplier)));
        for (let d = 1; d <= maxCheckDist; d++) {
          const checkX = Math.round(x + sunDx * d);
          const checkY = Math.round(y + sunDy * d);

          if (checkX >= 0 && checkX < width && checkY >= 0 && checkY < height) {
            const blocker = grid[checkY][checkX];
            const blockerElev = blocker.baseTerrain.elevation;

            if (blockerElev > elev) {
              const heightDiff = blockerElev - elev;
              // Sun angle tangent determines if shadow reaches cell
              const shadowLength = heightDiff / Math.tan(Math.max(0.1, (sunElevation * Math.PI) / 180));
              if (d <= shadowLength) {
                // Cell is in terrain shadow
                obstructionFactor = Math.min(obstructionFactor, 0.15); // diffuse sky only
                break;
              }
            }
          }
        }

        cell.dynamic.terrainObstruction = Number(obstructionFactor.toFixed(2));

        // Equation E2: Effective Irradiance = Base * Obstruction * CloudAttenuation * cos(incidence)
        // Fixed flat panel cosine incidence = sin(sunElevation)
        const cosIncidence = Math.max(0, Math.sin((sunElevation * Math.PI) / 180));
        const cloudAtten = cell.dynamic.cloudAttenuation ?? 1.0;

        const effective = baseSolarIrradiance * obstructionFactor * cloudAtten * cosIncidence;
        cell.dynamic.effectiveIrradiance = Number(effective.toFixed(1));
      }
    }

    return {
      sunElevation: Number(sunElevation.toFixed(1)),
      sunAzimuth: Number(sunAzimuth.toFixed(1)),
      baseSolarIrradiance: Number(baseSolarIrradiance.toFixed(1)),
    };
  }
}
