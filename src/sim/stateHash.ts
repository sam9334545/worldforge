/**
 * Deterministic State Hash Utility
 * Section 36 & Test Case 3 of energy-ecosystem-spec.md
 * 
 * Computes a deterministic integer/hex hash over the entire simulation state
 * to verify bit-identical reproducibility.
 */

import type { WorldState } from './contracts/WorldState.ts';

export function computeStateHash(state: WorldState): string {
  let hash = 0x811c9dc5; // FNV-1a 32-bit offset basis

  const updateHash = (str: string) => {
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193); // FNV prime
    }
  };

  // Hash global time & seed
  updateHash(`T:${state.time.tick};D:${state.time.day};S:${state.time.season};Y:${state.time.year};SEED:${state.seed};`);

  // Hash global environment
  updateHash(`SOLAR:${state.globalEnv.baseSolarIrradiance.toFixed(2)};WIND:${state.globalEnv.globalWindSpeed.toFixed(2)}@${state.globalEnv.globalWindDirection};`);

  // Hash grid cells
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      const cell = state.grid[y][x];
      const mStr = cell.machine ? `${cell.machine.type}@${cell.machine.orientation}:${cell.derived.powerGenerated.toFixed(1)}` : 'none';
      const oStr = cell.overlays.join(',');
      const dStr = `w:${cell.dynamic.windSpeed.toFixed(1)};s:${cell.dynamic.effectiveIrradiance.toFixed(1)};q:${cell.dynamic.flowRateQ.toFixed(1)};sn:${cell.dynamic.snowDepth.toFixed(1)}`;
      updateHash(`[${x},${y}:${cell.baseTerrain.id};${oStr};${mStr};${dStr}]`);
    }
  }

  // Hash economy
  updateHash(`REV:${state.economy.cumulativeRevenue.toFixed(2)};NET:${state.economy.netWorth.toFixed(2)};`);

  return (hash >>> 0).toString(16).padStart(8, '0');
}
