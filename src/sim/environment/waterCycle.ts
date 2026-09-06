/**
 * Water Cycle Simulation Engine
 * Sections 11, 13, 22 of energy-ecosystem-spec.md
 * Rules: RULE-WATER-001..002, RULE-SNOW-001..002
 * Equations: E7, E10, E11, E12, E13
 * Top 20 Test Case 1: Mass Balance Audit
 */

import { CONFIGURABLE_PARAMS } from '../constants.ts';
import type { CellState } from '../types.ts';

export interface MassBalanceRecord {
  totalInflow: number;        // Rain + Snowmelt
  totalEvaporation: number;
  totalInfiltration: number;
  totalRunoff: number;
  isBalanced: boolean;
  discrepancy: number;
}

export class WaterCycleEngine {
  /**
   * Updates snow accumulation/melt, evaporation, infiltration, runoff, and surface water routing
   */
  public static updateWaterCycle(
    grid: CellState[][],
    width: number,
    height: number,
    rainfallMap: number[][]
  ): { runoffToRiver: Map<string, number>; massBalance: MassBalanceRecord } {
    const { k_evap, k_inf, k_melt } = CONFIGURABLE_PARAMS;

    let totalInflow = 0;        // Rain + Snowmelt
    let totalInitialStorage = 0; // Surface water already on ground
    let totalEvaporation = 0;
    let totalInfiltration = 0;
    let totalRunoff = 0;
    let totalFinalStorage = 0;

    const runoffGrid: number[][] = Array.from({ length: height }, () => Array(width).fill(0));
    const runoffToRiver = new Map<string, number>();

    // 1. Process each cell for Snow, Evaporation, Infiltration, and Runoff generation
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const cell = grid[y][x];
        const temp = cell.dynamic.temperature;
        const precip = rainfallMap[y][x] || 0;

        const startStorage = cell.dynamic.surfaceWater;
        totalInitialStorage += startStorage;
        let availableWater = startStorage;

        // A. Snow Accumulation vs Rainfall (RULE-SNOW-001, E12)
        if (temp <= 0) {
          // Precipitation freezes as snowpack
          cell.dynamic.snowDepth += precip;
          cell.dynamic.snowmelt = 0;
        } else {
          // Precipitation falls as liquid rain
          availableWater += precip;
          totalInflow += precip;

          // B. Snowmelt (degree-day model, RULE-SNOW-002, E13)
          if (cell.dynamic.snowDepth > 0) {
            const potentialMelt = k_melt * Math.max(0, temp);
            const actualMelt = Math.min(cell.dynamic.snowDepth, potentialMelt);
            cell.dynamic.snowDepth -= actualMelt;
            cell.dynamic.snowmelt = actualMelt;
            availableWater += actualMelt;
            totalInflow += actualMelt;
          }
        }

        // C. Evaporation (E7, RULE-WATER-001)
        const tFactor = Math.max(0.1, (temp + 10) / 30);
        const evapPotential = k_evap * tFactor * (1.0 - cell.dynamic.humidity) * availableWater;
        const actualEvap = Math.min(availableWater, Math.max(0, evapPotential));
        cell.dynamic.evaporation = Number(actualEvap.toFixed(3));
        availableWater -= actualEvap;
        totalEvaporation += actualEvap;

        // D. Infiltration (E10, RULE-WATER-001)
        const perm = cell.derived.effectivePermeability;
        const infilPotential = perm * k_inf * availableWater;
        const actualInfil = Math.min(availableWater, Math.max(0, infilPotential));
        cell.dynamic.infiltration = Number(actualInfil.toFixed(3));
        availableWater -= actualInfil;
        totalInfiltration += actualInfil;

        // E. Runoff (E11, mass balance identity)
        const actualRunoff = Math.max(0, availableWater);
        cell.dynamic.runoff = Number(actualRunoff.toFixed(3));
        runoffGrid[y][x] = actualRunoff;
        totalRunoff += actualRunoff;

        // Final storage remaining on cell
        const finalStorage = cell.baseTerrain.id === 'T06' ? 0.0 : 0.0;
        cell.dynamic.surfaceWater = finalStorage;
        totalFinalStorage += finalStorage;
      }
    }

    // 2. Downhill Runoff Routing (RULE-WATER-002)
    // 4-connected downhill routing with fixed deterministic tie-breaker: N > E > S > W
    const neighborOffsets = [
      { dx: 0, dy: -1 }, // N (priority 0)
      { dx: 1, dy: 0 },  // E (priority 1)
      { dx: 0, dy: 1 },  // S (priority 2)
      { dx: -1, dy: 0 }, // W (priority 3)
    ];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const runoff = runoffGrid[y][x];
        if (runoff <= 0.001) continue;

        const cellElev = grid[y][x].baseTerrain.elevation;
        let lowestElev = cellElev;
        let bestTarget: { x: number; y: number } | null = null;

        for (const offset of neighborOffsets) {
          const nx = x + offset.dx;
          const ny = y + offset.dy;

          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const nCell = grid[ny][nx];
            const nElev = nCell.baseTerrain.elevation;

            if (nElev < lowestElev) {
              lowestElev = nElev;
              bestTarget = { x: nx, y: ny };
            }
          }
        }

        if (bestTarget) {
          const targetCell = grid[bestTarget.y][bestTarget.x];
          // If downhill target is a water cell, route runoff into river flow
          if (targetCell.baseTerrain.id === 'T06') {
            const key = `${bestTarget.x},${bestTarget.y}`;
            runoffToRiver.set(key, (runoffToRiver.get(key) || 0) + runoff);
          }
        }
      }
    }

    // Mass balance check: (Inflow + Initial Storage) vs (Evaporation + Infiltration + Runoff + Final Storage)
    const totalWaterIn = totalInflow + totalInitialStorage;
    const totalWaterOut = totalEvaporation + totalInfiltration + totalRunoff + totalFinalStorage;
    const discrepancy = Math.abs(totalWaterIn - totalWaterOut);
    const isBalanced = discrepancy < 0.01;

    return {
      runoffToRiver,
      massBalance: {
        totalInflow: totalWaterIn,
        totalEvaporation,
        totalInfiltration,
        totalRunoff,
        isBalanced,
        discrepancy,
      }
    };
  }
}
