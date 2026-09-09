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
   * Helper to check if a cell contains a high-voltage cable/conduit
   */
  public static isConduitOrCable(cell: CellState | undefined | null): boolean {
    if (!cell) return false;
    if (cell.cable || (cell as any).has_cable || (cell as any).hasCable) return true;
    const typeStr = String(cell.machine?.type ?? cell.machine ?? '').toLowerCase();
    if (typeStr === 'conduit' || typeStr === 'cable') return true;
    return false;
  }

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

    let totalGeneratedPower = 0;
    let totalDeliveredPower = 0;
    let totalTransmissionLossKW = 0;
    let totalCurtailedKW = 0;
    let totalMaintenance = 0;
    let totalRevenue = 0;

    // Reset delivered energy across all demand zones and track remaining demand per zone
    const zoneRemainingDemand = new Map<string, number>();
    for (const dz of demandZones) {
      dz.deliveredEnergy = 0;
      zoneRemainingDemand.set(dz.id, dz.demandLevel);
    }

    // 1. Process all generators and transmission paths
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const cell = grid[y][x];

        if (cell.machine && cell.machine.isOperating) {
          totalMaintenance += cell.machine.maintenanceCostPerTick;
          const gen = cell.derived.powerGenerated;
          totalGeneratedPower += gen;

          if (gen > 0) {
            if (!requireGridConnection) {
              // In early levels (1-5), generators deliver directly without transmission conduit loss
              cell.derived.transmissionLoss = 0;
              cell.derived.curtailedPower = 0;
              cell.derived.powerDelivered = Number(gen.toFixed(1));

              totalDeliveredPower += gen;
              // Direct tariff revenue in unconnected levels
              const tariff = demandZones[0]?.pricePerUnit ?? 0.15;
              totalRevenue += gen * tariff;
              if (demandZones[0]) {
                demandZones[0].deliveredEnergy += gen;
              }
              continue;
            }

            // For grid-connected levels (Levels 6-10):
            // Find reachable demand zone with available capacity (or nearest reachable zone)
            let targetZone: DemandZone | null = null;
            let targetCell: { x: number; y: number } | null = null;
            let minDistance = Infinity;

            // First priority: reachable demand zone that still has remaining demand capacity
            for (const dz of demandZones) {
              const isConn = this.isConnectedToDemandZone(x, y, grid, width, height, dz);
              if (isConn) {
                const remaining = zoneRemainingDemand.get(dz.id) ?? 0;
                const dzCenter = dz.cells[0] || { x: width - 1, y: height - 1 };
                const dist = Math.abs(x - dzCenter.x) + Math.abs(y - dzCenter.y);
                if (remaining > 0 && dist < minDistance) {
                  minDistance = dist;
                  targetZone = dz;
                  targetCell = dzCenter;
                }
              }
            }

            // Second priority: if all reachable zones are saturated, route to nearest reachable zone
            if (!targetZone) {
              minDistance = Infinity;
              for (const dz of demandZones) {
                const isConn = this.isConnectedToDemandZone(x, y, grid, width, height, dz);
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
            }

            if (!targetZone || !targetCell) {
              cell.derived.transmissionLoss = 0;
              cell.derived.powerDelivered = 0;
              cell.derived.curtailedPower = gen;
              totalCurtailedKW += gen;
              console.log(`Machine at ${x},${y} -> Connected: false, Raw Gen: ${gen}, Delivered: 0`);
              continue;
            }

            // Distance from generator to targeted demand zone
            const dist = minDistance;

            // E18: Transmission loss = distance * lossPerCell
            const lossFraction = Math.min(0.5, dist * transmissionLossPerCell);
            const loss = gen * lossFraction;
            let availableForDelivery = gen - loss;

            // Cable capacity limit check (Section 17, Test 16: max 1000 kW per line)
            let lineCurtailed = 0;
            const cableCapacity = cell.cable ? cell.cable.capacity : 1000;
            if (availableForDelivery > cableCapacity) {
              lineCurtailed = availableForDelivery - cableCapacity;
              availableForDelivery = cableCapacity;
            }

            // Audit Multi-Zone Demand Caps:
            // Check remaining demand capacity of target zone for this tick
            const remainingDemand = zoneRemainingDemand.get(targetZone.id) ?? 0;
            const powerAbsorbed = Math.min(availableForDelivery, remainingDemand);
            const excessOverDemand = availableForDelivery - powerAbsorbed;

            // Cumulative filling of target zone
            targetZone.deliveredEnergy += powerAbsorbed;
            zoneRemainingDemand.set(targetZone.id, Math.max(0, remainingDemand - powerAbsorbed));

            // Accumulate delivered power and revenue
            totalTransmissionLossKW += loss;
            totalCurtailedKW += lineCurtailed + excessOverDemand;
            totalDeliveredPower += powerAbsorbed;
            totalRevenue += powerAbsorbed * targetZone.pricePerUnit;

            cell.derived.transmissionLoss = Number(loss.toFixed(1));
            cell.derived.powerDelivered = Number(powerAbsorbed.toFixed(1));
            cell.derived.curtailedPower = Number((lineCurtailed + excessOverDemand).toFixed(1));

            console.log(`Machine at ${x},${y} -> Connected: true, Raw Gen: ${gen}, Delivered: ${cell.derived.powerDelivered}`);
          }
        }
      }
    }

    // 2. Evaluate total demand and fulfillment stats
    let totalDemand = 0;
    let totalFulfilled = 0;
    for (const dz of demandZones) {
      dz.deliveredEnergy = Number(dz.deliveredEnergy.toFixed(1));
      totalDemand += dz.demandLevel;
      totalFulfilled += dz.deliveredEnergy;
    }

    // Operating profit for this tick (delivered revenue - recurring maintenance expenses)
    // Note: One-time capital construction costs are excluded from tick operating profit rate.
    const tickOperatingProfit = Number((totalRevenue - totalMaintenance).toFixed(2));

    const prevHistory = Array.isArray(economy.tickProfitHistory) ? economy.tickProfitHistory : [];
    const updatedHistory = [...prevHistory, tickOperatingProfit].slice(-24);
    economy.tickProfitHistory = updatedHistory;
    economy.rollingDailyProfit = Number(
      updatedHistory.reduce((sum, val) => sum + val, 0).toFixed(2)
    );

    // Save current tick totals on economy object
    economy.totalDeliveredPower = Number(totalDeliveredPower.toFixed(1));
    economy.totalGeneratedPower = Number(totalGeneratedPower.toFixed(1));

    // Update economy cumulative state
    economy.cumulativeRevenue += totalRevenue;
    economy.cumulativeCost += totalMaintenance;
    economy.cash += totalRevenue - totalMaintenance;
    economy.cumulativeGenerated += totalGeneratedPower;
    economy.cumulativeDelivered += totalDeliveredPower;
    economy.cumulativeCurtailed += totalCurtailedKW;
    economy.netWorth = economy.cash + (economy.cumulativeGenerated * 0.1);
    economy.reliabilityRatio = totalDemand > 0 ? Number((totalFulfilled / totalDemand).toFixed(3)) : 1.0;

    // Energy conservation audit: Generation >= Delivered + Losses + Curtailed
    const unaccounted = totalGeneratedPower - (totalDeliveredPower + totalTransmissionLossKW + totalCurtailedKW);
    const isEnergyConserved = Math.abs(unaccounted) < 0.05;

    return {
      totalGeneratedKW: Number(totalGeneratedPower.toFixed(1)),
      totalDeliveredKW: Number(totalDeliveredPower.toFixed(1)),
      totalTransmissionLossKW: Number(totalTransmissionLossKW.toFixed(1)),
      totalCurtailedKW: Number(totalCurtailedKW.toFixed(1)),
      isEnergyConserved,
      revenueEarned: Number(totalRevenue.toFixed(2)),
      maintenanceCostPaid: Number(totalMaintenance.toFixed(2)),
    };
  }

  /**
   * Evaluates if a machine at (x, y) is connected to the target demand zone via adjacent cables/conduits
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

    // Direct adjacency or overlap of generator cell to any cell in demand zone
    for (const dz of demandZone.cells) {
      if (Math.abs(x - dz.x) + Math.abs(y - dz.y) <= 1) return true;
    }

    // BFS through cable / conduit network
    const visited = new Set<string>();
    const queue: Array<{ x: number; y: number }> = [];

    // Always allow the generator tile itself to initiate search
    queue.push({ x, y });
    visited.add(`${x},${y}`);

    const dirs = [{ dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }];

    while (queue.length > 0) {
      const curr = queue.shift()!;

      // Check if curr is in or directly adjacent to any demand zone cell
      for (const dz of demandZone.cells) {
        if (Math.abs(curr.x - dz.x) + Math.abs(curr.y - dz.y) <= 1) {
          return true;
        }
      }

      for (const d of dirs) {
        const nx = curr.x + d.dx;
        const ny = curr.y + d.dy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const key = `${nx},${ny}`;
          if (!visited.has(key)) {
            const isDZ = demandZone.cells.some(c => c.x === nx && c.y === ny);
            const isConduit = this.isConduitOrCable(grid[ny][nx]);

            if (isDZ || isConduit) {
              visited.add(key);
              if (isDZ) return true;
              queue.push({ x: nx, y: ny });
            }
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
    queue.push({ x: startX, y: startY });

    const dirs = [{ dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }];

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

      for (const d of dirs) {
        const nx = curr.x + d.dx;
        const ny = curr.y + d.dy;
        const nKey = `${nx},${ny}`;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height && !visited.has(nKey)) {
          const isDZ = targetDemandZone.cells.some(c => c.x === nx && c.y === ny);
          const isConduit = this.isConduitOrCable(grid[ny][nx]);
          if (isDZ || isConduit) {
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
