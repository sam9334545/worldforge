/**
 * Level Progress Manager
 * Persists campaign progression, high scores, and stars
 */

import type { LevelId, LevelStatus } from './LevelConfig.ts';
import { LEVEL_DEFINITIONS } from './LevelDefinitions.ts';

const STORAGE_KEY = 'terraforge_campaign_progress_v1';

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
   * Resets all progress back to initial campaign state (Level 1 unlocked only)
   */
  public static resetProgress(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
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
