/**
 * Drop-in replacement for the old local SimulationEngine, backed by the Python
 * engine over HTTP.
 *
 * The shape mirrors the class it replaces so the UI needed only to await calls
 * that used to be synchronous. Everything physical happens server-side; this
 * object is a cache of the last state the server returned plus a way to post
 * actions at it.
 */

import type { AgentAction } from '../sim/contracts/AgentAction';
import type { SimulationEvent } from '../sim/contracts/SimulationEvent';
import type { CellState } from '../sim/types';
import * as api from './client';
import type { ActionResult, RemoteWorld } from './client';

export interface RemoteStepResult {
  state: RemoteWorld;
  events: SimulationEvent[];
  actionResult?: ActionResult;
}

export class RemoteSimulationEngine {
  private sessionId: string | null = null;
  private world: RemoteWorld | null = null;
  private lastAction: ActionResult | null = null;

  /** Create a world on the server and pull its first state. */
  async init(seed: number, opts?: { width?: number; height?: number }): Promise<RemoteWorld> {
    const s = await api.createSession(seed, opts);
    this.sessionId = s.sessionId;
    this.world = await api.fetchWorld(s.sessionId);
    return this.world;
  }

  get id(): string | null {
    return this.sessionId;
  }

  get ready(): boolean {
    return this.sessionId !== null && this.world !== null;
  }

  /** Last state the server returned. Synchronous, for render paths. */
  getSimulationState(): RemoteWorld | null {
    return this.world;
  }

  getState(): RemoteWorld | null {
    return this.world;
  }

  getLastActionResult(): ActionResult | null {
    return this.lastAction;
  }

  async resetEnvironment(seed: number): Promise<RemoteWorld> {
    return this.init(seed);
  }

  /**
   * Apply an optional action, then advance one tick -- matching the old
   * engine's `step(action?)` contract. ADVANCE_TIME advances without acting.
   */
  async step(action?: AgentAction, ticks = 1): Promise<RemoteStepResult> {
    const sid = this.requireSession();
    this.lastAction = null;

    if (action) {
      this.lastAction = await this.dispatch(sid, action);
      if (action.type === 'ADVANCE_TIME') {
        this.world = await api.fetchWorld(sid);
        return { state: this.world, events: this.world.events, actionResult: this.lastAction ?? undefined };
      }
    }

    await api.advance(sid, ticks);
    this.world = await api.fetchWorld(sid);
    return { state: this.world, events: this.world.events, actionResult: this.lastAction ?? undefined };
  }

  /** Apply an action without advancing time. */
  async executeAction(action: AgentAction): Promise<ActionResult> {
    const sid = this.requireSession();
    this.lastAction = await this.dispatch(sid, action);
    this.world = await api.fetchWorld(sid);
    return this.lastAction;
  }

  /** Advance without acting. */
  async advance(ticks: number): Promise<RemoteWorld> {
    const sid = this.requireSession();
    await api.advance(sid, ticks);
    this.world = await api.fetchWorld(sid);
    return this.world;
  }

  async refresh(): Promise<RemoteWorld> {
    const sid = this.requireSession();
    this.world = await api.fetchWorld(sid);
    return this.world;
  }

  async validateAction(
    action: Extract<AgentAction, { type: 'PLACE' }>,
  ): Promise<{ valid: boolean; reason: string }> {
    const sid = this.requireSession();
    return api.canPlace(sid, action.machineType, action.x, action.y);
  }

  async placementMasks(): Promise<api.PlacementMasks> {
    return api.fetchPlaceable(this.requireSession());
  }

  async score(): Promise<Record<string, unknown>> {
    return api.fetchScore(this.requireSession());
  }

  cellAt(x: number, y: number): CellState | null {
    if (!this.world) return null;
    return this.world.grid[y]?.[x] ?? null;
  }

  private requireSession(): string {
    if (!this.sessionId) {
      throw new Error('engine not initialised - call init(seed) first');
    }
    return this.sessionId;
  }

  private async dispatch(sid: string, action: AgentAction): Promise<ActionResult> {
    switch (action.type) {
      case 'PLACE':
        return api.place(sid, action.machineType, action.x, action.y, action.orientation);
      case 'PLACE_CABLE':
        return api.placeCable(sid, action.path);
      case 'SET_ORIENTATION':
        return api.setOrientation(sid, action.x, action.y, action.orientation);
      case 'REINFORCE':
        return api.reinforce(sid, action.x, action.y, action.overlayType);
      case 'REMOVE':
        return api.remove(sid, action.x, action.y);
      case 'QUERY_PREDICTION':
        return api.predict(sid, action.machineType, action.x, action.y);
      case 'ADVANCE_TIME':
        await api.advance(sid, action.ticks);
        return { ok: true, action: 'ADVANCE_TIME', cost: 0, data: {},
                 message: `advanced ${action.ticks} tick(s)` };
      default: {
        const exhaustive: never = action;
        return { ok: false, action: 'UNKNOWN', cost: 0, data: {},
                 message: `unsupported action ${JSON.stringify(exhaustive)}` };
      }
    }
  }
}
