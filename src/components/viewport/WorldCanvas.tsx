import React, { useRef, useEffect, useState, useCallback } from 'react';
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
}

export const WorldCanvas: React.FC<WorldCanvasProps> = ({
  worldState,
  selectedCell,
  onSelectCell,
  hoveredCell,
  setHoveredCell,
  buildTool,
  onBuild,
  activeXRayLayer = 'none'
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Camera transform state: pan and zoom
  const [zoom, setZoom] = useState<number>(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const { grid, width, height } = worldState;

  // Isometric tile geometry constants
  const tileWidth = 64;
  const tileHeight = 32;
  const elevationStep = 10; // pixels per elevation unit (0 to 5)

  // Material palette with Top, Left, and Right face colors for 2.5D shading
  const getBlockShading = (id: string) => {
    switch (id) {
      case 'T01': // Grass/Dirt
        return { top: '#2a5834', left: '#142817', right: '#0d1c10', stroke: '#366e43' };
      case 'T02': // Sand
        return { top: '#734b26', left: '#4a2e13', right: '#2d1b0b', stroke: '#8c5e33' };
      case 'T03': // Mud/Clay
        return { top: '#3f2a1d', left: '#271911', right: '#1a100a', stroke: '#523727' };
      case 'T04': // Stone/Rock
        return { top: '#30353d', left: '#252a32', right: '#1b2027', stroke: '#424754' };
      case 'T05': // Snow/Peak
        return { top: '#f0f6fc', left: '#afc6ff', right: '#8ca8e8', stroke: '#ffffff' };
      case 'T06': // Water/River
        return { top: '#0072e3', left: '#00458e', right: '#002d6d', stroke: '#388bfd' };
      case 'T07': // Gravel
        return { top: '#4e5563', left: '#3b404b', right: '#2b2f37', stroke: '#656e7e' };
      default:
        return { top: '#1b2027', left: '#14181e', right: '#0d1117', stroke: '#30353d' };
    }
  };

  // Convert grid (x, y) with elevation to isometric canvas screen (px, py)
  const gridToIso = useCallback((x: number, y: number, elev: number) => {
    const isoX = (x - y) * (tileWidth / 2);
    const isoY = (x + y) * (tileHeight / 2) - elev * elevationStep;
    return { x: isoX, y: isoY };
  }, [tileWidth, tileHeight, elevationStep]);

  // Convert screen coordinates back to grid (x, y)
  const screenToGrid = useCallback((screenX: number, screenY: number) => {
    // Screen relative to center of canvas + pan
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const originX = canvas.width / 2 + pan.x;
    const originY = canvas.height / 3 + pan.y;

    const relX = (screenX - originX) / zoom;
    const relY = (screenY - originY) / zoom;

    // Search closest tile based on polygon hit-test from top to bottom
    // We iterate backwards from highest elevation and nearest tiles
    let closest: { x: number; y: number } | null = null;
    let minDistance = Infinity;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const cell = grid[y][x];
        const elev = cell.baseTerrain.elevation;
        const pt = gridToIso(x, y, elev);

        // Distance from center of diamond
        const dist = Math.hypot(relX - pt.x, relY - pt.y);
        if (dist < minDistance && dist < tileWidth * 0.75) {
          minDistance = dist;
          closest = { x, y };
        }
      }
    }

    return closest;
  }, [pan, zoom, width, height, grid, gridToIso, tileWidth]);

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Auto resize
    const rect = canvas.getBoundingClientRect();
    if (canvas.width !== rect.width || canvas.height !== rect.height) {
      canvas.width = rect.width;
      canvas.height = rect.height;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Save context for camera pan/zoom
    ctx.save();
    const originX = canvas.width / 2 + pan.x;
    const originY = canvas.height / 3 + pan.y;

    ctx.translate(originX, originY);
    ctx.scale(zoom, zoom);

    // 1. Draw substrate slab under the map (Stitch aesthetic)
    const eastCorner = gridToIso(width, 0, 0);
    const southCorner = gridToIso(width, height, 0);
    const westCorner = gridToIso(0, height, 0);
    const slabDepth = 24;

    // Slab bottom faces
    ctx.beginPath();
    ctx.moveTo(westCorner.x, westCorner.y);
    ctx.lineTo(southCorner.x, southCorner.y);
    ctx.lineTo(southCorner.x, southCorner.y + slabDepth);
    ctx.lineTo(westCorner.x, westCorner.y + slabDepth);
    ctx.closePath();
    ctx.fillStyle = '#090f15';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(southCorner.x, southCorner.y);
    ctx.lineTo(eastCorner.x, eastCorner.y);
    ctx.lineTo(eastCorner.x, eastCorner.y + slabDepth);
    ctx.lineTo(southCorner.x, southCorner.y + slabDepth);
    ctx.closePath();
    ctx.fillStyle = '#171c23';
    ctx.fill();

    // 2. Render 2.5D Isometric Cells in painter's order (back-to-front: y from 0 to height, x from 0 to width)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const cell = grid[y][x];
        const elev = cell.baseTerrain.elevation;
        const shading = getBlockShading(cell.baseTerrain.id);
        const pt = gridToIso(x, y, elev);

        const isHovered = hoveredCell?.x === x && hoveredCell?.y === y;
        const isSelected = selectedCell?.x === x && selectedCell?.y === y;

        // Block extrusion depth: extends down to base elevation (elev * elevationStep + 8)
        const blockDepth = Math.max(6, elev * elevationStep + 4);

        // A. Left face extrusion
        ctx.beginPath();
        ctx.moveTo(pt.x - tileWidth / 2, pt.y);
        ctx.lineTo(pt.x, pt.y + tileHeight / 2);
        ctx.lineTo(pt.x, pt.y + tileHeight / 2 + blockDepth);
        ctx.lineTo(pt.x - tileWidth / 2, pt.y + blockDepth);
        ctx.closePath();
        ctx.fillStyle = shading.left;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        ctx.stroke();

        // B. Right face extrusion
        ctx.beginPath();
        ctx.moveTo(pt.x, pt.y + tileHeight / 2);
        ctx.lineTo(pt.x + tileWidth / 2, pt.y);
        ctx.lineTo(pt.x + tileWidth / 2, pt.y + blockDepth);
        ctx.lineTo(pt.x, pt.y + tileHeight / 2 + blockDepth);
        ctx.closePath();
        ctx.fillStyle = shading.right;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        ctx.stroke();

        // C. Top diamond face
        ctx.beginPath();
        ctx.moveTo(pt.x, pt.y - tileHeight / 2);
        ctx.lineTo(pt.x + tileWidth / 2, pt.y);
        ctx.lineTo(pt.x, pt.y + tileHeight / 2);
        ctx.lineTo(pt.x - tileWidth / 2, pt.y);
        ctx.closePath();

        ctx.fillStyle = isSelected ? 'rgba(88, 166, 255, 0.5)' : (isHovered ? 'rgba(175, 198, 255, 0.4)' : shading.top);
        ctx.fill();

        ctx.strokeStyle = isSelected ? '#58a6ff' : (isHovered ? '#afc6ff' : shading.stroke);
        ctx.lineWidth = isSelected ? 2 : (isHovered ? 1.5 : 0.75);
        ctx.stroke();

        // D. Overlay rendering (e.g. Gravel reinforcement markings)
        if (cell.overlays.includes('Gravel')) {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 6, 0, Math.PI * 2);
          ctx.stroke();
        }

        // X-RAY LAYER OVERLAYS (Section 15, Oxygen Not Included style)
        if (activeXRayLayer === 'wind') {
          // Wind vector arrow & shadow factor
          const wSpeed = cell.dynamic.windSpeed;
          const wDir = cell.dynamic.windDirection;
          const wRad = (wDir * Math.PI) / 180;
          // Vector points in direction wind blows TO
          const arrowLen = Math.min(14, Math.max(4, wSpeed * 1.0));
          const dx = -Math.sin(wRad) * arrowLen;
          const dy = Math.cos(wRad) * arrowLen * 0.5; // isometric foreshortening

          ctx.strokeStyle = cell.dynamic.windShadowFactor < 0.7 ? '#f0883e' : '#79c0ff';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(pt.x - dx / 2, pt.y - dy / 2);
          ctx.lineTo(pt.x + dx / 2, pt.y + dy / 2);
          ctx.stroke();

          // Small arrowhead
          ctx.fillStyle = cell.dynamic.windShadowFactor < 0.7 ? '#f0883e' : '#79c0ff';
          ctx.beginPath();
          ctx.arc(pt.x + dx / 2, pt.y + dy / 2, 1.5, 0, Math.PI * 2);
          ctx.fill();
        } else if (activeXRayLayer === 'solar') {
          // Solar exposure overlay
          const irr = cell.dynamic.effectiveIrradiance;
          const alpha = Math.min(0.6, Math.max(0.05, irr / 1000));
          ctx.fillStyle = cell.dynamic.terrainObstruction < 0.8
            ? 'rgba(40, 60, 120, 0.45)' // diffuse obstruction shadow
            : `rgba(255, 234, 121, ${alpha})`;
          ctx.beginPath();
          ctx.moveTo(pt.x, pt.y - tileHeight / 2);
          ctx.lineTo(pt.x + tileWidth / 2, pt.y);
          ctx.lineTo(pt.x, pt.y + tileHeight / 2);
          ctx.lineTo(pt.x - tileWidth / 2, pt.y);
          ctx.closePath();
          ctx.fill();
        } else if (activeXRayLayer === 'hydro') {
          // River flow & runoff overlay
          if (cell.dynamic.waterBodyType === 'RIVER') {
            ctx.fillStyle = 'rgba(0, 229, 255, 0.4)';
            ctx.beginPath();
            ctx.moveTo(pt.x, pt.y - tileHeight / 2);
            ctx.lineTo(pt.x + tileWidth / 2, pt.y);
            ctx.lineTo(pt.x, pt.y + tileHeight / 2);
            ctx.lineTo(pt.x - tileWidth / 2, pt.y);
            ctx.closePath();
            ctx.fill();

            // Velocity indicator
            ctx.fillStyle = '#ffffff';
            ctx.font = '8px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`${cell.dynamic.velocity.toFixed(1)}m/s`, pt.x, pt.y + 3);
          }
        } else if (activeXRayLayer === 'elevation') {
          // Elevation heat contours
          const colors = ['#1b3b22', '#2a5834', '#4e7336', '#73684a', '#6b7280', '#e5e7eb'];
          ctx.fillStyle = colors[Math.min(colors.length - 1, elev)] + '88';
          ctx.beginPath();
          ctx.moveTo(pt.x, pt.y - tileHeight / 2);
          ctx.lineTo(pt.x + tileWidth / 2, pt.y);
          ctx.lineTo(pt.x, pt.y + tileHeight / 2);
          ctx.lineTo(pt.x - tileWidth / 2, pt.y);
          ctx.closePath();
          ctx.fill();
        }

        // E. Machine icon representation (functional 2.5D marker)
        if (cell.machine) {
          ctx.save();
          ctx.translate(pt.x, pt.y - 6);

          if (cell.machine.type === 'LandSolar') {
            // Solar panel angled diamond
            ctx.fillStyle = '#00458e';
            ctx.strokeStyle = '#afc6ff';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(-10, -4);
            ctx.lineTo(10, -8);
            ctx.lineTo(14, 4);
            ctx.lineTo(-6, 8);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
          } else if (cell.machine.type === 'WindTurbine') {
            // Wind turbine mast and rotor
            ctx.strokeStyle = '#dee2ec';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(0, 4);
            ctx.lineTo(0, -18);
            ctx.stroke();

            // Nacelle hub
            ctx.fillStyle = '#afc6ff';
            ctx.beginPath();
            ctx.arc(0, -18, 2.5, 0, Math.PI * 2);
            ctx.fill();

            // Simple static 3-blade indicator
            ctx.strokeStyle = '#58a6ff';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(0, -18);
            ctx.lineTo(0, -30);
            ctx.moveTo(0, -18);
            ctx.lineTo(10, -12);
            ctx.moveTo(0, -18);
            ctx.lineTo(-10, -12);
            ctx.stroke();
          } else if (cell.machine.type === 'HydroTurbine') {
            // Dam station block
            ctx.fillStyle = '#252a32';
            ctx.strokeStyle = '#388bfd';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.rect(-12, -8, 24, 14);
            ctx.fill();
            ctx.stroke();

            // Rapids water foam
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(-3, 8, 3, 0, Math.PI * 2);
            ctx.arc(4, 7, 2.5, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }

        // F. Elevation label for high elevation blocks
        if (elev >= 3) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
          ctx.font = '9px Inter, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(`+${elev}m`, pt.x, pt.y + 4);
        }
      }
    }

    // Energy Network Conduit Overlay (Section 17, Stitch style)
    if (activeXRayLayer === 'network') {
      const demandZone = worldState.demandZones[0];
      const targetPos = demandZone?.cells[0] || { x: width - 1, y: height - 1 };
      const targetCell = grid[targetPos.y][targetPos.x];
      const targetPt = gridToIso(targetPos.x, targetPos.y, targetCell.baseTerrain.elevation);

      ctx.save();
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const cell = grid[y][x];
          if (cell.machine && cell.derived.powerGenerated > 0) {
            const genPt = gridToIso(x, y, cell.baseTerrain.elevation);

            // Glowing cyan laser conduit line
            ctx.strokeStyle = '#388bfd';
            ctx.lineWidth = 2.5;
            ctx.setLineDash([6, 6]);
            ctx.beginPath();
            ctx.moveTo(genPt.x, genPt.y - 6);
            ctx.lineTo(targetPt.x, targetPt.y);
            ctx.stroke();
            ctx.setLineDash([]);

            // Inner core
            ctx.strokeStyle = '#79c0ff';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(genPt.x, genPt.y - 6);
            ctx.lineTo(targetPt.x, targetPt.y);
            ctx.stroke();
          }
        }
      }
      ctx.restore();
    }

    // 3. Draw Hover Reticle / Ghost Placement Preview
    if (hoveredCell) {
      const cell = grid[hoveredCell.y][hoveredCell.x];
      const pt = gridToIso(hoveredCell.x, hoveredCell.y, cell.baseTerrain.elevation);

      if (buildTool) {
        // Validation check directly from PlacementEngine
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
        ctx.lineWidth = 2;
        ctx.stroke();

        // Tooltip with validation feedback
        const tipX = pt.x + 35;
        const tipY = pt.y - 55;
        const boxWidth = isValid ? 170 : 230;
        const boxHeight = isValid ? 44 : 64;

        ctx.fillStyle = 'rgba(22, 27, 34, 0.95)';
        ctx.strokeStyle = ghostStroke;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(tipX, tipY, boxWidth, boxHeight, 4);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = ghostStroke;
        ctx.font = '700 10px Inter, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(isValid ? `✓ CAN PLACE ${buildTool.type.toUpperCase()}` : `✕ CANNOT PLACE ${buildTool.type.toUpperCase()}`, tipX + 8, tipY + 14);

        if (isValid) {
          ctx.fillStyle = '#f0f6fc';
          ctx.font = '10px Inter, sans-serif';
          ctx.fillText(`Click to construct on [${hoveredCell.x}, ${hoveredCell.y}]`, tipX + 8, tipY + 28);
        } else {
          ctx.fillStyle = '#ffb4ab';
          ctx.font = '9px Inter, sans-serif';
          // Split long reason
          const reason = validation.reason || 'Placement invalid.';
          const words = reason.split(' ');
          let line1 = '';
          let line2 = '';
          for (const w of words) {
            if ((line1 + w).length < 34) {
              line1 += (line1 ? ' ' : '') + w;
            } else {
              line2 += (line2 ? ' ' : '') + w;
            }
          }
          ctx.fillText(line1, tipX + 8, tipY + 28);
          if (line2) ctx.fillText(line2, tipX + 8, tipY + 42);
        }
      } else {
        // Standard Inspect Hover Reticle
        ctx.strokeStyle = '#afc6ff';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(pt.x, pt.y - tileHeight / 2 - 2);
        ctx.lineTo(pt.x + tileWidth / 2 + 3, pt.y);
        ctx.lineTo(pt.x, pt.y + tileHeight / 2 + 2);
        ctx.lineTo(pt.x - tileWidth / 2 - 3, pt.y);
        ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);

        // Pointer line to floating tag
        ctx.strokeStyle = '#afc6ff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pt.x, pt.y);
        ctx.lineTo(pt.x + 30, pt.y - 35);
        ctx.stroke();

        // Tooltip pill
        const tipX = pt.x + 35;
        const tipY = pt.y - 55;
        ctx.fillStyle = 'rgba(22, 27, 34, 0.95)';
        ctx.strokeStyle = '#30363d';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(tipX, tipY, 150, 48, 4);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#afc6ff';
        ctx.font = '600 10px Inter, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`CELL [${hoveredCell.x}, ${hoveredCell.y}]`, tipX + 8, tipY + 14);

        ctx.fillStyle = '#f0f6fc';
        ctx.font = '10px Inter, sans-serif';
        ctx.fillText(`${cell.baseTerrain.name} • +${cell.baseTerrain.elevation}m`, tipX + 8, tipY + 28);

        ctx.fillStyle = '#8b949e';
        ctx.font = '9px Inter, sans-serif';
        ctx.fillText(`Stab: ${cell.derived.effectiveStability.toFixed(2)} • Wind: ${cell.dynamic.windSpeed.toFixed(1)}m/s`, tipX + 8, tipY + 41);
      }
    }

    ctx.restore();
  }, [grid, width, height, pan, zoom, hoveredCell, selectedCell, buildTool, worldState, getBlockShading, gridToIso, tileWidth, tileHeight, elevationStep]);

  // Mouse event handlers for panning, zooming, selecting
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDragging) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    } else {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const pos = screenToGrid(e.clientX - rect.left, e.clientY - rect.top);
      setHoveredCell(pos);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
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
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    setZoom((prev: number) => Math.min(2.5, Math.max(0.5, prev * zoomFactor)));
  };

  const handleResetCamera = () => {
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
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
          cursor: isDragging ? 'grabbing' : 'grab',
          display: 'block'
        }}
      />

      {/* Floating Camera Dock (Stitch & Reference Game HUD) */}
      <div style={{
        position: 'absolute',
        top: '16px',
        left: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        background: 'var(--glass-bg)',
        backdropFilter: 'blur(8px)',
        padding: '4px',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-subtle)',
        boxShadow: 'var(--glass-shadow)',
        zIndex: 20
      }}>
        <button
          onClick={() => setZoom((z: number) => Math.min(2.5, z * 1.2))}
          style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-sm)' }}
          title="Zoom In"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span>
        </button>
        <button
          onClick={() => setZoom((z: number) => Math.max(0.5, z / 1.2))}
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
