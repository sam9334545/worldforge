import React, { useRef, useEffect, useCallback, useState } from 'react';
import type { CellState } from '../../sim/types.ts';
import type { WorldState } from '../../sim/contracts/WorldState.ts';
import type { SelectedBuildTool, InteractionMode } from '../ui/BottomControlDock.tsx';
import { PlacementEngine } from '../../sim/rules.ts';
import { MACHINE_CONFIGS } from '../../sim/constants.ts';
import { EnergyNetworkEngine } from '../../sim/energy/network.ts';
import type { XRayLayer } from './XRayControls.tsx';
import type { LevelId } from '../../levels/LevelConfig.ts';
import { LEVEL_VISUAL_THEMES } from '../../levels/LevelVisualTheme.ts';
import { audioSystem } from '../../utils/audioSystem.ts';

interface WorldCanvasProps {
  worldState: WorldState;
  selectedCell: { x: number; y: number } | null;
  onSelectCell: (cell: CellState | null) => void;
  hoveredCell: { x: number; y: number } | null;
  setHoveredCell: (pos: { x: number; y: number } | null) => void;
  buildTool?: SelectedBuildTool;
  onBuild?: (cell: CellState) => void;
  onBuildCablePath?: (path: Array<{ x: number; y: number }>) => void;
  activeXRayLayer?: XRayLayer;
  focusCoord?: { x: number; y: number } | null;
  constructionPulse?: { x: number; y: number; time: number } | null;
  levelId?: LevelId;
  mode?: InteractionMode;
}

// Particle definitions for object pooling
interface WindParticle {
  x: number;
  y: number;
  speed: number;
  length: number;
  alpha: number;
}

interface RainParticle {
  x: number;
  y: number;
  speed: number;
  length: number;
  alpha: number;
}

interface SnowParticle {
  x: number;
  y: number;
  speed: number;
  size: number;
  alpha: number;
  sway: number;
}

interface CloudLobe {
  ox: number;
  oy: number;
  r: number;
}

interface CloudPuff {
  x: number;
  y: number;
  altitude: number;
  size: number;
  opacity: number;
  speed: number;
  lobes: CloudLobe[];
}

interface Star {
  x: number;
  y: number;
  radius: number;
  twinklePhase: number;
}

