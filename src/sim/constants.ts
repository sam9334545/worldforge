/**
 * Master Constants and Master Property Tables
 * Source of Truth: energy-ecosystem-spec.md (Sections 5, 6, 14, 18, 20, Deliverables G & H)
 */

import type { StaticTerrainBlock, TerrainId, MachineType, Season } from './types.ts';

// ==========================================
// MASTER PROPERTY TABLE (Section 6, Deliverable A)
// ==========================================

export const MASTER_TERRAIN_TABLE: Record<TerrainId, StaticTerrainBlock> = {
  T01: {
    id: 'T01',
    name: 'Grass/Dirt',
    elevation: 1,
    roughnessZ0: 0.03,
    moistureCapacity: 0.50,
    permeability: 0.55,
    stability: 0.70,
    waterRetention: 0.45,
    allowedOverlays: ['Gravel', 'Sand', 'Mud'],
    forbiddenOverlays: ['Snow'],
    allowedMachines: ['LandSolar', 'WindTurbine', 'Cable'],
    transformable: true,
    reinforceable: true,
  },
  T02: {
    id: 'T02',
    name: 'Sand',
    elevation: 1,
    roughnessZ0: 0.01,
    moistureCapacity: 0.05,
    permeability: 0.85,
    stability: 0.55,          // Requires gravel reinforcement to reach 0.7 for LandSolar
    waterRetention: 0.05,
    allowedOverlays: ['Gravel', 'Dirt'],
    forbiddenOverlays: ['Mud'],
    allowedMachines: ['LandSolar', 'Cable'], // LandSolar conditional on stability >= 0.7 (Sec 6.2, 16)
    transformable: true,
    reinforceable: true,
  },
  T03: {
    id: 'T03',
    name: 'Mud/Clay',
    elevation: 0,
    roughnessZ0: 0.05,
    moistureCapacity: 0.95,
    permeability: 0.10,
    stability: 0.30,          // Low bearing capacity
    waterRetention: 0.90,
    allowedOverlays: ['Gravel', 'Stone'],
    forbiddenOverlays: [],
    allowedMachines: ['Cable', 'LandSolar', 'WindTurbine'], // Conditional on stability >= 0.7 after reinforcement (Sec 6.3, 15, Matrix G)
    transformable: true,      // Sustained rainfall + adjacent water -> transforms to Water
    reinforceable: true,
  },
  T04: {
    id: 'T04',
    name: 'Stone/Rock',
    elevation: 3,
    roughnessZ0: 0.20,
    moistureCapacity: 0.15,
    permeability: 0.10,
    stability: 0.95,
    waterRetention: 0.10,
    allowedOverlays: ['Gravel', 'Stone'],
    forbiddenOverlays: ['Mud'],
    allowedMachines: ['WindTurbine', 'LandSolar', 'Cable'],
    transformable: false,
    reinforceable: false,
  },
  T05: {
    id: 'T05',
    name: 'Snow/Peak',
    elevation: 5,
    roughnessZ0: 0.50,
    moistureCapacity: 0.80,
    permeability: 0.05,       // Frozen ground
    stability: 0.60,
    waterRetention: 0.80,
    allowedOverlays: [],
    forbiddenOverlays: ['Gravel', 'Sand', 'Mud', 'Stone', 'Dirt'],
    allowedMachines: ['WindTurbine'], // Solar forbidden (low angle + high albedo); Hydro/Cable forbidden on frozen ground
    transformable: true,      // Seasonal melt to Stone/Grass
    reinforceable: false,
  },
  T06: {
    id: 'T06',
    name: 'Water/River',
    elevation: 0,
    roughnessZ0: 0.0002,
    moistureCapacity: 1.0,
    permeability: 0.0,
    stability: 0.0,
    waterRetention: 1.0,
    allowedOverlays: [],
    forbiddenOverlays: ['Gravel', 'Sand', 'Mud', 'Stone', 'Dirt'],
    allowedMachines: ['HydroTurbine', 'FloatSolar'], // FloatSolar conditional on velocity <= V_float_max
    transformable: false,
    reinforceable: false,
  },
  T07: {
    id: 'T07',
    name: 'Gravel',
    elevation: 2,
    roughnessZ0: 0.08,
    moistureCapacity: 0.30,
    permeability: 0.60,
    stability: 0.85,
    waterRetention: 0.20,
    allowedOverlays: ['Dirt', 'Mud'],
    forbiddenOverlays: [],
    allowedMachines: ['LandSolar', 'WindTurbine', 'Cable'],
    transformable: false,
    reinforceable: false,     // Acts as the reinforcement overlay itself
  }
};

