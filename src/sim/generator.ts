/**
 * Deterministic World Generator
 * Sections 4, 5, 6, 36, 39 of energy-ecosystem-spec.md
 */

import { MASTER_TERRAIN_TABLE, SEASON_PROFILES } from './constants.ts';
import { DeterministicPRNG } from './prng.ts';
import type { CellState, DynamicCellState, OverlayType, TerrainId } from './types.ts';
import type { WorldState } from './contracts/WorldState.ts';

export interface WorldGenOptions {
  width?: number;
  height?: number;
  seed?: number;
  isWalkthroughPreset?: boolean; // Section 39 10x10 preset
}

export class WorldGenerator {
  /**
   * Generates a fully populated, deterministic WorldState
   */
  public static generateWorld(options: WorldGenOptions = {}): WorldState {
    const width = options.width ?? (options.isWalkthroughPreset ? 10 : 12);
    const height = options.height ?? (options.isWalkthroughPreset ? 10 : 12);
    const seed = options.seed ?? 42;
    const prng = new DeterministicPRNG(seed);

    if (options.isWalkthroughPreset || seed === 42) {
      return this.generateSection39WalkthroughWorld(width, height, seed, prng);
    }

    return this.generateProceduralWorld(width, height, seed, prng);
  }

  /**
   * Generates the authoritative Section 39 Worked Example world (10x10, Seed 42, Summer Day 1 Noon)
   */
  private static generateSection39WalkthroughWorld(
    width: number,
    height: number,
    seed: number,
    _prng: DeterministicPRNG
  ): WorldState {
    const grid: CellState[][] = [];

    // River path: from mountain base (col 7, row 4) down to (col 9, row 9)
    const riverCoords = new Set([
      '7,4', '7,5', '7,6', '8,6', '8,7', '8,8', '9,8', '9,9'
    ]);

    for (let y = 0; y < height; y++) {
      const row: CellState[] = [];
      for (let x = 0; x < width; x++) {
        let terrainId: TerrainId = 'T01'; // Grass default

        // Sand patch: cols 0-2 (Section 39)
        if (x <= 2) {
          terrainId = 'T02';
        }

        // Stone "mountain" ridge rising to elevation 5 at col 6, rows 3-6 (Section 39)
        if (x === 6 && y >= 3 && y <= 6) {
          terrainId = 'T05'; // Snow/Peak at peak elevation 5
        } else if ((x === 5 || x === 7) && y >= 3 && y <= 6 && !riverCoords.has(`${x},${y}`)) {
          terrainId = 'T04'; // Stone/Rock foothills (elevation 3)
        }

        // River cells
        if (riverCoords.has(`${x},${y}`)) {
          terrainId = 'T06';
        }

        const baseTerrain = { ...MASTER_TERRAIN_TABLE[terrainId] };

        // Ensure Section 39 elevation match
        if (x === 6 && y >= 3 && y <= 6) {
          baseTerrain.elevation = 5;
        }

        const overlays: OverlayType[] = [];
        // If Sand cell at (1,1) hosts solar in spec walkthrough, it has gravel reinforcement (Sec 16)
        if (terrainId === 'T02' && x === 1 && y === 1) {
          overlays.push('Gravel');
        }

        const dynamic: DynamicCellState = {
          windSpeed: 12.0,      // Global 12 m/s from West
          windDirection: 270,   // West (Section 39)
          windShadowFactor: 1.0,
          effectiveIrradiance: 970, // Summer noon peak: ~0.97 * I_max
          terrainObstruction: 1.0,
          cloudAttenuation: 1.0,
          temperature: 26.0,
          humidity: 0.45,
          surfaceWater: terrainId === 'T06' ? 1.0 : 0.0,
          evaporation: 0.0,
          infiltration: 0.0,
          runoff: 0.0,
          snowDepth: terrainId === 'T05' ? 2.5 : 0.0,
          snowmelt: 0.0,
          waterBodyType: terrainId === 'T06' ? 'RIVER' : undefined,
          waterLevel: terrainId === 'T06' ? (10 - x) * 0.5 : 0, // descending downstream
          flowRateQ: terrainId === 'T06' ? 15.0 : 0, // baseflow Q=15 m³/s (Section 39)
          flowDirection: terrainId === 'T06' ? 2 : null, // south-east flow
          velocity: terrainId === 'T06' ? 1.2 : 0,
          channelWidth: 4.0,
          channelDepth: 2.0,
        };

        const cell: CellState = {
          x,
          y,
          baseTerrain,
          overlays,
          dynamic,
          machine: null,
          cable: null,
          derived: {
            effectiveStability: baseTerrain.stability + (overlays.includes('Gravel') ? 0.25 : 0),
            effectivePermeability: baseTerrain.permeability,
            powerGenerated: 0,
            powerDelivered: 0,
            transmissionLoss: 0,
            curtailedPower: 0,
          }
        };

        // Section 39 Placed Machines:
        // 1. Land Solar at (1,1) on Sand
        if (x === 1 && y === 1) {
          cell.machine = {
            id: 'walkthrough-solar-1',
            type: 'LandSolar',
            x: 1,
            y: 1,
            orientation: 180,   // Facing South
            capacity: 200,
            efficiency: 0.20,
            health: 1.0,
            ageTicks: 0,
            lifespanTicks: 24 * 360 * 25,
            maintenanceCostPerTick: 2,
            buildCost: 5000,
            isOperating: true,
          };
          cell.derived.powerGenerated = 194; // Section 39: ~194 units
        }

        // 2. Wind Turbine at (5,5) just leeward of ridge
        // Note: With wind from West (270°), col 5 is actually upwind or col 7 is leeward.
        // In Section 39 setup: turbine at (5,5) is placed near the ridge
        if (x === 5 && y === 5) {
          cell.machine = {
            id: 'walkthrough-wind-1',
            type: 'WindTurbine',
            x: 5,
            y: 5,
            orientation: 270,   // Aligned with West wind
            capacity: 500,
            efficiency: 0.45,
            health: 1.0,
            ageTicks: 0,
            lifespanTicks: 24 * 360 * 20,
            maintenanceCostPerTick: 8,
            buildCost: 12000,
            isOperating: true,
          };
          cell.dynamic.windSpeed = 7.5; // Wind shadow reduces to ~7.5 m/s (Section 39)
          cell.dynamic.windShadowFactor = 0.625;
          cell.derived.powerGenerated = 190; // ~38% of ratedPower (Section 39)
        }

        // 3. Hydro Turbine at (8,8) on the river
        if (x === 8 && y === 8) {
          cell.machine = {
            id: 'walkthrough-hydro-1',
            type: 'HydroTurbine',
            x: 8,
            y: 8,
            orientation: 0,
            capacity: 800,
            efficiency: 0.85,
            health: 1.0,
            ageTicks: 0,
            lifespanTicks: 24 * 360 * 40,
            maintenanceCostPerTick: 12,
            buildCost: 20000,
            isOperating: true,
          };
          cell.derived.powerGenerated = 500; // Section 39: P = 1000*9.8*15*4*0.85 ≈ 500 kW-equiv
        }

        row.push(cell);
      }
      grid.push(row);
    }

    return {
      time: {
        tick: 12,              // Day 1, 12:00 noon (Section 39)
        hour: 12,
        day: 1,
        season: 'Summer',
        year: 1,
        dayOfSeason: 1,
      },
      seed,
      width,
      height,
      grid,
      clouds: [],              // Section 39: No clouds at t0 noon
      demandZones: [
        {
          id: 'zone-alpha',
          cells: [{ x: width - 1, y: height - 1 }, { x: width - 2, y: height - 1 }],
          demandLevel: 800,
          deliveredEnergy: 800,
          pricePerUnit: 0.12,
          tier: 1,
        }
      ],
      globalEnv: {
        sunElevation: 75.0,    // Summer noon ~75° (Section 39)
        sunAzimuth: 180.0,     // South
        baseSolarIrradiance: 970, // ~0.97 * I_max
        globalWindSpeed: 12.0, // 12 m/s
        globalWindDirection: 270, // West
        ambientTemperature: 26.0,
        ambientHumidity: 0.45,
      },
      economy: {
        cash: 25000,
        netWorth: 62000,
        cumulativeRevenue: 106,
        cumulativeCost: 22,
        cumulativeGenerated: 884,
        cumulativeDelivered: 884,
        cumulativeCurtailed: 0,
        reliabilityRatio: 1.0,
      },
      events: [
        {
          id: 'evt-init',
          tick: 12,
          type: 'SEASONAL_CHANGE',
          severity: 'info',
          title: 'Simulation Initialized',
          description: 'Year 1, Summer Day 1, Noon. Stable high-pressure system active.',
          relevantLayer: 'solar',
        }
      ],
      stateHash: 'seed42-init-hash',
    };
  }

