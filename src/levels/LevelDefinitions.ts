/**
 * Level Definitions (Levels 1 to 10)
 * Exact adherence to energy-ecosystem-spec.md Section 21
 */

import type { LevelConfig } from './LevelConfig.ts';

export const LEVEL_DEFINITIONS: Record<number, LevelConfig> = {
  1: {
    id: 1,
    name: 'Sunlight & Earth',
    subtitle: 'Level 1: Basic Placement',
    briefing: {
      story: 'Welcome to the TerraForge energy expedition. A pristine grassy plain with open sand tracts has been selected for solar deployment.',
      newMechanics: [
        'Land Solar Arrays generate clean power from sunlight',
        'Sand terrain has high roughness; Grass provides standard baseline',
        'Direct generation without complex transmission conduits'
      ],
      hint: 'Place multiple Land Solar arrays on Grass terrain to reach the initial 150 kW generation threshold.'
    },
    newUnlocksGuide: [
      {
        name: 'Land Solar Array',
        type: 'LandSolar',
        icon: 'solar_power',
        cost: '$5,000 (Maint: $2/tick)',
        category: 'machine',
        description: 'Deploy on stable dry terrain (Sand, Grass, Stone). Produces up to 200 kW during peak sunlight hours. Forbidden on water and snow peaks. Requires soil stability ≥ 0.70.'
      }
    ],
    dimensions: { width: 12, height: 12 },
    seed: 101,
    startingCash: 25000,
    demandKW: 150,
    allowedTerrain: ['T01', 'T02', 'T04', 'T05', 'T06'],
    unlockedMachines: ['LandSolar'],
    unlockedOverlays: [],
    unlockedXRayLayers: ['none', 'solar'],
    requireGridConnection: false,
    objective: {
      description: 'Supply 150 kW of solar energy to the regional grid.',
      targetPowerKW: 150,
      requiredSustainedTicks: 5
    },
    defaultSeason: 'Summer'
  },

  2: {
    id: 2,
    name: 'Wind & Roughness',
    subtitle: 'Level 2: Comparative Tradeoffs',
    briefing: {
      story: 'Rocky outcrops have been discovered adjacent to coastal sandflats. Atmospheric stations report steady ambient airflow.',
      newMechanics: [
        'Wind Turbines convert kinetic air movement into electricity',
        'Stone outcrops provide elevation boosts for wind capture',
        'Gravel reinforcement stabilizes unstable soil for infrastructure'
      ],
      hint: 'Compare Solar output on plains against Wind Turbines on elevated stone ridges. Notice how roughness affects wind velocity.'
    },
    newUnlocksGuide: [
      {
        name: 'Wind Turbine',
        type: 'WindTurbine',
        icon: 'wind_power',
        cost: '$12,000 (Maint: $8/tick)',
        category: 'machine',
        description: 'Harvests kinetic energy from passing air currents. Yield scales with the cube of wind velocity. High elevation stone ridges provide significant wind speed multipliers.'
      },
      {
        name: 'Gravel Stabilizer',
        type: 'Gravel',
        icon: 'terrain',
        cost: '$500 / cell',
        category: 'stabilizer',
        description: 'Applies crushed stone foundation to loose Sand and Mud terrain (+0.25 effective stability), allowing heavy machine construction.'
      }
    ],
    dimensions: { width: 12, height: 12 },
    seed: 102,
    startingCash: 35000,
    demandKW: 350,
    allowedTerrain: ['T01', 'T02', 'T04', 'T05', 'T06'],
    unlockedMachines: ['LandSolar', 'WindTurbine'],
    unlockedOverlays: ['Gravel'],
    unlockedXRayLayers: ['none', 'solar', 'elevation'],
    requireGridConnection: false,
    objective: {
      description: 'Generate 350 kW by deploying a balanced mix of Solar and Wind generation.',
      targetPowerKW: 350,
      requiredSustainedTicks: 5
    },
    defaultSeason: 'Spring'
  },

  3: {
    id: 3,
    name: 'Wind Frontier',
    subtitle: 'Level 3: Directional Reasoning',
    briefing: {
      story: 'Regional weather patterns have activated dynamic prevailing westerlies. Wind direction now directly influences turbine aerodynamics.',
      newMechanics: [
        'Wind direction varies dynamically across cardinal bearings',
        'Turbine yaw angle misalignment reduces output by cos(Delta angle)',
        'Wake interference: turbines too close (< 2.0 cells) disrupt airflow'
      ],
      hint: 'Inspect wind direction using the Wind Vector X-Ray. Orient your turbines facing upwind with [R] and maintain spatial clearance between towers.'
    },
    newUnlocksGuide: [
      {
        name: 'Aerodynamic Yaw Alignment',
        type: 'WindTurbine',
        icon: 'rotate_right',
        cost: 'Press [R] to Rotate',
        category: 'machine',
        description: 'Rotate wind turbines using the R key to point directly into the oncoming wind vector. Ensure at least 2 cells of spacing between turbines to prevent aerodynamic wake turbulence.'
      }
    ],
    dimensions: { width: 14, height: 14 },
    seed: 103,
    startingCash: 45000,
    demandKW: 600,
    allowedTerrain: ['T01', 'T02', 'T04', 'T05', 'T06'],
    unlockedMachines: ['LandSolar', 'WindTurbine'],
    unlockedOverlays: ['Gravel'],
    unlockedXRayLayers: ['none', 'solar', 'elevation', 'wind'],
    requireGridConnection: false,
    objective: {
      description: 'Build an optimized wind generation farm generating at least 600 kW.',
      targetPowerKW: 600,
      requiredSustainedTicks: 6
    },
    defaultSeason: 'Autumn'
  },

  4: {
    id: 4,
    name: 'Solar Dynamics',
    subtitle: 'Level 4: Temporal Cycles',
    briefing: {
      story: 'Summer heatwaves create massive diurnal irradiance fluctuations. Surface water bodies offer natural cooling for specialized photovoltaic pontoons.',
      newMechanics: [
        'Diurnal cycle: solar intensity peaks at noon and drops to zero at night',
        'Floating Solar pontoons deploy on calm water surfaces',
        'Water evaporative cooling boosts floating panel efficiency by +10%'
      ],
      hint: 'Place Floating Solar on calm water tiles to benefit from evaporative cooling efficiency bonuses.'
    },
    newUnlocksGuide: [
      {
        name: 'Floating Solar Array',
        type: 'FloatSolar',
        icon: 'wb_sunny',
        cost: '$7,500 (Maint: $3/tick)',
        category: 'machine',
        description: 'Specialized photovoltaic pontoons engineered for water surfaces. Water evaporative cooling grants a +10% efficiency bonus. Water velocity must not exceed 1.5 m/s.'
      }
    ],
    dimensions: { width: 14, height: 14 },
    seed: 104,
    startingCash: 50000,
    demandKW: 800,
    allowedTerrain: ['T01', 'T02', 'T04', 'T05', 'T06'],
    unlockedMachines: ['LandSolar', 'FloatSolar', 'WindTurbine'],
    unlockedOverlays: ['Gravel'],
    unlockedXRayLayers: ['none', 'solar', 'elevation', 'wind', 'water'],
    requireGridConnection: false,
    objective: {
      description: 'Deliver 800 kW during daytime and buffer output with wind at night.',
      targetPowerKW: 800,
      requiredSustainedTicks: 6
    },
    defaultSeason: 'Summer'
  },

  5: {
    id: 5,
    name: 'River Power',
    subtitle: 'Level 5: New-Modality Integration',
    briefing: {
      story: 'A major river channel cuts through the mountain pass. Hydrokinetic turbines can deliver continuous, non-intermittent baseline power.',
      newMechanics: [
        'Hydroelectric generators harness hydraulic volumetric flow rate (Q)',
        'Hydro plants provide 24/7 steady baseline power regardless of weather',
        'Hydro density cap: minimum 2-tile spacing between river plants'
      ],
      hint: 'Inspect river flow rate using the Hydrology X-Ray layer. Place Hydro Plants on high-velocity river sections.'
    },
    newUnlocksGuide: [
      {
        name: 'Hydrokinetic Plant',
        type: 'HydroTurbine',
        icon: 'waves',
        cost: '$20,000 (Maint: $12/tick)',
        category: 'machine',
        description: 'Construct on river channel cells with flow rate Q ≥ 1.0 m³/s. Generates continuous baseline power independent of day/night cycles (85% hydraulic efficiency).'
      }
    ],
    dimensions: { width: 16, height: 16 },
    seed: 105,
    startingCash: 65000,
    demandKW: 1200,
    allowedTerrain: ['T01', 'T02', 'T04', 'T05', 'T06'],
    unlockedMachines: ['LandSolar', 'FloatSolar', 'WindTurbine', 'HydroTurbine'],
    unlockedOverlays: ['Gravel'],
    unlockedXRayLayers: ['none', 'solar', 'elevation', 'wind', 'hydro', 'water'],
    requireGridConnection: false,
    objective: {
      description: 'Integrate Hydro, Solar, and Wind to sustain 1,200 kW continuous output.',
      targetPowerKW: 1200,
      requiredSustainedTicks: 8
    },
    defaultSeason: 'Spring'
  },

  6: {
    id: 6,
    name: 'Interconnected Systems',
    subtitle: 'Level 6: Systemic & Causal Reasoning',
    briefing: {
      story: 'The regional power grid is active! Power generated by remote facilities must now be physically transported through transmission cables to Demand Zones.',
      newMechanics: [
        'Physical grid transmission: generators must connect to Demand Zone cells',
        'High-Voltage Conduits transmit electricity across terrain',
        'Transmission losses: long cable runs incur resistive line drop (~1.2%/cell)'
      ],
      hint: 'Use the Conduit tool to build an unbroken cable route from your generators to the glowing Demand Zone intake cells.'
    },
    newUnlocksGuide: [
      {
        name: 'High-Voltage Conduit (Cable)',
        type: 'Cable',
        icon: 'cable',
        cost: '$100 / cell',
        category: 'conduit',
        description: 'Connects distant generators to the glowing DEMAND INTAKE tiles. Power delivers and earns revenue only when an unbroken conduit link exists. Generators can be built on top of cables.'
      }
    ],
    dimensions: { width: 16, height: 16 },
    seed: 106,
    startingCash: 75000,
    demandKW: 1500,
    allowedTerrain: ['T01', 'T02', 'T04', 'T05', 'T06'],
    unlockedMachines: ['LandSolar', 'FloatSolar', 'WindTurbine', 'HydroTurbine'],
    unlockedOverlays: ['Gravel'],
    unlockedXRayLayers: ['none', 'solar', 'elevation', 'wind', 'hydro', 'network'],
    requireGridConnection: true,
    objective: {
      description: 'Connect all generators via conduits to supply 1,500 kW to the Demand Zone.',
      targetPowerKW: 1500,
      requiredSustainedTicks: 8
    },
    defaultSeason: 'Summer'
  },

  7: {
    id: 7,
    name: 'Highland Winds',
    subtitle: 'Level 7: Spatial & Causal Reasoning',
    briefing: {
      story: 'A steep mountain ridge offers fierce alpine wind currents. However, steep terrain and leeward wind shadows penalize careless placement.',
      newMechanics: [
        'Mountain orographic acceleration boosts wind velocity on crests',
        'Leeward wind shadow zones suffer severe velocity reductions (up to 60%)',
        'Stone Anchor Footings secure heavy turbines on steep inclines'
      ],
      hint: 'Consult the Wind X-Ray layer to identify mountain crest speed zones and avoid building in the leeward wind shadow.'
    },
    newUnlocksGuide: [
      {
        name: 'Stone Anchor Footing',
        type: 'Stone',
        icon: 'architecture',
        cost: '$1,000 / cell',
        category: 'stabilizer',
        description: 'Engineered geotechnical foundation for steep inclines and marshland (+0.40 effective stability), enabling secure installation of high-capacity turbines.'
      }
    ],
    dimensions: { width: 16, height: 16 },
    seed: 107,
    startingCash: 85000,
    demandKW: 2000,
    allowedTerrain: ['T01', 'T02', 'T04', 'T05', 'T06'],
    unlockedMachines: ['LandSolar', 'FloatSolar', 'WindTurbine', 'HydroTurbine'],
    unlockedOverlays: ['Gravel', 'Stone'],
    unlockedXRayLayers: ['none', 'solar', 'elevation', 'wind', 'hydro', 'network'],
    requireGridConnection: true,
    objective: {
      description: 'Exploit highland crest winds to supply 2,000 kW while avoiding wind shadows.',
      targetPowerKW: 2000,
      requiredSustainedTicks: 10
    },
    defaultSeason: 'Autumn'
  },

  8: {
    id: 8,
    name: 'Alpine Thaw',
    subtitle: 'Level 8: Delayed Consequences & Memory',
    briefing: {
      story: 'Deep winter snowpacks blanket the upper peaks. As temperatures rise in spring, snowmelt triggers massive downstream river flow surges.',
      newMechanics: [
        'Seasonal thermal lag: ambient temperature elevation triggers snowmelt',
        'Runoff surges dramatically increase hydro flow rates (Q)',
        'Freezing temperatures diminish hydro generation during cold snaps'
      ],
      hint: 'Prepare for seasonal thermal transitions. Deploy hydro turbines in channels that capture alpine runoff surges.'
    },
    newUnlocksGuide: [
      {
        name: 'Thermal Snowmelt Surges',
        type: 'HydroTurbine',
        icon: 'ac_unit',
        cost: 'Thermal Coupling',
        category: 'machine',
        description: 'Spring warming melts high-elevation snowpacks into river channels, multiplying river velocity Q and generating massive surges in hydro generation output.'
      }
    ],
    dimensions: { width: 16, height: 16 },
    seed: 108,
    startingCash: 95000,
    demandKW: 2500,
    allowedTerrain: ['T01', 'T02', 'T04', 'T05', 'T06'],
    unlockedMachines: ['LandSolar', 'FloatSolar', 'WindTurbine', 'HydroTurbine'],
    unlockedOverlays: ['Gravel', 'Stone'],
    unlockedXRayLayers: ['none', 'solar', 'elevation', 'wind', 'hydro', 'snow', 'network'],
    requireGridConnection: true,
    objective: {
      description: 'Capitalize on seasonal snowmelt surges to deliver 2,500 kW to the regional grid.',
      targetPowerKW: 2500,
      requiredSustainedTicks: 10
    },
    defaultSeason: 'Winter'
  },

  9: {
    id: 9,
    name: 'Grid Economy',
    subtitle: 'Level 9: Resource Allocation & Optimization',
    briefing: {
      story: 'Two independent demand hubs (Industrial Sector South and Metro North) offer tiered dynamic tariffs ($0.18 and $0.22/kWh). Balancing capital and transmission is essential.',
      newMechanics: [
        'Multi-terminal demand routing with varying economic power tariffs',
        'Levelized cost optimization: balancing turbine costs against long cable routes',
        'Positive operating margin requirement alongside power delivery'
      ],
      hint: 'Prioritize connecting to the high-tariff Metro North demand zone to maximize daily operating profit.'
    },
    newUnlocksGuide: [
      {
        name: 'Multi-Terminal Grid Routing',
        type: 'Cable',
        icon: 'alt_route',
        cost: 'Optimized Transmission',
        category: 'conduit',
        description: 'Connect to both Industrial South ($0.18/kWh) and Metro North ($0.22/kWh). Route conduits strategically to capture premium tariff revenue while minimizing transmission resistance losses.'
      }
    ],
    dimensions: { width: 16, height: 16 },
    seed: 109,
    startingCash: 110000,
    demandKW: 3000,
    allowedTerrain: ['T01', 'T02', 'T04', 'T05', 'T06'],
    unlockedMachines: ['LandSolar', 'FloatSolar', 'WindTurbine', 'HydroTurbine'],
    unlockedOverlays: ['Gravel', 'Stone'],
    unlockedXRayLayers: ['none', 'solar', 'elevation', 'wind', 'hydro', 'network', 'ai'],
    requireGridConnection: true,
    objective: {
      description: 'Deliver 3,000 kW across both demand zones and achieve a positive daily operating profit.',
      targetPowerKW: 3000,
      minProfit: 1000,
      requiredSustainedTicks: 12
    },
    defaultSeason: 'Spring'
  },

  10: {
    id: 10,
    name: 'Generalization Frontier',
    subtitle: 'Level 10: Full Transfer & Autonomous Evaluation',
    briefing: {
      story: 'The master evaluation scenario: complex archipelago terrain with rapid seasonal shifts, orographic winds, tidal flows, and full multi-spectral telemetry.',
      newMechanics: [
        'Full multi-modal ecosystem integration (Solar, Wind, Hydro, Floating Solar)',
        'Multi-spectral X-Ray suite with live AI world model benchmark prediction',
        'Extreme weather resilience and sustained operational stability'
      ],
      hint: 'Deploy a complete multi-modal energy network across land, water, and ridges. Maintain 3,500 kW sustained delivery.'
    },
    newUnlocksGuide: [
      {
        name: 'Full Multi-Modal Grid Integration',
        type: 'Generalization',
        icon: 'hub',
        cost: 'Master Tier',
        category: 'machine',
        description: 'Synthesize solar, wind, hydro, foundation stabilization, and high-voltage transmission networks to achieve maximum grid capacity and autonomous stability.'
      }
    ],
    dimensions: { width: 16, height: 16 },
    seed: 110,
    startingCash: 130000,
    demandKW: 3500,
    allowedTerrain: ['T01', 'T02', 'T04', 'T05', 'T06'],
    unlockedMachines: ['LandSolar', 'FloatSolar', 'WindTurbine', 'HydroTurbine'],
    unlockedOverlays: ['Gravel', 'Stone'],
    unlockedXRayLayers: ['none', 'solar', 'elevation', 'wind', 'hydro', 'snow', 'network', 'ai'],
    requireGridConnection: true,
    objective: {
      description: 'Attain the ultimate milestone: sustain 3,500 kW across the archipelago with >95% reliability.',
      targetPowerKW: 3500,
      minProfit: 2000,
      requiredSustainedTicks: 15
    },
    defaultSeason: 'Summer'
  }
};
