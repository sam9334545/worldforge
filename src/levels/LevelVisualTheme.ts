import type { LevelId } from './LevelConfig.ts';

export interface LevelVisualTheme {
  id: LevelId;
  name: string;
  subtitle: string;
  terrainStyle: 'sunny_valley' | 'windy_plains' | 'mountain_pass' | 'solar_valley' | 'river_basin' | 'weather_frontier' | 'highland_peaks' | 'frozen_alpine' | 'grid_network' | 'integrated_frontier';
  mountainDensity: number;
  vegetationDensity: number;
  riverPresence: boolean;
  weatherVisualStyle: {
    cloudDensityMultiplier: number;
    precipitationParticleDensity: number;
    atmosphericDrama: number;
  };
  visualAtmosphere: {
    fog: number;
    lighting: 'warm_sun' | 'golden_winds' | 'rocky_dusk' | 'high_noon' | 'river_shimmer' | 'storm_indigo' | 'alpine_frost' | 'winter_ice' | 'electric_azure' | 'dynamic_frontier';
    skyDawn: [string, string];
    skyNoon: [string, string];
    skyDusk: [string, string];
    skyNight: [string, string];
    ambientLight: number;
    distantMountainColor: string;
    distantMountainFog: string;
  };
}

export const LEVEL_VISUAL_THEMES: Record<LevelId, LevelVisualTheme> = {
  1: {
    id: 1,
    name: 'Sunny Valley',
    subtitle: 'Lush valley with bright solar exposure and calm winds',
    terrainStyle: 'sunny_valley',
    mountainDensity: 0.35,
    vegetationDensity: 0.75,
    riverPresence: true,
    weatherVisualStyle: {
      cloudDensityMultiplier: 0.85,
      precipitationParticleDensity: 0.8,
      atmosphericDrama: 0.35,
    },
    visualAtmosphere: {
      fog: 0.08,
      lighting: 'warm_sun',
      skyDawn: ['#1a2035', '#e89858'],
      skyNoon: ['#0f3562', '#4389d8'],
      skyDusk: ['#23193e', '#e06b3a'],
      skyNight: ['#050811', '#0e1626'],
      ambientLight: 1.0,
      distantMountainColor: '#1e3352',
      distantMountainFog: 'rgba(15, 53, 98, 0.45)',
    },
  },
  2: {
    id: 2,
    name: 'Windy Grasslands',
    subtitle: 'Expansive rolling plains with steady prevailing winds',
    terrainStyle: 'windy_plains',
    mountainDensity: 0.25,
    vegetationDensity: 0.65,
    riverPresence: true,
    weatherVisualStyle: {
      cloudDensityMultiplier: 1.0,
      precipitationParticleDensity: 1.0,
      atmosphericDrama: 0.55,
    },
    visualAtmosphere: {
      fog: 0.12,
      lighting: 'golden_winds',
      skyDawn: ['#16233b', '#e2a362'],
      skyNoon: ['#154374', '#569ce6'],
      skyDusk: ['#281e42', '#d97843'],
      skyNight: ['#060a14', '#101a2d'],
      ambientLight: 0.95,
      distantMountainColor: '#243a57',
      distantMountainFog: 'rgba(21, 67, 116, 0.4)',
    },
  },
  3: {
    id: 3,
    name: 'Mountain Pass',
    subtitle: 'Rugged ridges creating channeled wind corridors and shadows',
    terrainStyle: 'mountain_pass',
    mountainDensity: 0.65,
    vegetationDensity: 0.45,
    riverPresence: true,
    weatherVisualStyle: {
      cloudDensityMultiplier: 1.1,
      precipitationParticleDensity: 1.1,
      atmosphericDrama: 0.65,
    },
    visualAtmosphere: {
      fog: 0.18,
      lighting: 'rocky_dusk',
      skyDawn: ['#1c1c36', '#d68763'],
      skyNoon: ['#183a66', '#4f85c7'],
      skyDusk: ['#2d1b3f', '#c96441'],
      skyNight: ['#080913', '#121626'],
      ambientLight: 0.9,
      distantMountainColor: '#2b3345',
      distantMountainFog: 'rgba(24, 58, 102, 0.5)',
    },
  },
  4: {
    id: 4,
    name: 'Solar Basin',
    subtitle: 'Clear skies with dramatic diurnal solar variations',
    terrainStyle: 'solar_valley',
    mountainDensity: 0.3,
    vegetationDensity: 0.5,
    riverPresence: false,
    weatherVisualStyle: {
      cloudDensityMultiplier: 0.75,
      precipitationParticleDensity: 0.6,
      atmosphericDrama: 0.3,
    },
    visualAtmosphere: {
      fog: 0.05,
      lighting: 'high_noon',
      skyDawn: ['#182342', '#f29b52'],
      skyNoon: ['#0d4282', '#4b98f2'],
      skyDusk: ['#301740', '#e86234'],
      skyNight: ['#040710', '#0a1222'],
      ambientLight: 1.05,
      distantMountainColor: '#203657',
      distantMountainFog: 'rgba(13, 66, 130, 0.35)',
    },
  },
  5: {
    id: 5,
    name: 'River Basin',
    subtitle: 'Dynamic hydrological flow with active rapids and hydro power',
    terrainStyle: 'river_basin',
    mountainDensity: 0.4,
    vegetationDensity: 0.85,
    riverPresence: true,
    weatherVisualStyle: {
      cloudDensityMultiplier: 1.0,
      precipitationParticleDensity: 1.15,
      atmosphericDrama: 0.6,
    },
    visualAtmosphere: {
      fog: 0.15,
      lighting: 'river_shimmer',
      skyDawn: ['#13243a', '#d49668'],
      skyNoon: ['#114578', '#468ecf'],
      skyDusk: ['#221d38', '#cc764b'],
      skyNight: ['#050c18', '#0c182c'],
      ambientLight: 0.98,
      distantMountainColor: '#1d3b59',
      distantMountainFog: 'rgba(17, 69, 120, 0.45)',
    },
  },
  6: {
    id: 6,
    name: 'Dynamic Weather Frontier',
    subtitle: 'Shifting atmospheric fronts demanding balanced grid conduits',
    terrainStyle: 'weather_frontier',
    mountainDensity: 0.45,
    vegetationDensity: 0.6,
    riverPresence: true,
    weatherVisualStyle: {
      cloudDensityMultiplier: 1.25,
      precipitationParticleDensity: 1.35,
      atmosphericDrama: 0.9,
    },
    visualAtmosphere: {
      fog: 0.25,
      lighting: 'storm_indigo',
      skyDawn: ['#191e30', '#b87e68'],
      skyNoon: ['#1d2d47', '#3c587d'],
      skyDusk: ['#281e36', '#9c5a4d'],
      skyNight: ['#070a12', '#0f1725'],
      ambientLight: 0.85,
      distantMountainColor: '#242c3d',
      distantMountainFog: 'rgba(29, 45, 71, 0.6)',
    },
  },
  7: {
    id: 7,
    name: 'Highland Peaks',
    subtitle: 'Towering mountain topography with severe windward barriers',
    terrainStyle: 'highland_peaks',
    mountainDensity: 0.8,
    vegetationDensity: 0.35,
    riverPresence: true,
    weatherVisualStyle: {
      cloudDensityMultiplier: 1.15,
      precipitationParticleDensity: 1.25,
      atmosphericDrama: 0.75,
    },
    visualAtmosphere: {
      fog: 0.22,
      lighting: 'alpine_frost',
      skyDawn: ['#1c203b', '#ce8d7b'],
      skyNoon: ['#1e4069', '#4d7ca8'],
      skyDusk: ['#2c1f3d', '#bf6a5a'],
      skyNight: ['#080a14', '#111728'],
      ambientLight: 0.9,
      distantMountainColor: '#30394d',
      distantMountainFog: 'rgba(30, 64, 105, 0.55)',
    },
  },
  8: {
    id: 8,
    name: 'Frozen Alpine Thaw',
    subtitle: 'Sub-zero snowpack accumulation with degree-day melt surges',
    terrainStyle: 'frozen_alpine',
    mountainDensity: 0.7,
    vegetationDensity: 0.4,
    riverPresence: true,
    weatherVisualStyle: {
      cloudDensityMultiplier: 1.2,
      precipitationParticleDensity: 1.4,
      atmosphericDrama: 0.8,
    },
    visualAtmosphere: {
      fog: 0.3,
      lighting: 'winter_ice',
      skyDawn: ['#1c263c', '#c79ba8'],
      skyNoon: ['#264467', '#5f88b5'],
      skyDusk: ['#29233f', '#a9738f'],
      skyNight: ['#090d18', '#141d2f'],
      ambientLight: 0.88,
      distantMountainColor: '#384860',
      distantMountainFog: 'rgba(38, 68, 103, 0.65)',
    },
  },
  9: {
    id: 9,
    name: 'Connected Grid Network',
    subtitle: 'Extensive multi-zone settlements requiring optimal energy routing',
    terrainStyle: 'grid_network',
    mountainDensity: 0.35,
    vegetationDensity: 0.6,
    riverPresence: true,
    weatherVisualStyle: {
      cloudDensityMultiplier: 1.0,
      precipitationParticleDensity: 1.0,
      atmosphericDrama: 0.5,
    },
    visualAtmosphere: {
      fog: 0.1,
      lighting: 'electric_azure',
      skyDawn: ['#15233c', '#e49f65'],
      skyNoon: ['#113d6e', '#4585c9'],
      skyDusk: ['#251a3d', '#dc7042'],
      skyNight: ['#060a14', '#0d1729'],
      ambientLight: 0.95,
      distantMountainColor: '#1d3454',
      distantMountainFog: 'rgba(17, 61, 110, 0.45)',
    },
  },
  10: {
    id: 10,
    name: 'Generalization Frontier',
    subtitle: 'Unpredictable integrated ecosystem testing complete autonomous adaptation',
    terrainStyle: 'integrated_frontier',
    mountainDensity: 0.55,
    vegetationDensity: 0.65,
    riverPresence: true,
    weatherVisualStyle: {
      cloudDensityMultiplier: 1.3,
      precipitationParticleDensity: 1.35,
      atmosphericDrama: 0.95,
    },
    visualAtmosphere: {
      fog: 0.2,
      lighting: 'dynamic_frontier',
      skyDawn: ['#1b1f38', '#d98b68'],
      skyNoon: ['#163c6c', '#4c82be'],
      skyDusk: ['#2b1c3b', '#cc694f'],
      skyNight: ['#070a13', '#10182b'],
      ambientLight: 0.95,
      distantMountainColor: '#26344d',
      distantMountainFog: 'rgba(22, 60, 108, 0.5)',
    },
  },
};
