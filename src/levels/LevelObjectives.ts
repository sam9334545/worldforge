/**
 * Level Objectives Evaluator
 * Checks win/loss criteria in real time from WorldState
 */

import type { LevelConfig, LevelObjectiveEvaluation } from './LevelConfig.ts';
import type { WorldState } from '../sim/contracts/WorldState.ts';

export class LevelObjectives {
  /**
   * Evaluates the current world state against the active level's objectives
   */
  public static evaluate(
    level: LevelConfig,
    worldState: WorldState,
    consecutiveSustainedTicks: number
  ): LevelObjectiveEvaluation {
    const objective = level.objective;

    // 1. Calculate active power
    let currentPowerKW = 0;
    if (level.requireGridConnection) {
      // In grid-connected levels, sum all power delivered to demand zones
      for (const zone of worldState.demandZones) {
        currentPowerKW += zone.deliveredEnergy;
      }
      // If demand zone deliveredEnergy is 0 or less, fallback to accumulated totalDeliveredPower
      if (currentPowerKW === 0) {
        if (worldState.totalDeliveredPower !== undefined && worldState.totalDeliveredPower > 0) {
          currentPowerKW = worldState.totalDeliveredPower;
        } else if (worldState.economy.totalDeliveredPower !== undefined && worldState.economy.totalDeliveredPower > 0) {
          currentPowerKW = worldState.economy.totalDeliveredPower;
        } else {
          for (let y = 0; y < worldState.height; y++) {
            for (let x = 0; x < worldState.width; x++) {
              currentPowerKW += worldState.grid[y][x].derived.powerDelivered;
            }
          }
        }
      }
    } else {
      // In early levels (1-5), all generation counts directly
      if (worldState.totalGeneratedPower !== undefined && worldState.totalGeneratedPower > 0) {
        currentPowerKW = worldState.totalGeneratedPower;
      } else if (worldState.economy.totalGeneratedPower !== undefined && worldState.economy.totalGeneratedPower > 0) {
        currentPowerKW = worldState.economy.totalGeneratedPower;
      } else {
        for (let y = 0; y < worldState.height; y++) {
          for (let x = 0; x < worldState.width; x++) {
            currentPowerKW += worldState.grid[y][x].derived.powerGenerated;
          }
        }
      }
    }

    currentPowerKW = Math.round(currentPowerKW * 10) / 10;

    // 2. Calculate profit (rolling 24-tick / 1-day sustained net operating rate)
    const currentProfit = Math.round(worldState.economy.rollingDailyProfit ?? 0);

    // 3. Grid reliability
    const currentReliability = worldState.economy.reliabilityRatio;

    // 4. Check target conditions
    const meetsPower = currentPowerKW >= objective.targetPowerKW;
    const meetsProfit = objective.minProfit === undefined || currentProfit >= objective.minProfit;
    const meetsReliability = objective.minReliability === undefined || currentReliability >= objective.minReliability;

    const allConditionsMet = meetsPower && meetsProfit && meetsReliability;

    const requiredTicks = objective.requiredSustainedTicks ?? 5;
    const nextSustainedTicks = allConditionsMet ? consecutiveSustainedTicks + 1 : 0;
    const isCompleted = nextSustainedTicks >= requiredTicks;

    // 5. Failure condition: Bankruptcy
    const isFailed = worldState.economy.cash < 0;
    const failureReason = isFailed ? 'Regional budget exhausted. Cash reserves fell below $0.' : undefined;

    // 6. Progress percentage
    let powerProgress = Math.min(1.0, currentPowerKW / Math.max(1, objective.targetPowerKW));
    let tickProgress = Math.min(1.0, nextSustainedTicks / requiredTicks);
    let progressPercent = Math.round(allConditionsMet ? (50 + tickProgress * 50) : (powerProgress * 50));

    return {
      currentPowerKW,
      targetPowerKW: objective.targetPowerKW,
      currentReliability,
      targetReliability: objective.minReliability,
      currentProfit,
      targetProfit: objective.minProfit,
      sustainedTicks: nextSustainedTicks,
      requiredSustainedTicks: requiredTicks,
      isCompleted,
      isFailed,
      failureReason,
      progressPercent,
    };
  }
}
