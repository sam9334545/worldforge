/**
 * Level System Configuration & Types
 * Faithful to Section 21 of energy-ecosystem-spec.md
 */

import type { MachineType, OverlayType, TerrainId } from '../sim/types.ts';
import type { XRayLayer } from '../components/viewport/XRayControls.tsx';

export type LevelId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export interface LevelBriefing {
  story: string;
  newMechanics: string[];
  hint: string;
}

export interface LevelObjectiveSpec {
  description: string;
  targetPowerKW: number;
  minReliability?: number; // e.g. 0.90 for 90%
  minProfit?: number;      // e.g. $5000
  requiredSustainedTicks?: number; // must hold for N ticks, default 10
}

export interface NewUnlockItem {
  name: string;
  type: string;
  icon: string;
  cost?: string;
  category: 'machine' | 'conduit' | 'stabilizer';
  description: string;
}

export interface LevelConfig {
  id: LevelId;
  name: string;
  subtitle: string;
  briefing: LevelBriefing;
  dimensions: { width: number; height: number };
  seed: number;
  startingCash: number;
  demandKW: number;
  allowedTerrain: TerrainId[];
  unlockedMachines: MachineType[];
  unlockedOverlays: OverlayType[];
  unlockedXRayLayers: XRayLayer[];
  requireGridConnection: boolean; // Level >= 6
  objective: LevelObjectiveSpec;
  defaultSeason?: 'Spring' | 'Summer' | 'Autumn' | 'Winter';
  newUnlocksGuide?: NewUnlockItem[];
}

export interface LevelStatus {
  levelId: LevelId;
  unlocked: boolean;
  completed: boolean;
  bestDeliveredKW: number;
  bestProfit: number;
  stars: number; // 1 to 3
}

export interface LevelObjectiveEvaluation {
  currentPowerKW: number;
  targetPowerKW: number;
  currentReliability: number;
  targetReliability?: number;
  currentProfit: number;
  targetProfit?: number;
  sustainedTicks: number;
  requiredSustainedTicks: number;
  isCompleted: boolean;
  isFailed: boolean;
  failureReason?: string;
  progressPercent: number;
}
