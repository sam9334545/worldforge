/**
 * API Service for WorldForge Engine & Benchmark Backend
 * Communicates with the FastAPI backend (default http://localhost:8000)
 */

import type {
  CellState,
  DemandZone,
  EconomyState,
  GlobalEnvironment,
  MachineType,
  OverlayType,
  SimulationTime,
} from '../sim/types.ts';
import type { SimulationEvent } from '../sim/contracts/SimulationEvent.ts';

// Configurable API base URL defaulting to http://localhost:8000
export const API_BASE: string =
  (import.meta as any).env?.VITE_API_URL ??
  (import.meta as any).env?.VITE_API_BASE ??
  'http://localhost:8000';

// ---------------------------------------------------------------------------
// World & Simulation Interfaces
// ---------------------------------------------------------------------------

export interface RemoteWorld {
  seed: number;
  width: number;
  height: number;
  grid: CellState[][];
  time: SimulationTime;
  globalEnv: GlobalEnvironment;
  demandZones: DemandZone[];
  economy: EconomyState & {
    equityValue: number;
    enterpriseValue: number;
    debt: number;
    leverage: number;
    wacc: number;
    lcoe: number;
    capacityFactor: number;
    installedCapacityKw: number;
    debtHeadroom: number;
    covenantBreaches: number;
    hedgedFraction: number;
  };
  market: {
    price: number;
    priceHistory24h: number[];
    carbonPrice: number;
    ppaStrike: number;
    capex: Record<string, number>;
  };
  lastTick: {
    generatedKw: number;
    deliveredKw: number;
    curtailedKw: number;
    lossKw: number;
    unconnectedKw: number;
    reliability: number;
    revenue: number;
    events: string[];
  } | null;
  clouds: any[];
  events: SimulationEvent[];
  terminated: boolean;
  terminationReason: string;
  stateHash: string;
}

export interface ActionResult {
  ok: boolean;
  action: string;
  message: string;
  cost: number;
  data: Record<string, unknown>;
}

export interface PlacementMasks {
  width: number;
  height: number;
  masks: Record<string, boolean[][]>;
}

// ---------------------------------------------------------------------------
// Benchmark Interfaces
// ---------------------------------------------------------------------------

export interface BenchmarkRunRequest {
  seed: number;
  agent_type: 'donothing' | 'random' | 'lookup' | 'heuristic' | string;
  max_steps: number;
  decision_interval?: number;
  include_step_logs?: boolean;
  max_log_entries?: number;
}

export interface ActionLog {
  ok: boolean;
  action: string;
  message: string;
  cost: number;
}

export interface StepPerformanceLog {
  tick: number;
  step: number;
  actions_taken: number;
  action_results: ActionLog[];
  generated_kw: number;
  delivered_kw: number;
  curtailed_kw: number;
  loss_kw: number;
  price: number;
  cash: number;
  equity_value: number;
  reliability: number;
  events: string[];
}

export interface TransmissionEfficiency {
  mwh_generated: number;
  mwh_delivered: number;
  mwh_curtailed: number;
  transmission_loss_mwh: number;
  delivery_efficiency: number;
  loss_rate: number;
  curtailment_rate: number;
}

export interface ScoringMetrics {
  score: number;
  terminal_equity: number;
  starting_equity: number;
  total_return: number;
  cash: number;
  debt: number;
  enterprise_value: number;
  roic: number;
  lcoe: number;
  capacity_factor: number;
  installed_capacity_kw: number;
  mean_reliability: number;
  reliability_std: number;
  curtailment_rate: number;
  max_drawdown: number;
  covenant_breaches: number;
  insolvent: boolean;
  placements_valid: number;
  placements_attempted: number;
  placement_efficiency: number;
  machines_built: number;
  cable_cells: number;
  components: Record<string, number>;
  weights: Record<string, number>;
}

