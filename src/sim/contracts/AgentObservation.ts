/**
 * Shared Contract: AgentObservation
 * Section 27 of energy-ecosystem-spec.md
 * 
 * Observation payload visible to an agent. Supports partial observability:
 * Cloud entities and environmental phenomena outside visibility radius are filtered out.
 */

import { CloudEntity, DemandZone, EconomyState, GlobalEnvironment, SimulationTime } from '../types';
import { CellState } from '../types';

export interface ObservableCell extends CellState {
  isVisible: boolean;
}

export interface AgentObservation {
  time: SimulationTime;
  visibilityRadius: number;     // Level-configurable (Section 27)
  grid: ObservableCell[][];
  clouds: CloudEntity[];        // Filtered within agent's field of view
  demandZones: DemandZone[];
  globalEnv: Partial<GlobalEnvironment>;
  economy: EconomyState;
  rawMetrics: {
    energyGeneratedKWh: number;
    reliabilityRatio: number;
    economicProfit: number;
    infrastructureEfficiency: number;
    placementEfficiency: number;
    predictionAccuracy: number;
    adaptationScore: number;
    generalizationScore: number;
    longTermPlanningScore: number;
    resourceEfficiency: number;
  };
}
