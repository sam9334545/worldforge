/**
 * Shared Contract: SimulationEvent
 * Sections 16, 22, 30 of energy-ecosystem-spec.md
 * 
 * RimWorld-inspired event notification model.
 * Each event is deterministic and links to affected world coordinates and causal explanations.
 */

export type SimulationEventType =
  | 'HEAVY_RAINFALL'
  | 'CLOUD_FORMATION'
  | 'SEASONAL_CHANGE'
  | 'RIVER_FLOW_SURGE'
  | 'SNOW_ACCUMULATION'
  | 'SNOWMELT_SURGE'
  | 'EXTREME_WIND'
  | 'TURBINE_SHUTDOWN'
  | 'MACHINE_DEGRADATION'
  | 'PLACEMENT_REJECTED'
  | 'DEMAND_SPIKE'
  | 'AI_PREDICTION_AVAILABLE'
  | 'MUD_TRANSFORMATION'
  | 'THERMAL_ANOMALY';

export type EventSeverity = 'info' | 'warning' | 'critical';

export interface SimulationEvent {
  id: string;
  tick: number;
  type: SimulationEventType;
  severity: EventSeverity;
  title: string;
  description: string;
  location?: { x: number; y: number };
  relevantLayer?: string;       // e.g. 'wind', 'hydro', 'solar', 'snow'
  causalTraceId?: string;
  metadata?: Record<string, unknown>;
}
