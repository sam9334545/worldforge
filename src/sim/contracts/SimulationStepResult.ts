/**
 * Shared Contract: SimulationStepResult
 * Returned by engine.step(action)
 */

import { WorldState } from './WorldState';
import { AgentObservation } from './AgentObservation';
import { SimulationEvent } from './SimulationEvent';

export interface ValidationResult {
  valid: boolean;
  failedCheckIndex?: number;    // 1 to 8 (Section 15 sequence)
  reason?: string;              // Human-readable rejection reason
  firstFailingRule?: string;    // e.g. 'RULE-PLACE-003'
}

export interface PredictionQueryResult {
  x: number;
  y: number;
  machineType: string;
  expectedOutputKW: number;
  limitingFactor: string;
  causalFactors: {
    resourceAvailability: number;
    shadowOrObstructionLoss: number;
    attenuationLoss: number;
    orientationAlignment: number;
    headOrVelocityEfficiency: number;
  };
}

export interface SimulationStepResult {
  state: WorldState;
  observation: AgentObservation;
  events: SimulationEvent[];
  validationResult?: ValidationResult;
  predictionResult?: PredictionQueryResult;
}
