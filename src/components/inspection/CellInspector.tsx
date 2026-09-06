import React from 'react';
import type { CellState } from '../../sim/types';

interface CellInspectorProps {
  cell: CellState;
  onClose: () => void;
}

export const CellInspector: React.FC<CellInspectorProps> = ({ cell, onClose }) => {
  const { baseTerrain, overlays, machine, dynamic, derived } = cell;

  return (
    <aside style={{
      width: '340px',
      height: '100%',
      backgroundColor: 'var(--surface-base)',
      borderLeft: '1px solid var(--border-subtle)',
      padding: 'var(--space-base)',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      overflowY: 'auto',
      zIndex: 25,
      boxShadow: 'var(--modal-shadow)'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="material-symbols-outlined" style={{ color: 'var(--primary-bright)', fontSize: '20px' }}>layers</span>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
              CELL INSPECTION [{cell.x}, {cell.y}]
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Elevation: +{baseTerrain.elevation}m
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          style={{ width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', borderRadius: 'var(--radius-xs)' }}
        >
          ✕
        </button>
      </div>

      {/* Layer A: Base Terrain */}
      <div style={{
        background: 'var(--surface-elevated)',
        padding: '10px',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-subtle)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Layer A • Base Terrain
          </span>
          <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: 'var(--radius-xs)', background: 'rgba(255,255,255,0.05)', color: 'var(--text-variant)' }}>
            {baseTerrain.id}
          </span>
        </div>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
          {baseTerrain.name}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '11px' }} className="tabular-nums">
          <div style={{ background: 'var(--surface-container-lowest)', padding: '4px 6px', borderRadius: 'var(--radius-xs)' }}>
            <span style={{ color: 'var(--text-muted)' }}>Stability: </span>
            <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{baseTerrain.stability.toFixed(2)}</span>
          </div>
          <div style={{ background: 'var(--surface-container-lowest)', padding: '4px 6px', borderRadius: 'var(--radius-xs)' }}>
            <span style={{ color: 'var(--text-muted)' }}>Permeability: </span>
            <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{baseTerrain.permeability.toFixed(2)}</span>
          </div>
          <div style={{ background: 'var(--surface-container-lowest)', padding: '4px 6px', borderRadius: 'var(--radius-xs)' }}>
            <span style={{ color: 'var(--text-muted)' }}>Roughness z₀: </span>
            <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{baseTerrain.roughnessZ0}m</span>
          </div>
          <div style={{ background: 'var(--surface-container-lowest)', padding: '4px 6px', borderRadius: 'var(--radius-xs)' }}>
            <span style={{ color: 'var(--text-muted)' }}>Moisture Cap: </span>
            <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{baseTerrain.moistureCapacity.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Layer A Overlays & Reinforcement (Section 16) */}
      <div style={{
        background: 'var(--surface-elevated)',
        padding: '10px',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-subtle)'
      }}>
        <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
          Overlay Stack (RULE-OVERLAY-001)
        </div>
        <div style={{ fontSize: '12px', color: overlays.length > 0 ? 'var(--tertiary)' : 'var(--text-muted)', fontWeight: 500, marginBottom: '6px' }}>
          {overlays.length > 0 ? overlays.join(' → ') : 'None (Unreinforced Ground)'}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', background: 'var(--surface-container-lowest)', padding: '4px 6px', borderRadius: 'var(--radius-xs)' }} className="tabular-nums">
          <span style={{ color: 'var(--text-muted)' }}>Effective Stability:</span>
          <span style={{ color: derived.effectiveStability >= 0.7 ? 'var(--tertiary)' : 'var(--warning-bright)', fontWeight: 700 }}>
            {derived.effectiveStability.toFixed(2)} {derived.effectiveStability >= 0.7 ? '(Suitable for Solar/Wind)' : '(Requires ≥ 0.70)'}
          </span>
        </div>
      </div>

      {/* Layer C: Machine & Infrastructure */}
      <div style={{
        background: 'var(--surface-elevated)',
        padding: '10px',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-subtle)'
      }}>
        <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
          Layer C • Infrastructure
        </div>
        {machine ? (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--primary-bright)' }}>{machine.type}</span>
              <span style={{ fontSize: '10px', color: machine.isOperating ? 'var(--tertiary)' : 'var(--error-bright)', fontWeight: 600 }}>
                {machine.isOperating ? 'ACTIVE' : 'OFFLINE'}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', fontSize: '11px' }} className="tabular-nums">
              <span>Capacity: {machine.capacity} kW</span>
              <span>Efficiency: {(machine.efficiency * 100).toFixed(0)}%</span>
              <span>Health: {(machine.health * 100).toFixed(1)}%</span>
              <span>Maintenance: ${machine.maintenanceCostPerTick}/tick</span>
            </div>
            <div style={{ marginTop: '8px', background: 'var(--surface-container-lowest)', padding: '6px', borderRadius: 'var(--radius-xs)', display: 'flex', justifyContent: 'space-between', fontSize: '11px' }} className="tabular-nums">
              <span style={{ color: 'var(--text-muted)' }}>Output this tick:</span>
              <span style={{ color: 'var(--tertiary)', fontWeight: 700 }}>{derived.powerGenerated.toFixed(1)} kW</span>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No machine installed on this cell.</div>
        )}
      </div>

      {/* Layer B: Dynamic Environment */}
      <div style={{
        background: 'var(--surface-elevated)',
        padding: '10px',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-subtle)'
      }}>
        <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
          Layer B • Dynamic Environment
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '11px' }} className="tabular-nums">
          <div style={{ background: 'var(--surface-container-lowest)', padding: '4px 6px', borderRadius: 'var(--radius-xs)' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '10px' }}>Local Wind</div>
            <div style={{ color: 'var(--secondary)', fontWeight: 600 }}>{dynamic.windSpeed.toFixed(1)} m/s</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '9px' }}>Shadow: {(dynamic.windShadowFactor * 100).toFixed(0)}%</div>
          </div>
          <div style={{ background: 'var(--surface-container-lowest)', padding: '4px 6px', borderRadius: 'var(--radius-xs)' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '10px' }}>Effective Solar</div>
            <div style={{ color: 'var(--warning-bright)', fontWeight: 600 }}>{dynamic.effectiveIrradiance.toFixed(0)} W/m²</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '9px' }}>Obs: {(dynamic.terrainObstruction * 100).toFixed(0)}%</div>
          </div>
          {dynamic.waterBodyType && (
            <>
              <div style={{ background: 'var(--surface-container-lowest)', padding: '4px 6px', borderRadius: 'var(--radius-xs)' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '10px' }}>Flow Rate Q</div>
                <div style={{ color: 'var(--cyan-bright)', fontWeight: 600 }}>{dynamic.flowRateQ.toFixed(1)} m³/s</div>
              </div>
              <div style={{ background: 'var(--surface-container-lowest)', padding: '4px 6px', borderRadius: 'var(--radius-xs)' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '10px' }}>Water Velocity</div>
                <div style={{ color: 'var(--cyan-bright)', fontWeight: 600 }}>{dynamic.velocity.toFixed(2)} m/s</div>
              </div>
            </>
          )}
        </div>
      </div>
    </aside>
  );
};
