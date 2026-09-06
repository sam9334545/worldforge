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

    // Reset delivered energy across all demand zones
    for (const dz of demandZones) {
      dz.deliveredEnergy = 0;
    }

    // 1. Process all generators and transmission paths
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const cell = grid[y][x];

        if (cell.machine && cell.machine.isOperating) {
          totalMaintenance += cell.machine.maintenanceCostPerTick;
          const gen = cell.derived.powerGenerated;
          totalGeneratedKW += gen;

          if (gen > 0) {
            // Find reachable demand zone
            let targetZone: DemandZone | null = null;
            let targetCell: { x: number; y: number } | null = null;
            let minDistance = Infinity;

            for (const dz of demandZones) {
              const isConn = !requireGridConnection || this.isConnectedToDemandZone(x, y, grid, width, height, dz);
              if (isConn) {
                const dzCenter = dz.cells[0] || { x: width - 1, y: height - 1 };
                const dist = Math.abs(x - dzCenter.x) + Math.abs(y - dzCenter.y);
                if (dist < minDistance) {
                  minDistance = dist;
                  targetZone = dz;
                  targetCell = dzCenter;
                }
              }
            }

            if (!targetZone || !targetCell) {
              cell.derived.transmissionLoss = 0;
              cell.derived.powerDelivered = 0;
              cell.derived.curtailedPower = gen;
              totalCurtailedKW += gen;
              continue;
            }

            // Distance from generator to targeted demand zone
            const dist = minDistance;

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

            // Attribute power to target demand zone
            targetZone.deliveredEnergy += availableForDelivery;
          }
        }
      }
    }

    // 2. Evaluate demand fulfillment and revenue across all demand zones (Section 18, E19)
    let totalRevenue = 0;
    let totalDemand = 0;
    let totalFulfilled = 0;

    for (const dz of demandZones) {
      const fulfilled = Math.min(dz.demandLevel, dz.deliveredEnergy);
      dz.deliveredEnergy = Number(fulfilled.toFixed(1));
      totalRevenue += dz.deliveredEnergy * dz.pricePerUnit;
      totalDemand += dz.demandLevel;
      totalFulfilled += dz.deliveredEnergy;
    }

    // Update economy state
    economy.cumulativeRevenue += totalRevenue;
    economy.cumulativeCost += totalMaintenance;
    economy.cash += totalRevenue - totalMaintenance;
    economy.cumulativeGenerated += totalGeneratedKW;
    economy.cumulativeDelivered += totalDeliveredKW;
    economy.cumulativeCurtailed += totalCurtailedKW;
    economy.netWorth = economy.cash + (economy.cumulativeGenerated * 0.1);
    economy.reliabilityRatio = totalDemand > 0 ? Number((totalFulfilled / totalDemand).toFixed(3)) : 1.0;

    // Energy conservation audit: Generation >= Delivered + Losses + Curtailed
    const unaccounted = totalGeneratedKW - (totalDeliveredKW + totalTransmissionLossKW + totalCurtailedKW);
    const isEnergyConserved = Math.abs(unaccounted) < 0.05;

    return {
      totalGeneratedKW: Number(totalGeneratedKW.toFixed(1)),
      totalDeliveredKW: Number(totalDeliveredKW.toFixed(1)),
      totalTransmissionLossKW: Number(totalTransmissionLossKW.toFixed(1)),
      totalCurtailedKW: Number(totalCurtailedKW.toFixed(1)),
      isEnergyConserved,
      revenueEarned: Number(totalRevenue.toFixed(2)),
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

  /**
   * Reconstructs the exact sequence of grid cells linking a machine to a demand zone along cables
   */
  public static findCablePath(
    startX: number,
    startY: number,
    grid: CellState[][],
    width: number,
    height: number,
    targetDemandZone: DemandZone
  ): Array<{ x: number; y: number }> | null {
    if (!targetDemandZone || !targetDemandZone.cells || !targetDemandZone.cells.length) return null;

    // Check if directly adjacent
    for (const dz of targetDemandZone.cells) {
      if (Math.abs(startX - dz.x) + Math.abs(startY - dz.y) <= 1) {
        return [{ x: startX, y: startY }, { x: dz.x, y: dz.y }];
      }
    }

    const parent = new Map<string, { x: number; y: number }>();
    const queue: Array<{ x: number; y: number }> = [];
    const visited = new Set<string>();

    const startKey = `${startX},${startY}`;
    visited.add(startKey);

    if (grid[startY][startX].cable) {
      queue.push({ x: startX, y: startY });
    } else {
      const dirs = [{ dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }];
      for (const d of dirs) {
        const nx = startX + d.dx;
        const ny = startY + d.dy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height && grid[ny][nx].cable) {
          const nKey = `${nx},${ny}`;
          visited.add(nKey);
          parent.set(nKey, { x: startX, y: startY });
          queue.push({ x: nx, y: ny });
        }
      }
    }

    let endPt: { x: number; y: number } | null = null;
    while (queue.length > 0) {
      const curr = queue.shift()!;

      for (const dz of targetDemandZone.cells) {
        if (Math.abs(curr.x - dz.x) + Math.abs(curr.y - dz.y) <= 1) {
          endPt = { x: dz.x, y: dz.y };
          parent.set(`${dz.x},${dz.y}`, curr);
          break;
        }
      }
      if (endPt) break;

      const dirs = [{ dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }];
      for (const d of dirs) {
        const nx = curr.x + d.dx;
        const ny = curr.y + d.dy;
        const nKey = `${nx},${ny}`;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height && !visited.has(nKey)) {
          if (grid[ny][nx].cable) {
            visited.add(nKey);
            parent.set(nKey, curr);
            queue.push({ x: nx, y: ny });
          }
        }
      }
    }

    if (!endPt) return null;

    // Reconstruct backwards
    const path: Array<{ x: number; y: number }> = [];
    let currKey = `${endPt.x},${endPt.y}`;
    path.unshift(endPt);

    while (parent.has(currKey)) {
      const p = parent.get(currKey)!;
      path.unshift(p);
      currKey = `${p.x},${p.y}`;
      if (p.x === startX && p.y === startY) break;
    }

    return path;
  }
}
