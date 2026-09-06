import React, { useRef, useEffect, useCallback } from 'react';
import type { CellState } from '../../sim/types.ts';
import type { WorldState } from '../../sim/contracts/WorldState.ts';
import type { SelectedBuildTool } from '../ui/BottomControlDock.tsx';
import { PlacementEngine } from '../../sim/rules.ts';
import type { XRayLayer } from './XRayControls.tsx';

interface WorldCanvasProps {
  worldState: WorldState;
  selectedCell: { x: number; y: number } | null;
  onSelectCell: (cell: CellState | null) => void;
  hoveredCell: { x: number; y: number } | null;
  setHoveredCell: (pos: { x: number; y: number } | null) => void;
  buildTool?: SelectedBuildTool;
  onBuild?: (cell: CellState) => void;
  activeXRayLayer?: XRayLayer;
  focusCoord?: { x: number; y: number } | null;
  constructionPulse?: { x: number; y: number; time: number } | null;
}

// Wind particle definition for object pooling
interface WindParticle {
  x: number;
  y: number;
  speed: number;
  length: number;
  alpha: number;
}

// Cloud puff definition
interface CloudPuff {
  x: number;
  y: number;
  size: number;
  opacity: number;
  speed: number;
}

export const WorldCanvas: React.FC<WorldCanvasProps> = ({
  worldState,
  selectedCell,
  onSelectCell,
  hoveredCell,
  setHoveredCell,
  buildTool,
  onBuild,
  activeXRayLayer = 'none',
  focusCoord,
  constructionPulse
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Isometric tile geometry constants (Phase 1: 84px x 42px base)
  const tileWidth = 84;
  const tileHeight = 42;
  const elevationStep = 13; // pixels per elevation level

  // Smooth Camera State (current interpolated towards target)
  const currentPan = useRef<{ x: number; y: number }>({ x: 0, y: -40 });
  const targetPan = useRef<{ x: number; y: number }>({ x: 0, y: -40 });
  const currentZoom = useRef<number>(1.35);
  const targetZoom = useRef<number>(1.35);

  const isDragging = useRef<boolean>(false);
  const dragStart = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Animation states
  const animFrameId = useRef<number | null>(null);
  const animTime = useRef<number>(0);
  const turbineAngles = useRef<{ [key: string]: number }>({});

  const { grid, width, height } = worldState;

  // Object-pooled wind particles (45 particles)
  const windParticles = useRef<WindParticle[]>([]);
  useEffect(() => {
    const pts: WindParticle[] = [];
    for (let i = 0; i < 45; i++) {
      pts.push({
        x: (Math.random() - 0.5) * 1400,
        y: (Math.random() - 0.5) * 900,
        speed: 1.2 + Math.random() * 1.8,
        length: 12 + Math.random() * 20,
        alpha: 0.15 + Math.random() * 0.25,
      });
    }
    windParticles.current = pts;
  }, []);

  // Procedural drifting clouds (5 clouds)
  const clouds = useRef<CloudPuff[]>([
    { x: -350, y: -180, size: 140, opacity: 0.25, speed: 0.35 },
    { x: 120, y: -280, size: 180, opacity: 0.28, speed: 0.4 },
    { x: -150, y: 150, size: 160, opacity: 0.22, speed: 0.3 },
    { x: 300, y: 50, size: 150, opacity: 0.26, speed: 0.38 },
    { x: 450, y: -100, size: 130, opacity: 0.24, speed: 0.32 },
  ]);

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
      // Pan camera to center on focus coordinate
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
    const originY = canvas.height / 2.5 + currentPan.current.y;

    const relX = (screenX - originX) / currentZoom.current;
    const relY = (screenY - originY) / currentZoom.current;

    let closest: { x: number; y: number } | null = null;
    let minDistance = Infinity;

    // Search closest tile based on polygon hit-test
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
          top: elev >= 2 ? '#34663e' : '#2a5834',
          topBevel: '#488254',
          left: '#1a3320',
          right: '#102215',
          cliff: '#1e3825',
          stroke: '#3e764c'
        };
      case 'T02': // Sand
        return {
          top: '#82552c',
          topBevel: '#9e6a38',
          left: '#54361b',
          right: '#362310',
          cliff: '#54361b',
          stroke: '#9e6a38'
        };
      case 'T03': // Mud/Clay
        return {
          top: '#452e1f',
          topBevel: '#593b28',
          left: '#2c1d14',
          right: '#1d130d',
          cliff: '#302016',
          stroke: '#5c3e2b'
        };
      case 'T04': // Stone/Ridge
        return {
          top: '#3a4049',
          topBevel: '#4d5561',
          left: '#262a30',
          right: '#191c20',
          cliff: '#2a2e36',
          stroke: '#525b68'
        };
      case 'T05': // Alpine Snow
        return {
          top: '#f0f6fc',
          topBevel: '#ffffff',
          left: '#b8ccff',
          right: '#96b0ee',
          cliff: '#7996d9',
          stroke: '#ffffff'
        };
      case 'T06': // River/Water
        return {
          top: '#0072e3',
          topBevel: '#388bfd',
          left: '#004aa0',
          right: '#00316e',
          cliff: '#004aa0',
          stroke: '#58a6ff'
        };
      case 'T07': // Gravel
        return {
          top: '#525a68',
          topBevel: '#667080',
          left: '#383e47',
          right: '#24282e',
          cliff: '#383e47',
          stroke: '#737e90'
        };
      default:
        return {
          top: '#242830',
          topBevel: '#343a45',
          left: '#171a1f',
          right: '#0e1013',
          cliff: '#171a1f',
          stroke: '#3a4250'
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

      // Auto resize canvas to match device pixels
      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== rect.width || canvas.height !== rect.height) {
        canvas.width = rect.width;
        canvas.height = rect.height;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Deep atmospheric background gradient
      const bgGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      bgGrad.addColorStop(0, '#06090e');
      bgGrad.addColorStop(0.5, '#0a0e16');
      bgGrad.addColorStop(1, '#0e1420');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Push camera transform
      ctx.save();
      const originX = canvas.width / 2 + currentPan.current.x;
      const originY = canvas.height / 2.5 + currentPan.current.y;
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
      // PHASE 4: PROCEDURAL MOVING CLOUD SHADOWS
      // ----------------------------------------------------
      const windRad = ((worldState.globalEnv.globalWindDirection || 270) * Math.PI) / 180;
      const windSpeed = worldState.globalEnv.globalWindSpeed || 8;
      const cloudSpeedMul = 0.08 * (windSpeed / 10);

      // Draw cloud shadows onto ground before terrain blocks
      ctx.save();
      for (const cloud of clouds.current) {
        cloud.x += Math.cos(windRad) * cloud.speed * cloudSpeedMul;
        cloud.y += Math.sin(windRad) * cloud.speed * cloudSpeedMul * 0.5;

        // Wrap around world boundary
        if (cloud.x > 600) cloud.x = -600;
        if (cloud.x < -600) cloud.x = 600;
        if (cloud.y > 450) cloud.y = -450;
        if (cloud.y < -450) cloud.y = 450;

        // Soft ground shadow
        const shadowGrad = ctx.createRadialGradient(cloud.x, cloud.y + 40, 10, cloud.x, cloud.y + 40, cloud.size);
        shadowGrad.addColorStop(0, `rgba(0, 0, 0, ${cloud.opacity * 0.9})`);
        shadowGrad.addColorStop(0.7, `rgba(0, 0, 0, ${cloud.opacity * 0.4})`);
        shadowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = shadowGrad;
        ctx.beginPath();
        ctx.ellipse(cloud.x, cloud.y + 40, cloud.size * 1.3, cloud.size * 0.65, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // ----------------------------------------------------
      // PHASE 2: 2.5D ELEVATED TERRAIN RENDERING & MICRO-DETAILS
      // ----------------------------------------------------
      // Sort and render isometric blocks from back-to-front (y then x)
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const cell = grid[y][x];
          const elev = cell.baseTerrain.elevation;
          const pt = gridToIso(x, y, elev);
          const shading = getBlockShading(cell.baseTerrain.id, elev);

          const isSelected = selectedCell?.x === x && selectedCell?.y === y;
          const isHovered = hoveredCell?.x === x && hoveredCell?.y === y;

          // A. Draw Elevation Vertical Cliff Faces (if elevation > 0)
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

            // Right Cliff Face
            ctx.fillStyle = shading.right;
            ctx.beginPath();
            ctx.moveTo(pt.x, pt.y + tileHeight / 2);
            ctx.lineTo(pt.x + tileWidth / 2, pt.y);
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

          // Selection / hover color grading
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

          // C. Deterministic Micro-Details (Grass tufts, sand ripples, water waves)
          const cellHash = (x * 37 + y * 19 + worldState.seed) % 100;

          if (cell.baseTerrain.id === 'T01' && cellHash > 35) {
            // Grass Tufts
            ctx.strokeStyle = '#488254';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(pt.x - 4, pt.y + 1);
            ctx.lineTo(pt.x - 5, pt.y - 4);
            ctx.moveTo(pt.x, pt.y + 2);
            ctx.lineTo(pt.x + 1, pt.y - 5);
            ctx.moveTo(pt.x + 4, pt.y + 1);
            ctx.lineTo(pt.x + 6, pt.y - 3);
            ctx.stroke();
          } else if (cell.baseTerrain.id === 'T02') {
            // Sand Dune Ripples
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(pt.x - 8, pt.y - 2);
            ctx.quadraticCurveTo(pt.x, pt.y + 3, pt.x + 8, pt.y - 2);
            ctx.stroke();
          } else if (cell.dynamic.waterBodyType === 'RIVER') {
            // Flowing Water Shimmer Waves (Speed proportional to velocity)
            const riverVel = Math.max(0.5, cell.dynamic.velocity || 1.0);
            const riverOffset = (timestamp * 0.003 * riverVel) % 12;

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(pt.x - 10 + riverOffset, pt.y - 2);
            ctx.lineTo(pt.x + riverOffset, pt.y + 3);
            ctx.lineTo(pt.x + 10 + riverOffset, pt.y - 2);
            ctx.stroke();
          }

          // D. Overlays (e.g. Gravel reinforcement)
          if (cell.overlays.includes('Gravel')) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.beginPath();
            ctx.arc(pt.x - 6, pt.y - 2, 1.8, 0, Math.PI * 2);
            ctx.arc(pt.x + 5, pt.y + 2, 1.5, 0, Math.PI * 2);
            ctx.arc(pt.x + 1, pt.y - 4, 1.6, 0, Math.PI * 2);
            ctx.fill();
          }

          // ----------------------------------------------------
          // PHASE 3: ANIMATED INFRASTRUCTURE
          // ----------------------------------------------------
          if (cell.machine) {
            const machineKey = `${x}_${y}`;
            ctx.save();
            ctx.translate(pt.x, pt.y - 6);

            if (cell.machine.type === 'LandSolar' || cell.machine.type === 'FloatSolar') {
              // Recognizable Multi-Panel Solar Array with mounting frame & specular glint
              const irr = cell.dynamic.effectiveIrradiance || 600;
              const glint = Math.min(1.0, irr / 900);

              // Sub-panel mounting rack
              ctx.strokeStyle = '#2d333b';
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.moveTo(-14, 8);
              ctx.lineTo(0, 12);
              ctx.lineTo(14, 6);
              ctx.stroke();

              // Multi-panel angled diamond face
              ctx.fillStyle = '#0a2540';
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
              ctx.strokeStyle = 'rgba(88, 166, 255, 0.35)';
              ctx.lineWidth = 0.8;
              ctx.beginPath();
              ctx.moveTo(-2, -9);
              ctx.lineTo(2, 9);
              ctx.moveTo(-14, 3);
              ctx.lineTo(14, -3);
              ctx.stroke();

              // Specular sun highlight glint
              if (glint > 0.4) {
                ctx.fillStyle = `rgba(255, 245, 180, ${glint * 0.7})`;
                ctx.beginPath();
                ctx.arc(-2, -2, 2.5 * glint, 0, Math.PI * 2);
                ctx.fill();
              }
            } else if (cell.machine.type === 'WindTurbine') {
              // Rotating Wind Turbine with Oblique Shadow
              const localWind = cell.dynamic.windSpeed || 0;
              const isOper = cell.machine.isOperating;
              const rotSpeed = isOper ? localWind * 0.08 : 0.01;

              // Advance blade rotation angle
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
              ctx.arc(0, -22, 3, 0, Math.PI * 2);
              ctx.fill();

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

                // Blade tip red hazard paint
                ctx.fillStyle = '#f85149';
                ctx.beginPath();
                ctx.arc(tipX, tipY, 1.2, 0, Math.PI * 2);
                ctx.fill();
              }
            } else if (cell.machine.type === 'HydroTurbine') {
              // Active Hydro Station with Dam Sluice & Foaming Rapids
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

              // Churning rapids white-water foam (scales with flow Q)
              const foamCount = Math.min(8, Math.max(3, Math.floor(flowQ / 15)));
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
          // X-RAY MULTI-SPECTRAL OVERLAYS
          // ----------------------------------------------------
          if (activeXRayLayer === 'wind') {
            const wSpeed = cell.dynamic.windSpeed;
            const wRad = ((cell.dynamic.windDirection || 270) * Math.PI) / 180;
            const arrowLen = Math.min(18, Math.max(6, wSpeed * 1.2));
            const dx = -Math.sin(wRad) * arrowLen;
            const dy = Math.cos(wRad) * arrowLen * 0.5;

            ctx.strokeStyle = cell.dynamic.windShadowFactor < 0.7 ? '#f0883e' : '#79c0ff';
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.moveTo(pt.x - dx / 2, pt.y - dy / 2);
            ctx.lineTo(pt.x + dx / 2, pt.y + dy / 2);
            ctx.stroke();

            ctx.fillStyle = cell.dynamic.windShadowFactor < 0.7 ? '#f0883e' : '#79c0ff';
            ctx.beginPath();
            ctx.arc(pt.x + dx / 2, pt.y + dy / 2, 2, 0, Math.PI * 2);
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
              ctx.fillText(`${cell.dynamic.velocity.toFixed(1)}m/s`, pt.x, pt.y + 3);
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
          }
        }
      }

      // ----------------------------------------------------
      // PHASE 4: LIVING WIND PARTICLES
      // ----------------------------------------------------
      ctx.save();
      const pSpeedMul = 0.4 * (windSpeed / 10);
      for (const p of windParticles.current) {
        p.x += Math.cos(windRad) * p.speed * pSpeedMul;
        p.y += Math.sin(windRad) * p.speed * pSpeedMul * 0.5;

        // Wrap around viewport boundary
        if (p.x > 700) p.x = -700;
        if (p.x < -700) p.x = 700;
        if (p.y > 450) p.y = -450;
        if (p.y < -450) p.y = 450;

        // Draw wind streak
        ctx.strokeStyle = `rgba(180, 220, 255, ${p.alpha})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + Math.cos(windRad) * p.length, p.y + Math.sin(windRad) * p.length * 0.5);
        ctx.stroke();
      }
      ctx.restore();

      // ----------------------------------------------------
      // PHASE 5: PULSING GLOWING ENERGY CONDUITS
      // ----------------------------------------------------
      const demandZone = worldState.demandZones[0];
      const targetPos = demandZone?.cells[0] || { x: width - 1, y: height - 1 };
      const targetCell = grid[targetPos.y]?.[targetPos.x];
      if (targetCell) {
        const targetPt = gridToIso(targetPos.x, targetPos.y, targetCell.baseTerrain.elevation);

        ctx.save();
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const cell = grid[y][x];
            if (cell.machine && cell.derived.powerDelivered > 0) {
              const genPt = gridToIso(x, y, cell.baseTerrain.elevation);
              const pDeliv = cell.derived.powerDelivered;

              // Animated energy pulse phase
              const pulsePhase = (timestamp * 0.004 * (pDeliv / 100)) % 1;
              const pulseX = genPt.x + (targetPt.x - genPt.x) * pulsePhase;
              const pulseY = (genPt.y - 6) + (targetPt.y - (genPt.y - 6)) * pulsePhase;

              // Glowing Cable Line
              ctx.strokeStyle = activeXRayLayer === 'network' ? 'rgba(0, 229, 255, 0.75)' : 'rgba(56, 139, 253, 0.45)';
              ctx.lineWidth = 2;
              ctx.setLineDash([5, 5]);
              ctx.beginPath();
              ctx.moveTo(genPt.x, genPt.y - 6);
              ctx.lineTo(targetPt.x, targetPt.y);
              ctx.stroke();
              ctx.setLineDash([]);

              // Flowing Energy Pulse Glow Particle
              const glowGrad = ctx.createRadialGradient(pulseX, pulseY, 1, pulseX, pulseY, 10);
              glowGrad.addColorStop(0, '#ffffff');
              glowGrad.addColorStop(0.4, '#79c0ff');
              glowGrad.addColorStop(1, 'rgba(56, 139, 253, 0)');
              ctx.fillStyle = glowGrad;
              ctx.beginPath();
              ctx.arc(pulseX, pulseY, 10, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
        ctx.restore();
      }

      // ----------------------------------------------------
      // PHASE 5: CONSTRUCTION SHOCKWAVE RING POP
      // ----------------------------------------------------
      if (constructionPulse) {
        const elapsed = timestamp - constructionPulse.time;
        if (elapsed < 400) {
          const progress = elapsed / 400; // 0 to 1
          const pulseCell = grid[constructionPulse.y]?.[constructionPulse.x];
          if (pulseCell) {
            const pt = gridToIso(constructionPulse.x, constructionPulse.y, pulseCell.baseTerrain.elevation);
            const radius = 10 + progress * 40;
            const alpha = 1.0 - progress;

            ctx.save();
            ctx.strokeStyle = `rgba(56, 139, 253, ${alpha})`;
            ctx.lineWidth = 3 * (1.0 - progress);
            ctx.beginPath();
            ctx.ellipse(pt.x, pt.y, radius, radius * 0.5, 0, 0, Math.PI * 2);
            ctx.stroke();

            // Inner flash
            ctx.fillStyle = `rgba(121, 192, 255, ${alpha * 0.4})`;
            ctx.beginPath();
            ctx.ellipse(pt.x, pt.y, radius * 0.6, radius * 0.3, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        }
      }

      // ----------------------------------------------------
      // PHASE 8: FACTORIO GHOST PLACEMENT HOVER PREVIEW
      // ----------------------------------------------------
      if (hoveredCell) {
        const cell = grid[hoveredCell.y]?.[hoveredCell.x];
        if (cell) {
          const pt = gridToIso(hoveredCell.x, hoveredCell.y, cell.baseTerrain.elevation);

          if (buildTool) {
            const validation = buildTool.kind === 'machine'
              ? PlacementEngine.canPlace(buildTool.type, cell, worldState)
              : PlacementEngine.canReinforce(buildTool.type, cell);

            const isValid = validation.valid;
            const ghostFill = isValid ? 'rgba(46, 160, 67, 0.45)' : 'rgba(248, 81, 73, 0.45)';
            const ghostStroke = isValid ? '#3fb950' : '#f85149';

            // Draw Ghost Diamond footprint
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

            // Tooltip pill
            const tipX = pt.x + 40;
            const tipY = pt.y - 65;
            const boxWidth = isValid ? 180 : 250;
            const boxHeight = isValid ? 48 : 68;

            ctx.fillStyle = 'rgba(13, 17, 23, 0.95)';
            ctx.strokeStyle = ghostStroke;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect(tipX, tipY, boxWidth, boxHeight, 6);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = ghostStroke;
            ctx.font = '700 11px Inter, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(isValid ? `✓ CAN PLACE ${buildTool.type.toUpperCase()}` : `✕ CANNOT PLACE ${buildTool.type.toUpperCase()}`, tipX + 10, tipY + 16);

            if (isValid) {
              ctx.fillStyle = '#f0f6fc';
              ctx.font = '10px Inter, sans-serif';
              ctx.fillText(`Click to construct on [${hoveredCell.x}, ${hoveredCell.y}]`, tipX + 10, tipY + 32);
            } else {
              ctx.fillStyle = '#ffb4ab';
              ctx.font = '9.5px Inter, sans-serif';
              const reason = validation.reason || 'Placement invalid.';
              const words = reason.split(' ');
              let line1 = '';
              let line2 = '';
              for (const w of words) {
                if ((line1 + w).length < 36) {
                  line1 += (line1 ? ' ' : '') + w;
                } else {
                  line2 += (line2 ? ' ' : '') + w;
                }
              }
              ctx.fillText(line1, tipX + 10, tipY + 32);
              if (line2) ctx.fillText(line2, tipX + 10, tipY + 48);
            }
          } else {
            // Standard Inspect Hover Reticle
            ctx.strokeStyle = '#afc6ff';
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
  }, [grid, width, height, selectedCell, hoveredCell, buildTool, worldState, getBlockShading, gridToIso, activeXRayLayer, constructionPulse, tileWidth, tileHeight, elevationStep]);

  // Mouse event handlers for smooth panning, zooming, selecting
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    isDragging.current = true;
    dragStart.current = {
      x: e.clientX - targetPan.current.x,
      y: e.clientY - targetPan.current.y
    };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDragging.current) {
      targetPan.current = {
        x: e.clientX - dragStart.current.x,
        y: e.clientY - dragStart.current.y
      };
    } else {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const pos = screenToGrid(e.clientX - rect.left, e.clientY - rect.top);
      setHoveredCell(pos);
    }
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pos = screenToGrid(e.clientX - rect.left, e.clientY - rect.top);
    if (pos) {
      const cell = grid[pos.y][pos.x];
      if (buildTool && onBuild) {
        onBuild(cell);
      } else {
        onSelectCell(cell);
      }
    } else {
      onSelectCell(null);
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.88;
    targetZoom.current = Math.min(2.8, Math.max(0.6, targetZoom.current * zoomFactor));
  };

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
        onWheel={handleWheel}
        style={{
          width: '100%',
          height: '100%',
          cursor: isDragging.current ? 'grabbing' : 'grab',
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
    </div>
  );
};
