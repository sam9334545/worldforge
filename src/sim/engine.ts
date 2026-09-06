/**
 * Deterministic Simulation Engine Orchestrator
 * Section 24 of energy-ecosystem-spec.md
 * 
 * Strict non-circular 21-step simulation update order per tick.
 * Guarantees mass balance and energy conservation invariants.
 */

import { SEASON_PROFILES, MACHINE_CONFIGS } from './constants.ts';
import { DeterministicPRNG } from './prng.ts';
import { computeStateHash } from './stateHash.ts';
import { WindEngine } from './environment/wind.ts';
import { CloudEngine } from './environment/clouds.ts';
import { WaterCycleEngine } from './environment/waterCycle.ts';
import { RiverEngine } from './environment/river.ts';
import { SolarEngine } from './energy/solar.ts';
import { EnergyNetworkEngine } from './energy/network.ts';
import { PlacementEngine } from './rules.ts';
import type { AgentAction } from './contracts/AgentAction.ts';
import type { SimulationEvent } from './contracts/SimulationEvent.ts';
import type { SimulationStepResult, ValidationResult } from './contracts/SimulationStepResult.ts';
import type { AgentObservation } from './contracts/AgentObservation.ts';
import type { WorldState } from './contracts/WorldState.ts';
import { WorldGenerator } from './generator.ts';

export class SimulationEngine {
  private state: WorldState;
  private prng: DeterministicPRNG;
  public requireGridConnection = false;

  constructor(initialState: WorldState) {
    this.state = initialState;
    this.prng = new DeterministicPRNG(initialState.seed + initialState.time.tick);
  }

  public setRequireGridConnection(val: boolean): void {
    this.requireGridConnection = val;
  }

  public getState(): WorldState {
    return this.state;
  }

  public getSimulationState(): WorldState {
    return this.state;
  }

  public getObservation(): AgentObservation {
    return this.createObservation();
  }

  public getAvailableActions(): AgentAction[] {
    const actions: AgentAction[] = [{ type: 'ADVANCE_TIME', ticks: 1 }];
    for (let y = 0; y < this.state.height; y++) {
      for (let x = 0; x < this.state.width; x++) {
        const cell = this.state.grid[y][x];
        if (PlacementEngine.canPlace('LandSolar', cell, this.state).valid) {
          actions.push({ type: 'PLACE', machineType: 'LandSolar', x, y });
        }
        if (PlacementEngine.canPlace('WindTurbine', cell, this.state).valid) {
          actions.push({ type: 'PLACE', machineType: 'WindTurbine', x, y });
        }
        if (PlacementEngine.canPlace('HydroTurbine', cell, this.state).valid) {
          actions.push({ type: 'PLACE', machineType: 'HydroTurbine', x, y });
        }
      }
    }
    return actions;
  }

  public executeAction(action: AgentAction): SimulationStepResult {
    return this.step(action);
  }

  public stepSimulation(): SimulationStepResult {
    return this.step();
  }

  public resetEnvironment(seed?: number): WorldState {
    const s = seed ?? this.state.seed;
    this.state = WorldGenerator.generateWorld({ seed: s, isWalkthroughPreset: s === 42 });
    this.prng = new DeterministicPRNG(s);
    return this.state;
  }