export const WorldCanvas: React.FC<WorldCanvasProps> = ({
  worldState,
  selectedCell,
  onSelectCell,
  hoveredCell,
  setHoveredCell,
  buildTool,
  onBuild,
  onBuildCablePath,
  activeXRayLayer = 'none',
  focusCoord,
  constructionPulse,
  levelId = 1,
  mode = 'simulate'
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Active level visual theme
  const visualTheme = LEVEL_VISUAL_THEMES[levelId] || LEVEL_VISUAL_THEMES[1];

  // Isometric tile geometry constants
  const tileWidth = 84;
  const tileHeight = 42;
  const elevationStep = 13;

  // Interactive Conduit / Cable routing state
  const [cablePath, setCablePath] = useState<Array<{ x: number; y: number }>>([]);
  const isCableDragging = useRef<boolean>(false);

  // Smooth Camera State (current interpolated towards target)
  const currentPan = useRef<{ x: number; y: number }>({ x: 0, y: -40 });
  const targetPan = useRef<{ x: number; y: number }>({ x: 0, y: -40 });
  const currentZoom = useRef<number>(1.35);
  const targetZoom = useRef<number>(1.35);

  const isDragging = useRef<boolean>(false);
  const dragStart = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragDistance = useRef<number>(0);

  // Animation & Visual Interpolation states
  const animFrameId = useRef<number | null>(null);
  const animTime = useRef<number>(0);
  const turbineAngles = useRef<{ [key: string]: number }>({});
  const hydroWheelAngles = useRef<{ [key: string]: number }>({});

  // Visual Interpolation Layer (Separation of Simulation Speed from Ambient Visuals)
  const interpSunElevation = useRef<number>(45);
  const interpSunAzimuth = useRef<number>(180);
  const interpWindSpeed = useRef<number>(8.0);
  const interpTemp = useRef<number>(20.0);
  const interpRiverFlow = useRef<number>(20.0);
  const interpSnowCoverage = useRef<number>(0.0);

  // Lightning Flash State
  const lightningTime = useRef<number>(0);
  const lightningFlashDuration = 120; // ms

  const { grid, width, height } = worldState;

  // Object-pooled wind particles (50 particles)
  const windParticles = useRef<WindParticle[]>([]);
  useEffect(() => {
    const pts: WindParticle[] = [];
    for (let i = 0; i < 50; i++) {
      pts.push({
        x: (Math.random() - 0.5) * 1600,
        y: (Math.random() - 0.5) * 1000,
        speed: 1.2 + Math.random() * 2.0,
        length: 14 + Math.random() * 22,
        alpha: 0.15 + Math.random() * 0.25,
      });
    }
    windParticles.current = pts;
  }, []);

  // Object-pooled rain particles (70 particles)
  const rainParticles = useRef<RainParticle[]>([]);
  useEffect(() => {
    const rPts: RainParticle[] = [];
    for (let i = 0; i < 70; i++) {
      rPts.push({
        x: (Math.random() - 0.5) * 1600,
        y: (Math.random() - 0.5) * 1000,
        speed: 12 + Math.random() * 8,
        length: 12 + Math.random() * 12,
        alpha: 0.35 + Math.random() * 0.35,
      });
    }
    rainParticles.current = rPts;
  }, []);

  // Object-pooled snow particles (50 particles)
  const snowParticles = useRef<SnowParticle[]>([]);
  useEffect(() => {
    const sPts: SnowParticle[] = [];
    for (let i = 0; i < 50; i++) {
      sPts.push({
        x: (Math.random() - 0.5) * 1600,
        y: (Math.random() - 0.5) * 1000,
        speed: 1.0 + Math.random() * 1.5,
        size: 1.5 + Math.random() * 2.5,
        alpha: 0.4 + Math.random() * 0.5,
        sway: Math.random() * Math.PI * 2,
      });
    }
    snowParticles.current = sPts;
  }, []);

  // Object-pooled celestial night stars (50 stars)
  const stars = useRef<Star[]>([]);
  useEffect(() => {
    const st: Star[] = [];
    for (let i = 0; i < 50; i++) {
      st.push({
        x: Math.random() * 1920,
        y: Math.random() * 450,
        radius: 0.6 + Math.random() * 1.2,
        twinklePhase: Math.random() * Math.PI * 2,
      });
    }
    stars.current = st;
  }, []);

  // Procedural drifting atmospheric cumulus clouds (7 formations)
  const clouds = useRef<CloudPuff[]>([
    {
      x: -520, y: -260, altitude: 175, size: 140, opacity: 0.76, speed: 0.38,
      lobes: [
        { ox: 0, oy: 0, r: 0.9 },
        { ox: -0.4, oy: 0.08, r: 0.65 },
        { ox: 0.42, oy: 0.06, r: 0.7 },
        { ox: -0.15, oy: -0.32, r: 0.6 },
        { ox: 0.22, oy: -0.25, r: 0.55 },
        { ox: 0, oy: 0.15, r: 0.8 }
      ]
    },
    {
      x: 140, y: -340, altitude: 195, size: 185, opacity: 0.8, speed: 0.44,
      lobes: [
        { ox: 0, oy: 0, r: 0.95 },
        { ox: -0.45, oy: 0.1, r: 0.68 },
        { ox: 0.48, oy: 0.05, r: 0.72 },
        { ox: -0.18, oy: -0.35, r: 0.65 },
        { ox: 0.2, oy: -0.3, r: 0.6 },
        { ox: 0, oy: 0.18, r: 0.85 }
      ]
    },
    {
      x: -240, y: 140, altitude: 165, size: 155, opacity: 0.72, speed: 0.35,
      lobes: [
        { ox: 0, oy: 0, r: 0.88 },
        { ox: -0.38, oy: 0.08, r: 0.6 },
        { ox: 0.4, oy: 0.05, r: 0.65 },
        { ox: -0.12, oy: -0.3, r: 0.58 },
        { ox: 0.18, oy: -0.22, r: 0.52 },
        { ox: 0, oy: 0.12, r: 0.75 }
      ]
    },
    {
      x: 380, y: -100, altitude: 185, size: 165, opacity: 0.75, speed: 0.4,
      lobes: [
        { ox: 0, oy: 0, r: 0.92 },
        { ox: -0.42, oy: 0.08, r: 0.65 },
        { ox: 0.45, oy: 0.06, r: 0.7 },
        { ox: -0.16, oy: -0.32, r: 0.62 },
        { ox: 0.22, oy: -0.26, r: 0.58 }
      ]
    },
    {
      x: 580, y: 160, altitude: 170, size: 145, opacity: 0.7, speed: 0.36,
      lobes: [
        { ox: 0, oy: 0, r: 0.9 },
        { ox: -0.4, oy: 0.1, r: 0.62 },
        { ox: 0.42, oy: 0.08, r: 0.68 },
        { ox: -0.15, oy: -0.3, r: 0.58 },
        { ox: 0.2, oy: -0.24, r: 0.54 }
      ]
    },
    {
      x: -340, y: -90, altitude: 160, size: 175, opacity: 0.77, speed: 0.39,
      lobes: [
        { ox: 0, oy: 0, r: 0.94 },
        { ox: -0.44, oy: 0.08, r: 0.66 },
        { ox: 0.46, oy: 0.06, r: 0.72 },
        { ox: -0.18, oy: -0.34, r: 0.64 },
        { ox: 0.24, oy: -0.28, r: 0.58 }
      ]
    },
    {
      x: 20, y: 220, altitude: 155, size: 135, opacity: 0.68, speed: 0.34,
      lobes: [
        { ox: 0, oy: 0, r: 0.88 },
        { ox: -0.38, oy: 0.08, r: 0.6 },
        { ox: 0.4, oy: 0.06, r: 0.65 },
        { ox: -0.14, oy: -0.28, r: 0.55 },
        { ox: 0.18, oy: -0.22, r: 0.5 }
      ]
    }
  ]);

  // Escape key cancels cable routing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && cablePath.length > 0) {
        setCablePath([]);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cablePath.length]);

  // Convert grid (x, y) with elevation to isometric canvas coordinates
  const gridToIso = useCallback((x: number, y: number, elev: number) => {
    const isoX = (x - y) * (tileWidth / 2);
    const isoY = (x + y) * (tileHeight / 2) - elev * elevationStep;
    return { x: isoX, y: isoY };
  }, [tileWidth, tileHeight, elevationStep]);

  // Smooth Camera Fly-To when focusCoord changes
  useEffect(() => {
    if (focusCoord && canvasRef.current) {
      const targetElev = grid[focusCoord.y]?.[focusCoord.x]?.baseTerrain.elevation ?? 0;
      const pt = gridToIso(focusCoord.x, focusCoord.y, targetElev);
      targetPan.current = {
        x: -pt.x * targetZoom.current,
        y: -pt.y * targetZoom.current + 40
      };
    }
  }, [focusCoord, grid, gridToIso]);

  // Convert screen coordinates back to grid (x, y)
  const screenToGrid = useCallback((screenX: number, screenY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const originX = canvas.width / 2 + currentPan.current.x;
    const originY = canvas.height / 2.3 + currentPan.current.y;

    const relX = (screenX - originX) / currentZoom.current;
    const relY = (screenY - originY) / currentZoom.current;

    let closest: { x: number; y: number } | null = null;
    let minDistance = Infinity;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const cell = grid[y][x];
        const elev = cell.baseTerrain.elevation;
        const pt = gridToIso(x, y, elev);

        const dist = Math.hypot(relX - pt.x, relY - pt.y);
        if (dist < minDistance && dist < tileWidth * 0.72) {
          minDistance = dist;
          closest = { x, y };
        }
      }
    }

    return closest;
  }, [height, width, grid, gridToIso, tileWidth]);

  // Palette with richer 2.5D shading, bevel highlights, and cliff strata
  const getBlockShading = useCallback((id: string, elev: number) => {
    switch (id) {
      case 'T01': // Grass/Meadow
        return {
          top: elev >= 2 ? '#2f633a' : '#265430',
          topBevel: '#437d4f',
          left: '#193320',
          right: '#0f2215',
          cliff: '#1d3824',
          stroke: '#3b7348'
        };
      case 'T02': // Sand
        return {
          top: '#7f532a',
          topBevel: '#9b6736',
          left: '#523419',
          right: '#34210f',
          cliff: '#523419',
          stroke: '#9b6736'
        };
      case 'T03': // Mud/Clay
        return {
          top: '#432c1e',
          topBevel: '#573926',
          left: '#2a1b13',
          right: '#1b120c',
          cliff: '#2e1e15',
          stroke: '#5a3c2a'
        };
      case 'T04': // Stone/Ridge
        return {
          top: '#383e47',
          topBevel: '#4b535f',
          left: '#24282e',
          right: '#171a1e',
          cliff: '#282c34',
          stroke: '#505966'
        };
      case 'T05': // Alpine Snow
        return {
          top: '#edf4fb',
          topBevel: '#ffffff',
          left: '#b5c9fc',
          right: '#93aee8',
          cliff: '#7693d6',
          stroke: '#ffffff'
        };
      case 'T06': // River/Water
        return {
          top: '#006edc',
          topBevel: '#3588f7',
          left: '#00479b',
          right: '#002f69',
          cliff: '#00479b',
          stroke: '#54a3ff'
        };
      case 'T07': // Gravel
        return {
          top: '#505866',
          topBevel: '#646e7d',
          left: '#363c45',
          right: '#22262c',
          cliff: '#363c45',
          stroke: '#707b8d'
        };
      default:
        return {
          top: '#22262e',
          topBevel: '#323842',
          left: '#15181d',
          right: '#0d0f12',
          cliff: '#15181d',
          stroke: '#38404d'
        };
    }
  }, []);

  // Main Unified 60FPS Continuous Animation & Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let isRunning = true;

    const renderFrame = (timestamp: number) => {
      if (!isRunning) return;

      animTime.current = timestamp;

      // 1. Smooth Camera Interpolation (lerp current to target)
      currentPan.current.x += (targetPan.current.x - currentPan.current.x) * 0.12;
      currentPan.current.y += (targetPan.current.y - currentPan.current.y) * 0.12;
      currentZoom.current += (targetZoom.current - currentZoom.current) * 0.12;

      // 2. Visual Interpolation Layer (Lerp simulation values for seamless transitions)
      const targetSunElev = worldState.globalEnv.sunElevation ?? 45;
      const targetSunAzim = worldState.globalEnv.sunAzimuth ?? 180;
      const targetWindSpd = worldState.globalEnv.globalWindSpeed ?? 8;
      const targetTemp = worldState.globalEnv.ambientTemperature ?? 20;

      interpSunElevation.current += (targetSunElev - interpSunElevation.current) * 0.08;
      interpSunAzimuth.current += (targetSunAzim - interpSunAzimuth.current) * 0.08;
      interpWindSpeed.current += (targetWindSpd - interpWindSpeed.current) * 0.08;
      interpTemp.current += (targetTemp - interpTemp.current) * 0.08;

      let maxRiverFlow = 0;
      let avgSnow = 0;
      let snowCells = 0;
      for (const row of grid) {
        for (const c of row) {
          if (c.dynamic.waterBodyType === 'RIVER') {
            maxRiverFlow = Math.max(maxRiverFlow, c.dynamic.flowRateQ);
          }
          if (c.dynamic.snowDepth > 0) {
            avgSnow += c.dynamic.snowDepth;
            snowCells++;
          }
        }
      }
      interpRiverFlow.current += (maxRiverFlow - interpRiverFlow.current) * 0.08;
      interpSnowCoverage.current += ((snowCells > 0 ? avgSnow / snowCells : 0) - interpSnowCoverage.current) * 0.08;

      // Auto resize canvas to match device pixels
      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== rect.width || canvas.height !== rect.height) {
        canvas.width = rect.width;
        canvas.height = rect.height;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // ----------------------------------------------------
      // PHASE 2: CELESTIAL SKY DOME & DIURNAL LIGHTING
      // ----------------------------------------------------
      const hour = worldState.time.hour;
      let skyTop = '#0a101d';
      let skyBot = '#172338';
      let isNight = false;

      if (hour >= 5 && hour < 8) {
        // Dawn
        skyTop = visualTheme.visualAtmosphere.skyDawn[0];
        skyBot = visualTheme.visualAtmosphere.skyDawn[1];
      } else if (hour >= 8 && hour < 18) {
        // Midday
        skyTop = visualTheme.visualAtmosphere.skyNoon[0];
        skyBot = visualTheme.visualAtmosphere.skyNoon[1];
      } else if (hour >= 18 && hour < 21) {
        // Sunset / Dusk
        skyTop = visualTheme.visualAtmosphere.skyDusk[0];
        skyBot = visualTheme.visualAtmosphere.skyDusk[1];
      } else {
        // Night
        skyTop = visualTheme.visualAtmosphere.skyNight[0];
        skyBot = visualTheme.visualAtmosphere.skyNight[1];
        isNight = true;
      }

      // Check for thunderstorm lightning
      const isStorming = (worldState.events.length > 0 && worldState.events[0].type === 'THERMAL_ANOMALY') ||
        interpWindSpeed.current > 16 ||
        visualTheme.weatherProfile.stormProbability > 0.15;

      if (isStorming && Math.random() < 0.003 && timestamp - lightningTime.current > 2000) {
        lightningTime.current = timestamp;
        audioSystem.playThunderSound();
      }

      const isLightningFlash = timestamp - lightningTime.current < lightningFlashDuration;

      // Render Atmospheric Sky Gradient
      const skyGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      if (isLightningFlash) {
        skyGrad.addColorStop(0, '#e8f0fe');
        skyGrad.addColorStop(0.5, '#c5d8ff');
        skyGrad.addColorStop(1, '#8caeed');
      } else {
        skyGrad.addColorStop(0, skyTop);
        skyGrad.addColorStop(0.65, skyBot);
        skyGrad.addColorStop(1, '#0b0f16');
      }
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Twinkling Celestial Stars at Night
      if (isNight && !isLightningFlash) {
        ctx.save();
        for (const st of stars.current) {
          const twinkle = Math.sin(timestamp * 0.002 + st.twinklePhase);
          ctx.fillStyle = `rgba(255, 255, 255, ${0.4 + twinkle * 0.35})`;
          ctx.beginPath();
          ctx.arc(st.x % canvas.width, st.y, st.radius, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // Celestial Sun / Moon Orbit
      ctx.save();
      const sunElevNorm = Math.max(0, interpSunElevation.current / 90);
      const sunAzimRad = ((interpSunAzimuth.current || 180) * Math.PI) / 180;
      const sunScreenX = canvas.width / 2 + Math.cos(sunAzimRad) * (canvas.width * 0.38);
      const sunScreenY = canvas.height * 0.45 - Math.sin(sunElevNorm * Math.PI * 0.5) * (canvas.height * 0.32);

      if (!isNight) {
        // Glowing Sun Orb with Radial Corona Flare
        const sunGlow = ctx.createRadialGradient(sunScreenX, sunScreenY, 4, sunScreenX, sunScreenY, 80);
        sunGlow.addColorStop(0, 'rgba(255, 250, 210, 0.95)');
        sunGlow.addColorStop(0.2, 'rgba(255, 230, 140, 0.6)');
        sunGlow.addColorStop(0.5, 'rgba(255, 180, 80, 0.2)');
        sunGlow.addColorStop(1, 'rgba(255, 160, 50, 0)');
        ctx.fillStyle = sunGlow;
        ctx.beginPath();
        ctx.arc(sunScreenX, sunScreenY, 80, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(sunScreenX, sunScreenY, 14, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Crescent Moon
        ctx.fillStyle = '#f0f4f8';
        ctx.beginPath();
        ctx.arc(sunScreenX, sunScreenY, 16, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = skyTop;
        ctx.beginPath();
        ctx.arc(sunScreenX + 6, sunScreenY - 3, 14, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // ----------------------------------------------------
      // PHASE 2: DISTANT PANORAMIC MOUNTAIN RANGES (Parallax & Fog)
      // ----------------------------------------------------
      ctx.save();
      const parallaxX = currentPan.current.x * 0.12;
      const horizonY = canvas.height * 0.38;

      // Far Mountain Silhouettes (Layer 1)
      ctx.fillStyle = visualTheme.visualAtmosphere.distantMountainColor;
      ctx.beginPath();
      ctx.moveTo(0, canvas.height);
      ctx.lineTo(0, horizonY);
      for (let mx = 0; mx <= canvas.width + 100; mx += 80) {
        const peakHeight = Math.sin((mx - parallaxX) * 0.006) * 75 + Math.cos((mx - parallaxX) * 0.015) * 45;
        ctx.lineTo(mx, horizonY - 45 - peakHeight);
      }
      ctx.lineTo(canvas.width, canvas.height);
      ctx.closePath();
      ctx.fill();

      // Mid-Distance Mountain Ridge with Alpine Snow Caps (Layer 2)
      ctx.fillStyle = visualTheme.visualAtmosphere.distantMountainFog;
      ctx.beginPath();
      ctx.moveTo(0, canvas.height);
      ctx.lineTo(0, horizonY + 20);
      for (let mx = 0; mx <= canvas.width + 100; mx += 60) {
        const peakHeight = Math.sin((mx - parallaxX * 1.5) * 0.009) * 55 + Math.sin((mx - parallaxX * 1.5) * 0.02) * 30;
        ctx.lineTo(mx, horizonY + 10 - peakHeight);
      }
      ctx.lineTo(canvas.width, canvas.height);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Push world camera transform
      ctx.save();
      const originX = canvas.width / 2 + currentPan.current.x;
      const originY = canvas.height / 2.3 + currentPan.current.y;
      ctx.translate(originX, originY);
      ctx.scale(currentZoom.current, currentZoom.current);

      // ----------------------------------------------------
      // PHASE 1: ORGANIC CONTINENTAL SKIRT & OCEAN FRINGE
      // ----------------------------------------------------
      const skirtMargin = 3;
      const skirtDepth = 38;

      // Ambient coastal ocean water surrounding the island
      const seaGrad = ctx.createRadialGradient(0, 0, 100, 0, 0, 850);
      seaGrad.addColorStop(0, 'rgba(0, 65, 140, 0.45)');
      seaGrad.addColorStop(0.6, 'rgba(0, 35, 85, 0.25)');
      seaGrad.addColorStop(1, 'rgba(5, 12, 25, 0)');
      ctx.fillStyle = seaGrad;
      ctx.beginPath();
      ctx.ellipse(0, (width * tileHeight) / 4, 750, 420, 0, 0, Math.PI * 2);
      ctx.fill();

      // Gentle animated ocean shore waves
      const wavePhase = timestamp * 0.0018;
      ctx.strokeStyle = 'rgba(56, 139, 253, 0.18)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, (width * tileHeight) / 4, 620 + Math.sin(wavePhase) * 6, 340 + Math.cos(wavePhase) * 4, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Continental Substrate Slab Base
      const northCorner = gridToIso(-skirtMargin, -skirtMargin, -0.8);
      const eastCorner = gridToIso(width + skirtMargin - 1, -skirtMargin, -0.8);
      const southCorner = gridToIso(width + skirtMargin - 1, height + skirtMargin - 1, -0.8);
      const westCorner = gridToIso(-skirtMargin, height + skirtMargin - 1, -0.8);

      // Draw Continental Base Faces
      ctx.fillStyle = '#0f141c';
      ctx.beginPath();
      ctx.moveTo(westCorner.x, westCorner.y);
      ctx.lineTo(southCorner.x, southCorner.y);
      ctx.lineTo(southCorner.x, southCorner.y + skirtDepth);
      ctx.lineTo(westCorner.x, westCorner.y + skirtDepth);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#090d13';
      ctx.beginPath();
      ctx.moveTo(southCorner.x, southCorner.y);
      ctx.lineTo(eastCorner.x, eastCorner.y);
      ctx.lineTo(eastCorner.x, eastCorner.y + skirtDepth);
      ctx.lineTo(southCorner.x, southCorner.y + skirtDepth);
      ctx.closePath();
      ctx.fill();

      // Top Continental Bedrock Plate
      ctx.fillStyle = '#171e28';
      ctx.strokeStyle = '#222c3a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(northCorner.x, northCorner.y);
      ctx.lineTo(eastCorner.x, eastCorner.y);
      ctx.lineTo(southCorner.x, southCorner.y);
      ctx.lineTo(westCorner.x, westCorner.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // ----------------------------------------------------
      // PROCEDURAL MOVING CLOUD SHADOWS
      // ----------------------------------------------------
      const windRad = ((worldState.globalEnv.globalWindDirection || 270) * Math.PI) / 180;
      const windSpeed = interpWindSpeed.current;
      const cloudSpeedMul = 0.09 * (windSpeed / 10);
      const moveDx = -Math.sin(windRad);
      const moveDy = Math.cos(windRad) * 0.5;

      ctx.save();
      for (const cloud of clouds.current) {
        cloud.x += moveDx * cloud.speed * cloudSpeedMul;
        cloud.y += moveDy * cloud.speed * cloudSpeedMul;

        // Wrap around world boundary smoothly
        if (cloud.x > 800) cloud.x = -800;
        if (cloud.x < -800) cloud.x = 800;
        if (cloud.y > 550) cloud.y = -550;
        if (cloud.y < -550) cloud.y = 550;

        // Soft ground shadow blob cast on the landscape
        const shadowGrad = ctx.createRadialGradient(cloud.x, cloud.y + 30, 10, cloud.x, cloud.y + 30, cloud.size * 0.75);
        shadowGrad.addColorStop(0, `rgba(0, 0, 0, ${cloud.opacity * 0.38})`);
        shadowGrad.addColorStop(0.65, `rgba(0, 0, 0, ${cloud.opacity * 0.16})`);
        shadowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = shadowGrad;
        ctx.beginPath();
        ctx.ellipse(cloud.x, cloud.y + 30, cloud.size * 0.9, cloud.size * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // ----------------------------------------------------
      // 2.5D ELEVATED TERRAIN RENDERING & LIVING VEGETATION
      // ----------------------------------------------------
      const windSwayMag = Math.min(8, Math.max(1.2, windSpeed * 0.45));
      const treePhase = timestamp * 0.0035;

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const cell = grid[y][x];
          const elev = cell.baseTerrain.elevation;
          const pt = gridToIso(x, y, elev);
          const shading = getBlockShading(cell.baseTerrain.id, elev);

          const isSelected = selectedCell?.x === x && selectedCell?.y === y;
          const isHovered = hoveredCell?.x === x && hoveredCell?.y === y;

          // A. Draw Elevation Vertical Cliff Faces
          if (elev > 0) {
            const cliffBaseY = pt.y + elev * elevationStep;

            // Left Cliff Face
            ctx.fillStyle = shading.left;
            ctx.beginPath();
            ctx.moveTo(pt.x - tileWidth / 2, pt.y);
            ctx.lineTo(pt.x, pt.y + tileHeight / 2);
            ctx.lineTo(pt.x, cliffBaseY + tileHeight / 2);
            ctx.lineTo(pt.x - tileWidth / 2, cliffBaseY);
            ctx.closePath();
            ctx.fill();

            // Right Cliff Face (Leeward shading contrast)
            ctx.fillStyle = shading.right;
            ctx.beginPath();
            ctx.moveTo(pt.x, pt.y + tileHeight / 2);
            ctx.lineTo(pt.x + tileWidth / 2, pt.y);
            ctx.lineTo(pt.x + tileWidth / 2, cliffBaseY);
            ctx.lineTo(pt.x + tileWidth / 2, cliffBaseY);
            ctx.lineTo(pt.x, cliffBaseY + tileHeight / 2);
            ctx.closePath();
            ctx.fill();

            // Cliff Strata Lines (Rock ridge details)
            if (cell.baseTerrain.id === 'T04' || cell.baseTerrain.id === 'T05') {
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
              ctx.lineWidth = 1;
              for (let s = 1; s <= elev; s++) {
                const sy = pt.y + s * elevationStep;
                ctx.beginPath();
                ctx.moveTo(pt.x - tileWidth / 2, sy);
                ctx.lineTo(pt.x, sy + tileHeight / 2);
                ctx.lineTo(pt.x + tileWidth / 2, sy);
                ctx.stroke();
              }
            }
          }

          // B. Top Diamond Face
          ctx.beginPath();
          ctx.moveTo(pt.x, pt.y - tileHeight / 2);
          ctx.lineTo(pt.x + tileWidth / 2, pt.y);
          ctx.lineTo(pt.x, pt.y + tileHeight / 2);
          ctx.lineTo(pt.x - tileWidth / 2, pt.y);
          ctx.closePath();

          let topFill = shading.top;
          if (isSelected) {
            topFill = 'rgba(88, 166, 255, 0.55)';
          } else if (isHovered) {
            topFill = 'rgba(175, 198, 255, 0.4)';
          }
          ctx.fillStyle = topFill;
          ctx.fill();

          // Top Bevel Highlight Stroke
          ctx.strokeStyle = isSelected ? '#58a6ff' : (isHovered ? '#afc6ff' : shading.topBevel);
          ctx.lineWidth = isSelected ? 2.5 : (isHovered ? 1.8 : 0.85);
          ctx.stroke();

          // Demand Zone Intake Ground Terminal Highlight
          const activeDemandZoneOnCell = worldState.demandZones?.find(dz =>
            dz.cells?.some(c => c.x === x && c.y === y)
          );
          if (activeDemandZoneOnCell) {
            const pulse = (Math.sin(timestamp * 0.005 + x * 0.5 + y * 0.5) + 1) / 2;
            ctx.save();

            // High-visibility glowing intake surface
            ctx.fillStyle = `rgba(56, 189, 248, ${0.25 + pulse * 0.15})`;
            ctx.fill();

            // Glowing boundary stroke
            ctx.strokeStyle = `rgba(56, 189, 248, ${0.85 + pulse * 0.15})`;
            ctx.lineWidth = 2.8;
            ctx.shadowColor = '#38bdf8';
            ctx.shadowBlur = 10 + pulse * 8;
            ctx.stroke();

            // Crosshatch / intake terminal lines on ground
            ctx.strokeStyle = `rgba(255, 255, 255, ${0.35 + pulse * 0.25})`;
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(pt.x - tileWidth / 4, pt.y);
            ctx.lineTo(pt.x, pt.y - tileHeight / 4);
            ctx.moveTo(pt.x, pt.y + tileHeight / 4);
            ctx.lineTo(pt.x + tileWidth / 4, pt.y);
            ctx.stroke();

            ctx.restore();
          }

          // C. Visible Terrain Reinforcement Overlays (Distinguishable without opening inspector)
          if (cell.overlays.includes('Gravel')) {
            // Visible Gravel Aggregate Ballast
            ctx.fillStyle = 'rgba(180, 190, 205, 0.7)';
            ctx.beginPath();
            ctx.arc(pt.x - 8, pt.y - 2, 2.0, 0, Math.PI * 2);
            ctx.arc(pt.x + 8, pt.y + 3, 1.8, 0, Math.PI * 2);
            ctx.arc(pt.x + 2, pt.y - 5, 2.2, 0, Math.PI * 2);
            ctx.arc(pt.x - 2, pt.y + 4, 1.9, 0, Math.PI * 2);
            ctx.fill();
          }
          if (cell.overlays.includes('Stone')) {
            // Visible Concrete/Stone Anchor Footing
            ctx.strokeStyle = '#8b949e';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(pt.x - 10, pt.y - 6, 20, 12);
          }

          // D. Dynamic Snow Coverage (Soft snowy frost on ground when cold/snowy)
          if (cell.dynamic.snowDepth > 0.05 || (cell.baseTerrain.id === 'T05' && interpSnowCoverage.current > 0.1)) {
            const snowAlpha = Math.min(0.85, (cell.dynamic.snowDepth + interpSnowCoverage.current) * 0.9);
            ctx.fillStyle = `rgba(240, 246, 255, ${snowAlpha})`;
            ctx.beginPath();
            ctx.ellipse(pt.x, pt.y, tileWidth * 0.35, tileHeight * 0.35, 0, 0, Math.PI * 2);
            ctx.fill();
          }

          // E. Micro-details: Flowing River Waves & Living Vegetation
          const cellHash = (x * 37 + y * 19 + worldState.seed) % 100;

          if (cell.dynamic.waterBodyType === 'RIVER') {
            // Flowing Water Shimmer Waves (Speed and foam proportional to velocity & discharge Q)
            const riverVel = Math.max(0.5, cell.dynamic.velocity || 1.0);
            const riverQ = cell.dynamic.flowRateQ || 20;
            const riverOffset = (timestamp * 0.003 * riverVel) % 14;

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.42)';
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.moveTo(pt.x - 12 + riverOffset, pt.y - 2);
            ctx.lineTo(pt.x + riverOffset, pt.y + 4);
            ctx.lineTo(pt.x + 12 + riverOffset, pt.y - 2);
            ctx.stroke();

            // High river flow foam rapids along river banks
            if (riverQ > 40) {
              ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
              const foamBlink = Math.sin(timestamp * 0.01 + x + y);
              if (foamBlink > 0) {
                ctx.beginPath();
                ctx.arc(pt.x - 8, pt.y + 3, 2, 0, Math.PI * 2);
                ctx.arc(pt.x + 9, pt.y - 3, 1.8, 0, Math.PI * 2);
                ctx.fill();
              }
            }
          } else if (cell.baseTerrain.id === 'T01' && !cell.machine && !cell.cable) {
            // LIVING SWAYING TREES (Section 6)
            if (cellHash > 28) {
              const swayAngle = Math.sin(treePhase + (x * 0.7) + (y * 0.4)) * windSwayMag;
              const isPine = cellHash % 2 === 0;

              ctx.save();
              ctx.translate(pt.x, pt.y);

              // Tree Trunk
              ctx.fillStyle = '#2c1e13';
              ctx.fillRect(-1.5, -6, 3, 6);

              // Canopy Sway
              ctx.translate(swayAngle * 0.4, 0);

              if (isPine) {
                // Tiered Evergreen Pine Fir
                const pineGreen = interpTemp.current < 2 ? '#3a5442' : '#234e2c';
                ctx.fillStyle = pineGreen;

                // Tier 1 (Bottom)
                ctx.beginPath();
                ctx.moveTo(-10, -6);
                ctx.lineTo(0, -16);
                ctx.lineTo(10, -6);
                ctx.closePath();
                ctx.fill();

                // Tier 2 (Middle)
                ctx.beginPath();
                ctx.moveTo(-8, -12);
                ctx.lineTo(0, -22);
                ctx.lineTo(8, -12);
                ctx.closePath();
                ctx.fill();

                // Tier 3 (Top)
                ctx.beginPath();
                ctx.moveTo(-5, -18);
                ctx.lineTo(0, -28);
                ctx.lineTo(5, -18);
                ctx.closePath();
                ctx.fill();

                // Snow Cap on Pine Tree Crown
                if (interpTemp.current < 2 || cell.dynamic.snowDepth > 0) {
                  ctx.fillStyle = '#ffffff';
                  ctx.beginPath();
                  ctx.moveTo(-3, -24);
                  ctx.lineTo(0, -29);
                  ctx.lineTo(3, -24);
                  ctx.closePath();
                  ctx.fill();
                }
              } else {
                // Deciduous Broadleaf Tree
                const leafGreen = interpTemp.current < 2 ? '#48634e' : '#336e3b';
                ctx.fillStyle = leafGreen;
                ctx.beginPath();
                ctx.arc(0, -18, 9, 0, Math.PI * 2);
                ctx.fill();

                ctx.beginPath();
                ctx.arc(-5, -14, 6, 0, Math.PI * 2);
                ctx.arc(5, -14, 6, 0, Math.PI * 2);
                ctx.fill();

                // Snow Cap on Broadleaf Canopy
                if (interpTemp.current < 2 || cell.dynamic.snowDepth > 0) {
                  ctx.fillStyle = '#ffffff';
                  ctx.beginPath();
                  ctx.ellipse(0, -25, 6, 2.5, 0, 0, Math.PI * 2);
                  ctx.fill();
                }
              }

              ctx.restore();
            }
          }

          // ----------------------------------------------------
          // LIVING INFRASTRUCTURE ANIMATIONS
          // ----------------------------------------------------
          if (cell.machine) {
            const machineKey = `${x}_${y}`;
            ctx.save();
            ctx.translate(pt.x, pt.y - 6);

            if (cell.machine.type === 'LandSolar' || cell.machine.type === 'FloatSolar') {
              // Recognizable Multi-Panel Solar Array with mounting frame & specular glint
              const irr = cell.dynamic.effectiveIrradiance || 600;
              const glint = isNight ? 0 : Math.min(1.0, irr / 900);

              // Sub-panel mounting rack
              ctx.strokeStyle = '#2d333b';
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.moveTo(-14, 8);
              ctx.lineTo(0, 12);
              ctx.lineTo(14, 6);
              ctx.stroke();

              // Multi-panel angled diamond face (darker at night / cloud cover)
              ctx.fillStyle = isNight ? '#08111b' : '#0a2540';
              ctx.strokeStyle = `rgba(121, 192, 255, ${0.4 + glint * 0.4})`;
              ctx.lineWidth = 1.2;
              ctx.beginPath();
              ctx.moveTo(-16, -6);
              ctx.lineTo(12, -12);
              ctx.lineTo(16, 6);
              ctx.lineTo(-12, 12);
              ctx.closePath();
              ctx.fill();
              ctx.stroke();

              // Silicon cell grid divisions
              ctx.strokeStyle = isNight ? 'rgba(88, 166, 255, 0.15)' : 'rgba(88, 166, 255, 0.35)';
              ctx.lineWidth = 0.8;
              ctx.beginPath();
              ctx.moveTo(-2, -9);
              ctx.lineTo(2, 9);
              ctx.moveTo(-14, 3);
              ctx.lineTo(14, -3);
              ctx.stroke();

              // Continuous Reflected Solar Rays & Specular Sunbeam (Section 12)
              if (!isNight && glint > 0.15) {
                ctx.save();

                // A. Reflected Sunlight Beam projecting upward from the panel surface
                const sunBeamAngle = -Math.PI * 0.38;
                const beamLength = 28 + Math.sin(timestamp * 0.003 + (x * 3 + y * 2)) * 8;
                const beamWidth = 12 * glint;

                const beamGrad = ctx.createLinearGradient(0, 0, Math.cos(sunBeamAngle) * beamLength, Math.sin(sunBeamAngle) * beamLength);
                beamGrad.addColorStop(0, `rgba(255, 250, 200, ${0.45 * glint})`);
                beamGrad.addColorStop(0.5, `rgba(255, 230, 130, ${0.2 * glint})`);
                beamGrad.addColorStop(1, 'rgba(255, 220, 100, 0)');

                ctx.fillStyle = beamGrad;
                ctx.beginPath();
                ctx.moveTo(-10, 0);
                ctx.lineTo(-10 + Math.cos(sunBeamAngle) * beamLength - beamWidth * 0.5, Math.sin(sunBeamAngle) * beamLength);
                ctx.lineTo(6 + Math.cos(sunBeamAngle) * beamLength + beamWidth * 0.5, Math.sin(sunBeamAngle) * beamLength);
                ctx.lineTo(6, 4);
                ctx.closePath();
                ctx.fill();

                // B. Dynamic Radiating Starburst Reflection Rays (Multi-spoke specular reflection flare)
                const flarePulse = Math.sin(timestamp * 0.004 + (x * 13 + y * 7)) * 0.35 + 0.65;
                const rayAlpha = Math.min(0.9, glint * flarePulse);
                const flareCenter = { x: 0, y: -2 };

                // Core glint glow
                const coreGrad = ctx.createRadialGradient(flareCenter.x, flareCenter.y, 1, flareCenter.x, flareCenter.y, 10 * glint);
                coreGrad.addColorStop(0, '#ffffff');
                coreGrad.addColorStop(0.3, `rgba(255, 245, 170, ${rayAlpha})`);
                coreGrad.addColorStop(1, 'rgba(255, 220, 80, 0)');
                ctx.fillStyle = coreGrad;
                ctx.beginPath();
                ctx.arc(flareCenter.x, flareCenter.y, 10 * glint, 0, Math.PI * 2);
                ctx.fill();

                // 4-Spoke Primary Solar Ray Cross
                const rayLen = 14 + flarePulse * 12;
                ctx.strokeStyle = `rgba(255, 255, 230, ${rayAlpha})`;
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(flareCenter.x - rayLen, flareCenter.y);
                ctx.lineTo(flareCenter.x + rayLen, flareCenter.y);
                ctx.moveTo(flareCenter.x, flareCenter.y - rayLen * 0.65);
                ctx.lineTo(flareCenter.x, flareCenter.y + rayLen * 0.65);
                ctx.stroke();

                // Diagonal Secondary Reflected Ray Spikes
                const diagLen = rayLen * 0.65;
                ctx.strokeStyle = `rgba(255, 240, 160, ${rayAlpha * 0.7})`;
                ctx.lineWidth = 1.0;
                ctx.beginPath();
                ctx.moveTo(flareCenter.x - diagLen, flareCenter.y - diagLen * 0.5);
                ctx.lineTo(flareCenter.x + diagLen, flareCenter.y + diagLen * 0.5);
                ctx.moveTo(flareCenter.x - diagLen, flareCenter.y + diagLen * 0.5);
                ctx.lineTo(flareCenter.x + diagLen, flareCenter.y - diagLen * 0.5);
                ctx.stroke();

                // C. Floating Solar Photon Sparkles (Micro-energy particles dancing above panel)
                for (let s = 0; s < 3; s++) {
                  const sparkPhase = (timestamp * 0.0025 + s * 2.1 + (x * 3 + y * 5)) % (Math.PI * 2);
                  const sparkX = Math.cos(sparkPhase) * (8 + s * 3);
                  const sparkY = -6 + Math.sin(sparkPhase) * 5 - (s * 3);
                  const sparkAlpha = Math.max(0, Math.sin(sparkPhase)) * glint;

                  ctx.fillStyle = `rgba(255, 255, 200, ${sparkAlpha})`;
                  ctx.beginPath();
                  ctx.arc(sparkX, sparkY, 1.2, 0, Math.PI * 2);
                  ctx.fill();
                }

                ctx.restore();
              }
            } else if (cell.machine.type === 'WindTurbine') {
              // Rotating Wind Turbine with Oblique Shadow & Mast Beacon
              const localWind = cell.dynamic.windSpeed || 0;
              const isOper = cell.machine.isOperating;
              const rotSpeed = isOper ? localWind * 0.08 : 0;

              if (!turbineAngles.current[machineKey]) {
                turbineAngles.current[machineKey] = (cellHash * 10) % (Math.PI * 2);
              }
              turbineAngles.current[machineKey] += rotSpeed;
              const bladeAngle = turbineAngles.current[machineKey];

              // Oblique Turbine Ground Shadow
              ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
              ctx.beginPath();
              ctx.ellipse(8, 10, 14, 5, 0.4, 0, Math.PI * 2);
              ctx.fill();

              // Sleek Mast Tower
              ctx.strokeStyle = '#c9d1d9';
              ctx.lineWidth = 2.5;
              ctx.beginPath();
              ctx.moveTo(0, 6);
              ctx.lineTo(0, -22);
              ctx.stroke();

              // Nacelle Hub
              ctx.fillStyle = '#58a6ff';
              ctx.beginPath();
              ctx.arc(0, -22, 3.5, 0, Math.PI * 2);
              ctx.fill();

              // Mast Hazard Warning Light (Blinking red LED)
              if (Math.sin(timestamp * 0.005) > 0.2) {
                ctx.fillStyle = '#f85149';
                ctx.beginPath();
                ctx.arc(0, -25.5, 1.5, 0, Math.PI * 2);
                ctx.fill();
              }

              // 3 Rotating Aerodynamic Blades
              ctx.strokeStyle = '#f0f6fc';
              ctx.lineWidth = 2;
              for (let b = 0; b < 3; b++) {
                const angle = bladeAngle + (b * Math.PI * 2) / 3;
                const tipX = Math.cos(angle) * 16;
                const tipY = -22 + Math.sin(angle) * 14;

                ctx.beginPath();
                ctx.moveTo(0, -22);
                ctx.lineTo(tipX, tipY);
                ctx.stroke();

                // Blade tip red hazard stripe
                ctx.fillStyle = '#f85149';
                ctx.beginPath();
                ctx.arc(tipX, tipY, 1.2, 0, Math.PI * 2);
                ctx.fill();
              }
            } else if (cell.machine.type === 'HydroTurbine') {
              // Active Hydro Station with Dam Sluice & Rotating Turbine Waterwheel
              const flowQ = cell.dynamic.flowRateQ || 20;

              // Dam Concrete Station
              ctx.fillStyle = '#21262d';
              ctx.strokeStyle = '#388bfd';
              ctx.lineWidth = 1.5;
              ctx.beginPath();
              ctx.rect(-14, -10, 28, 16);
              ctx.fill();
              ctx.stroke();

              // Sluice Gate Aperture
              ctx.fillStyle = '#0d1117';
              ctx.beginPath();
              ctx.rect(-6, -2, 12, 8);
              ctx.fill();

              // Rotating Waterwheel inside Sluice
              if (!hydroWheelAngles.current[machineKey]) hydroWheelAngles.current[machineKey] = 0;
              hydroWheelAngles.current[machineKey] += Math.min(0.25, flowQ * 0.005);
              const wheelAngle = hydroWheelAngles.current[machineKey];

              ctx.strokeStyle = '#58a6ff';
              ctx.lineWidth = 1.2;
              ctx.beginPath();
              ctx.moveTo(-4 * Math.cos(wheelAngle), 2 - 4 * Math.sin(wheelAngle));
              ctx.lineTo(4 * Math.cos(wheelAngle), 2 + 4 * Math.sin(wheelAngle));
              ctx.stroke();

              // Churning rapids white-water foam (scales with flow Q)
              const foamCount = Math.min(10, Math.max(3, Math.floor(flowQ / 12)));
              const foamPhase = timestamp * 0.008;

              ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
              for (let f = 0; f < foamCount; f++) {
                const fx = -8 + ((f * 5 + foamPhase * 10) % 18);
                const fy = 8 + Math.sin(foamPhase + f) * 3;
                const fSize = 2 + (f % 3);
                ctx.beginPath();
                ctx.arc(fx, fy, fSize, 0, Math.PI * 2);
                ctx.fill();
              }
            }
            ctx.restore();
          }

          // ----------------------------------------------------
          // LIVING SETTLEMENT / DEMAND ZONE CLUSTER
          // ----------------------------------------------------
          const isDemandZoneCell = worldState.demandZones.some(dz =>
            dz.cells.some(c => c.x === x && c.y === y)
          );

          if (isDemandZoneCell && !cell.machine) {
            ctx.save();
            ctx.translate(pt.x, pt.y - 4);

            const activeDemandZone = worldState.demandZones.find(dz =>
              dz.cells.some(c => c.x === x && c.y === y)
            );
            const isPowered = (activeDemandZone?.deliveredEnergy || 0) >= (activeDemandZone?.demandLevel || 100) * 0.5;

            // 2.5D City Apartment Buildings
            ctx.fillStyle = '#1c2128';
            ctx.strokeStyle = '#444c56';
            ctx.lineWidth = 1.2;
            ctx.fillRect(-12, -22, 11, 20);
            ctx.strokeRect(-12, -22, 11, 20);

            ctx.fillStyle = '#2d333b';
            ctx.fillRect(1, -28, 12, 26);
            ctx.strokeRect(1, -28, 12, 26);

            // Windows (warm golden glow when powered, dark when brownout/blackout)
            const windowFill = isPowered ? '#ffea79' : '#161b22';
            ctx.fillStyle = windowFill;
            ctx.fillRect(-10, -18, 3, 3);
            ctx.fillRect(-5, -18, 3, 3);
            ctx.fillRect(-10, -12, 3, 3);
            ctx.fillRect(-5, -12, 3, 3);

            ctx.fillRect(3, -24, 3, 3);
            ctx.fillRect(8, -24, 3, 3);
            ctx.fillRect(3, -18, 3, 3);
            ctx.fillRect(8, -18, 3, 3);
            ctx.fillRect(3, -12, 3, 3);
            ctx.fillRect(8, -12, 3, 3);

            // Communication Spire with Blinking Aviation Beacon
            ctx.strokeStyle = '#8b949e';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(7, -28);
            ctx.lineTo(7, -38);
            ctx.stroke();

            if (Math.sin(timestamp * 0.006) > 0) {
              ctx.fillStyle = '#f85149';
              ctx.beginPath();
              ctx.arc(7, -38, 1.8, 0, Math.PI * 2);
              ctx.fill();
            }

            // Demand Target Overhead Callout Pill
            const pulseAlpha = (Math.sin(timestamp * 0.006 + x + y) + 1) / 2;
            const badgeText = `⚡ DEMAND [${x},${y}]`;
            const subText = `${activeDemandZone?.deliveredEnergy || 0}/${activeDemandZone?.demandLevel || 0} kW`;
            
            ctx.font = 'bold 8.5px system-ui, sans-serif';
            const bWidth = Math.max(ctx.measureText(badgeText).width, ctx.measureText(subText).width) + 10;
            
            ctx.fillStyle = 'rgba(10, 15, 28, 0.9)';
            ctx.strokeStyle = isPowered ? 'rgba(63, 185, 80, 0.95)' : `rgba(56, 189, 248, ${0.75 + pulseAlpha * 0.25})`;
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.roundRect(-bWidth / 2, -62, bWidth, 22, 4);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = isPowered ? '#3fb950' : '#79c0ff';
            ctx.textAlign = 'center';
            ctx.fillText(badgeText, 0, -52);

            ctx.font = '7.5px system-ui, sans-serif';
            ctx.fillStyle = '#c9d1d9';
            ctx.fillText(subText, 0, -43);

            ctx.restore();
          }

          // ----------------------------------------------------
          // X-RAY MULTI-SPECTRAL OVERLAYS (Section 15 audit)
          // ----------------------------------------------------
          if (activeXRayLayer === 'wind') {
            const wSpeed = cell.dynamic.windSpeed;
            const wRad = ((cell.dynamic.windDirection || 270) * Math.PI) / 180;
            const arrowLen = Math.min(20, Math.max(6, wSpeed * 1.3));
            const dx = -Math.sin(wRad) * arrowLen;
            const dy = Math.cos(wRad) * arrowLen * 0.5;

            ctx.strokeStyle = cell.dynamic.windShadowFactor < 0.7 ? '#f0883e' : '#79c0ff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(pt.x - dx / 2, pt.y - dy / 2);
            ctx.lineTo(pt.x + dx / 2, pt.y + dy / 2);
            ctx.stroke();

            ctx.fillStyle = cell.dynamic.windShadowFactor < 0.7 ? '#f0883e' : '#79c0ff';
            ctx.beginPath();
            ctx.arc(pt.x + dx / 2, pt.y + dy / 2, 2.2, 0, Math.PI * 2);
            ctx.fill();
          } else if (activeXRayLayer === 'solar') {
            const irr = cell.dynamic.effectiveIrradiance;
            const alpha = Math.min(0.65, Math.max(0.08, irr / 1000));
            ctx.fillStyle = cell.dynamic.terrainObstruction < 0.8
              ? 'rgba(40, 60, 120, 0.45)'
              : `rgba(255, 234, 121, ${alpha})`;
            ctx.beginPath();
            ctx.moveTo(pt.x, pt.y - tileHeight / 2);
            ctx.lineTo(pt.x + tileWidth / 2, pt.y);
            ctx.lineTo(pt.x, pt.y + tileHeight / 2);
            ctx.lineTo(pt.x - tileWidth / 2, pt.y);
            ctx.closePath();
            ctx.fill();
          } else if (activeXRayLayer === 'hydro') {
            if (cell.dynamic.waterBodyType === 'RIVER') {
              ctx.fillStyle = 'rgba(0, 229, 255, 0.45)';
              ctx.beginPath();
              ctx.moveTo(pt.x, pt.y - tileHeight / 2);
              ctx.lineTo(pt.x + tileWidth / 2, pt.y);
              ctx.lineTo(pt.x, pt.y + tileHeight / 2);
              ctx.lineTo(pt.x - tileWidth / 2, pt.y);
              ctx.closePath();
              ctx.fill();

              ctx.fillStyle = '#ffffff';
              ctx.font = '700 9px Inter, sans-serif';
              ctx.textAlign = 'center';
              ctx.fillText(`${cell.dynamic.velocity.toFixed(1)}m/s • Q:${cell.dynamic.flowRateQ.toFixed(0)}`, pt.x, pt.y + 3);
            }
          } else if (activeXRayLayer === 'elevation') {
            const colors = ['#1b3b22', '#2a5834', '#4e7336', '#73684a', '#6b7280', '#e5e7eb'];
            ctx.fillStyle = colors[Math.min(colors.length - 1, elev)] + '95';
            ctx.beginPath();
            ctx.moveTo(pt.x, pt.y - tileHeight / 2);
            ctx.lineTo(pt.x + tileWidth / 2, pt.y);
            ctx.lineTo(pt.x, pt.y + tileHeight / 2);
            ctx.lineTo(pt.x - tileWidth / 2, pt.y);
            ctx.closePath();
            ctx.fill();
          } else if (activeXRayLayer === 'snow') {
            const snowAlpha = Math.min(0.7, cell.dynamic.snowDepth * 1.5);
            ctx.fillStyle = `rgba(220, 235, 255, ${Math.max(0.1, snowAlpha)})`;
            ctx.beginPath();
            ctx.moveTo(pt.x, pt.y - tileHeight / 2);
            ctx.lineTo(pt.x + tileWidth / 2, pt.y);
            ctx.lineTo(pt.x, pt.y + tileHeight / 2);
            ctx.lineTo(pt.x - tileWidth / 2, pt.y);
            ctx.closePath();
            ctx.fill();
          } else if (activeXRayLayer === 'network') {
            if (cell.cable) {
              ctx.fillStyle = 'rgba(0, 229, 255, 0.45)';
              ctx.beginPath();
              ctx.arc(pt.x, pt.y, 6, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      }

      // ----------------------------------------------------
      // LIVING WIND PARTICLES
      // ----------------------------------------------------
      ctx.save();
      const pSpeedMul = 0.4 * (windSpeed / 10);
      for (const p of windParticles.current) {
        p.x += Math.cos(windRad) * p.speed * pSpeedMul;
        p.y += Math.sin(windRad) * p.speed * pSpeedMul * 0.5;

        if (p.x > 800) p.x = -800;
        if (p.x < -800) p.x = 800;
        if (p.y > 500) p.y = -500;
        if (p.y < -500) p.y = 500;

        ctx.strokeStyle = `rgba(180, 220, 255, ${p.alpha})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + Math.cos(windRad) * p.length, p.y + Math.sin(windRad) * p.length * 0.5);
        ctx.stroke();
      }
      ctx.restore();

      // ----------------------------------------------------
      // LIVING RAINFALL ANIMATION
      // ----------------------------------------------------
      const isRaining = worldState.clouds.length > 0 ||
        activeXRayLayer === 'hydro' ||
        visualTheme.weatherProfile.rainfallProbability > 0.2 ||
        worldState.globalEnv.ambientHumidity > 0.55;

      if (isRaining && interpTemp.current >= 2) {
        ctx.save();
        ctx.strokeStyle = 'rgba(175, 215, 255, 0.45)';
        ctx.lineWidth = 1.2;
        const rainDriftX = Math.cos(windRad) * (windSpeed * 0.15);
        for (const r of rainParticles.current) {
          r.y += r.speed;
          r.x += rainDriftX;
          if (r.y > 500) {
            r.y = -500;
            r.x = (Math.random() - 0.5) * 1600;
          }
          if (r.x > 800) r.x = -800;
          if (r.x < -800) r.x = 800;

          ctx.beginPath();
          ctx.moveTo(r.x, r.y);
          ctx.lineTo(r.x + rainDriftX * 0.4, r.y + r.length);
          ctx.stroke();
        }
        ctx.restore();
      }

      // ----------------------------------------------------
      // LIVING SNOWFALL ANIMATION
      // ----------------------------------------------------
      if (interpTemp.current < 2 || visualTheme.terrainStyle === 'frozen_alpine') {
        ctx.save();
        ctx.fillStyle = 'rgba(245, 250, 255, 0.7)';
        for (const s of snowParticles.current) {
          s.y += s.speed;
          s.sway += 0.03;
          s.x += Math.sin(s.sway) * 0.8 + Math.cos(windRad) * (windSpeed * 0.08);

          if (s.y > 500) {
            s.y = -500;
            s.x = (Math.random() - 0.5) * 1600;
          }
          if (s.x > 800) s.x = -800;
          if (s.x < -800) s.x = 800;

          ctx.beginPath();
          ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // ----------------------------------------------------
      // INTERACTIVE CONDUIT / CABLE ROUTE PREVIEW
      // ----------------------------------------------------
      if (cablePath.length > 0) {
        ctx.save();
        for (let i = 0; i < cablePath.length; i++) {
          const ptPos = cablePath[i];
          const pathCell = grid[ptPos.y]?.[ptPos.x];
          if (!pathCell) continue;
          const isoPt = gridToIso(ptPos.x, ptPos.y, pathCell.baseTerrain.elevation);
          const val = PlacementEngine.canPlace('Cable', pathCell, worldState);
          const col = val.valid ? 'rgba(0, 229, 255, 0.5)' : 'rgba(248, 81, 73, 0.55)';
          const strokeCol = val.valid ? '#00e5ff' : '#f85149';

          ctx.beginPath();
          ctx.moveTo(isoPt.x, isoPt.y - tileHeight / 2);
          ctx.lineTo(isoPt.x + tileWidth / 2, isoPt.y);
          ctx.lineTo(isoPt.x, isoPt.y + tileHeight / 2);
          ctx.lineTo(isoPt.x - tileWidth / 2, isoPt.y);
          ctx.closePath();
          ctx.fillStyle = col;
          ctx.fill();
          ctx.strokeStyle = strokeCol;
          ctx.lineWidth = 2;
          ctx.stroke();

          if (i > 0) {
            const prevPos = cablePath[i - 1];
            const prevCell = grid[prevPos.y]?.[prevPos.x];
            if (prevCell) {
              const prevIso = gridToIso(prevPos.x, prevPos.y, prevCell.baseTerrain.elevation);
              ctx.strokeStyle = val.valid ? '#00e5ff' : '#f85149';
              ctx.lineWidth = 3;
              ctx.beginPath();
              ctx.moveTo(prevIso.x, prevIso.y);
              ctx.lineTo(isoPt.x, isoPt.y);
              ctx.stroke();
            }
          }
        }
        ctx.restore();
      }

      // ----------------------------------------------------
      // SEQUENTIAL CABLE PATH ENERGY PULSE TRAVERSAL (Section 18)
      // ----------------------------------------------------
      if (worldState.demandZones && worldState.demandZones.length > 0) {
        ctx.save();
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const cell = grid[y][x];
            if (cell.machine && cell.derived.powerDelivered > 0) {
              const pDeliv = cell.derived.powerDelivered;
              // Check all active demand zones to find connected cable route
              for (const demandZone of worldState.demandZones) {
                const cableRoute = EnergyNetworkEngine.findCablePath(x, y, grid, width, height, demandZone);

                if (cableRoute && cableRoute.length >= 2) {
                  // Draw connected cable path segments
                  ctx.strokeStyle = activeXRayLayer === 'network' ? 'rgba(0, 229, 255, 0.85)' : 'rgba(56, 139, 253, 0.55)';
                  ctx.lineWidth = 2.2;
                  ctx.beginPath();
                  for (let seg = 0; seg < cableRoute.length; seg++) {
                    const segPt = cableRoute[seg];
                    const segCell = grid[segPt.y]?.[segPt.x];
                    const segElev = segCell?.baseTerrain.elevation ?? 0;
                    const segIso = gridToIso(segPt.x, segPt.y, segElev);
                    if (seg === 0) ctx.moveTo(segIso.x, segIso.y - 6);
                    else ctx.lineTo(segIso.x, segIso.y);
                  }
                  ctx.stroke();

                  // Animate glowing energy pulse traversing sequential segments
                  const totalSegments = cableRoute.length - 1;
                  const pathProgress = ((timestamp * 0.0025 * (pDeliv / 100)) % 1) * totalSegments;
                  const currSegmentIndex = Math.min(totalSegments - 1, Math.floor(pathProgress));
                  const segmentFrac = pathProgress - currSegmentIndex;

                  const p0 = cableRoute[currSegmentIndex];
                  const p1 = cableRoute[currSegmentIndex + 1];
                  const c0 = grid[p0.y]?.[p0.x];
                  const c1 = grid[p1.y]?.[p1.x];
                  if (c0 && c1) {
                    const iso0 = gridToIso(p0.x, p0.y, c0.baseTerrain.elevation);
                    const iso1 = gridToIso(p1.x, p1.y, c1.baseTerrain.elevation);
                    const pulseX = iso0.x + (iso1.x - iso0.x) * segmentFrac;
                    const pulseY = (iso0.y - (currSegmentIndex === 0 ? 6 : 0)) + (iso1.y - (iso0.y - (currSegmentIndex === 0 ? 6 : 0))) * segmentFrac;

                    const glowGrad = ctx.createRadialGradient(pulseX, pulseY, 1, pulseX, pulseY, 9);
                    glowGrad.addColorStop(0, '#ffffff');
                    glowGrad.addColorStop(0.4, '#79c0ff');
                    glowGrad.addColorStop(1, 'rgba(56, 139, 253, 0)');
                    ctx.fillStyle = glowGrad;
                    ctx.beginPath();
                    ctx.arc(pulseX, pulseY, 9, 0, Math.PI * 2);
                    ctx.fill();
                  }
                }
              }
            }
          }
        }
        ctx.restore();
      }

      // ----------------------------------------------------
      // CONSTRUCTION SHOCKWAVE RING POP
      // ----------------------------------------------------
      if (constructionPulse) {
        const elapsed = timestamp - constructionPulse.time;
        if (elapsed < 480) {
          const progress = elapsed / 480;
          const pulseCell = grid[constructionPulse.y]?.[constructionPulse.x];
          if (pulseCell) {
            const pt = gridToIso(constructionPulse.x, constructionPulse.y, pulseCell.baseTerrain.elevation);
            const radius = 10 + progress * 45;
            const alpha = 1.0 - progress;

            ctx.save();

            // Special Solar Ray Reflection Burst on Land Solar Placement
            if (pulseCell.machine?.type === 'LandSolar' || pulseCell.machine?.type === 'FloatSolar') {
              const rayCount = 8;
              const rayLength = 18 + progress * 55;
              const rotAngle = progress * 0.4;

              ctx.save();
              ctx.translate(pt.x, pt.y - 6);

              // 8-Directional Reflected Sunbeam Spikes
              for (let r = 0; r < rayCount; r++) {
                const angle = rotAngle + (r * Math.PI * 2) / rayCount;
                const rx = Math.cos(angle) * rayLength;
                const ry = Math.sin(angle) * (rayLength * 0.55);

                const rayGrad = ctx.createLinearGradient(0, 0, rx, ry);
                rayGrad.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
                rayGrad.addColorStop(0.3, `rgba(255, 235, 120, ${alpha * 0.9})`);
                rayGrad.addColorStop(1, 'rgba(255, 190, 40, 0)');

                ctx.strokeStyle = rayGrad;
                ctx.lineWidth = 2.4 * alpha;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(rx, ry);
                ctx.stroke();
              }

              // Glowing Solar Corona Burst Halo
              ctx.strokeStyle = `rgba(255, 230, 90, ${alpha * 0.85})`;
              ctx.lineWidth = 2.5 * alpha;
              ctx.beginPath();
              ctx.ellipse(0, 0, rayLength * 0.55, rayLength * 0.28, 0, 0, Math.PI * 2);
              ctx.stroke();

              // Central Radiant Solar Lens Flash
              const flashGrad = ctx.createRadialGradient(0, 0, 1, 0, 0, 24 * alpha);
              flashGrad.addColorStop(0, '#ffffff');
              flashGrad.addColorStop(0.4, `rgba(255, 240, 150, ${alpha * 0.7})`);
              flashGrad.addColorStop(1, 'rgba(255, 180, 50, 0)');
              ctx.fillStyle = flashGrad;
              ctx.beginPath();
              ctx.arc(0, 0, 24 * alpha, 0, Math.PI * 2);
              ctx.fill();

              ctx.restore();
            } else {
              // Standard shockwave ring pop for other structures
              ctx.strokeStyle = `rgba(56, 139, 253, ${alpha})`;
              ctx.lineWidth = 3 * alpha;
              ctx.beginPath();
              ctx.ellipse(pt.x, pt.y, radius, radius * 0.5, 0, 0, Math.PI * 2);
              ctx.stroke();

              ctx.fillStyle = `rgba(121, 192, 255, ${alpha * 0.4})`;
              ctx.beginPath();
              ctx.ellipse(pt.x, pt.y, radius * 0.6, radius * 0.3, 0, 0, Math.PI * 2);
              ctx.fill();
            }

            ctx.restore();
          }
        }
      }

      // ----------------------------------------------------
      // LIVING OVERHEAD VOLUMETRIC CLOUDS (ATMOSPHERIC DRIFT)
      // ----------------------------------------------------
      ctx.save();
      const sunElev = interpSunElevation.current;
      const isDay = sunElev > 15;
      const isSunset = sunElev > 0 && sunElev <= 15;

      // 1. Procedural Ambient Cumulus Formations
      for (const cloud of clouds.current) {
        const cloudCY = cloud.y - cloud.altitude;
        const breath = 1.0 + 0.025 * Math.sin(animTime.current * 0.0018 + cloud.x * 0.01);

        for (const lobe of cloud.lobes) {
          const lx = cloud.x + lobe.ox * cloud.size * breath;
          const ly = cloudCY + lobe.oy * cloud.size * 0.58 * breath;
          const lr = lobe.r * cloud.size * 0.46 * breath;

          const grad = ctx.createRadialGradient(lx, ly - lr * 0.35, lr * 0.08, lx, ly, lr);

          if (isDay) {
            // Bright white sunlit cumulus with soft ambient under-shading
            grad.addColorStop(0, `rgba(255, 255, 255, ${cloud.opacity * 0.95})`);
            grad.addColorStop(0.45, `rgba(242, 248, 255, ${cloud.opacity * 0.82})`);
            grad.addColorStop(0.85, `rgba(205, 222, 244, ${cloud.opacity * 0.55})`);
            grad.addColorStop(1, 'rgba(195, 218, 245, 0)');
          } else if (isSunset) {
            // Golden-peach and rose twilight rim-lit cloud
            grad.addColorStop(0, `rgba(255, 225, 185, ${cloud.opacity * 0.95})`);
            grad.addColorStop(0.48, `rgba(250, 195, 165, ${cloud.opacity * 0.8})`);
            grad.addColorStop(0.85, `rgba(180, 150, 190, ${cloud.opacity * 0.5})`);
            grad.addColorStop(1, 'rgba(150, 130, 180, 0)');
          } else {
            // Silvery moonlit nocturnal cloud
            grad.addColorStop(0, `rgba(180, 205, 245, ${cloud.opacity * 0.45})`);
            grad.addColorStop(0.5, `rgba(120, 150, 200, ${cloud.opacity * 0.3})`);
            grad.addColorStop(0.85, `rgba(70, 95, 150, ${cloud.opacity * 0.18})`);
            grad.addColorStop(1, 'rgba(50, 70, 120, 0)');
          }

          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(lx, ly, lr, 0, Math.PI * 2);
          ctx.fill();
        }

        // Soft cloud crest highlight line
        ctx.strokeStyle = isDay
          ? `rgba(255, 255, 255, ${cloud.opacity * 0.3})`
          : isSunset
            ? `rgba(255, 225, 185, ${cloud.opacity * 0.35})`
            : `rgba(190, 215, 255, ${cloud.opacity * 0.15})`;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(cloud.x, cloudCY - cloud.size * 0.22, cloud.size * 0.38, Math.PI * 0.9, Math.PI * 2.1);
        ctx.stroke();
      }

      // 2. Deterministic Simulation Clouds (worldState.clouds)
      if (worldState.clouds && worldState.clouds.length > 0) {
        for (const simCloud of worldState.clouds) {
          const simPt = gridToIso(simCloud.x, simCloud.y, 4);
          const scX = simPt.x;
          const scY = simPt.y - 175;
          const scRadius = Math.max(35, (simCloud.coverageRadius || 2) * 28);
          const scDensity = Math.min(1.0, Math.max(0.3, simCloud.cloudDensity || 0.6));
          const isStormy = (simCloud.precipitationPotential || 0) > 0.35;

          // Localized rain veil falling from stormy clouds
          if (isStormy) {
            const rainGrad = ctx.createLinearGradient(scX, scY + scRadius * 0.4, scX, simPt.y);
            rainGrad.addColorStop(0, 'rgba(140, 175, 215, 0.45)');
            rainGrad.addColorStop(1, 'rgba(140, 175, 215, 0.05)');
            ctx.fillStyle = rainGrad;
            ctx.beginPath();
            ctx.moveTo(scX - scRadius * 0.7, scY + scRadius * 0.4);
            ctx.lineTo(scX + scRadius * 0.7, scY + scRadius * 0.4);
            ctx.lineTo(scX + scRadius * 0.9 + 15, simPt.y);
            ctx.lineTo(scX - scRadius * 0.9 - 15, simPt.y);
            ctx.closePath();
            ctx.fill();
          }

          // Volumetric cloud formation
          const scGrad = ctx.createRadialGradient(scX, scY - scRadius * 0.3, scRadius * 0.1, scX, scY, scRadius);
          if (isStormy) {
            scGrad.addColorStop(0, `rgba(140, 160, 185, ${scDensity * 0.95})`);
            scGrad.addColorStop(0.55, `rgba(90, 110, 135, ${scDensity * 0.9})`);
            scGrad.addColorStop(0.85, `rgba(50, 70, 95, ${scDensity * 0.7})`);
            scGrad.addColorStop(1, 'rgba(40, 60, 80, 0)');
          } else {
            scGrad.addColorStop(0, `rgba(255, 255, 255, ${scDensity * 0.9})`);
            scGrad.addColorStop(0.6, `rgba(230, 240, 250, ${scDensity * 0.75})`);
            scGrad.addColorStop(0.9, `rgba(190, 210, 235, ${scDensity * 0.45})`);
            scGrad.addColorStop(1, 'rgba(180, 205, 235, 0)');
          }

          ctx.fillStyle = scGrad;
          ctx.beginPath();
          ctx.arc(scX, scY, scRadius, 0, Math.PI * 2);
          ctx.fill();

          ctx.beginPath();
          ctx.arc(scX - scRadius * 0.5, scY + scRadius * 0.1, scRadius * 0.65, 0, Math.PI * 2);
          ctx.arc(scX + scRadius * 0.5, scY + scRadius * 0.08, scRadius * 0.7, 0, Math.PI * 2);
          ctx.arc(scX + scRadius * 0.15, scY - scRadius * 0.35, scRadius * 0.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();

      // ----------------------------------------------------
      // SELECTED CELL RETICLE & ELEVATION PLUMB BEACON
      // ----------------------------------------------------
      if (selectedCell) {
        const selCell = grid[selectedCell.y]?.[selectedCell.x];
        if (selCell) {
          const selPt = gridToIso(selectedCell.x, selectedCell.y, selCell.baseTerrain.elevation);
          const pulse = 0.8 + 0.2 * Math.sin(animTime.current * 0.006);

          ctx.save();
          // Animated cyan diamond perimeter
          ctx.strokeStyle = `rgba(56, 189, 248, ${0.85 * pulse})`;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(selPt.x, selPt.y - tileHeight / 2 - 2);
          ctx.lineTo(selPt.x + tileWidth / 2 + 3, selPt.y);
          ctx.lineTo(selPt.x, selPt.y + tileHeight / 2 + 2);
          ctx.lineTo(selPt.x - tileWidth / 2 - 3, selPt.y);
          ctx.closePath();
          ctx.stroke();

          // Corner bracket accents
          const bracketLen = 8;
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 3;
          // Top vertex
          ctx.beginPath();
          ctx.moveTo(selPt.x - bracketLen, selPt.y - tileHeight / 2 - 2 + bracketLen / 2);
          ctx.lineTo(selPt.x, selPt.y - tileHeight / 2 - 2);
          ctx.lineTo(selPt.x + bracketLen, selPt.y - tileHeight / 2 - 2 + bracketLen / 2);
          ctx.stroke();
          // Bottom vertex
          ctx.beginPath();
          ctx.moveTo(selPt.x - bracketLen, selPt.y + tileHeight / 2 + 2 - bracketLen / 2);
          ctx.lineTo(selPt.x, selPt.y + tileHeight / 2 + 2);
          ctx.lineTo(selPt.x + bracketLen, selPt.y + tileHeight / 2 + 2 - bracketLen / 2);
          ctx.stroke();

          // Rising laser beacon & coordinate HUD pip
          const beamGrad = ctx.createLinearGradient(selPt.x, selPt.y, selPt.x, selPt.y - 36);
          beamGrad.addColorStop(0, 'rgba(56, 189, 248, 0.7)');
          beamGrad.addColorStop(1, 'rgba(56, 189, 248, 0.05)');
          ctx.strokeStyle = beamGrad;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([3, 2]);
          ctx.beginPath();
          ctx.moveTo(selPt.x, selPt.y);
          ctx.lineTo(selPt.x, selPt.y - 36);
          ctx.stroke();
          ctx.setLineDash([]);

          // Coordinate pip
          ctx.fillStyle = 'rgba(10, 14, 22, 0.88)';
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.roundRect(selPt.x - 22, selPt.y - 48, 44, 16, 4);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#38bdf8';
          ctx.font = '700 9px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`[${selectedCell.x}, ${selectedCell.y}]`, selPt.x, selPt.y - 40);

          ctx.restore();
        }
      }

      // ----------------------------------------------------
      // GHOST PLACEMENT PREVIEW & REAL-TIME TELEMETRY
      // ----------------------------------------------------
      if (hoveredCell) {
        const cell = grid[hoveredCell.y]?.[hoveredCell.x];
        if (cell) {
          const pt = gridToIso(hoveredCell.x, hoveredCell.y, cell.baseTerrain.elevation);

          if (buildTool) {
            const toolCost = buildTool.kind === 'machine'
              ? (MACHINE_CONFIGS[buildTool.type]?.buildCost ?? 5000)
              : (buildTool.type === 'Gravel' ? 500 : 1000);
            const canAfford = worldState.economy.cash >= toolCost;
            const isWater = cell.baseTerrain.id === 'T06' || cell.dynamic.waterBodyType === 'RIVER' || (cell.dynamic.surfaceWater ?? 0) > 0;
            const isHydroOnNonWater = buildTool.kind === 'machine' && buildTool.type === 'HydroTurbine' && !isWater;

            const validation = buildTool.kind === 'machine'
              ? PlacementEngine.canPlace(buildTool.type, cell, worldState)
              : PlacementEngine.canReinforce(buildTool.type, cell);

            const isValid = validation.valid && canAfford && !isHydroOnNonWater;
            const ghostFill = isValid ? 'rgba(46, 160, 67, 0.45)' : 'rgba(248, 81, 73, 0.45)';
            const ghostStroke = isValid ? '#3fb950' : '#f85149';

            ctx.beginPath();
            ctx.moveTo(pt.x, pt.y - tileHeight / 2);
            ctx.lineTo(pt.x + tileWidth / 2, pt.y);
            ctx.lineTo(pt.x, pt.y + tileHeight / 2);
            ctx.lineTo(pt.x - tileWidth / 2, pt.y);
            ctx.closePath();
            ctx.fillStyle = ghostFill;
            ctx.fill();
            ctx.strokeStyle = ghostStroke;
            ctx.lineWidth = 2.5;
            ctx.stroke();

            const telemetryLines: string[] = [];
            if (buildTool.kind === 'machine') {
              if (buildTool.type === 'LandSolar') {
                telemetryLines.push(`• Cost: $${toolCost.toLocaleString()} | Cash: $${Math.max(0, Math.floor(worldState.economy.cash)).toLocaleString()}`);
                telemetryLines.push(`• Exposure: ${Math.round(cell.dynamic.effectiveIrradiance / 10)}% | Clouds: ${Math.round((1 - cell.dynamic.cloudAttenuation) * 100)}%`);
                telemetryLines.push(`• Stability: ${cell.derived.effectiveStability.toFixed(2)} (Req >= 0.70)`);
                telemetryLines.push(`• Est Output: ~${Math.round(cell.dynamic.effectiveIrradiance * 0.22)} kW`);
              } else if (buildTool.type === 'WindTurbine') {
                let minTurbDist: number | null = null;
                for (let ty = 0; ty < height; ty++) {
                  for (let tx = 0; tx < width; tx++) {
                    if (grid[ty][tx].machine?.type === 'WindTurbine') {
                      const d = Math.hypot(tx - cell.x, ty - cell.y);
                      if (minTurbDist === null || d < minTurbDist) minTurbDist = d;
                    }
                  }
                }
                const estWindKW = Math.round(Math.min(500, 0.5 * 1.225 * 50 * Math.pow(cell.dynamic.windSpeed, 3) * 0.45 * 0.001));
                telemetryLines.push(`• Cost: $${toolCost.toLocaleString()} | Cash: $${Math.max(0, Math.floor(worldState.economy.cash)).toLocaleString()}`);
                telemetryLines.push(`• Wind: ${cell.dynamic.windSpeed.toFixed(1)} m/s | Bearing: ${Math.round(cell.dynamic.windDirection)}°`);
                telemetryLines.push(`• Clearance: ${minTurbDist !== null ? `${minTurbDist.toFixed(1)} cells (Req >= 2.0)` : 'Clear'}`);
                telemetryLines.push(`• Est Output: ~${estWindKW} kW`);
              } else if (buildTool.type === 'HydroTurbine') {
                const flowQ = cell.dynamic.flowRateQ || 0;
                const estHydro = flowQ >= 2 ? Math.round(1000 * 9.81 * flowQ * 4 * 0.85 * 0.001) : 0;
                telemetryLines.push(`• Cost: $${toolCost.toLocaleString()} | Cash: $${Math.max(0, Math.floor(worldState.economy.cash)).toLocaleString()}`);
                telemetryLines.push(`• River Flow Q: ${flowQ.toFixed(1)} m³/s (Req >= 1.0)`);
                telemetryLines.push(`• Velocity: ${cell.dynamic.velocity?.toFixed(2) ?? '0.00'} m/s`);
                telemetryLines.push(`• Est Output: ~${estHydro} kW`);
              } else if (buildTool.type === 'Cable') {
                telemetryLines.push(`• Substrate: ${cell.baseTerrain.name} | Cost: $200`);
                telemetryLines.push(`• Drag or click path to connect generators to grid`);
              }
            } else {
              const projectedStab = cell.derived.effectiveStability + (buildTool.type === 'Gravel' ? 0.25 : 0.40);
              telemetryLines.push(`• Cost: $${toolCost.toLocaleString()} | Cash: $${Math.max(0, Math.floor(worldState.economy.cash)).toLocaleString()}`);
              telemetryLines.push(`• Terrain Stability: ${cell.derived.effectiveStability.toFixed(2)} → ${projectedStab.toFixed(2)}`);
              telemetryLines.push(`• Substrate: ${cell.baseTerrain.name}`);
            }

            const tipX = pt.x + 36;
            const tipY = pt.y - 75;
            const boxWidth = 248;
            const baseHeight = isValid ? 44 + telemetryLines.length * 15 : 68;

            ctx.fillStyle = 'rgba(10, 14, 22, 0.95)';
            ctx.strokeStyle = ghostStroke;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect(tipX, tipY, boxWidth, baseHeight, 6);
            ctx.fill();
            ctx.stroke();

            // Tooltip header determination
            let headerText = '';
            if (!canAfford) {
              headerText = 'CANNOT PLACE: Insufficient Funds';
            } else if (isHydroOnNonWater) {
              headerText = 'CANNOT PLACE: Requires Water';
            } else if (!validation.valid) {
              headerText = `CANNOT PLACE ${buildTool.type.toUpperCase()}`;
            } else {
              headerText = `✓ CAN PLACE ${buildTool.type.toUpperCase()}`;
            }

            ctx.fillStyle = ghostStroke;
            ctx.font = '700 11px Inter, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(headerText, tipX + 10, tipY + 16);

            if (isValid) {
              ctx.fillStyle = '#c9d1d9';
              ctx.font = '10px Inter, sans-serif';
              for (let l = 0; l < telemetryLines.length; l++) {
                ctx.fillText(telemetryLines[l], tipX + 10, tipY + 32 + l * 15);
              }
            } else {
              ctx.fillStyle = '#ffb4ab';
              ctx.font = '9.5px Inter, sans-serif';
              let reason = '';
              if (!canAfford) {
                reason = `Insufficient funds: Needs $${toolCost.toLocaleString()} (Have: $${Math.max(0, Math.floor(worldState.economy.cash)).toLocaleString()}).`;
              } else if (isHydroOnNonWater) {
                reason = 'Hydro Turbine requires a Water/River cell.';
              } else {
                reason = validation.errorReason || validation.reason || 'Placement invalid.';
              }

              const words = reason.split(' ');
              let line1 = '';
              let line2 = '';
              for (const w of words) {
                if ((line1 + w).length < 38) {
                  line1 += (line1 ? ' ' : '') + w;
                } else {
                  line2 += (line2 ? ' ' : '') + w;
                }
              }
              ctx.fillText(line1, tipX + 10, tipY + 34);
              if (line2) ctx.fillText(line2, tipX + 10, tipY + 50);
            }
          } else {
            // Hover highlight reticle
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 1.8;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(pt.x, pt.y - tileHeight / 2 - 2);
            ctx.lineTo(pt.x + tileWidth / 2 + 3, pt.y);
            ctx.lineTo(pt.x, pt.y + tileHeight / 2 + 2);
            ctx.lineTo(pt.x - tileWidth / 2 - 3, pt.y);
            ctx.closePath();
            ctx.stroke();
            ctx.setLineDash([]);

            // On-Canvas Inspect Telemetry Card (shown in Inspect Mode or when hovering features)
            const isInspectMode = mode === 'inspect';
            const hasMachine = cell.machine !== null;
            const isRiver = cell.dynamic.waterBodyType === 'RIVER' || cell.baseTerrain.id === 'T06';

            if (isInspectMode || hasMachine || isRiver) {
              const tipX = pt.x + 36;
              const tipY = pt.y - 70;
              const boxWidth = 236;
              const boxHeight = 72;

              ctx.save();
              ctx.fillStyle = 'rgba(10, 14, 22, 0.94)';
              ctx.strokeStyle = hasMachine ? '#38bdf8' : (isRiver ? '#0284c7' : '#64748b');
              ctx.lineWidth = 1.2;
              ctx.beginPath();
              ctx.roundRect(tipX, tipY, boxWidth, boxHeight, 6);
              ctx.fill();
              ctx.stroke();

              // Header
              ctx.fillStyle = hasMachine ? '#38bdf8' : (isRiver ? '#38bdf8' : '#e2e8f0');
              ctx.font = '700 11px Inter, sans-serif';
              ctx.textAlign = 'left';
              ctx.textBaseline = 'alphabetic';

              const title = hasMachine
                ? `⚡ ${cell.machine!.type.toUpperCase()} [${cell.x}, ${cell.y}]`
                : isRiver
                  ? `💧 RIVER / WATERWAY [${cell.x}, ${cell.y}]`
                  : `🌐 ${cell.baseTerrain.name.toUpperCase()} [${cell.x}, ${cell.y}]`;
              ctx.fillText(title, tipX + 10, tipY + 16);

              ctx.fillStyle = '#94a3b8';
              ctx.font = '10px Inter, sans-serif';
              if (hasMachine) {
                const kw = Math.round(cell.derived.powerGenerated || 0);
                const hp = Math.round(cell.machine!.health * 100);
                const isOperating = cell.machine!.isOperating;
                ctx.fillText(`• Output: ${kw} kW | Health: ${hp}%`, tipX + 10, tipY + 32);
                ctx.fillText(`• Status: ${isOperating ? 'OPERATIONAL' : 'OFFLINE'} | Temp: ${cell.dynamic.temperature.toFixed(1)}°C`, tipX + 10, tipY + 47);
              } else if (isRiver) {
                const q = cell.dynamic.flowRateQ?.toFixed(1) || '0.0';
                const v = cell.dynamic.velocity?.toFixed(2) || '0.00';
                ctx.fillText(`• Discharge Q: ${q} m³/s | Velocity: ${v} m/s`, tipX + 10, tipY + 32);
                ctx.fillText(`• Elev: +${cell.baseTerrain.elevation}m | Depth: ${(cell.dynamic.channelDepth || 0).toFixed(2)}m`, tipX + 10, tipY + 47);
              } else {
                ctx.fillText(`• Elevation: +${cell.baseTerrain.elevation}m (${cell.baseTerrain.elevation * 300}m ASL)`, tipX + 10, tipY + 32);
                ctx.fillText(`• Stability: ${cell.derived.effectiveStability.toFixed(2)} | Sun: ${Math.round(cell.dynamic.effectiveIrradiance || 0)} W/m²`, tipX + 10, tipY + 47);
              }

              // Hint footer
              ctx.fillStyle = '#38bdf8';
              ctx.font = 'italic 9px Inter, sans-serif';
              ctx.fillText('Click cell to open detailed inspection panel ➔', tipX + 10, tipY + 62);

              ctx.restore();
            }
          }
        }
      }

      ctx.restore();

      animFrameId.current = requestAnimationFrame(renderFrame);
    };

    animFrameId.current = requestAnimationFrame(renderFrame);

    return () => {
      isRunning = false;
      if (animFrameId.current) {
        cancelAnimationFrame(animFrameId.current);
      }
    };
  }, [grid, width, height, selectedCell, hoveredCell, buildTool, worldState, getBlockShading, gridToIso, activeXRayLayer, constructionPulse, tileWidth, tileHeight, elevationStep, cablePath, visualTheme, mode]);

  // Mouse event handlers for smooth panning, zooming, selecting, and cable routing
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (buildTool?.type === 'Cable') {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const pos = screenToGrid(e.clientX - rect.left, e.clientY - rect.top);
      if (pos) {
        isCableDragging.current = true;
        setCablePath(prev => {
          if (prev.length === 0) return [pos];
          if (prev[prev.length - 1].x === pos.x && prev[prev.length - 1].y === pos.y) return prev;
          return [...prev, pos];
        });
      }
      return;
    }

    isDragging.current = true;
    dragDistance.current = 0;
    dragStart.current = {
      x: e.clientX - targetPan.current.x,
      y: e.clientY - targetPan.current.y
    };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pos = screenToGrid(e.clientX - rect.left, e.clientY - rect.top);
    if (pos) setHoveredCell(pos);

    if (buildTool?.type === 'Cable' && isCableDragging.current && pos) {
      setCablePath(prev => {
        if (prev.length === 0) return [pos];
        const last = prev[prev.length - 1];
        if (last.x === pos.x && last.y === pos.y) return prev;
        if (Math.abs(pos.x - last.x) <= 1 && Math.abs(pos.y - last.y) <= 1) {
          if (!prev.some(p => p.x === pos.x && p.y === pos.y)) {
            return [...prev, pos];
          }
        }
        return prev;
      });
      return;
    }

    if (isDragging.current) {
      dragDistance.current += Math.hypot(e.movementX, e.movementY);
      targetPan.current = {
        x: e.clientX - dragStart.current.x,
        y: e.clientY - dragStart.current.y
      };
    }
  };

  const handleMouseUp = () => {
    isDragging.current = false;
    isCableDragging.current = false;
    if (cablePath.length === 1) {
      setCablePath([]);
    }
  };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // If the user was panning or dragging the camera, suppress click to prevent accidental cell selection/deselection
    if (dragDistance.current > 5) {
      return;
    }

    const isConduit = buildTool?.type === 'Cable' || (buildTool?.type as string) === 'Conduit';
    if (isConduit && cablePath.length > 1) {
      return;
    }
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pos = screenToGrid(e.clientX - rect.left, e.clientY - rect.top);
    if (pos) {
      const cell = grid[pos.y][pos.x];
      if (buildTool && onBuild) {
        const toolCost = buildTool.kind === 'machine'
          ? (isConduit ? 100 : (MACHINE_CONFIGS[buildTool.type]?.buildCost ?? 5000))
          : (buildTool.type === 'Gravel' ? 500 : 1000);
        const canAfford = worldState.economy.cash >= toolCost;
        const isWater = cell.baseTerrain.id === 'T06' || cell.dynamic.waterBodyType === 'RIVER' || (cell.dynamic.surfaceWater ?? 0) > 0;
        const isHydroOnNonWater = buildTool.kind === 'machine' && buildTool.type === 'HydroTurbine' && !isWater;

        const validation = buildTool.kind === 'machine'
          ? PlacementEngine.canPlace(buildTool.type, cell, worldState)
          : PlacementEngine.canReinforce(buildTool.type, cell);

        const isAllowed = validation.valid && canAfford && !isHydroOnNonWater;

        onBuild(cell);
        if (isAllowed) {
          audioSystem.playPlacementSound(buildTool.type);
        } else {
          audioSystem.playErrorSound();
        }
      } else {
        onSelectCell(cell);
      }
    } else {
      onSelectCell(null);
    }
  };

  // Non-passive wheel listener attached directly to canvas DOM element to prevent browser warnings
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.88;
      targetZoom.current = Math.min(2.8, Math.max(0.6, targetZoom.current * zoomFactor));
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', onWheel);
    };
  }, []);

  const handleResetCamera = () => {
    targetZoom.current = 1.35;
    targetPan.current = { x: 0, y: -40 };
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onClick={handleClick}
        style={{
          width: '100%',
          height: '100%',
          cursor: isDragging.current
            ? 'grabbing'
            : mode === 'inspect'
              ? (hoveredCell ? 'crosshair' : 'default')
              : mode === 'build'
                ? 'copy'
                : (hoveredCell ? 'pointer' : 'grab'),
          display: 'block'
        }}
      />

      {/* Floating Camera Dock (Minimal & Ergonomic) */}
      <div style={{
        position: 'absolute',
        top: '64px',
        right: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        background: 'var(--glass-bg)',
        backdropFilter: 'blur(12px)',
        padding: '4px',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-subtle)',
        boxShadow: 'var(--glass-shadow)',
        zIndex: 20
      }}>
        <button
          onClick={() => { targetZoom.current = Math.min(2.8, targetZoom.current * 1.2); }}
          style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-sm)' }}
          title="Zoom In"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span>
        </button>
        <button
          onClick={() => { targetZoom.current = Math.max(0.6, targetZoom.current / 1.2); }}
          style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-sm)' }}
          title="Zoom Out"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>remove</span>
        </button>
        <button
          onClick={handleResetCamera}
          style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-sm)', color: 'var(--primary-bright)' }}
          title="Reset Isometric Orientation"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>filter_center_focus</span>
        </button>
      </div>

      {/* Floating Cable Route Action Dock (Section 2.2) */}
      {cablePath.length > 0 && (
        <div style={{
          position: 'absolute',
          bottom: '82px',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: 'rgba(10, 14, 22, 0.94)',
          backdropFilter: 'blur(16px)',
          border: '1px solid #00e5ff',
          borderRadius: 'var(--radius-xl)',
          padding: '8px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          boxShadow: '0 0 24px rgba(0, 229, 255, 0.35)',
          zIndex: 35,
          userSelect: 'none'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px', color: '#00e5ff' }}>cable</span>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#00e5ff' }}>
              Conduit Route: {cablePath.length} Cells (${cablePath.length * 100})
            </span>
          </div>
          <button
            onClick={() => {
              if (onBuildCablePath) {
                onBuildCablePath(cablePath);
              } else if (onBuild) {
                cablePath.forEach(pt => onBuild(grid[pt.y][pt.x]));
              }
              setCablePath([]);
            }}
            style={{
              padding: '6px 14px',
              backgroundColor: '#00e5ff',
              color: '#05070a',
              fontWeight: 800,
              fontSize: '11.5px',
              borderRadius: 'var(--radius-sm)',
              boxShadow: '0 0 12px rgba(0, 229, 255, 0.5)'
            }}
          >
            Confirm & Lay Conduits
          </button>
          <button
            onClick={() => setCablePath([])}
            style={{
              padding: '6px 12px',
              backgroundColor: 'var(--surface-container-highest)',
              color: 'var(--text-muted)',
              fontSize: '11.5px',
              borderRadius: 'var(--radius-sm)'
            }}
          >
            Clear Route
          </button>
        </div>
      )}
    </div>
  );
};
