import React from 'react';
import type { LevelId } from '../../levels/LevelConfig.ts';
import { LEVEL_DEFINITIONS } from '../../levels/LevelDefinitions.ts';
import { LevelProgress } from '../../levels/LevelProgress.ts';

interface LevelCampaignModalProps {
  currentLevelId: LevelId;
  onSelectLevel: (levelId: LevelId) => void;
  onClose: () => void;
}

export const LevelCampaignModal: React.FC<LevelCampaignModalProps> = ({
  currentLevelId,
  onSelectLevel,
  onClose
}) => {
  const allStatus = LevelProgress.getAllStatus();

  // 10 nodes organized as requested: [01]-[05] on row 1, [10]-[06] on row 2
  const row1: LevelId[] = [1, 2, 3, 4, 5];
  const row2: LevelId[] = [10, 9, 8, 7, 6];

  const renderLevelCard = (lvlId: LevelId) => {
    const config = LEVEL_DEFINITIONS[lvlId];
    const status = allStatus[lvlId] || {
      levelId: lvlId,
      unlocked: lvlId === 1,
      completed: false,
      bestDeliveredKW: 0,
      bestProfit: 0,
      stars: 0,
    };

    const isCurrent = currentLevelId === lvlId;
    const isUnlocked = status.unlocked;
    const isCompleted = status.completed;

    return (
      <div
        key={lvlId}
        onClick={() => {
          if (isUnlocked) {
            onSelectLevel(lvlId);
          }
        }}
        style={{
          width: '145px',
          minHeight: '160px',
          backgroundColor: isCurrent
            ? 'rgba(56, 139, 253, 0.12)'
            : isUnlocked
            ? 'var(--surface-container-lowest)'
            : 'rgba(15, 18, 24, 0.6)',
          border: isCurrent
            ? '2px solid var(--primary-bright)'
            : isCompleted
            ? '1px solid rgba(63, 185, 80, 0.5)'
            : isUnlocked
            ? '1px solid var(--border-subtle)'
            : '1px dashed rgba(255, 255, 255, 0.08)',
          borderRadius: 'var(--radius-lg)',
          padding: '12px 10px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          cursor: isUnlocked ? 'pointer' : 'not-allowed',
          opacity: isUnlocked ? 1 : 0.45,
          position: 'relative',
          boxShadow: isCurrent ? '0 0 16px rgba(56, 139, 253, 0.3)' : 'none',
          transition: 'all 0.2s ease',
          userSelect: 'none'
        }}
      >
        {/* Level Number & Status Badge */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{
            fontSize: '11px',
            fontWeight: 800,
            color: isCompleted ? '#3fb950' : isUnlocked ? 'var(--primary-bright)' : 'var(--text-muted)'
          }}>
            LVL {lvlId.toString().padStart(2, '0')}
          </span>

          {isCompleted ? (
            <div style={{ display: 'flex', gap: '1px' }}>
              {[1, 2, 3].map(s => (
                <span
                  key={s}
                  className="material-symbols-outlined"
                  style={{
                    fontSize: '13px',
                    color: s <= status.stars ? 'var(--warning-bright)' : 'var(--text-muted)'
                  }}
                >
                  star
                </span>
              ))}
            </div>
          ) : !isUnlocked ? (
            <span className="material-symbols-outlined" style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
              lock
            </span>
          ) : (
            <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--cyan-bright)' }}>READY</span>
          )}
        </div>

        {/* Title & Target */}
        <div style={{ marginTop: '8px', marginBottom: '8px' }}>
          <div style={{
            fontSize: '12px',
            fontWeight: 700,
            color: isUnlocked ? 'var(--text-primary)' : 'var(--text-muted)',
            lineHeight: '1.2'
          }}>
            {config.name}
          </div>
          <div style={{
            fontSize: '9.5px',
            color: 'var(--text-secondary)',
            marginTop: '3px',
            lineHeight: '1.2'
          }}>
            {config.briefing.newMechanics[0]}
          </div>
        </div>

        {/* Target Power Badge */}
        <div style={{
          fontSize: '9.5px',
          fontWeight: 600,
          color: isUnlocked ? 'var(--text-muted)' : 'var(--text-muted)',
          backgroundColor: 'var(--surface-container-highest)',
          padding: '2px 6px',
          borderRadius: '4px',
          textAlign: 'center'
        }}>
          Target: {config.objective.targetPowerKW} kW
        </div>
      </div>
    );
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(5, 7, 10, 0.88)',
      backdropFilter: 'blur(16px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 120,
      padding: '24px'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '920px',
        backgroundColor: 'var(--surface-elevated)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-xl)',
        boxShadow: 'var(--modal-shadow)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{
          backgroundColor: 'var(--surface-container-highest)',
          padding: '16px 24px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div>
            <div style={{ fontSize: '10.5px', fontWeight: 800, color: 'var(--primary-bright)', letterSpacing: '0.12em' }}>
              TERRAFORGE CAMPAIGN DISPATCH
            </div>
            <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', margin: '2px 0 0 0' }}>
              Grid Energy Ecosystem Progression
            </h2>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={() => {
                LevelProgress.unlockAll();
                window.location.reload();
              }}
              style={{
                fontSize: '11px',
                padding: '4px 8px',
                borderRadius: '4px',
                color: 'var(--text-muted)',
                border: '1px dashed var(--border-subtle)'
              }}
              title="Unlock All Levels (Evaluation Mode)"
            >
              Unlock All
            </button>

            <button
              onClick={onClose}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: 'var(--radius-sm)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-secondary)'
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>close</span>
            </button>
          </div>
        </div>

        {/* Body: Visual Circuit Progression */}
        <div style={{
          padding: '36px 32px',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
          alignItems: 'center'
        }}>
          {/* Row 1: Levels 1 -> 5 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {row1.map((id, index) => (
              <React.Fragment key={id}>
                {renderLevelCard(id)}
                {index < row1.length - 1 && (
                  <div style={{
                    width: '24px',
                    height: '2px',
                    backgroundColor: allStatus[id + 1]?.unlocked ? 'var(--primary-bright)' : 'var(--border-subtle)'
                  }} />
                )}
              </React.Fragment>
            ))}
          </div>

          {/* Vertical Connector between Level 5 and Level 6 */}
          <div style={{
            width: '100%',
            maxWidth: '780px',
            display: 'flex',
            justifyContent: 'flex-end',
            paddingRight: '60px'
          }}>
            <div style={{
              width: '2px',
              height: '32px',
              backgroundColor: allStatus[6]?.unlocked ? 'var(--primary-bright)' : 'var(--border-subtle)'
            }} />
          </div>

          {/* Row 2: Levels 10 <- 6 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {row2.map((id, index) => (
              <React.Fragment key={id}>
                {renderLevelCard(id)}
                {index < row2.length - 1 && (
                  <div style={{
                    width: '24px',
                    height: '2px',
                    backgroundColor: allStatus[id]?.unlocked ? 'var(--primary-bright)' : 'var(--border-subtle)'
                  }} />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Footer info */}
        <div style={{
          backgroundColor: 'var(--surface-container-highest)',
          padding: '12px 24px',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '11px',
          color: 'var(--text-muted)'
        }}>
          <span>Levels unlock sequentially upon achieving the generation target and holding stability.</span>
          <span>Authoritative Source: Section 21 Curriculum</span>
        </div>
      </div>
    </div>
  );
};