export interface PerformanceLogs {
  total_ticks: number;
  sim_years: number;
  wall_time_seconds: number;
  terminated: boolean;
  termination_reason: string;
  summary_report: string;
  step_logs: StepPerformanceLog[];
}

export interface BenchmarkRunResponse {
  seed: number;
  seed_category: 'training' | 'held_out' | 'custom' | string;
  agent_type: string;
  max_steps: number;
  scoring_metrics: ScoringMetrics;
  transmission_efficiency: TransmissionEfficiency;
  performance_logs: PerformanceLogs;
}

export interface SuiteRunRequest {
  agent_types?: string[];
  seeds?: number[];
  horizon_years?: number;
}

// Machine & overlay mapping
const KIND: Record<MachineType, string> = {
  LandSolar: 'land_solar',
  FloatSolar: 'floating_solar',
  WindTurbine: 'wind',
  HydroTurbine: 'hydro',
  Cable: 'cable',
  Conduit: 'cable',
};

const OVERLAY: Partial<Record<OverlayType, string>> = {
  Gravel: 'gravel',
  Stone: 'stone',
};

// ---------------------------------------------------------------------------
// HTTP Request Helper
// ---------------------------------------------------------------------------

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${init?.method ?? 'GET'} ${path} -> ${res.status} ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Session & World API Methods
// ---------------------------------------------------------------------------

export async function health(): Promise<{ ok: boolean; sessions?: number; status?: string }> {
  try {
    return await req('/health');
  } catch {
    return req('/api/health');
  }
}

export async function createSession(
  seed: number,
  opts: { width?: number; height?: number; horizonYears?: number } = {},
): Promise<{ sessionId: string; seed: number; width: number; height: number }> {
  return req('/sessions', {
    method: 'POST',
    body: JSON.stringify({
      seed,
      width: opts.width ?? null,
      height: opts.height ?? null,
      horizon_years: opts.horizonYears ?? null,
    }),
  });
}

export async function listSessions(): Promise<{ sessions: string[] }> {
  return req('/sessions');
}

export async function deleteSession(sessionId: string): Promise<{ deleted: boolean }> {
  return req(`/sessions/${sessionId}`, { method: 'DELETE' });
}

export async function fetchTerrain(sessionId: string): Promise<{
  width: number;
  height: number;
  grid: any[][];
  elevation: number[][];
}> {
  return req(`/sessions/${sessionId}/terrain`);
}

export async function fetchWorld(sessionId: string, includeTerrain = true): Promise<RemoteWorld> {
  return req(`/sessions/${sessionId}/world?include_terrain=${includeTerrain}`);
}

export async function fetchMap(sessionId: string): Promise<{ map: string }> {
  return req(`/sessions/${sessionId}/map`);
}

export async function advance(
  sessionId: string,
  ticks = 1,
): Promise<{ ticks: number; tick: number; terminated: boolean; events: string[] }> {
  return req(`/sessions/${sessionId}/advance`, {
    method: 'POST',
    body: JSON.stringify({ ticks }),
  });
}

export async function canPlace(
  sessionId: string,
  machineType: MachineType,
  x: number,
  y: number,
): Promise<{ valid: boolean; reason: string }> {
  const kind = KIND[machineType] || machineType.toLowerCase();
  const q = new URLSearchParams({ kind, x: String(x), y: String(y) });
  return req(`/sessions/${sessionId}/can_place?${q}`);
}

export async function sendAction(
  sessionId: string,
  action: Record<string, unknown>,
): Promise<ActionResult> {
  return req(`/sessions/${sessionId}/actions`, {
    method: 'POST',
    body: JSON.stringify({ action }),
  });
}

export async function place(
  sessionId: string,
  machineType: MachineType,
  x: number,
  y: number,
  orientation?: number,
  debtFraction = 0,
): Promise<ActionResult> {
  const kind = KIND[machineType] || machineType.toLowerCase();
  return sendAction(sessionId, {
    type: 'PLACE',
    kind,
    x,
    y,
    ...(orientation === undefined ? {} : { orientation }),
    debt_fraction: debtFraction,
  });
}

