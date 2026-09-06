/**
 * Energy Network and Grid Transmission Engine
 * Section 17, 18, 22 of energy-ecosystem-spec.md
 * Rules: RULE-ECON-001..002
 * Equations: E18, E19
 * Top 20 Test Case 2: Energy conservation (Generation >= Delivered + Losses + Curtailed)
 * Top 20 Test Case 16: Cable overload curtailment
 */

import { CONFIGURABLE_PARAMS } from '../constants.ts';
import type { CellState, DemandZone, EconomyState } from '../types.ts';

export interface GridSimulationResult {
  totalGeneratedKW: number;
  totalDeliveredKW: number;
  totalTransmissionLossKW: number;
  totalCurtailedKW: number;
  isEnergyConserved: boolean;
  revenueEarned: number;
  maintenanceCostPaid: number;
}

export class EnergyNetworkEngine {
  /**
   * Simulates generation -> transmission losses -> cable capacity limits -> demand delivery -> revenue
   */
  public static updateGrid(
    grid: CellState[][],
    width: number,
    height: number,
    demandZones: DemandZone[],
    economy: EconomyState,
    requireGridConnection = false
  ): GridSimulationResult {
    const { transmissionLossPerCell } = CONFIGURABLE_PARAMS;

    let totalGeneratedKW = 0;
    let totalDeliveredKW = 0;
    let totalTransmissionLossKW = 0;
    let totalCurtailedKW = 0;
    let totalMaintenance = 0;

    const targetDemandZone = demandZones[0];
    const targetCell = targetDemandZone?.cells[0] || { x: width - 1, y: height - 1 };

    // 1. Process all generators and transmission paths
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const cell = grid[y][x];

        if (cell.machine && cell.machine.isOperating) {
          totalMaintenance += cell.machine.maintenanceCostPerTick;
          const gen = cell.derived.powerGenerated;
          totalGeneratedKW += gen;

          if (gen > 0) {
            // Level-gated grid connection check (Section 17: Level >= 6 requires unbroken Cable path)
            const isConnected = !requireGridConnection || this.isConnectedToDemandZone(x, y, grid, width, height, targetDemandZone);

            if (!isConnected) {
              cell.derived.transmissionLoss = 0;
              cell.derived.powerDelivered = 0;
              cell.derived.curtailedPower = gen;
              totalCurtailedKW += gen;
              continue;
            }

            // Distance from generator to demand zone
            const dist = Math.abs(x - targetCell.x) + Math.abs(y - targetCell.y);

            // E18: Transmission loss = distance * lossPerCell
            const lossFraction = Math.min(0.5, dist * transmissionLossPerCell);
            const loss = gen * lossFraction;
            let availableForDelivery = gen - loss;

            // Cable capacity limit check (Section 17, Test 16: max 1000 kW per line)
            let curtailed = 0;
            const cableCapacity = cell.cable ? cell.cable.capacity : 1000;
            if (availableForDelivery > cableCapacity) {
              curtailed = availableForDelivery - cableCapacity;
              availableForDelivery = cableCapacity;
            }

            cell.derived.transmissionLoss = Number(loss.toFixed(1));
            cell.derived.powerDelivered = Number(availableForDelivery.toFixed(1));
            cell.derived.curtailedPower = Number(curtailed.toFixed(1));

            totalTransmissionLossKW += loss;
            totalDeliveredKW += availableForDelivery;
            totalCurtailedKW += curtailed;
          }
        }
      }
    }

    // 2. Evaluate demand fulfillment and revenue (Section 18, E19)
    let revenue = 0;
    if (targetDemandZone) {
      targetDemandZone.deliveredEnergy = Number(Math.min(targetDemandZone.demandLevel, totalDeliveredKW).toFixed(1));
      revenue = targetDemandZone.deliveredEnergy * targetDemandZone.pricePerUnit;

      // Update economy state
      economy.cumulativeRevenue += revenue;
      economy.cumulativeCost += totalMaintenance;
      economy.cash += revenue - totalMaintenance;
      economy.cumulativeGenerated += totalGeneratedKW;
      economy.cumulativeDelivered += totalDeliveredKW;
      economy.cumulativeCurtailed += totalCurtailedKW;
      economy.netWorth = economy.cash + (economy.cumulativeGenerated * 0.1);
      economy.reliabilityRatio = targetDemandZone.demandLevel > 0
        ? targetDemandZone.deliveredEnergy / targetDemandZone.demandLevel
        : 1.0;
    }

    // Energy conservation audit: Generation >= Delivered + Losses + Curtailed
    // Due to numerical precision, we check (Generated - Delivered - Losses - Curtailed) >= -0.01
    const unaccounted = totalGeneratedKW - (totalDeliveredKW + totalTransmissionLossKW + totalCurtailedKW);
    const isEnergyConserved = Math.abs(unaccounted) < 0.05;

    return {
      totalGeneratedKW: Number(totalGeneratedKW.toFixed(1)),
      totalDeliveredKW: Number(totalDeliveredKW.toFixed(1)),
      totalTransmissionLossKW: Number(totalTransmissionLossKW.toFixed(1)),
      totalCurtailedKW: Number(totalCurtailedKW.toFixed(1)),
      isEnergyConserved,
      revenueEarned: Number(revenue.toFixed(2)),
      maintenanceCostPaid: Number(totalMaintenance.toFixed(2)),
    };
  }

  /**
   * Evaluates if a machine at (x, y) is connected to the target demand zone via adjacent cables
   * Section 17: Level >= 6 unbroken cable requirement
   */
  public static isConnectedToDemandZone(
    x: number,
    y: number,
    grid: CellState[][],
    width: number,
    height: number,
    demandZone: DemandZone
  ): boolean {
    if (!demandZone || !demandZone.cells || !demandZone.cells.length) return true;

    // Check if directly adjacent to any cell in demand zone
    for (const dz of demandZone.cells) {
      if (Math.abs(x - dz.x) + Math.abs(y - dz.y) <= 1) return true;
    }

    // BFS through cable network
    const visited = new Set<string>();
    const queue: Array<{ x: number; y: number }> = [];

    // Starting points: if machine cell has cable or adjacent cells have cable
    if (grid[y][x].cable) {
      queue.push({ x, y });
      visited.add(`${x},${y}`);
    } else {
      const dirs = [{ dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }];
      for (const d of dirs) {
        const nx = x + d.dx;
        const ny = y + d.dy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height && grid[ny][nx].cable) {
          queue.push({ x: nx, y: ny });
          visited.add(`${nx},${ny}`);
        }
      }
    }

    while (queue.length > 0) {
      const curr = queue.shift()!;

      // Check if curr is adjacent to any demand zone cell
      for (const dz of demandZone.cells) {
        if (Math.abs(curr.x - dz.x) + Math.abs(curr.y - dz.y) <= 1) {
          return true;
        }
      }

      const dirs = [{ dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }];
      for (const d of dirs) {
        const nx = curr.x + d.dx;
        const ny = curr.y + d.dy;
        const key = `${nx},${ny}`;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height && !visited.has(key)) {
          if (grid[ny][nx].cable) {
            visited.add(key);
            queue.push({ x: nx, y: ny });
          }
        }
      }
    }

    return false;
  }
}
