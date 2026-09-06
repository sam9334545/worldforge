/**
 * Cloud and Atmospheric Simulation Engine
 * Sections 7, 10, 22 of energy-ecosystem-spec.md
 * Rules: RULE-CLOUD-001..002, Equation E2, E8, E9
 */

import { CONFIGURABLE_PARAMS } from '../constants.ts';
import type { CellState, CloudEntity } from '../types.ts';
import { DeterministicPRNG } from '../prng.ts';

export class CloudEngine {
  /**
   * Updates existing clouds, moves them per ambient wind, precipitates, and spawns new clouds
   */
  public static updateClouds(
    clouds: CloudEntity[],
    grid: CellState[][],
    width: number,
    height: number,
    globalWindSpeed: number,
    globalWindDirection: number,
    prng: DeterministicPRNG
  ): { updatedClouds: CloudEntity[]; precipitationMap: number[][] } {
    const { H_condensation_threshold, cloudDissipationRate, k_atten } = CONFIGURABLE_PARAMS;
    const precipitationMap: number[][] = Array.from({ length: height }, () => Array(width).fill(0));

    // 1. Reset all cell cloud attenuation to 1.0 (clear sky default)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        grid[y][x].dynamic.cloudAttenuation = 1.0;
      }
    }

    // Cloud drifts WITH wind (downwind): for wind from West (270°), drifts toward East (+x)
    const windRad = (globalWindDirection * Math.PI) / 180;
    const moveDx = -Math.sin(windRad) * (globalWindSpeed * 0.1);
    const moveDy = Math.cos(windRad) * (globalWindSpeed * 0.1);

    const survivingClouds: CloudEntity[] = [];

    for (const cloud of clouds) {
      cloud.x += moveDx;
      cloud.y += moveDy;
      cloud.cloudLifetime -= 1;
      cloud.cloudDensity = Math.max(0, cloud.cloudDensity - cloudDissipationRate);

      // Check if cloud is within or near map boundaries
      if (
        cloud.cloudLifetime > 0 &&
        cloud.cloudDensity > 0.05 &&
        cloud.x >= -cloud.coverageRadius &&
        cloud.x <= width + cloud.coverageRadius &&
        cloud.y >= -cloud.coverageRadius &&
        cloud.y <= height + cloud.coverageRadius
      ) {
        // Cloud precipitation onto underlying grid cells (E9)
        const radius = Math.ceil(cloud.coverageRadius);
        const centerX = Math.round(cloud.x);
        const centerY = Math.round(cloud.y);

        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const cx = centerX + dx;
            const cy = centerY + dy;

            if (cx >= 0 && cx < width && cy >= 0 && cy < height) {
              const dist = Math.hypot(dx, dy);
              if (dist <= cloud.coverageRadius) {
                const cell = grid[cy][cx];
                const falloff = 1.0 - dist / cloud.coverageRadius;

                // E2: Solar attenuation from overhead cloud
                const localAtten = Math.max(0.1, 1.0 - cloud.cloudDensity * k_atten * falloff);
                cell.dynamic.cloudAttenuation = Math.min(cell.dynamic.cloudAttenuation, localAtten);

                // E9: Precipitation = cloudWaterContent * precipPotential * falloff
                const rain = cloud.cloudWaterContent * cloud.precipitationPotential * falloff * 0.2;
                precipitationMap[cy][cx] += rain;
                cloud.cloudWaterContent = Math.max(0, cloud.cloudWaterContent - rain * 0.1);
              }
            }
          }
        }

        survivingClouds.push(cloud);
      }
    }

    // 3. Convective & Orographic Cloud Formation (RULE-CLOUD-001, E8)
    // Scan cells: evap + humidity >= threshold + cooling or orographic lift
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const cell = grid[y][x];
        const moistSum = cell.dynamic.evaporation + cell.dynamic.humidity;

        const isMountain = cell.baseTerrain.elevation >= 4;
        const triggerThreshold = isMountain ? H_condensation_threshold * 0.85 : H_condensation_threshold;

        if (moistSum >= triggerThreshold && survivingClouds.length < 8) {
          // Spawn new cloud entity if PRNG passes
          if (prng.next() < 0.15) {
            const density = Math.min(1.0, (moistSum - triggerThreshold) * 2.0 + 0.3);
            survivingClouds.push({
              id: `cloud-${Date.now()}-${prng.nextInt(1000, 9999)}`,
              x,
              y,
              cloudDensity: density,
              cloudWaterContent: density * 2.5,
              cloudTemperature: cell.dynamic.temperature - 4,
              cloudAltitude: 1200 + cell.baseTerrain.elevation * 200,
              movementDirection: globalWindDirection,
              movementSpeed: globalWindSpeed * 0.1,
              precipitationPotential: Math.min(0.8, density * 0.9),
              cloudLifetime: prng.nextInt(36, 72), // in ticks
              coverageRadius: prng.nextFloat(1.5, 3.0),
            });
          }
        }
      }
    }

    return { updatedClouds: survivingClouds, precipitationMap };
  }
}
