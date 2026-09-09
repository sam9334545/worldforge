/**
 * Grid Energy Ecosystem & AI Evaluation Testbed
 * Core Type Definitions
 * Source of Truth: energy-ecosystem-spec.md
 */



// ==========================================
// LAYER A: STATIC TERRAIN (Section 5 & 6)
// ==========================================

export type TerrainId = 'T01' | 'T02' | 'T03' | 'T04' | 'T05' | 'T06' | 'T07';

export type TerrainTypeName =
  | 'Grass/Dirt'
  | 'Sand'
  | 'Mud/Clay'
  | 'Stone/Rock'
  | 'Snow/Peak'
  | 'Water/River'
  | 'Gravel';

export type MachineType =
  | 'LandSolar'
  | 'FloatSolar'
  | 'WindTurbine'
  | 'HydroTurbine'
  | 'Cable'
  | 'Conduit';

export type OverlayType = 'Gravel' | 'Sand' | 'Mud' | 'Stone' | 'Dirt';

export interface StaticTerrainBlock {
  id: TerrainId;
  name: TerrainTypeName;
  elevation: number;            // 0 to 5
  roughnessZ0: number;          // meters (0.0002 to 0.50)
  moistureCapacity: number;     // 0.0 to 1.0
  permeability: number;         // 0.0 to 1.0
  stability: number;            // 0.0 to 1.0
  waterRetention: number;       // 0.0 to 1.0
  thermalInertia?: number;
  allowedOverlays: OverlayType[];
  forbiddenOverlays: string[];
  allowedMachines: MachineType[];
  transformable: boolean;
  reinforceable: boolean;
}

// ==========================================
// LAYER B: DYNAMIC ENVIRONMENT (Section 7-13)
// ==========================================

export type Season = 'Spring' | 'Summer' | 'Autumn' | 'Winter';

export type WaterBodyType = 'RIVER' | 'LAKE' | 'STAGNANT_WATER';

export interface DynamicCellState {
  // Wind (Section 9)
  windSpeed: number;            // local wind speed (m/s)
  windDirection: number;        // local wind bearing (degrees 0-359)
  windShadowFactor: number;     // 0.0 (full shadow) to 1.0 (no shadow)
  orographicLift?: number;      // windward ascent factor (Section 10)

  // Solar & Atmosphere (Section 7 & 8)
  effectiveIrradiance: number;  // W/m² equivalent
  terrainObstruction: number;   // 0.0 to 1.0 (1.0 = no shadow)
  cloudAttenuation: number;     // 0.0 to 1.0 (1.0 = clear sky)
  temperature: number;          // °C
  humidity: number;             // 0.0 to 1.0

  // Water & Hydrology (Section 11-13)
  surfaceWater: number;         // available surface water
  evaporation: number;          // evaporated this tick
  infiltration: number;         // infiltrated into soil this tick
  runoff: number;               // surface runoff generated this tick
  snowDepth: number;            // accumulated snowpack (m)
  snowmelt: number;             // melted snow this tick

  // River specifics (if water block, Section 12)
  waterBodyType?: WaterBodyType;
  waterLevel: number;           // elevation + water depth
  flowRateQ: number;            // m³/s
  flowDirection: number | null; // 0=N, 1=E, 2=S, 3=W, or null
  velocity: number;             // m/s
  channelWidth: number;         // m
  channelDepth: number;         // m
}

export interface CloudEntity {
  id: string;
  x: number;                    // grid coordinate (float)
  y: number;                    // grid coordinate (float)
  cloudDensity: number;         // 0.0 to 1.0
  cloudWaterContent: number;    // kg/m² abstracted
  cloudTemperature: number;     // °C
  cloudAltitude: number;        // m
  movementDirection: number;    // bearing (0-359)
  movementSpeed: number;        // cells per tick
  precipitationPotential: number; // 0.0 to 1.0
  cloudLifetime: number;        // ticks remaining
  coverageRadius: number;       // cells radius
}

// ==========================================
// LAYER C: INFRASTRUCTURE (Section 14-16)
// ==========================================

export interface MachineState {
  id: string;
  type: MachineType;
  x: number;
  y: number;
  orientation: number;          // yaw bearing (0-359) or tilt
  tilt?: number;                // degrees from horizontal
  capacity: number;             // rated power (kW / arbitrary units)
  efficiency: number;           // 0.0 to 1.0
  health: number;               // 1.0 (new) to 0.0 (retired)
  ageTicks: number;
  lifespanTicks: number;
  maintenanceCostPerTick: number;
  buildCost: number;
  isOperating: boolean;
  shutdownReason?: string;
}

export interface CableState {
  id: string;
  x: number;
  y: number;
  connectedTo: Array<{ x: number; y: number }>;
  capacity: number;             // max throughput
  currentThroughput: number;
  lossPerCell: number;
}

// ==========================================
// LAYER D: DERIVED VALUES (Section 3 & 23)
// ==========================================

export interface DerivedPhysicalState {
  effectiveStability: number;   // base stability + overlays
  effectivePermeability: number;
  powerGenerated: number;       // kW-equivalent this tick
  powerDelivered: number;       // after transmission losses
  transmissionLoss: number;
  curtailedPower: number;
}

// ==========================================
// LAYER E: ECONOMY (Section 18)
// ==========================================

export interface DemandZone {
  id: string;
  cells: Array<{ x: number; y: number }>;
  demandLevel: number;          // kW demanded this tick
  deliveredEnergy: number;      // kW received
  pricePerUnit: number;         // $ / unit
  tier: number;
}

export interface EconomyState {
  cash: number;
  coins?: number;
  netWorth: number;
  cumulativeRevenue: number;
  cumulativeCost: number;
  cumulativeGenerated: number;  // kWh
  cumulativeDelivered: number;  // kWh
  cumulativeCurtailed: number;  // kWh
  totalDeliveredPower?: number; // kW this tick
  totalGeneratedPower?: number; // kW this tick
  reliabilityRatio: number;     // delivered / demanded
  tickProfitHistory: number[];  // sliding window array storing net operating profit of the last 24 ticks
  rollingDailyProfit: number;   // sum of tickProfitHistory (representing current daily net operating rate)
}

// ==========================================
// CELL FULL STATE (Section 25)
// ==========================================

export interface CellState {
  x: number;
  y: number;
  baseTerrain: StaticTerrainBlock;
  overlays: OverlayType[];       // stacked, bottom to top
  dynamic: DynamicCellState;
  machine: MachineState | null;
  cable: CableState | null;
  has_cable?: boolean;
  hasCable?: boolean;
  derived: DerivedPhysicalState;
}

// ==========================================
// SIMULATION TIME (Section 19)
// ==========================================

export interface SimulationTime {
  tick: number;                 // current tick (1 tick = 1 hour by default)
  hour: number;                 // 0 to 23
  day: number;                  // 1 to 360
  season: Season;               // Spring, Summer, Autumn, Winter
  year: number;                 // 1 to 10
  dayOfSeason: number;          // 1 to 90
}

// Global environmental parameters for the tick
export interface GlobalEnvironment {
  sunElevation: number;         // degrees (-90 to 90)
  sunAzimuth: number;           // degrees (0 to 359)
  baseSolarIrradiance: number;  // W/m² (I_max * max(0, sin(elev)))
  globalWindSpeed: number;      // m/s
  globalWindDirection: number;  // degrees (0 to 359)
  ambientTemperature: number;   // °C baseline
  ambientHumidity: number;      // 0.0 to 1.0 baseline
}
