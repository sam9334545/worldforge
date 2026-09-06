/**
 * Shared Contract: AgentAction
 * Section 26 of energy-ecosystem-spec.md
 * 
 * Standard action space supported by the deterministic simulation engine.
 * Consumed by both human players and AI agents (System A / System B).
 */

import { MachineType, OverlayType } from '../types';

export type AgentAction =
  | {
      type: 'PLACE';
      machineType: MachineType;
      x: number;
      y: number;
      orientation?: number;     // 0-359 yaw or tilt
    }
  | {
      type: 'REMOVE';
      x: number;
      y: number;
    }
  | {
      type: 'REINFORCE';
      x: number;
      y: number;
      overlayType: OverlayType;
    }
  | {
      type: 'PLACE_CABLE';
      path: Array<{ x: number; y: number }>;
    }
  | {
      type: 'SET_ORIENTATION';
      x: number;
      y: number;
      orientation: number;
    }
  | {
      type: 'ADVANCE_TIME';
      ticks: number;
    }
  | {
      type: 'QUERY_PREDICTION';
      x: number;
      y: number;
      machineType: MachineType;
      counterfactualCondition?: {
        windSpeed?: number;
        windDirection?: number;
        rainIntensity?: number;
        sunElevation?: number;
      };
    };