// ==========================================
// MACHINE SPECIFICATIONS (Section 14)
// ==========================================

export interface MachineConfig {
  type: MachineType;
  ratedPower: number;         // kW
  efficiency: number;         // default efficiency factor
  minStability: number;       // required effective stability
  buildCost: number;          // $
  maintenanceCostPerTick: number; // $
  lifespanTicks: number;      // ticks until retirement
  // Solar specific
  panelArea?: number;         // m²
  // Wind specific
  rotorArea?: number;         // m²
  cutInSpeed?: number;        // m/s
  ratedSpeed?: number;        // m/s
  cutOutSpeed?: number;       // m/s
  betzLimit?: number;         // max 0.593
  // Hydro specific
  qMin?: number;              // m³/s minimum flow rate
  hMin?: number;              // m minimum hydraulic head
}

export const MACHINE_CONFIGS: Record<MachineType, MachineConfig> = {
  LandSolar: {
    type: 'LandSolar',
    ratedPower: 200,
    efficiency: 0.20,
    minStability: 0.70,
    buildCost: 5000,
    maintenanceCostPerTick: 2,
    lifespanTicks: 24 * 360 * 25, // 25 years
    panelArea: 1000,
  },
  FloatSolar: {
    type: 'FloatSolar',
    ratedPower: 220,
    efficiency: 0.22,         // Cooling bonus factor included (Sec 14)
    minStability: 0.0,
    buildCost: 7500,
    maintenanceCostPerTick: 4,
    lifespanTicks: 24 * 360 * 20,
    panelArea: 1000,
  },
  WindTurbine: {
    type: 'WindTurbine',
    ratedPower: 500,
    efficiency: 0.45,         // Betz limited (Sec 14, Betz max is 0.593)
    minStability: 0.70,
    buildCost: 12000,
    maintenanceCostPerTick: 8,
    lifespanTicks: 24 * 360 * 20,
    rotorArea: 1500,
    cutInSpeed: 3.0,          // m/s
    ratedSpeed: 12.0,         // m/s
    cutOutSpeed: 25.0,        // m/s
    betzLimit: 0.593,
  },
  HydroTurbine: {
    type: 'HydroTurbine',
    ratedPower: 800,
    efficiency: 0.85,
    minStability: 0.0,
    buildCost: 20000,
    maintenanceCostPerTick: 12,
    lifespanTicks: 24 * 360 * 40,
    qMin: 2.0,                // m³/s (RULE-HYDRO-001)
    hMin: 1.0,                // m head
  },
  Cable: {
    type: 'Cable',
    ratedPower: 1000,         // max throughput capacity (Sec 14)
    efficiency: 0.98,
    minStability: 0.30,
    buildCost: 200,
    maintenanceCostPerTick: 0.1,
    lifespanTicks: 24 * 360 * 30,
  },
  Conduit: {
    type: 'Conduit',
    ratedPower: 1000,
    efficiency: 0.98,
    minStability: 0.30,
    buildCost: 100,
    maintenanceCostPerTick: 0.1,
    lifespanTicks: 24 * 360 * 30,
  }
};

// ==========================================
// CONFIGURABLE ENGINE PARAMETERS (Section 42)
// ==========================================

