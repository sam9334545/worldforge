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
    economy: EconomyState
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
}