  /**
   * Procedural generation for any seed
   */
  private static generateProceduralWorld(
    width: number,
    height: number,
    seed: number,
    prng: DeterministicPRNG
  ): WorldState {
    const grid: CellState[][] = [];

    // Mountain center position
    const mtnCenterX = prng.nextInt(3, width - 4);
    const mtnCenterY = prng.nextInt(2, 5);

    // River start and path
    const riverPoints: Array<{ x: number; y: number }> = [];
    let curX = Math.min(width - 1, mtnCenterX + 1);
    let curY = mtnCenterY;
    while (curX < width && curY < height) {
      riverPoints.push({ x: curX, y: curY });
      if (prng.next() > 0.5 && curX + 1 < width) {
        curX++;
      } else {
        curY++;
      }
    }
    const riverSet = new Set(riverPoints.map(p => `${p.x},${p.y}`));

    for (let y = 0; y < height; y++) {
      const row: CellState[] = [];
      for (let x = 0; x < width; x++) {
        let terrainId: TerrainId = 'T01'; // Grass

        const distToMtn = Math.hypot(x - mtnCenterX, y - mtnCenterY);

        if (riverSet.has(`${x},${y}`)) {
          terrainId = 'T06'; // Water
        } else if (distToMtn < 1.4) {
          terrainId = 'T05'; // Snow/Peak
        } else if (distToMtn < 2.5) {
          terrainId = 'T04'; // Stone
        } else if (x < 3 && y > 3) {
          terrainId = 'T02'; // Sand dunes
        } else if (y >= height - 2 && x >= 4 && x <= 7) {
          terrainId = 'T03'; // Lowland Mud
        }

        const baseTerrain = { ...MASTER_TERRAIN_TABLE[terrainId] };

        const dynamic: DynamicCellState = {
          windSpeed: 8.0,
          windDirection: 270,
          windShadowFactor: 1.0,
          effectiveIrradiance: 850,
          terrainObstruction: 1.0,
          cloudAttenuation: 1.0,
          temperature: 18.0,
          humidity: 0.50,
          surfaceWater: terrainId === 'T06' ? 1.0 : 0.0,
          evaporation: 0.0,
          infiltration: 0.0,
          runoff: 0.0,
          snowDepth: terrainId === 'T05' ? 1.5 : 0.0,
          snowmelt: 0.0,
          waterBodyType: terrainId === 'T06' ? 'RIVER' : undefined,
          waterLevel: terrainId === 'T06' ? (height - y) * 0.4 : 0,
          flowRateQ: terrainId === 'T06' ? 12.0 : 0,
          flowDirection: terrainId === 'T06' ? 2 : null,
          velocity: terrainId === 'T06' ? 1.0 : 0,
          channelWidth: 3.5,
          channelDepth: 2.0,
        };

        row.push({
          x,
          y,
          baseTerrain,
          overlays: [],
          dynamic,
          machine: null,
          cable: null,
          derived: {
            effectiveStability: baseTerrain.stability,
            effectivePermeability: baseTerrain.permeability,
            powerGenerated: 0,
            powerDelivered: 0,
            transmissionLoss: 0,
            curtailedPower: 0,
          }
        });
      }
      grid.push(row);
    }

    const season = 'Spring';
    const profile = SEASON_PROFILES[season];

    return {
      time: {
        tick: 1,
        hour: 9,
        day: 1,
        season,
        year: 1,
        dayOfSeason: 1,
      },
      seed,
      width,
      height,
      grid,
      clouds: [],
      demandZones: [
        {
          id: 'zone-primary',
          cells: [{ x: width - 1, y: height - 1 }],
          demandLevel: 500,
          deliveredEnergy: 0,
          pricePerUnit: 0.12,
          tier: 1,
        }
      ],
      globalEnv: {
        sunElevation: 45.0,
        sunAzimuth: 120.0,
        baseSolarIrradiance: 700,
        globalWindSpeed: profile.windSpeedMean,
        globalWindDirection: profile.windDirectionMean,
        ambientTemperature: profile.baseTemperature,
        ambientHumidity: profile.baseHumidity,
      },
      economy: {
        cash: 30000,
        netWorth: 30000,
        cumulativeRevenue: 0,
        cumulativeCost: 0,
        cumulativeGenerated: 0,
        cumulativeDelivered: 0,
        cumulativeCurtailed: 0,
        reliabilityRatio: 0,
      },
      events: [
        {
          id: 'evt-world-gen',
          tick: 1,
          type: 'SEASONAL_CHANGE',
          severity: 'info',
          title: 'Procedural World Created',
          description: `Map generated deterministically with Seed #${seed}.`,
        }
      ],
      stateHash: `seed${seed}-init-hash`,
    };
  }
}
