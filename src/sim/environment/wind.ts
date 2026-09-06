/**
 * Wind and Orographic Lift Simulation Engine
 * Sections 9, 10, 22 of energy-ecosystem-spec.md
 * Rules: RULE-WIND-001..003, RULE-OROG-001..002, Equation E6
 */

import { CONFIGURABLE_PARAMS } from '../constants.ts';
import type { CellState } from '../types.ts';

export interface WindUpdateResult {
  windSpeed: number;
  windDirection: number;
  windShadowFactor: number;
  orographicLift: number;
}

export class WindEngine {
  /**
   * Computes local wind speed, direction, wind shadow, and orographic lift for all cells
   */
  public static updateWindField(
    grid: CellState[][],
    width: number,
    height: number,
    globalWindSpeed: number,
    globalWindDirection: number // compass bearing 0-359
  ): void {
    // 1. Calculate map-average elevation for exposure bonus (Sec 9.2)
    let totalElevation = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        totalElevation += grid[y][x].baseTerrain.elevation;
      }
    }
    const avgElevation = totalElevation / (width * height);

    // Meteorological wind bearing: direction FROM which wind blows.
    // 0° = from North (dy = -1), 90° = from East (dx = 1), 180° = from South (dy = 1), 270° = from West (dx = -1).
    const rad = (globalWindDirection * Math.PI) / 180;
    const upwindDx = Math.sin(rad);
    const upwindDy = -Math.cos(rad);

    const { z0_ref, roughnessAlpha, R_orographic, windElevationBonusPerMeter } = CONFIGURABLE_PARAMS;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const cell = grid[y][x];
        const elev = cell.baseTerrain.elevation;
        const z0 = Math.max(0.0001, cell.baseTerrain.roughnessZ0);

        // A. Roughness damping factor (Sec 9.1, RULE-WIND-002)
        // smaller z0 (Sand 0.01) -> factor > 1.0 (accelerates); larger z0 (Stone 0.2) -> factor < 1.0
        const roughnessFactor = Math.pow(z0_ref / z0, roughnessAlpha);

        // B. Elevation exposure factor (Sec 9.2, RULE-WIND-001)
        const elevDiff = elev - avgElevation;
        const elevationFactor = Math.max(0.6, 1.0 + elevDiff * windElevationBonusPerMeter);

        // C. Orographic Wind Shadow (Sec 9.3, RULE-WIND-003)
        // Check upwind cells within R_orographic distance
        let maxShadowReduction = 0;
        let orographicLift = 0;

        for (let d = 1; d <= R_orographic; d++) {
          const checkX = Math.round(x + upwindDx * d);
          const checkY = Math.round(y + upwindDy * d);

          if (checkX >= 0 && checkX < width && checkY >= 0 && checkY < height) {
            const upwindCell = grid[checkY][checkX];
            const upwindElev = upwindCell.baseTerrain.elevation;

            if (upwindElev > elev) {
              // Upwind higher neighbor casts a leeward wind shadow
              const elevDelta = upwindElev - elev;
              const shadowContrib = (elevDelta / 5.0) * ((R_orographic - d + 1) / R_orographic);
              maxShadowReduction = Math.max(maxShadowReduction, shadowContrib);
            }

            // Orographic forced ascent on windward slope (Section 10)
            if (d === 1 && elev > upwindElev) {
              orographicLift = Math.max(0, (elev - upwindElev) * (globalWindSpeed / 10.0));
            }
          }
        }

        // Wind shadow factor ranges from ~0.35 (deep leeward shadow) to 1.0 (no shadow)
        const windShadowFactor = Math.max(0.35, 1.0 - maxShadowReduction * 0.65);

        // Equation E6: v_local = v_global * roughnessFactor * elevationFactor * windShadowFactor
        const v_local = Math.max(0, globalWindSpeed * roughnessFactor * elevationFactor * windShadowFactor);

        cell.dynamic.windSpeed = Number(v_local.toFixed(2));
        cell.dynamic.windDirection = globalWindDirection;
        cell.dynamic.windShadowFactor = Number(windShadowFactor.toFixed(2));
        cell.dynamic.orographicLift = Number(orographicLift.toFixed(2));
      }
    }
  }
}
