/**
 * Level Engine
 * Prepares deterministic simulation state tailored to each specific Level Configuration,
 * optionally restoring previous player-built grid infrastructure.
 */

import type { LevelConfig } from './LevelConfig.ts';
import type { LevelGridSnapshot } from './LevelProgress.ts';
import { WorldGenerator } from '../sim/generator.ts';
import { SimulationEngine } from '../sim/engine.ts';
import type { WorldState } from '../sim/contracts/WorldState.ts';
import { MASTER_TERRAIN_TABLE, SEASON_PROFILES } from '../sim/constants.ts';
import type { TerrainId } from '../sim/types.ts';

export class LevelEngine {
  /**
   * Builds an initial WorldState configured strictly according to the level specification,
   * optionally restoring a previously saved player grid snapshot.
   */
  public static buildWorldForLevel(
    config: LevelConfig,
    restoreSnapshot?: LevelGridSnapshot | null
  ): { worldState: WorldState; engine: SimulationEngine } {
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
        cell.has_cable = false;
        cell.hasCable = false;
        cell.overlays = [];
      }
    }

    // 1b. Restore saved player structure if requested
    if (restoreSnapshot && restoreSnapshot.structures && restoreSnapshot.structures.length > 0) {
      for (const s of restoreSnapshot.structures) {
        if (s.y >= 0 && s.y < height && s.x >= 0 && s.x < width) {
          const cell = baseWorld.grid[s.y][s.x];
          if (s.machine) {
            cell.machine = {
              id: `mach-restored-${s.x}-${s.y}`,
              type: s.machine.type as any,
              x: s.x,
              y: s.y,
              orientation: s.machine.orientation ?? 180,
              capacity: 500,
              efficiency: s.machine.efficiency ?? 0.85,
              health: 1.0,
              ageTicks: 0,
              lifespanTicks: 10000,
              maintenanceCostPerTick: 5,
              buildCost: 5000,
              isOperating: s.machine.isOperating ?? true,
            };
          }
          if (s.cable) {
            cell.cable = {
              id: `cable-restored-${s.x}-${s.y}`,
              x: s.x,
              y: s.y,
              connectedTo: [],
              capacity: s.cable.capacity ?? 1000,
              currentThroughput: s.cable.currentThroughput ?? 0,
              lossPerCell: 0.012,
            };
          }
          cell.has_cable = Boolean(s.has_cable || s.hasCable);
          cell.hasCable = Boolean(s.has_cable || s.hasCable);
          cell.overlays = s.overlays ? [...s.overlays as any] : [];
        }
      }
      if (restoreSnapshot.cash !== undefined && restoreSnapshot.cash > 0) {
        baseWorld.economy.cash = restoreSnapshot.cash;
        baseWorld.economy.netWorth = restoreSnapshot.cash;
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
    baseWorld.economy.tickProfitHistory = [];
    baseWorld.economy.rollingDailyProfit = 0;

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
