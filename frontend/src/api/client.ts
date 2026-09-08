/**
 * Client for the Python WorldForge engine.
 *
 * The physics, market and finance all live in Python. This front-end is a
 * viewer: it renders state the engine produces and posts actions back. There is
 * deliberately no simulation in this app any more -- two implementations of the
 * same rules drift, and the previous local engine had drifted badly (turbine
 * orientation never reached the power calculation, transmission loss used
 * straight-line distance rather than the cable path, hydraulic head came from a
 * cell's x-coordinate).
 */

import type { CellState, DemandZone, EconomyState, GlobalEnvironment,
              SimulationTime, MachineType, OverlayType } from '../sim/types';
import type { SimulationEvent } from '../sim/contracts/SimulationEvent';

export const API_BASE =
  (import.meta as any).env?.VITE_API_BASE ?? 'http://127.0.0.1:8000';

export interface RemoteWorld {
  seed: number;
  width: number;
  height: number;
  grid: CellState[][];
  time: SimulationTime;
  globalEnv: GlobalEnvironment;
  demandZones: DemandZone[];
  economy: EconomyState & {
    equityValue: number; enterpriseValue: number; debt: number;
    leverage: number; wacc: number; lcoe: number;
    capacityFactor: number; installedCapacityKw: number;
    debtHeadroom: number; covenantBreaches: number; hedgedFraction: number;
  };
  market: {
    price: number; priceHistory24h: number[]; carbonPrice: number;
    ppaStrike: number; capex: Record<string, number>;
  };
  lastTick: {
    generatedKw: number; deliveredKw: number; curtailedKw: number;
    lossKw: number; unconnectedKw: number; reliability: number;
    revenue: number; events: string[];
  } | null;
  clouds: never[];
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

/** Front-end machine names -> engine kinds. */
const KIND: Record<MachineType, string> = {
  LandSolar: 'land_solar',
  FloatSolar: 'floating_solar',
  WindTurbine: 'wind',
  HydroTurbine: 'hydro',
  Cable: 'cable',
};

const OVERLAY: Partial<Record<OverlayType, string>> = {
  Gravel: 'gravel',
  Stone: 'stone',
};

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${init?.method ?? 'GET'} ${path} -> ${res.status} ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export async function health(): Promise<{ ok: boolean; sessions: number }> {
  return req('/health');
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

export async function fetchWorld(sessionId: string): Promise<RemoteWorld> {
  return req(`/sessions/${sessionId}/world`);
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
  const q = new URLSearchParams({ kind: KIND[machineType], x: String(x), y: String(y) });
  return req(`/sessions/${sessionId}/can_place?${q}`);
}

export async function place(
  sessionId: string, machineType: MachineType, x: number, y: number,
  orientation?: number, debtFraction = 0,
): Promise<ActionResult> {
  return sendAction(sessionId, {
    type: 'PLACE', kind: KIND[machineType], x, y,
    ...(orientation === undefined ? {} : { orientation }),
    debt_fraction: debtFraction,
  });
}

export async function placeCable(
  sessionId: string, path: Array<{ x: number; y: number }>, debtFraction = 0,
): Promise<ActionResult> {
  return sendAction(sessionId, {
    type: 'PLACE_CABLE',
    path: path.map((p) => [p.x, p.y]),
    debt_fraction: debtFraction,
  });
}

export async function setOrientation(
  sessionId: string, x: number, y: number, orientation: number, tilt?: number,
): Promise<ActionResult> {
  return sendAction(sessionId, {
    type: 'SET_ORIENTATION', x, y, orientation,
    ...(tilt === undefined ? {} : { tilt }),
  });
}

export async function reinforce(
  sessionId: string, x: number, y: number, overlay: OverlayType,
): Promise<ActionResult> {
  const mapped = OVERLAY[overlay];
  if (!mapped) {
    return { ok: false, action: 'REINFORCE', cost: 0, data: {},
             message: `overlay ${overlay} is not a reinforcement layer; use Gravel or Stone` };
  }
  return sendAction(sessionId, { type: 'REINFORCE', x, y, overlay: mapped });
}

export async function remove(
  sessionId: string, x: number, y: number,
): Promise<ActionResult> {
  return sendAction(sessionId, { type: 'REMOVE', x, y });
}

export async function signPpa(
  sessionId: string, fraction: number,
): Promise<ActionResult> {
  return sendAction(sessionId, { type: 'SIGN_PPA', fraction });
}

export async function predict(
  sessionId: string, machineType: MachineType, x: number, y: number,
): Promise<ActionResult> {
  return sendAction(sessionId, { type: 'QUERY_PREDICTION', kind: KIND[machineType], x, y });
}

export interface PlacementMasks {
  width: number;
  height: number;
  masks: Record<string, boolean[][]>;
}

/** Validity masks straight from the engine, so the UI cannot disagree with it. */
export async function fetchPlaceable(sessionId: string): Promise<PlacementMasks> {
  return req(`/sessions/${sessionId}/placeable`);
}

export async function fetchScore(sessionId: string): Promise<Record<string, unknown>> {
  return req(`/sessions/${sessionId}/score`);
}

async function sendAction(
  sessionId: string, action: Record<string, unknown>,
): Promise<ActionResult> {
  return req(`/sessions/${sessionId}/actions`, {
    method: 'POST',
    body: JSON.stringify({ action }),
  });
}