export const CONFIGURABLE_PARAMS = {
  // Atmosphere & Solar
  I_max: 1000,                // W/m² peak clear-sky irradiance
  k_atten: 0.75,              // cloud attenuation multiplier (Sec 7)
  shadowRangeMultiplier: 2.0, // elevation diff shadow length multiplier

  // Wind
  z0_ref: 0.03,               // reference roughness (Grass)
  roughnessAlpha: 0.15,       // roughness damping exponent (Sec 9)
  R_orographic: 4,            // range of mountain wind shadow & lift in cells (Sec 10)
  windElevationBonusPerMeter: 0.08, // speed bonus per unit elevation above average

  // Clouds & Water Cycle
  H_condensation_threshold: 0.65, // humidity + evap threshold to spawn clouds
  cloudDissipationRate: 0.02,
  k_evap: 0.015,              // evaporation rate constant (E7)
  k_inf: 0.08,                // infiltration rate constant (E10)
  k_melt: 0.05,               // degree-day snowmelt constant (E13)

  // River & Floating Solar
  V_float_max: 1.5,           // m/s maximum river velocity for floating solar (RULE-PLACE-006)
  rho_water: 1000,            // kg/m³
  gravity: 9.81,              // m/s²
  airDensity: 1.225,          // kg/m³

  // Overlays & Reinforcement (RULE-OVERLAY-001)
  gravelDeltaStability: 0.25, // Gravel overlay adds +0.25 to stability
  stoneDeltaStability: 0.40,  // Stone overlay adds +0.40 to stability

  // Grid & Economics
  transmissionLossPerCell: 0.015, // 1.5% loss per cell distance (Sec 17)
  baseEnergyPrice: 0.12,      // $ per kWh delivered (Sec 18)
};

// ==========================================
// SEASONAL PARAMETERS (Section 20)
// ==========================================

export interface SeasonProfile {
  season: Season;
  solarAmplitude: number;     // modulates peak sun elevation
  dayLengthHours: number;
  baseTemperature: number;    // °C
  baseHumidity: number;       // 0-1
  windSpeedMean: number;      // m/s
  windDirectionMean: number;  // degrees
  snowMeltBias: number;       // degree-day multiplier
  riverBaseflowFactor: number;// multiplier on spring snowmelt vs summer low flow
}

export const SEASON_PROFILES: Record<Season, SeasonProfile> = {
  Spring: {
    season: 'Spring',
    solarAmplitude: 0.85,
    dayLengthHours: 12,
    baseTemperature: 12.0,
    baseHumidity: 0.60,
    windSpeedMean: 10.0,
    windDirectionMean: 270,   // West
    snowMeltBias: 1.2,        // Active snowmelt surge
    riverBaseflowFactor: 1.5, // Snowmelt pulse propagates to river
  },
  Summer: {
    season: 'Summer',
    solarAmplitude: 1.0,      // Maximum sun elevation
    dayLengthHours: 15,
    baseTemperature: 26.0,
    baseHumidity: 0.45,
    windSpeedMean: 7.5,
    windDirectionMean: 240,   // WSW
    snowMeltBias: 1.5,
    riverBaseflowFactor: 0.8, // Lower summer baseflow
  },
  Autumn: {
    season: 'Autumn',
    solarAmplitude: 0.75,
    dayLengthHours: 11,
    baseTemperature: 10.0,
    baseHumidity: 0.70,       // Higher rainfall frequency
    windSpeedMean: 12.0,
    windDirectionMean: 290,   // WNW
    snowMeltBias: 0.5,
    riverBaseflowFactor: 1.2,
  },
  Winter: {
    season: 'Winter',
    solarAmplitude: 0.50,     // Low sun angle
    dayLengthHours: 8,
    baseTemperature: -3.0,    // Sub-zero: precipitation accumulates as snow
    baseHumidity: 0.55,
    windSpeedMean: 14.0,      // Gusty winter winds
    windDirectionMean: 315,   // NW
    snowMeltBias: 0.0,        // Frozen, no melt
    riverBaseflowFactor: 0.5, // Frozen/reduced flow
  }
};
