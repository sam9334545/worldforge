import React from 'react';
import type { CellState } from '../../sim/types.ts';
import type { XRayLayer } from '../viewport/XRayControls.tsx';

interface CellInspectorProps {
  cell: CellState;
  onClose: () => void;
  onSelectXRayLayer?: (layer: XRayLayer) => void;
}

export const CellInspector: React.FC<CellInspectorProps> = ({ cell, onSelectXRayLayer }) => {
  const { baseTerrain, overlays, machine, cable, dynamic, derived } = cell;

  const isRiver = dynamic.waterBodyType === 'RIVER' || baseTerrain.id === 'T06';
  const isMountain = baseTerrain.elevation >= 3 || baseTerrain.id === 'T04' || baseTerrain.id === 'T05';

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      userSelect: 'none'
    }}>
      {/* Summary Banner */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 10px',
        backgroundColor: 'var(--surface-elevated)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-subtle)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="material-symbols-outlined" style={{ color: 'var(--primary-bright)', fontSize: '20px' }}>
            {isRiver ? 'water' : isMountain ? 'landscape' : 'terrain'}
          </span>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
              {isRiver ? 'RIVER / WATERWAY' : isMountain ? 'MOUNTAIN RIDGE' : baseTerrain.name.toUpperCase()} [{cell.x}, {cell.y}]
            </div>
            <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
              Elevation: +{baseTerrain.elevation}m ({baseTerrain.elevation * 300}m ASL)
            </div>
          </div>
        </div>
        <span style={{
          fontSize: '10px',
          fontWeight: 700,
          padding: '2px 6px',
          borderRadius: 'var(--radius-xs)',
          backgroundColor: 'rgba(255,255,255,0.06)',
          color: 'var(--tertiary)'
        }}>
          {baseTerrain.id}
        </span>
      </div>

      {/* Contextual Specialty Cards */}
      {isRiver && (
        <div style={{
          backgroundColor: 'rgba(0, 110, 220, 0.12)',
          border: '1px solid rgba(56, 139, 253, 0.4)',
          borderRadius: 'var(--radius-md)',
          padding: '10px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#58a6ff' }}>
              Hydrological Dynamics (Section 13)
            </span>
            {onSelectXRayLayer && (
              <button
                onClick={() => onSelectXRayLayer('hydro')}
                style={{
                  fontSize: '9.5px',
                  fontWeight: 600,
                  color: 'var(--primary-bright)',
                  padding: '2px 6px',
                  backgroundColor: 'rgba(56, 139, 253, 0.2)',
                  borderRadius: 'var(--radius-xs)',
                  border: '1px solid rgba(56, 139, 253, 0.4)'
                }}
              >
                Show Hydro X-Ray
              </button>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '11px' }} className="tabular-nums">
            <div style={{ background: 'rgba(0,0,0,0.25)', padding: '4px 6px', borderRadius: 'var(--radius-xs)' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '9.5px' }}>Discharge Q: </span>
              <div style={{ color: '#58a6ff', fontWeight: 700 }}>{dynamic.flowRateQ.toFixed(1)} m³/s</div>
            </div>
            <div style={{ background: 'rgba(0,0,0,0.25)', padding: '4px 6px', borderRadius: 'var(--radius-xs)' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '9.5px' }}>Flow Velocity: </span>
              <div style={{ color: '#79c0ff', fontWeight: 700 }}>{dynamic.velocity.toFixed(2)} m/s</div>
            </div>
          </div>
        </div>
      )}

      {isMountain && (
        <div style={{
          backgroundColor: 'rgba(110, 120, 140, 0.12)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: '10px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-primary)' }}>
              Orographic & Alpine Profile
            </span>
            {onSelectXRayLayer && (
              <button
                onClick={() => onSelectXRayLayer('wind')}
                style={{
                  fontSize: '9.5px',
                  fontWeight: 600,
                  color: 'var(--primary-bright)',
                  padding: '2px 6px',
                  backgroundColor: 'rgba(56, 139, 253, 0.2)',
                  borderRadius: 'var(--radius-xs)',
                  border: '1px solid rgba(56, 139, 253, 0.4)'
                }}
              >
                Show Wind X-Ray
              </button>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '11px' }} className="tabular-nums">
            <div style={{ background: 'rgba(0,0,0,0.25)', padding: '4px 6px', borderRadius: 'var(--radius-xs)' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '9.5px' }}>Windward Wind: </span>
              <div style={{ color: 'var(--secondary)', fontWeight: 700 }}>{dynamic.windSpeed.toFixed(1)} m/s</div>
            </div>
            <div style={{ background: 'rgba(0,0,0,0.25)', padding: '4px 6px', borderRadius: 'var(--radius-xs)' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '9.5px' }}>Leeward Factor: </span>
              <div style={{ color: dynamic.windShadowFactor < 0.7 ? 'var(--warning-bright)' : 'var(--tertiary)', fontWeight: 700 }}>
                {(dynamic.windShadowFactor * 100).toFixed(0)}%
              </div>
            </div>
            <div style={{ background: 'rgba(0,0,0,0.25)', padding: '4px 6px', borderRadius: 'var(--radius-xs)' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '9.5px' }}>Alpine Snow Depth: </span>
              <div style={{ color: '#ffffff', fontWeight: 700 }}>{(dynamic.snowDepth * 100).toFixed(1)} cm</div>
            </div>
            <div style={{ background: 'rgba(0,0,0,0.25)', padding: '4px 6px', borderRadius: 'var(--radius-xs)' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '9.5px' }}>Terrain Roughness: </span>
              <div style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{baseTerrain.roughnessZ0}m</div>
            </div>
          </div>
        </div>
      )}

      {/* Layer A: Soil Stability & Mechanical Stack */}
      <div style={{
        background: 'var(--surface-elevated)',
        padding: '10px',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px'
      }}>
        <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Soil & Foundation Stack (Section 16)
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '11px' }} className="tabular-nums">
          <div style={{ background: 'var(--surface-container-lowest)', padding: '4px 6px', borderRadius: 'var(--radius-xs)' }}>
            <span style={{ color: 'var(--text-muted)' }}>Effective Stability: </span>
            <div style={{ color: derived.effectiveStability >= 0.7 ? 'var(--tertiary)' : 'var(--warning-bright)', fontWeight: 700 }}>
              {derived.effectiveStability.toFixed(2)} {derived.effectiveStability >= 0.7 ? '✓ Stable' : '⚠ Soft'}
            </div>
          </div>
          <div style={{ background: 'var(--surface-container-lowest)', padding: '4px 6px', borderRadius: 'var(--radius-xs)' }}>
            <span style={{ color: 'var(--text-muted)' }}>Reinforcement: </span>
            <div style={{ color: overlays.length > 0 ? 'var(--tertiary)' : 'var(--text-muted)', fontWeight: 600 }}>
              {overlays.length > 0 ? overlays.join(' + ') : 'None'}
            </div>
          </div>
          <div style={{ background: 'var(--surface-container-lowest)', padding: '4px 6px', borderRadius: 'var(--radius-xs)' }}>
            <span style={{ color: 'var(--text-muted)' }}>Permeability: </span>
            <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{baseTerrain.permeability.toFixed(2)}</div>
          </div>
          <div style={{ background: 'var(--surface-container-lowest)', padding: '4px 6px', borderRadius: 'var(--radius-xs)' }}>
            <span style={{ color: 'var(--text-muted)' }}>Moisture Capacity: </span>
            <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{baseTerrain.moistureCapacity.toFixed(2)}</div>
          </div>
        </div>
      </div>

      {/* Layer B: Dynamic Atmospheric & Solar Irradiance */}
      <div style={{
        background: 'var(--surface-elevated)',
        padding: '10px',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Atmospheric & Solar Exposure
          </span>
          {onSelectXRayLayer && (
            <button
              onClick={() => onSelectXRayLayer('solar')}
              style={{
                fontSize: '9.5px',
                fontWeight: 600,
                color: 'var(--warning-bright)',
                padding: '2px 6px',
                backgroundColor: 'rgba(255, 234, 121, 0.15)',
                borderRadius: 'var(--radius-xs)',
                border: '1px solid rgba(255, 234, 121, 0.4)'
              }}
            >
              Show Solar X-Ray
            </button>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '11px' }} className="tabular-nums">
          <div style={{ background: 'var(--surface-container-lowest)', padding: '4px 6px', borderRadius: 'var(--radius-xs)' }}>
            <span style={{ color: 'var(--text-muted)' }}>Effective Solar: </span>
            <div style={{ color: 'var(--warning-bright)', fontWeight: 700 }}>{dynamic.effectiveIrradiance.toFixed(0)} W/m²</div>
          </div>
          <div style={{ background: 'var(--surface-container-lowest)', padding: '4px 6px', borderRadius: 'var(--radius-xs)' }}>
            <span style={{ color: 'var(--text-muted)' }}>Sun Exposure: </span>
            <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{(dynamic.terrainObstruction * 100).toFixed(0)}%</div>
          </div>
          <div style={{ background: 'var(--surface-container-lowest)', padding: '4px 6px', borderRadius: 'var(--radius-xs)' }}>
            <span style={{ color: 'var(--text-muted)' }}>Local Wind Speed: </span>
            <div style={{ color: 'var(--secondary)', fontWeight: 700 }}>{dynamic.windSpeed.toFixed(1)} m/s</div>
          </div>
          <div style={{ background: 'var(--surface-container-lowest)', padding: '4px 6px', borderRadius: 'var(--radius-xs)' }}>
            <span style={{ color: 'var(--text-muted)' }}>Wind Bearing: </span>
            <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{Math.round(dynamic.windDirection)}°</div>
          </div>
        </div>
      </div>

      {/* Layer C: Machine / Cable Infrastructure */}
      <div style={{
        background: 'var(--surface-elevated)',
        padding: '10px',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px'
      }}>
        <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Installed Infrastructure
        </div>
        {machine ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--primary-bright)' }}>{machine.type}</span>
              <span style={{ fontSize: '10px', color: machine.isOperating ? 'var(--tertiary)' : 'var(--error-bright)', fontWeight: 700 }}>
                {machine.isOperating ? '● ONLINE' : '○ OFFLINE'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }} className="tabular-nums">
              <span style={{ color: 'var(--text-muted)' }}>Output this tick:</span>
              <span style={{ color: 'var(--tertiary)', fontWeight: 700 }}>{derived.powerGenerated.toFixed(1)} kW</span>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>No machine installed.</div>
        )}
        {cable && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', borderTop: '1px solid var(--border-subtle)', paddingTop: '4px', marginTop: '2px' }}>
            <span style={{ color: '#00e5ff', fontWeight: 600 }}>⚡ Grid Conduit Cable</span>
            <span style={{ color: 'var(--text-muted)' }}>Cap: {cable.capacity} kW</span>
          </div>
        )}
      </div>
    </div>
  );
};
