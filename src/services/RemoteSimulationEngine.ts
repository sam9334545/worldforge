/**
 * Remote Simulation Engine
 * Authoritative remote client for Python WorldForge benchmark backend.
 * Replaces client-side physics simulation by dispatching all physics,
 * environment, hydrology, market, and finance calculations to FastAPI.
 */

import type { AgentAction } from '../sim/contracts/AgentAction.ts';
import type { SimulationEvent } from '../sim/contracts/SimulationEvent.ts';
import type { CellState, MachineType, OverlayType } from '../sim/types.ts';
import * as api from './api.ts';
import type { ActionResult, PlacementMasks, RemoteWorld } from './api.ts';

export interface RemoteStepResult {
  state: RemoteWorld;
  events: SimulationEvent[];
  actionResult?: ActionResult;
  validationResult?: { valid: boolean; reason?: string; errorReason?: string };
}

export class RemoteSimulationEngine {
  private sessionId: string | null = null;
  private world: RemoteWorld | null = null;
  private lastAction: ActionResult | null = null;
  public requireGridConnection = false;

  /** Create a world on the server and pull its first state. */
  async init(
    seed: number,
    opts?: { width?: number; height?: number; horizonYears?: number },
  ): Promise<RemoteWorld> {
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

  setRequireGridConnection(val: boolean): void {
    this.requireGridConnection = val;
  }

  /** Last state returned by the authoritative server. */
  getSimulationState(): RemoteWorld | null {
    return this.world;
  }

  getState(): RemoteWorld | null {
    return this.world;
  }

  getLastActionResult(): ActionResult | null {
    return this.lastAction;
  }

  async resetEnvironment(seed: number, opts?: { width?: number; height?: number }): Promise<RemoteWorld> {
    return this.init(seed, opts);
  }

  /**
   * Apply an optional action, then advance ticks.
   */
  async step(action?: AgentAction, ticks = 1): Promise<RemoteStepResult> {
    const sid = this.requireSession();
    this.lastAction = null;
    let validationResult: { valid: boolean; reason?: string; errorReason?: string } | undefined;

    if (action) {
      this.lastAction = await this.dispatch(sid, action);
      if (!this.lastAction.ok) {
        validationResult = {
          valid: false,
          reason: this.lastAction.message,
          errorReason: this.lastAction.message,
        };
      }
      if (action.type === 'ADVANCE_TIME') {
        this.world = await api.fetchWorld(sid);
        return {
          state: this.world,
          events: this.world.events,
          actionResult: this.lastAction,
          validationResult,
        };
      }
    }

    if (ticks > 0) {
      await api.advance(sid, ticks);
    }
    this.world = await api.fetchWorld(sid);
    return {
      state: this.world,
      events: this.world.events,
      actionResult: this.lastAction ?? undefined,
      validationResult,
    };
  }

  /** Apply an action without advancing time. */
  async executeAction(action: AgentAction): Promise<RemoteStepResult> {
    const sid = this.requireSession();
    this.lastAction = await this.dispatch(sid, action);
    this.world = await api.fetchWorld(sid);
    return {
      state: this.world,
      events: this.world.events,
      actionResult: this.lastAction,
      validationResult: this.lastAction.ok
        ? { valid: true }
        : { valid: false, reason: this.lastAction.message, errorReason: this.lastAction.message },
    };
  }

  /** Advance simulation clock by given number of ticks. */
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

  async validatePlacement(
    machineType: MachineType,
    x: number,
    y: number,
  ): Promise<{ valid: boolean; reason: string }> {
    const sid = this.requireSession();
    return api.canPlace(sid, machineType, x, y);
  }

  async placementMasks(): Promise<PlacementMasks> {
    return api.fetchPlaceable(this.requireSession());
  }

  async score(): Promise<Record<string, unknown>> {
    return api.fetchScore(this.requireSession());
  }

  cellAt(x: number, y: number): CellState | null {
    if (!this.world) return null;
    return this.world.grid[y]?.[x] ?? null;
  }

  dismissEvent(eventId: string): void {
    if (this.world?.events) {
      this.world.events = this.world.events.filter((e) => e.id !== eventId);
    }
  }

  private requireSession(): string {
    if (!this.sessionId) {
      throw new Error('Remote engine not initialized. Call init(seed) first.');
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
        return api.reinforce(sid, action.x, action.y, action.overlayType as OverlayType);
      case 'REMOVE':
        return api.remove(sid, action.x, action.y);
      case 'QUERY_PREDICTION':
        return api.predict(sid, action.machineType, action.x, action.y);
      case 'ADVANCE_TIME':
        await api.advance(sid, action.ticks);
        return {
          ok: true,
          action: 'ADVANCE_TIME',
          cost: 0,
          data: {},
          message: `Advanced ${action.ticks} tick(s)`,
        };
      default: {
        const exhaustive: never = action;
        return {
          ok: false,
          action: 'UNKNOWN',
          cost: 0,
          data: {},
          message: `Unsupported action ${JSON.stringify(exhaustive)}`,
        };
      }
    }
  }
}
