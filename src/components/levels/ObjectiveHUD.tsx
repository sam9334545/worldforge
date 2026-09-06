import React from 'react';
import type { LevelConfig, LevelObjectiveEvaluation } from '../../levels/LevelConfig.ts';

interface ObjectiveHUDProps {
  level: LevelConfig;
  evaluation: LevelObjectiveEvaluation;
  onOpenCampaign: () => void;
  onRestartLevel: () => void;
}

export const ObjectiveHUD: React.FC<ObjectiveHUDProps> = ({
  level,
  evaluation,
  onOpenCampaign,
  onRestartLevel
}) => {
  const isTargetMet = evaluation.currentPowerKW >= evaluation.targetPowerKW;
  const isSustaining = evaluation.sustainedTicks > 0;

  return (
    <aside aria-label="Active Level Objectives" style={{
      position: 'absolute',
      top: '56px',
      left: '16px',
      width: '280px',
      backgroundColor: 'var(--glass-bg)',
      backdropFilter: 'blur(16px)',
      borderRadius: 'var(--radius-lg)',
      border: '1px solid var(--border-subtle)',
      boxShadow: 'var(--glass-shadow)',
      padding: '12px 14px',
      zIndex: 25,
      display: 'flex',
      flexDirection: 'column',
      gap: '10px'
    }}>
      {/* Header with Level Badge and Campaign Map button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            fontSize: '10px',
            fontWeight: 800,
            padding: '2px 6px',
            borderRadius: '4px',
            backgroundColor: 'var(--primary-container)',
            color: 'var(--on-primary-container)',
            letterSpacing: '0.05em'
          }}>
            LEVEL {level.id.toString().padStart(2, '0')}
          </span>
          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
            {level.name}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            onClick={onRestartLevel}
            style={{
              width: '24px',
              height: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '4px',
              color: 'var(--text-muted)'
            }}
            title="Restart Level"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>restart_alt</span>
          </button>
          <button
            onClick={onOpenCampaign}
            style={{
              width: '24px',
              height: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '4px',
              color: 'var(--primary-bright)'
            }}
            title="Campaign Map"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>map</span>
          </button>
        </div>
      </div>

      {/* Target Progress Bar */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
          <span style={{ color: 'var(--text-secondary)' }}>Power Delivered</span>
          <span className="tabular-nums" style={{
            fontWeight: 700,
            color: isTargetMet ? 'var(--cyan-bright)' : 'var(--warning-bright)'
          }}>
            {evaluation.currentPowerKW} / {evaluation.targetPowerKW} kW
          </span>
        </div>
        <div style={{
          width: '100%',
          height: '6px',
          backgroundColor: 'var(--surface-container-highest)',
          borderRadius: '3px',
          overflow: 'hidden'
        }}>
          <div style={{
            width: `${Math.min(100, (evaluation.currentPowerKW / evaluation.targetPowerKW) * 100)}%`,
            height: '100%',
            backgroundColor: isTargetMet ? '#3fb950' : 'var(--primary-bright)',
            transition: 'width 0.3s ease'
          }} />
        </div>
      </div>

      {/* Checklist items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '10.5px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: isTargetMet ? '#3fb950' : 'var(--text-muted)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
            {isTargetMet ? 'check_circle' : 'radio_button_unchecked'}
          </span>
          <span>Target Generation reached ({evaluation.targetPowerKW} kW)</span>
        </div>

        {level.requireGridConnection && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: isTargetMet ? '#3fb950' : 'var(--cyan-bright)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>cable</span>
            <span>Conduit Grid Connection Enforced</span>
          </div>
        )}

        {evaluation.targetProfit && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            color: evaluation.currentProfit >= evaluation.targetProfit ? '#3fb950' : 'var(--text-muted)'
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
              {evaluation.currentProfit >= evaluation.targetProfit ? 'check_circle' : 'radio_button_unchecked'}
            </span>
            <span>Operating Profit: ${evaluation.currentProfit} / ${evaluation.targetProfit}</span>
          </div>
        )}

        {isSustaining && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            color: 'var(--cyan-bright)',
            fontWeight: 600,
            marginTop: '2px'
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>hourglass_top</span>
            <span>Holding Stability: {evaluation.sustainedTicks} / {evaluation.requiredSustainedTicks} Ticks</span>
          </div>
        )}
      </div>
    </aside>
  );
};
