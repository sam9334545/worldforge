/**
 * Level Engine
 * Prepares deterministic simulation state tailored to each specific Level Configuration
 */

import type { LevelConfig } from './LevelConfig.ts';
import { WorldGenerator } from '../sim/generator.ts';
import { SimulationEngine } from '../sim/engine.ts';
import type { WorldState } from '../sim/contracts/WorldState.ts';
import { MASTER_TERRAIN_TABLE, SEASON_PROFILES } from '../sim/constants.ts';
import type { TerrainId } from '../sim/types.ts';

export class LevelEngine {
  /**
   * Builds an initial WorldState configured strictly according to the level specification
   */
  public static buildWorldForLevel(config: LevelConfig): { worldState: WorldState; engine: SimulationEngine } {
    const { width, height } = config.dimensions;
    const seed = config.seed;

    // Generate base procedural world for this level seed and dimensions
    const baseWorld = WorldGenerator.generateWorld({
      width,
      height,
      seed,
      isWalkthroughPreset: false,
    });

    // 1. Terrain conformance: clamp grid cells to allowedTerrain
    const allowedSet = new Set<TerrainId>(config.allowedTerrain);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const cell = baseWorld.grid[y][x];
        if (!allowedSet.has(cell.baseTerrain.id)) {
          // Remap disallowed terrain to nearest valid terrain
          const fallbackId: TerrainId = allowedSet.has('T01') ? 'T01' : config.allowedTerrain[0];
          cell.baseTerrain = { ...MASTER_TERRAIN_TABLE[fallbackId] };
          cell.derived.effectiveStability = cell.baseTerrain.stability;
          cell.derived.effectivePermeability = cell.baseTerrain.permeability;

          // Clear water properties if turned to dry land
          if (fallbackId !== 'T06') {
            cell.dynamic.surfaceWater = 0;
            cell.dynamic.waterLevel = 0;
            cell.dynamic.flowRateQ = 0;
            cell.dynamic.velocity = 0;
            cell.dynamic.waterBodyType = undefined;
          }
        }

        // Remove any default machines so the player starts with a blank slate
        cell.machine = null;
        cell.cable = null;
        cell.overlays = [];
      }
    }

    // 2. Adjust season and environmental conditions
    if (config.defaultSeason) {
      baseWorld.time.season = config.defaultSeason;
      const profile = SEASON_PROFILES[config.defaultSeason];
      baseWorld.globalEnv.ambientTemperature = profile.baseTemperature;
      baseWorld.globalEnv.ambientHumidity = profile.baseHumidity;
      baseWorld.globalEnv.globalWindSpeed = profile.windSpeedMean;
      baseWorld.globalEnv.globalWindDirection = profile.windDirectionMean;
    }

    // 3. Configure Demand Zones
    if (config.id === 9) {
      // Level 9: Multiple demand zones to challenge transmission routing!
      baseWorld.demandZones = [
        {
          id: 'zone-industrial-south',
          cells: [{ x: width - 1, y: height - 1 }, { x: width - 2, y: height - 1 }],
          demandLevel: Math.round(config.demandKW * 0.6),
          deliveredEnergy: 0,
          pricePerUnit: 0.18,
          tier: 2,
        },
        {
          id: 'zone-metro-north',
          cells: [{ x: 1, y: 1 }, { x: 2, y: 1 }],
          demandLevel: Math.round(config.demandKW * 0.4),
          deliveredEnergy: 0,
          pricePerUnit: 0.22,
          tier: 3,
        }
      ];
    } else {
      // Standard demand zone at bottom-right corner
      baseWorld.demandZones = [
        {
          id: 'zone-central',
          cells: [{ x: width - 1, y: height - 1 }, { x: width - 2, y: height - 1 }],
          demandLevel: config.demandKW,
          deliveredEnergy: 0,
          pricePerUnit: 0.15,
          tier: 1,
        }
      ];
    }

    // 4. Set starting budget
    baseWorld.economy.cash = config.startingCash;
    baseWorld.economy.netWorth = config.startingCash;
    baseWorld.economy.cumulativeRevenue = 0;
    baseWorld.economy.cumulativeCost = 0;
    baseWorld.economy.cumulativeGenerated = 0;
    baseWorld.economy.cumulativeDelivered = 0;
    baseWorld.economy.cumulativeCurtailed = 0;
    baseWorld.economy.reliabilityRatio = 1.0;

    // 5. Initial Event
    baseWorld.events = [
      {
        id: `evt-lvl-${config.id}-start`,
        tick: 1,
        type: 'SEASONAL_CHANGE',
        severity: 'info',
        title: `${config.name} (${config.subtitle})`,
        description: config.briefing.story,
      }
    ];

    // Instantiate simulation engine with level grid connection rules
    const engine = new SimulationEngine(baseWorld);
    engine.setRequireGridConnection(config.requireGridConnection);

    return { worldState: baseWorld, engine };
  }
}