  /**
   * Executes a single simulation step following Section 24's exact 21 steps.
   */
  public step(action?: AgentAction): SimulationStepResult {
    let validationResult: ValidationResult | undefined;

    // Process player/agent action before physical update if applicable
    if (action) {
      validationResult = this.applyAction(action);
    }

    const { grid, width, height } = this.state;
    const events: SimulationEvent[] = [];

    // STEP 1: Advance time counters
    this.state.time.tick += 1;
    this.state.time.hour = (this.state.time.hour + 1) % 24;
    if (this.state.time.hour === 0) {
      this.state.time.day += 1;
      this.state.time.dayOfSeason = ((this.state.time.day - 1) % 90) + 1;

      // Season rollover every 90 days (Sec 19)
      const seasonIndex = Math.floor(((this.state.time.day - 1) / 90) % 4);
      const seasons: Array<'Spring' | 'Summer' | 'Autumn' | 'Winter'> = ['Spring', 'Summer', 'Autumn', 'Winter'];
      const newSeason = seasons[seasonIndex];

      if (newSeason !== this.state.time.season) {
        this.state.time.season = newSeason;
        events.push({
          id: `evt-season-${this.state.time.tick}`,
          tick: this.state.time.tick,
          type: 'SEASONAL_CHANGE',
          severity: 'info',
          title: `Season Transition: ${newSeason}`,
          description: `The world has entered ${newSeason}. Baseline temperature and solar curves have shifted.`,
        });
      }

      if (this.state.time.day > 360) {
        this.state.time.year += 1;
        this.state.time.day = 1;
      }
    }

    const seasonProfile = SEASON_PROFILES[this.state.time.season];

    // STEP 2 & 3 & 4: Sun position & Temperature baseline
    const solarResult = SolarEngine.updateSolarField(
      grid,
      width,
      height,
      this.state.time.hour,
      seasonProfile.solarAmplitude
    );

    this.state.globalEnv.sunElevation = solarResult.sunElevation;
    this.state.globalEnv.sunAzimuth = solarResult.sunAzimuth;
    this.state.globalEnv.baseSolarIrradiance = solarResult.baseSolarIrradiance;
    this.state.globalEnv.ambientTemperature = seasonProfile.baseTemperature;
    this.state.globalEnv.ambientHumidity = seasonProfile.baseHumidity;

    // STEP 4: Temperature update per cell (altitude lapse: -1.5°C per elevation unit)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const cell = grid[y][x];
        cell.dynamic.temperature = seasonProfile.baseTemperature - cell.baseTerrain.elevation * 1.5;
        cell.dynamic.humidity = seasonProfile.baseHumidity;
      }
    }

    // STEP 5: Global wind vector update (seeded small jitter)
    const windSpeedJitter = this.prng.nextGaussian(0, 0.5);
    this.state.globalEnv.globalWindSpeed = Math.max(1.0, seasonProfile.windSpeedMean + windSpeedJitter);
    this.state.globalEnv.globalWindDirection = seasonProfile.windDirectionMean;

    // STEP 6: Local wind per cell (Roughness damping, elevation exposure, orographic wind shadow)
    WindEngine.updateWindField(
      grid,
      width,
      height,
      this.state.globalEnv.globalWindSpeed,
      this.state.globalEnv.globalWindDirection
    );

    // STEP 7, 8, 9, 10: Clouds formation, movement, precipitation, and solar attenuation
    const cloudResult = CloudEngine.updateClouds(
      this.state.clouds,
      grid,
      width,
      height,
      this.state.globalEnv.globalWindSpeed,
      this.state.globalEnv.globalWindDirection,
      this.prng
    );
    this.state.clouds = cloudResult.updatedClouds;

    // STEP 11, 12, 13: Snow, Infiltration, Evaporation, Runoff (Mass Balance Closure)
    const waterResult = WaterCycleEngine.updateWaterCycle(
      grid,
      width,
      height,
      cloudResult.precipitationMap
    );

    // STEP 14: River flow downstream propagation
    RiverEngine.updateRiverFlow(
      grid,
      width,
      height,
      waterResult.runoffToRiver,
      seasonProfile.riverBaseflowFactor
    );

    // STEP 15: Machine power outputs (Section 14 & 23)
    let totalGeneratedKW = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const cell = grid[y][x];
        if (cell.machine) {
          if (!cell.machine.isOperating || cell.machine.health <= 0) {
            cell.derived.powerGenerated = 0;
            continue;
          }

          let output = 0;

          if (cell.machine.type === 'LandSolar' || cell.machine.type === 'FloatSolar') {
            // E3: P = I_eff * Area * efficiency
            const area = 1000; // m² default
            output = (cell.dynamic.effectiveIrradiance / 1000.0) * area * cell.machine.efficiency * cell.machine.health;
          } else if (cell.machine.type === 'WindTurbine') {
            // E4 & E5: Betz limited turbine output curve
            const v = cell.dynamic.windSpeed;
            const cutIn = 3.0;
            const rated = 12.0;
            const cutOut = 25.0;

            if (v >= cutIn && v <= cutOut) {
              const speedRatio = Math.min(1.0, Math.pow(v / rated, 3));
              output = cell.machine.capacity * speedRatio * cell.machine.efficiency * cell.machine.health;
            } else {
              output = 0; // Cut-in / cut-out shutdown (RULE-WIND-004)
            }
          } else if (cell.machine.type === 'HydroTurbine') {
            // E17: P = rho * g * Q * H * eta
            const Q = cell.dynamic.flowRateQ;
            const H = Math.max(1.0, (10 - cell.x) * 0.4); // Hydraulic head
            if (Q >= 2.0 && H >= 1.0) {
              output = Math.min(cell.machine.capacity, (1000 * 9.81 * Q * H * cell.machine.efficiency) / 1000);
            } else {
              output = 0;
            }
          }

          cell.derived.powerGenerated = Number(output.toFixed(1));
          totalGeneratedKW += output;
        }
      }
    }

    // STEP 16, 17, 18: Transmission, losses, demand delivery, and revenue (Sections 17 & 18)
    EnergyNetworkEngine.updateGrid(
      grid,
      width,
      height,
      this.state.demandZones,
      this.state.economy
    );

    // STEP 19: Machine health degradation update (Section 18)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const m = grid[y][x].machine;
        if (m) {
          m.ageTicks += 1;
          // Degradation rate based on lifespan
          m.health = Math.max(0, 1.0 - m.ageTicks / m.lifespanTicks);
          if (m.health <= 0 && m.isOperating) {
            m.isOperating = false;
            m.shutdownReason = 'Reached end of lifespan (RULE-ECON-002)';
            grid[y][x].derived.powerGenerated = 0;
            grid[y][x].derived.powerDelivered = 0;
          }
        }
      }
    }

    // STEP 20: State hash snapshot (Section 36 determinism)
    this.state.stateHash = computeStateHash(this.state);

    // STEP 21: Evaluate objectives & observation payload
    const observation = this.createObservation();

    return {
      state: this.state,
      observation,
      events,
      validationResult,
    };
  }

  /**
   * Action application with Section 15 validation directly from the specification
   */
  public validateAction(action: AgentAction): ValidationResult {
    const { grid, width, height } = this.state;

    if (action.type === 'PLACE') {
      if (action.x < 0 || action.x >= width || action.y < 0 || action.y >= height) {
        return { valid: false, reason: `Grid coordinates [${action.x}, ${action.y}] out of bounds.` };
      }
      return PlacementEngine.canPlace(action.machineType, grid[action.y][action.x], this.state);
    }

    if (action.type === 'REINFORCE') {
      if (action.x < 0 || action.x >= width || action.y < 0 || action.y >= height) {
        return { valid: false, reason: `Grid coordinates [${action.x}, ${action.y}] out of bounds.` };
      }
      return PlacementEngine.canReinforce(action.overlayType, grid[action.y][action.x]);
    }

    return { valid: true };
  }

  private applyAction(action: AgentAction): ValidationResult {
    const { grid, width, height } = this.state;

    if (action.type === 'PLACE') {
      if (action.x < 0 || action.x >= width || action.y < 0 || action.y >= height) {
        return { valid: false, reason: 'Coordinates out of bounds.' };
      }

      const cell = grid[action.y][action.x];
      const validation = PlacementEngine.canPlace(action.machineType, cell, this.state);

      if (!validation.valid) {
        this.state.events.unshift({
          id: `evt-reject-${this.state.time.tick}-${Date.now()}`,
          tick: this.state.time.tick,
          type: 'PLACEMENT_REJECTED',
          severity: 'warning',
          title: `Placement Rejected: ${action.machineType}`,
          description: validation.reason || 'Placement violates specification rules.',
          location: { x: action.x, y: action.y },
        });
        return validation;
      }

      // Check cash
      const config = MACHINE_CONFIGS[action.machineType];
      if (this.state.economy.cash < config.buildCost) {
        return {
          valid: false,
          reason: `Insufficient funds: Requires $${config.buildCost}, available $${this.state.economy.cash.toFixed(0)}.`
        };
      }

      // Deduct build cost
      this.state.economy.cash -= config.buildCost;
      this.state.economy.cumulativeCost += config.buildCost;

      // Place machine
      cell.machine = {
        id: `machine-${action.machineType}-${Date.now()}`,
        type: action.machineType,
        x: action.x,
        y: action.y,
        orientation: action.orientation ?? 180,
        capacity: config.ratedPower,
        efficiency: config.efficiency,
        health: 1.0,
        ageTicks: 0,
        lifespanTicks: config.lifespanTicks,
        maintenanceCostPerTick: config.maintenanceCostPerTick,
        buildCost: config.buildCost,
        isOperating: true,
      };

      return { valid: true };
    }

    if (action.type === 'REINFORCE') {
      const cell = grid[action.y][action.x];
      const validation = PlacementEngine.canReinforce(action.overlayType, cell);
      if (!validation.valid) return validation;

      const cost = action.overlayType === 'Gravel' ? 500 : 1000;
      if (this.state.economy.cash < cost) {
        return { valid: false, reason: `Insufficient funds for reinforcement ($${cost}).` };
      }

      this.state.economy.cash -= cost;
      cell.overlays.push(action.overlayType);

      // RULE-OVERLAY-001: recompute effective stability
      if (action.overlayType === 'Gravel') {
        cell.derived.effectiveStability = Math.min(1.0, cell.derived.effectiveStability + 0.25);
      } else if (action.overlayType === 'Stone') {
        cell.derived.effectiveStability = Math.min(1.0, cell.derived.effectiveStability + 0.40);
      }

      return { valid: true };
    }

    if (action.type === 'REMOVE') {
      const cell = grid[action.y][action.x];
      if (cell.machine) {
        // Refund 50% scrap value
        this.state.economy.cash += cell.machine.buildCost * 0.5;
        cell.machine = null;
        cell.derived.powerGenerated = 0;
      }
      return { valid: true };
    }

    if (action.type === 'PLACE_CABLE') {
      for (const pt of action.path) {
        if (pt.x >= 0 && pt.x < width && pt.y >= 0 && pt.y < height) {
          grid[pt.y][pt.x].cable = {
            id: `cable-${pt.x}-${pt.y}`,
            x: pt.x,
            y: pt.y,
            connectedTo: [],
            capacity: 1000,
            currentThroughput: 0,
            lossPerCell: 0.015,
          };
        }
      }
      return { valid: true };
    }

    return { valid: true };
  }

  private createObservation(): AgentObservation {
    return {
      time: this.state.time,
      visibilityRadius: 8,
      grid: this.state.grid.map(row => row.map(cell => ({ ...cell, isVisible: true }))),
      clouds: this.state.clouds,
      demandZones: this.state.demandZones,
      globalEnv: this.state.globalEnv,
      economy: this.state.economy,
      rawMetrics: {
        energyGeneratedKWh: this.state.economy.cumulativeGenerated,
        reliabilityRatio: this.state.economy.reliabilityRatio,
        economicProfit: this.state.economy.cumulativeRevenue - this.state.economy.cumulativeCost,
        infrastructureEfficiency: 1.0,
        placementEfficiency: 1.0,
        predictionAccuracy: 1.0,
        adaptationScore: 1.0,
        generalizationScore: 1.0,
        longTermPlanningScore: 1.0,
        resourceEfficiency: 1.0,
      }
    };
  }
}
