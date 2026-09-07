/**
 * Shared Contract: WorldState
 * Section 25 of energy-ecosystem-spec.md
 * 
 * Master representation of the entire simulated world at any given tick.
 * Completely deterministic and serializable.
 */

import { CellState, CloudEntity, DemandZone, EconomyState, GlobalEnvironment, SimulationTime } from '../types.ts';
import { SimulationEvent } from './SimulationEvent.ts';

export interface PlayerStateContract {
  player_id?: number;
  id?: number;
  coins: number;
}

export interface WorldState {
  time: SimulationTime;
  seed: number;
  width: number;
  height: number;
  grid: CellState[][];
  clouds: CloudEntity[];
  demandZones: DemandZone[];
  globalEnv: GlobalEnvironment;
  economy: EconomyState;
  events: SimulationEvent[];
  stateHash: string;            // Deterministic verification hash of current tick
  player?: PlayerStateContract;
  players?: PlayerStateContract[];
  totalDeliveredPower?: number;
  totalGeneratedPower?: number;
}