export async function placeCable(
  sessionId: string,
  path: Array<{ x: number; y: number }>,
  debtFraction = 0,
): Promise<ActionResult> {
  return sendAction(sessionId, {
    type: 'PLACE_CABLE',
    path: path.map((p) => [p.x, p.y]),
    debt_fraction: debtFraction,
  });
}

export async function setOrientation(
  sessionId: string,
  x: number,
  y: number,
  orientation: number,
  tilt?: number,
): Promise<ActionResult> {
  return sendAction(sessionId, {
    type: 'SET_ORIENTATION',
    x,
    y,
    orientation,
    ...(tilt === undefined ? {} : { tilt }),
  });
}

export async function reinforce(
  sessionId: string,
  x: number,
  y: number,
  overlay: OverlayType,
): Promise<ActionResult> {
  const mapped = OVERLAY[overlay];
  if (!mapped) {
    return {
      ok: false,
      action: 'REINFORCE',
      cost: 0,
      data: {},
      message: `Overlay ${overlay} is not a reinforcement layer (use Gravel or Stone)`,
    };
  }
  return sendAction(sessionId, { type: 'REINFORCE', x, y, overlay: mapped });
}

export async function remove(
  sessionId: string,
  x: number,
  y: number,
): Promise<ActionResult> {
  return sendAction(sessionId, { type: 'REMOVE', x, y });
}

export async function signPpa(
  sessionId: string,
  fraction: number,
): Promise<ActionResult> {
  return sendAction(sessionId, { type: 'SIGN_PPA', fraction });
}

export async function predict(
  sessionId: string,
  machineType: MachineType,
  x: number,
  y: number,
): Promise<ActionResult> {
  const kind = KIND[machineType] || machineType.toLowerCase();
  return sendAction(sessionId, { type: 'QUERY_PREDICTION', kind, x, y });
}

export async function fetchPlaceable(sessionId: string): Promise<PlacementMasks> {
  return req(`/sessions/${sessionId}/placeable`);
}

export async function fetchScore(sessionId: string): Promise<Record<string, unknown>> {
  return req(`/sessions/${sessionId}/score`);
}

// ---------------------------------------------------------------------------
// Scientific Benchmark API Methods
// ---------------------------------------------------------------------------

export async function listBenchmarkAgents(): Promise<{
  available_agents: string[];
  descriptions: Record<string, string>;
}> {
  try {
    return await req('/api/benchmark/agents');
  } catch {
    return req('/benchmark/agents');
  }
}

export async function listBenchmarkSeeds(): Promise<{
  training_seeds: number[];
  held_out_seeds: number[];
  description: string;
}> {
  try {
    return await req('/api/benchmark/seeds');
  } catch {
    return req('/benchmark/seeds');
  }
}

export async function runBenchmark(
  params: BenchmarkRunRequest,
): Promise<BenchmarkRunResponse> {
  try {
    return await req('/api/benchmark/run', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  } catch {
    return req('/benchmark/run', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }
}

export async function runBenchmarkSuite(
  params: SuiteRunRequest,
): Promise<{
  agents: string[];
  seeds: number[];
  horizon_years: number;
  aggregation: Record<string, any>;
  leaderboard: string;
  records_count: number;
}> {
  try {
    return await req('/api/benchmark/suite', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  } catch {
    return req('/benchmark/suite', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }
}

export async function evaluateGeneralizationGap(
  horizonYears = 0.25,
): Promise<{
  train_seeds: number[];
  held_out_seeds: number[];
  horizon_years: number;
  generalization_gap: Record<string, any>;
  train_aggregate: Record<string, any>;
  held_out_aggregate: Record<string, any>;
}> {
  try {
    return await req(`/api/benchmark/generalization-gap?horizon_years=${horizonYears}`);
  } catch {
    return req(`/benchmark/generalization-gap?horizon_years=${horizonYears}`);
  }
}
