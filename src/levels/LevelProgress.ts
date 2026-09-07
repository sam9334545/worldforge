/**
 * Level Progress Manager
 * Persists campaign progression, high scores, stars, and saved grid structures
 */

import type { LevelId, LevelStatus } from './LevelConfig.ts';
import { LEVEL_DEFINITIONS } from './LevelDefinitions.ts';
import type { CellState } from '../sim/types.ts';

const STORAGE_KEY = 'terraforge_campaign_progress_v1';
const SNAPSHOT_PREFIX = 'terraforge_level_snapshot_lvl_';

export interface LevelGridStructure {
  x: number;
  y: number;
  machine?: { type: string; orientation?: number; efficiency?: number; isOperating?: boolean } | null;
  cable?: { capacity: number; currentThroughput?: number } | null;
  has_cable?: boolean;
  hasCable?: boolean;
  overlays?: string[];
}

export interface LevelGridSnapshot {
  levelId: number;
  timestamp: number;
  cash: number;
  structures: LevelGridStructure[];
  summary: {
    totalMachines: number;
    totalCables: number;
    totalOverlays: number;
    machineCounts: Record<string, number>;
  };
}

export class LevelProgress {
  /**
   * Retrieves progression map for all 10 levels
   */
  public static getAllStatus(): Record<number, LevelStatus> {
    const defaultStatus: Record<number, LevelStatus> = {};
    for (let i = 1; i <= 10; i++) {
      defaultStatus[i] = {
        levelId: i as LevelId,
        unlocked: i === 1, // Level 1 unlocked by default
        completed: false,
        bestDeliveredKW: 0,
        bestProfit: 0,
        stars: 0,
      };
    }

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultStatus;
      const parsed = JSON.parse(raw) as Record<number, LevelStatus>;
      // Merge with defaults to ensure all 10 levels exist
      return { ...defaultStatus, ...parsed };
    } catch {
      return defaultStatus;
    }
  }

  /**
   * Retrieves status for a single level
   */
  public static getStatus(levelId: LevelId): LevelStatus {
    const all = this.getAllStatus();
    return all[levelId] || {
      levelId,
      unlocked: levelId === 1,
      completed: false,
      bestDeliveredKW: 0,
      bestProfit: 0,
      stars: 0,
    };
  }

  /**
   * Saves completion of a level and unlocks the next level
   */
  public static recordCompletion(
    levelId: LevelId,
    deliveredKW: number,
    profit: number
  ): { nextLevelUnlocked: LevelId | null; starsEarned: number } {
    const all = this.getAllStatus();
    const current = all[levelId] || {
      levelId,
      unlocked: true,
      completed: false,
      bestDeliveredKW: 0,
      bestProfit: 0,
      stars: 0,
    };

    const config = LEVEL_DEFINITIONS[levelId];
    // Calculate stars: 1 star for meeting target, 2 for exceeding by 15%, 3 for exceeding by 30% or extra profit
    let starsEarned = 1;
    if (deliveredKW >= config.objective.targetPowerKW * 1.15) starsEarned = 2;
    if (deliveredKW >= config.objective.targetPowerKW * 1.30 && (!config.objective.minProfit || profit >= config.objective.minProfit)) starsEarned = 3;

    current.completed = true;
    current.bestDeliveredKW = Math.max(current.bestDeliveredKW, Math.round(deliveredKW));
    current.bestProfit = Math.max(current.bestProfit, Math.round(profit));
    current.stars = Math.max(current.stars, starsEarned);
    all[levelId] = current;

    // Unlock next level if not already unlocked
    let nextLevelUnlocked: LevelId | null = null;
    if (levelId < 10) {
      const nextId = (levelId + 1) as LevelId;
      if (!all[nextId].unlocked) {
        all[nextId].unlocked = true;
        nextLevelUnlocked = nextId;
      }
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch {
      // Ignore storage errors in restricted contexts
    }

    return { nextLevelUnlocked, starsEarned };
  }

  /**
   * Saves player-built grid structure snapshot for a level
   */
  public static saveLevelGridSnapshot(
    levelId: number,
    grid: CellState[][],
    cash: number
  ): void {
    try {
      const structures: LevelGridStructure[] = [];
      let totalMachines = 0;
      let totalCables = 0;
      let totalOverlays = 0;
      const machineCounts: Record<string, number> = {};

      for (let y = 0; y < grid.length; y++) {
        for (let x = 0; x < grid[y].length; x++) {
          const cell = grid[y][x];
          const hasMachine = Boolean(cell.machine);
          const hasCable = Boolean(cell.has_cable || cell.hasCable || cell.cable);
          const hasOverlays = Boolean(cell.overlays && cell.overlays.length > 0);

          if (hasMachine || hasCable || hasOverlays) {
            if (hasMachine && cell.machine) {
              totalMachines++;
              const mType = String(cell.machine.type);
              machineCounts[mType] = (machineCounts[mType] || 0) + 1;
            }
            if (hasCable) totalCables++;
            if (hasOverlays && cell.overlays) totalOverlays += cell.overlays.length;

            structures.push({
              x,
              y,
              machine: cell.machine ? {
                type: String(cell.machine.type),
                orientation: cell.machine.orientation ?? 180,
                efficiency: cell.machine.efficiency,
                isOperating: cell.machine.isOperating,
              } : null,
              cable: cell.cable ? { capacity: cell.cable.capacity, currentThroughput: cell.cable.currentThroughput } : null,
              has_cable: Boolean(cell.has_cable || cell.hasCable),
              hasCable: Boolean(cell.has_cable || cell.hasCable),
              overlays: cell.overlays ? [...cell.overlays] : [],
            });
          }
        }
      }

      // Only save if there are actual player structures
      if (structures.length > 0) {
        const snapshot: LevelGridSnapshot = {
          levelId,
          timestamp: Date.now(),
          cash,
          structures,
          summary: {
            totalMachines,
            totalCables,
            totalOverlays,
            machineCounts,
          }
        };
        localStorage.setItem(`${SNAPSHOT_PREFIX}${levelId}`, JSON.stringify(snapshot));
      }
    } catch {
      // Ignore
    }
  }

  /**
   * Retrieves player-built structure snapshot for a level
   */
  public static getLevelGridSnapshot(levelId: number): LevelGridSnapshot | null {
    try {
      const raw = localStorage.getItem(`${SNAPSHOT_PREFIX}${levelId}`);
      if (!raw) return null;
      return JSON.parse(raw) as LevelGridSnapshot;
    } catch {
      return null;
    }
  }

  /**
   * Checks if a previous structure snapshot exists for a level
   */
  public static hasLevelGridSnapshot(levelId: number): boolean {
    try {
      return localStorage.getItem(`${SNAPSHOT_PREFIX}${levelId}`) !== null;
    } catch {
      return false;
    }
  }

  /**
   * Clears saved structure snapshot for a level
   */
  public static clearLevelGridSnapshot(levelId: number): void {
    try {
      localStorage.removeItem(`${SNAPSHOT_PREFIX}${levelId}`);
    } catch {
      // Ignore
    }
  }

  /**
   * Resets all progress back to initial campaign state (Level 1 unlocked only)
   */
  public static resetProgress(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
      for (let i = 1; i <= 10; i++) {
        localStorage.removeItem(`${SNAPSHOT_PREFIX}${i}`);
      }
    } catch {
      // Ignore
    }
  }

  /**
   * Unlock all levels (useful for debugging/testing/evaluation)
   */
  public static unlockAll(): void {
    const all = this.getAllStatus();
    for (let i = 1; i <= 10; i++) {
      all[i].unlocked = true;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch {
      // Ignore
    }
  }
}
