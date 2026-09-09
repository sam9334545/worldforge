import React from 'react';
import type { LevelConfig, LevelObjectiveEvaluation } from '../../levels/LevelConfig.ts';

interface LevelCompleteModalProps {
  level: LevelConfig;
  evaluation: LevelObjectiveEvaluation;
  starsEarned: number;
  onNextLevel: () => void;
  onReplayLevel: () => void;
  onOpenCampaign: () => void;
  onKeepViewing: () => void;
}

export const LevelCompleteModal: React.FC<LevelCompleteModalProps> = ({
  level,
  evaluation,
  starsEarned,
  onNextLevel,
  onReplayLevel,
  onOpenCampaign,
  onKeepViewing
}) => {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(5, 7, 10, 0.88)',
      backdropFilter: 'blur(16px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 110,
      padding: '20px'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '520px',
        backgroundColor: 'var(--surface-elevated)',
        border: '1px solid rgba(63, 185, 80, 0.4)',
        borderRadius: 'var(--radius-xl)',
        boxShadow: '0 0 40px rgba(63, 185, 80, 0.25)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        textAlign: 'center'
      }}>
        {/* Victory Header */}
        <div style={{
          backgroundColor: 'rgba(46, 160, 67, 0.15)',
          padding: '24px 20px 16px 20px',
          borderBottom: '1px solid rgba(63, 185, 80, 0.2)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px'
        }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            backgroundColor: 'rgba(46, 160, 67, 0.25)',
            border: '2px solid #3fb950',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#3fb950',
            boxShadow: '0 0 20px rgba(63, 185, 80, 0.4)'
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: '32px' }}>emoji_events</span>
          </div>

          <div style={{ fontSize: '11px', fontWeight: 800, color: '#3fb950', letterSpacing: '0.12em' }}>
            SECTOR STABILIZED • MISSION ACCOMPLISHED
          </div>

          <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
            {level.name}
          </h2>

          {/* Stars */}
          <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
            {[1, 2, 3].map(s => (
              <span
                key={s}
                className="material-symbols-outlined"
                style={{
                  fontSize: '24px',
                  color: s <= starsEarned ? 'var(--warning-bright)' : 'var(--text-muted)'
                }}
              >
                star
              </span>
            ))}
          </div>
        </div>

        {/* Evaluation Metrics */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '12px'
          }}>
            <div style={{
              backgroundColor: 'var(--surface-container-lowest)',
              padding: '12px 8px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)'
            }}>
              <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Power Delivered</div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--cyan-bright)', marginTop: '4px' }} className="tabular-nums">
                {evaluation.currentPowerKW} kW
              </div>
            </div>

            <div style={{
              backgroundColor: 'var(--surface-container-lowest)',
              padding: '12px 8px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)'
            }}>
              <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Daily Profit (24h)</div>
              <div
                style={{
                  fontSize: '16px',
                  fontWeight: 800,
                  color: evaluation.currentProfit >= 0 ? '#3fb950' : '#f85149',
                  marginTop: '4px'
                }}
                className="tabular-nums"
              >
                {evaluation.currentProfit >= 0 ? `$${evaluation.currentProfit}` : `-$${Math.abs(evaluation.currentProfit)}`}
              </div>
            </div>

            <div style={{
              backgroundColor: 'var(--surface-container-lowest)',
              padding: '12px 8px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)'
            }}>
              <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Reliability</div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--primary-bright)', marginTop: '4px' }} className="tabular-nums">
                {Math.round(evaluation.currentReliability * 100)}%
              </div>
            </div>
          </div>

          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
            You have satisfied all sector requirements and advanced the TerraForge energy grid network.
          </p>
        </div>

        {/* Modal Buttons */}
        <div style={{
          backgroundColor: 'var(--surface-container-highest)',
          padding: '16px 20px',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          flexWrap: 'wrap'
        }}>
          <button
            onClick={onOpenCampaign}
            style={{
              padding: '8px 12px',
              fontSize: '11.5px',
              fontWeight: 600,
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>map</span>
            <span>Campaign</span>
          </button>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={onKeepViewing}
              style={{
                padding: '8px 12px',
                fontSize: '11.5px',
                fontWeight: 600,
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'rgba(56, 189, 248, 0.15)',
                border: '1px solid rgba(56, 189, 248, 0.4)',
                color: 'var(--cyan-bright)',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                cursor: 'pointer'
              }}
              title="Keep viewing and inspecting current grid without resetting"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>visibility</span>
              <span>Keep Viewing</span>
            </button>

            <button
              onClick={onReplayLevel}
              style={{
                padding: '8px 12px',
                fontSize: '11.5px',
                fontWeight: 600,
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--surface-elevated)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                cursor: 'pointer'
              }}
              title="Restart Level with clean initial grid and reset funds"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>restart_alt</span>
              <span>Restart</span>
            </button>

            {level.id < 10 && (
              <button
                onClick={onNextLevel}
                style={{
                  padding: '9px 16px',
                  fontSize: '12px',
                  fontWeight: 700,
                  backgroundColor: '#3fb950',
                  color: '#05070a',
                  borderRadius: 'var(--radius-md)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 0 16px rgba(63, 185, 80, 0.4)',
                  cursor: 'pointer'
                }}
              >
                <span>NEXT LEVEL</span>
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_forward</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
