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
    dimensions: { width: 12, height: 12 },
    seed: 101,
    startingCash: 25000,
    demandKW: 150,
    allowedTerrain: ['T01', 'T02', 'T04', 'T05', 'T06'], // Grass, Sand, Stone, Snow/Peak, Water all visually present
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
        'Wind Turbines convert kinetic air movement into electricity (P = 0.5 * rho * A * v^3)',
        'Stone outcrops provide elevation boosts for wind capture',
        'Gravel reinforcement stabilizes unstable soil for infrastructure'
      ],
      hint: 'Compare Solar output on plains against Wind Turbines on elevated stone ridges. Notice how roughness affects wind velocity.'
    },
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
      hint: 'Inspect wind direction using the Wind Vector X-Ray. Orient your turbines facing upwind and maintain spatial clearance between towers.'
    },
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
      story: 'The orbital diurnal and seasonal solar engine is fully engaged. Sun elevation rises at dawn, peaks at solar noon, and declines toward dusk.',
      newMechanics: [
        'Sun azimuth and elevation angle shift hour-by-hour',
        'Seasonal changes modulate base solar irradiance and daytime duration',
        'Nighttime produces zero solar irradiance (sun elevation <= 0)'
      ],
      hint: 'Relying exclusively on solar leaves nighttime power deficits. Complement daytime solar with nighttime wind capacity.'
    },
    dimensions: { width: 14, height: 14 },
    seed: 104,
    startingCash: 55000,
    demandKW: 800,
    allowedTerrain: ['T01', 'T02', 'T04', 'T05', 'T06'],
    unlockedMachines: ['LandSolar', 'WindTurbine'],
    unlockedOverlays: ['Gravel'],
    unlockedXRayLayers: ['none', 'solar', 'elevation', 'wind'],
    requireGridConnection: false,
    objective: {
      description: 'Maintain 800 kW average power output across varying diurnal sun conditions.',
      targetPowerKW: 800,
      requiredSustainedTicks: 8
    },
    defaultSeason: 'Summer'
  },

  5: {
    id: 5,
    name: 'River Power',
    subtitle: 'Level 5: New-Modality Integration',
    briefing: {
      story: 'A major river channel cuts through the river valley. Hydrological kinetic potential is now available for deployment.',
      newMechanics: [
        'Hydro Turbines placed directly on river cells generate constant baseload',
        'Hydro generation depends on flow rate Q and hydraulic head H (P = rho * g * Q * H * eta)',
        'Hydro requires minimum flow (Q >= 5.0 m3/s) to initiate turbine rotation'
      ],
      hint: 'Place Hydro Turbines at high-flow channel points where elevation drop (head) is greatest for maximum generation.'
    },
    dimensions: { width: 16, height: 16 },
    seed: 105,
    startingCash: 70000,
    demandKW: 1200,
    allowedTerrain: ['T01', 'T02', 'T04', 'T06'], // + Water
    unlockedMachines: ['LandSolar', 'WindTurbine', 'HydroTurbine'],
    unlockedOverlays: ['Gravel'],
    unlockedXRayLayers: ['none', 'solar', 'elevation', 'wind', 'water'],
    requireGridConnection: false,
    objective: {
      description: 'Integrate hydroelectric baseload with solar and wind to generate 1,200 kW.',
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
      story: 'The regional power authority now enforces strict grid connection requirements! Power is only delivered if connected via high-voltage conduits to Demand Zones.',
      newMechanics: [
        'CABLE NETWORK REQUIRED: Generators must connect to Demand Zones via Conduit cables',
        'Atmospheric cloud cover dynamically shadows solar arrays, attenuating irradiance',
        'Rainfall increases soil moisture, generating surface runoff that swells river flow'
      ],
      hint: 'Use the Conduit Tool to lay cables from your generation sites to the city Demand Zone. Watch out for passing cloud systems!'
    },
    dimensions: { width: 16, height: 16 },
    seed: 106,
    startingCash: 85000,
    demandKW: 1500,
    allowedTerrain: ['T01', 'T02', 'T03', 'T04', 'T06'], // + Mud
    unlockedMachines: ['LandSolar', 'WindTurbine', 'HydroTurbine', 'Cable'],
    unlockedOverlays: ['Gravel', 'Stone'],
    unlockedXRayLayers: ['none', 'solar', 'elevation', 'wind', 'water', 'cloud', 'energy'],
    requireGridConnection: true, // Grid connection enforced!
    objective: {
      description: 'Deliver 1,500 kW of energy directly to the Demand Zone through high-voltage cables.',
      targetPowerKW: 1500,
      requiredSustainedTicks: 10
    },
    defaultSeason: 'Summer'
  },

  7: {
    id: 7,
    name: 'Highland Winds',
    subtitle: 'Level 7: Spatial & Causal Reasoning',
    briefing: {
      story: 'A towering mountain range splits the terrain. Windward slopes experience orographic wind acceleration, while leeward valleys sit in deep wind shadows.',
      newMechanics: [
        'Wind Shadow Effect: Leeward cells behind ridges experience up to 60% wind velocity drops',
        'Orographic lift forces cloud formation along windward mountain slopes',
        'Rain shadow suppresses precipitation downwind of the mountain spine'
      ],
      hint: 'Avoid placing wind turbines in the leeward wind shadow behind the mountain ridge. Exploit high-elevation crests for accelerated wind speed.'
    },
    dimensions: { width: 18, height: 18 },
    seed: 107,
    startingCash: 100000,
    demandKW: 2000,
    allowedTerrain: ['T01', 'T02', 'T03', 'T04', 'T06'],
    unlockedMachines: ['LandSolar', 'WindTurbine', 'HydroTurbine', 'Cable'],
    unlockedOverlays: ['Gravel', 'Stone'],
    unlockedXRayLayers: ['none', 'solar', 'elevation', 'wind', 'water', 'cloud', 'energy'],
    requireGridConnection: true,
    objective: {
      description: 'Deliver 2,000 kW to the demand grid while navigating complex mountain wind shadows.',
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
      story: 'Sub-zero mountain peaks accumulate deep winter snowpacks. As spring temperatures elevate, massive snowmelt runoff surges into downstream rivers.',
      newMechanics: [
        'Sub-zero temperatures freeze precipitation into snowpack accumulation on high peaks',
        'Thermal warming above 0 deg C triggers degree-day snowmelt, releasing high runoff',
        'Downstream river flow surges exponentially during thaw events, supercharging hydro turbines'
      ],
      hint: 'Monitor the Snow X-Ray layer. Prepare your grid to harvest surging hydro output during melt events while buffering with wind and solar during freezes.'
    },
    dimensions: { width: 20, height: 20 },
    seed: 108,
    startingCash: 120000,
    demandKW: 2500,
    allowedTerrain: ['T01', 'T02', 'T03', 'T04', 'T05', 'T06'], // + Snow/Peak
    unlockedMachines: ['LandSolar', 'WindTurbine', 'HydroTurbine', 'Cable'],
    unlockedOverlays: ['Gravel', 'Stone'],
    unlockedXRayLayers: ['none', 'solar', 'elevation', 'wind', 'water', 'cloud', 'snow', 'energy'],
    requireGridConnection: true,
    objective: {
      description: 'Deliver 2,500 kW sustained through seasonal freeze-thaw hydrological cycles.',
      targetPowerKW: 2500,
      requiredSustainedTicks: 12
    },
    defaultSeason: 'Winter'
  },

  9: {
    id: 9,
    name: 'Grid Economy',
    subtitle: 'Level 9: Resource Allocation & Optimization',
    briefing: {
      story: 'Multiple industrial and residential demand zones require power. Long-distance transmission conduits incur resistive Joule losses (P_loss = I^2 * R).',
      newMechanics: [
        'Transmission loss increases with cable distance and line impedance (1.2% loss/cell)',
        'Multiple demand zones have differentiated tier pricing ($0.12 - $0.20 / kWh)',
        'Economic optimization requires balancing capital build costs against long-term operational profit'
      ],
      hint: 'Optimize cable routing distances to minimize transmission losses. Connect to high-tier demand zones to maximize net operating profits.'
    },
    dimensions: { width: 22, height: 22 },
    seed: 109,
    startingCash: 150000,
    demandKW: 3000,
    allowedTerrain: ['T01', 'T02', 'T03', 'T04', 'T05', 'T06'],
    unlockedMachines: ['LandSolar', 'WindTurbine', 'HydroTurbine', 'Cable'],
    unlockedOverlays: ['Gravel', 'Stone'],
    unlockedXRayLayers: ['none', 'solar', 'elevation', 'wind', 'water', 'cloud', 'snow', 'energy'],
    requireGridConnection: true,
    objective: {
      description: 'Deliver 3,000 kW and generate at least $5,000 in net operating profit.',
      targetPowerKW: 3000,
      minProfit: 5000,
      requiredSustainedTicks: 12
    },
    defaultSeason: 'Spring'
  },

  10: {
    id: 10,
    name: 'Generalization Frontier',
    subtitle: 'Level 10: Full Transfer & Autonomous Evaluation',
    briefing: {
      story: 'The ultimate frontier: a completely unfamiliar, procedurally regenerated landscape with stochastic weather shocks and multi-year simulation horizon.',
      newMechanics: [
        'Unseen procedural topology: steep gorges, high plateaus, and shifting weather fronts',
        'Stochastic weather anomalies: thermal surges, sudden cloudbursts, and gust fronts',
        'Full AI Evaluation harness: evaluate human and benchmark agent policies across 90%+ reliability'
      ],
      hint: 'Employ all foundational principles: diversify generation modalities, respect wind clearance, stabilize soft soils, and engineer redundant grid conduits.'
    },
    dimensions: { width: 24, height: 24 },
    seed: 999,
    startingCash: 200000,
    demandKW: 3500,
    allowedTerrain: ['T01', 'T02', 'T03', 'T04', 'T05', 'T06'],
    unlockedMachines: ['LandSolar', 'WindTurbine', 'HydroTurbine', 'Cable'],
    unlockedOverlays: ['Gravel', 'Stone'],
    unlockedXRayLayers: ['none', 'solar', 'elevation', 'wind', 'water', 'cloud', 'snow', 'energy', 'ai'],
    requireGridConnection: true,
    objective: {
      description: 'Deliver 3,500 kW, sustain 90%+ grid reliability, and accumulate $10,000 profit on an unfamiliar map.',
      targetPowerKW: 3500,
      minReliability: 0.90,
      minProfit: 10000,
      requiredSustainedTicks: 15
    },
    defaultSeason: 'Summer'
  }
};
