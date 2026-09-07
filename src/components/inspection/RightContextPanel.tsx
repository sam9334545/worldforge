import React, { useState, useEffect } from 'react';
import type { CellState } from '../../sim/types.ts';
import type { WorldState } from '../../sim/contracts/WorldState.ts';
import type { XRayLayer } from '../viewport/XRayControls.tsx';
import { CellInspector } from './CellInspector.tsx';
import { MachineInspector } from './MachineInspector.tsx';

interface RightContextPanelProps {
  selectedCell: CellState | null;
  worldState: WorldState;
  onClose: () => void;
  onRemoveMachine: (cell: CellState) => void;
  onExplainCause?: (type: 'thermal' | 'wind') => void;
  onRotateMachine?: (cell: CellState) => void;
  onSelectXRayLayer?: (layer: XRayLayer) => void;
}

export const RightContextPanel: React.FC<RightContextPanelProps> = ({
  selectedCell,
  worldState,
  onClose,
  onRemoveMachine,
  onExplainCause,
  onRotateMachine,
  onSelectXRayLayer
}) => {
  const [activeTab, setActiveTab] = useState<'cell' | 'machine' | 'economy'>(
    selectedCell?.machine ? 'machine' : 'cell'
  );

  // Automatically switch tab when selecting a machine or empty cell
  useEffect(() => {
    if (selectedCell?.machine) {
      setActiveTab('machine');
    } else {
      setActiveTab('cell');
    }
  }, [selectedCell?.x, selectedCell?.y, selectedCell?.machine?.type]);

  if (!selectedCell) return null;

  const hasMachine = selectedCell.machine !== null;

  return (
    <aside style={{
      position: 'fixed',
      top: '64px',
      right: '16px',
      bottom: '80px',
      width: '360px',
      backgroundColor: 'rgba(10, 14, 22, 0.88)',
      backdropFilter: 'blur(20px)',
      borderRadius: 'var(--radius-xl)',
      border: '1px solid var(--border-subtle)',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 35,
      boxShadow: '0 16px 48px rgba(0, 0, 0, 0.6)',
      overflow: 'hidden',
      userSelect: 'none',
      animation: 'slideInRight 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
    }}>
      {/* Tab Navigation */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        borderBottom: '1px solid var(--border-subtle)',
        backgroundColor: 'var(--surface-container-lowest)'
      }}>
        <button
          onClick={() => setActiveTab('cell')}
          style={{
            flex: 1,
            padding: '10px',
            fontSize: '11px',
            fontWeight: 600,
            borderBottom: activeTab === 'cell' ? '2px solid var(--primary-bright)' : '2px solid transparent',
            color: activeTab === 'cell' ? 'var(--primary-bright)' : 'var(--text-muted)',
            backgroundColor: activeTab === 'cell' ? 'var(--surface-base)' : 'transparent'
          }}
        >
          Cell Stack
        </button>

        {hasMachine && (
          <button
            onClick={() => setActiveTab('machine')}
            style={{
              flex: 1,
              padding: '10px',
              fontSize: '11px',
              fontWeight: 600,
              borderBottom: activeTab === 'machine' ? '2px solid var(--primary-bright)' : '2px solid transparent',
              color: activeTab === 'machine' ? 'var(--primary-bright)' : 'var(--text-muted)',
              backgroundColor: activeTab === 'machine' ? 'var(--surface-base)' : 'transparent'
            }}
          >
            Machine
          </button>
        )}

        <button
          onClick={() => setActiveTab('economy')}
          style={{
            flex: 1,
            padding: '10px',
            fontSize: '11px',
            fontWeight: 600,
            borderBottom: activeTab === 'economy' ? '2px solid var(--primary-bright)' : '2px solid transparent',
            color: activeTab === 'economy' ? 'var(--primary-bright)' : 'var(--text-muted)',
            backgroundColor: activeTab === 'economy' ? 'var(--surface-base)' : 'transparent'
          }}
        >
          Economy
        </button>

        <button
          onClick={onClose}
          style={{
            padding: '10px 14px',
            color: 'var(--text-muted)',
            fontSize: '16px'
          }}
        >
          ✕
        </button>
      </div>

      {/* Tab Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
        {activeTab === 'cell' && (
          <CellInspector cell={selectedCell} onClose={onClose} onSelectXRayLayer={onSelectXRayLayer} />
        )}

        {activeTab === 'machine' && selectedCell.machine && (
          <MachineInspector
            machine={selectedCell.machine}
            derived={selectedCell.derived}
            onRemove={() => onRemoveMachine(selectedCell)}
            onClose={onClose}
            onExplainCause={onExplainCause ? () => onExplainCause(selectedCell.machine?.type === 'WindTurbine' ? 'wind' : 'thermal') : undefined}
            onRotate={onRotateMachine ? () => onRotateMachine(selectedCell) : undefined}
            localWindDir={selectedCell.dynamic.windDirection}
          />
        )}

        {activeTab === 'economy' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{
              backgroundColor: 'var(--surface-elevated)',
              padding: '12px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)'
            }}>
              <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Financial Telemetry (Section 18)
              </span>
              <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }} className="tabular-nums">
                ${worldState.economy.cash.toFixed(2)}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--tertiary)', marginTop: '2px', display: 'flex', justifyContent: 'space-between' }} className="tabular-nums">
                <span>Net Worth: ${worldState.economy.netWorth.toFixed(2)}</span>
                <span style={{ color: (worldState.economy.rollingDailyProfit ?? 0) >= 0 ? '#3fb950' : '#f85149', fontWeight: 600 }}>
                  24h Rate: {(worldState.economy.rollingDailyProfit ?? 0) >= 0 ? `+$${(worldState.economy.rollingDailyProfit ?? 0).toFixed(2)}` : `-$${Math.abs(worldState.economy.rollingDailyProfit ?? 0).toFixed(2)}`}/day
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '12px', fontSize: '11px' }} className="tabular-nums">
                <div style={{ background: 'var(--surface-container-lowest)', padding: '6px 8px', borderRadius: 'var(--radius-xs)' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '9px' }}>Cumulative Revenue</div>
                  <div style={{ color: 'var(--tertiary)', fontWeight: 600 }}>${worldState.economy.cumulativeRevenue.toFixed(2)}</div>
                </div>
                <div style={{ background: 'var(--surface-container-lowest)', padding: '6px 8px', borderRadius: 'var(--radius-xs)' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '9px' }}>Cumulative Costs</div>
                  <div style={{ color: 'var(--error-bright)', fontWeight: 600 }}>${worldState.economy.cumulativeCost.toFixed(2)}</div>
                </div>
                <div style={{ background: 'var(--surface-container-lowest)', padding: '6px 8px', borderRadius: 'var(--radius-xs)' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '9px' }}>Generated kWh</div>
                  <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{worldState.economy.cumulativeGenerated.toFixed(1)} kWh</div>
                </div>
                <div style={{ background: 'var(--surface-container-lowest)', padding: '6px 8px', borderRadius: 'var(--radius-xs)' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '9px' }}>Delivered kWh</div>
                  <div style={{ color: 'var(--cyan-bright)', fontWeight: 600 }}>{worldState.economy.cumulativeDelivered.toFixed(1)} kWh</div>
                </div>
              </div>
            </div>

            {/* Demand Zone Card */}
            {worldState.demandZones[0] && (
              <div style={{
                backgroundColor: 'var(--surface-elevated)',
                padding: '12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Primary Demand Zone
                  </span>
                  <span style={{ fontSize: '10px', color: 'var(--primary-bright)', fontWeight: 700 }}>
                    Tier {worldState.demandZones[0].tier}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }} className="tabular-nums">
                  <span>Demanded: {worldState.demandZones[0].demandLevel} kW</span>
                  <span style={{ color: 'var(--tertiary)' }}>Delivered: {worldState.demandZones[0].deliveredEnergy} kW</span>
                </div>
                <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-muted)' }} className="tabular-nums">
                  Tariff: ${worldState.demandZones[0].pricePerUnit}/kWh • Reliability: {(worldState.economy.reliabilityRatio * 100).toFixed(1)}%
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
