import React from 'react';
import type { MachineState, DerivedPhysicalState } from '../../sim/types.ts';

interface MachineInspectorProps {
  machine: MachineState;
  derived: DerivedPhysicalState;
  onRemove: () => void;
  onClose: () => void;
  onExplainCause?: () => void;
}

export const MachineInspector: React.FC<MachineInspectorProps> = ({
  machine,
  derived,
  onRemove,
  onClose,
  onExplainCause
}) => {
  const healthPercent = Math.max(0, Math.min(100, machine.health * 100));

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      backgroundColor: 'var(--surface-elevated)',
      padding: '12px',
      borderRadius: 'var(--radius-md)',
      border: '1px solid var(--border-subtle)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span className="material-symbols-outlined" style={{ color: 'var(--primary-bright)', fontSize: '18px' }}>
            precision_manufacturing
          </span>
          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
            {machine.type} [{machine.x}, {machine.y}]
          </span>
        </div>
        <button
          onClick={onClose}
          style={{ color: 'var(--text-muted)', fontSize: '16px' }}
        >
          ✕
        </button>
      </div>

      {/* Operational Status Banner */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 8px',
        borderRadius: 'var(--radius-xs)',
        backgroundColor: machine.isOperating ? 'rgba(46, 160, 67, 0.15)' : 'var(--error-container)',
        border: `1px solid ${machine.isOperating ? 'var(--success)' : 'var(--error-bright)'}`
      }}>
        <span style={{
          fontSize: '11px',
          fontWeight: 700,
          color: machine.isOperating ? 'var(--success)' : 'var(--error-bright)'
        }}>
          {machine.isOperating ? 'ONLINE • GENERATING' : 'OFFLINE'}
        </span>
        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-primary)' }} className="tabular-nums">
          {derived.powerGenerated.toFixed(1)} kW
        </span>
      </div>

      {/* Shutdown reason if offline */}
      {!machine.isOperating && machine.shutdownReason && (
        <div style={{ fontSize: '10px', color: 'var(--error-bright)', backgroundColor: 'rgba(0,0,0,0.3)', padding: '4px 6px', borderRadius: 'var(--radius-xs)' }}>
          Reason: {machine.shutdownReason}
        </div>
      )}

      {/* Health & Degradation Gauge (Section 18) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)' }} className="tabular-nums">
          <span>Machine Health & Wear:</span>
          <span style={{ color: healthPercent > 50 ? 'var(--tertiary)' : healthPercent > 20 ? 'var(--warning-bright)' : 'var(--error-bright)', fontWeight: 600 }}>
            {healthPercent.toFixed(1)}%
          </span>
        </div>
        <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--surface-container-lowest)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
          <div style={{
            width: `${healthPercent}%`,
            height: '100%',
            backgroundColor: healthPercent > 50 ? 'var(--tertiary)' : healthPercent > 20 ? 'var(--warning-bright)' : 'var(--error-bright)',
            transition: 'width 0.3s ease'
          }} />
        </div>
        <div style={{ fontSize: '9px', color: 'var(--text-subtle)' }} className="tabular-nums">
          Age: {machine.ageTicks} ticks / Lifespan: {machine.lifespanTicks} ticks
        </div>
      </div>

      {/* Specs & Performance Breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '11px' }} className="tabular-nums">
        <div style={{ background: 'var(--surface-container-lowest)', padding: '4px 6px', borderRadius: 'var(--radius-xs)' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '9px' }}>Rated Capacity</div>
          <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{machine.capacity} kW</div>
        </div>
        <div style={{ background: 'var(--surface-container-lowest)', padding: '4px 6px', borderRadius: 'var(--radius-xs)' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '9px' }}>Efficiency</div>
          <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{(machine.efficiency * 100).toFixed(0)}%</div>
        </div>
        <div style={{ background: 'var(--surface-container-lowest)', padding: '4px 6px', borderRadius: 'var(--radius-xs)' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '9px' }}>Line Losses</div>
          <div style={{ color: 'var(--warning-bright)', fontWeight: 600 }}>{derived.transmissionLoss.toFixed(1)} kW</div>
        </div>
        <div style={{ background: 'var(--surface-container-lowest)', padding: '4px 6px', borderRadius: 'var(--radius-xs)' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '9px' }}>Delivered to Zone</div>
          <div style={{ color: 'var(--tertiary)', fontWeight: 600 }}>{derived.powerDelivered.toFixed(1)} kW</div>
        </div>
      </div>

      {/* Action Buttons: Scrap / Replace / Explain */}
      <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
        {onExplainCause && (
          <button
            onClick={onExplainCause}
            style={{
              flex: 1,
              padding: '6px 10px',
              backgroundColor: 'var(--surface-container-high)',
              color: 'var(--primary-bright)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '11px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              border: '1px solid var(--border-subtle)'
            }}
            title="Inspect physical cause-and-effect DAG (Section 17 & 31)"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>account_tree</span>
            <span>Why This Output?</span>
          </button>
        )}
        <button
          onClick={onRemove}
          style={{
            flex: 1,
            padding: '6px 10px',
            backgroundColor: 'var(--surface-container-high)',
            color: 'var(--error-bright)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '11px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
            border: '1px solid var(--border-subtle)'
          }}
          title="Decommission machine and recover 50% scrap value"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>delete</span>
          <span>Decommission</span>
        </button>
      </div>
    </div>
  );
};
