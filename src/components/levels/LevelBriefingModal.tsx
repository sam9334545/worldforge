import React from 'react';
import type { LevelConfig } from '../../levels/LevelConfig.ts';

interface LevelBriefingModalProps {
  level: LevelConfig;
  onStartSimulation: () => void;
  onOpenCampaign: () => void;
}

export const LevelBriefingModal: React.FC<LevelBriefingModalProps> = ({
  level,
  onStartSimulation,
  onOpenCampaign
}) => {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(5, 7, 10, 0.85)',
      backdropFilter: 'blur(12px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
      padding: '20px'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '540px',
        backgroundColor: 'var(--surface-elevated)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-xl)',
        boxShadow: 'var(--modal-shadow)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Header Ribbon */}
        <div style={{
          backgroundColor: 'var(--surface-container-highest)',
          padding: '16px 24px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div>
            <div style={{
              fontSize: '11px',
              fontWeight: 800,
              color: 'var(--primary-bright)',
              letterSpacing: '0.1em',
              textTransform: 'uppercase'
            }}>
              CAMPAIGN SECTOR {level.id.toString().padStart(2, '0')}
            </div>
            <h2 style={{
              fontSize: '20px',
              fontWeight: 800,
              color: 'var(--text-primary)',
              margin: '2px 0 0 0'
            }}>
              {level.name}
            </h2>
          </div>
          <span style={{
            fontSize: '11px',
            fontWeight: 600,
            padding: '4px 10px',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: 'var(--primary-container)',
            color: 'var(--on-primary-container)'
          }}>
            {level.subtitle}
          </span>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Narrative Story */}
          <p style={{
            fontSize: '13.5px',
            lineHeight: '1.6',
            color: 'var(--text-secondary)',
            margin: 0
          }}>
            {level.briefing.story}
          </p>

          {/* New Mechanics Card */}
          <div style={{
            backgroundColor: 'var(--surface-container-lowest)',
            padding: '14px 16px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)'
          }}>
            <div style={{
              fontSize: '11px',
              fontWeight: 700,
              color: 'var(--cyan-bright)',
              marginBottom: '10px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>auto_awesome</span>
              <span>NEW SYSTEMS INTRODUCED</span>
            </div>
            <ul style={{
              margin: 0,
              paddingLeft: '18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              fontSize: '12px',
              color: 'var(--text-primary)'
            }}>
              {level.briefing.newMechanics.map((m, idx) => (
                <li key={idx} style={{ lineHeight: '1.4' }}>{m}</li>
              ))}
            </ul>
          </div>

          {/* Primary Objective Card */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '12px 16px',
            backgroundColor: 'rgba(56, 139, 253, 0.08)',
            border: '1px solid rgba(56, 139, 253, 0.25)',
            borderRadius: 'var(--radius-md)'
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: '24px', color: 'var(--primary-bright)' }}>
              flag
            </span>
            <div>
              <div style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--primary-bright)', letterSpacing: '0.05em' }}>
                PRIMARY DIRECTIVE
              </div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginTop: '2px' }}>
                {level.objective.description}
              </div>
            </div>
          </div>

          {/* Tactical Hint */}
          <div style={{
            fontSize: '11.5px',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '6px'
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: '15px', color: 'var(--warning-bright)' }}>
              lightbulb
            </span>
            <span><em>Tactical Hint:</em> {level.briefing.hint}</span>
          </div>
        </div>

        {/* Footer Actions */}
        <div style={{
          backgroundColor: 'var(--surface-container-highest)',
          padding: '16px 24px',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <button
            onClick={onOpenCampaign}
            style={{
              padding: '8px 16px',
              fontSize: '12px',
              fontWeight: 600,
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-secondary)'
            }}
          >
            Campaign Map
          </button>
          <button
            onClick={onStartSimulation}
            style={{
              padding: '10px 24px',
              fontSize: '13px',
              fontWeight: 700,
              backgroundColor: 'var(--primary-bright)',
              color: '#05070a',
              borderRadius: 'var(--radius-md)',
              boxShadow: '0 0 16px rgba(56, 139, 253, 0.4)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>START SIMULATION</span>
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>play_arrow</span>
          </button>
        </div>
      </div>
    </div>
  );
};
