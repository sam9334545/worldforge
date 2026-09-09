import React, { useState } from 'react';
import type { WorldState } from '../../sim/contracts/WorldState.ts';
import type { SimulationEvent } from '../../sim/contracts/SimulationEvent.ts';
import { audioSystem } from '../../utils/audioSystem.ts';

interface TopHUDProps {
  worldState: WorldState;
  activeEvent: SimulationEvent | null;
  onSelectSeed: (seed: number) => void;
  isDeterministic: boolean;
  onToggleAIComparison?: () => void;
  isAIComparisonOpen?: boolean;
  onOpenCampaign?: () => void;
  onOpenRuleBook?: () => void;
  onDismissActiveEvent?: () => void;
  activeLevelNumber?: number;
  isLevelCompleted?: boolean;
  onRestartLevel?: () => void;
  onNextLevel?: () => void;
  currentLevelId?: number;
}

export const TopHUD: React.FC<TopHUDProps> = ({
  worldState,
  activeEvent,
  onSelectSeed,
  isDeterministic,
  onToggleAIComparison,
  isAIComparisonOpen = false,
  onOpenCampaign,
  onOpenRuleBook,
  onDismissActiveEvent,
  activeLevelNumber,
  isLevelCompleted = false,
  onRestartLevel,
  onNextLevel,
  currentLevelId = 1
}) => {
  const { time, globalEnv, seed } = worldState;
  const [soundMuted, setSoundMuted] = useState<boolean>(() => audioSystem.getIsMuted());

  const handleToggleSound = () => {
    const next = audioSystem.toggleMute();
    setSoundMuted(next);
  };

  // Compute total hydrology flow across water cells
  let totalFlowQ = 0;
  for (const row of worldState.grid) {
    for (const cell of row) {
      if (cell.dynamic.waterBodyType === 'RIVER') {
        totalFlowQ = Math.max(totalFlowQ, cell.dynamic.flowRateQ);
      }
    }
  }

  const currentCoins = worldState.player?.coins ?? worldState.economy.cash ?? 0;
  const rollingProfit = worldState.economy.rollingDailyProfit ?? 0;

  return (
    <header style={{
      position: 'fixed',
      top: '12px',
      left: '16px',
      right: '16px',
      height: '44px',
      padding: '0 16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '12px',
      backgroundColor: 'rgba(10, 14, 22, 0.82)',
      backdropFilter: 'blur(16px)',
      border: isLevelCompleted ? '1px solid rgba(63, 185, 80, 0.5)' : '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-lg)',
      boxShadow: isLevelCompleted ? '0 8px 32px rgba(46, 160, 67, 0.25)' : '0 8px 32px rgba(0, 0, 0, 0.45)',
      zIndex: 50,
      userSelect: 'none'
    }}>
      {/* AI System A (Telemetry) - Clickable to open AI benchmark card */}
      <div
        onClick={onToggleAIComparison}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          minWidth: '220px',
          cursor: 'pointer',
          padding: '4px 8px',
          borderRadius: 'var(--radius-sm)',
          backgroundColor: isAIComparisonOpen ? 'var(--surface-container-high)' : 'transparent',
          border: isAIComparisonOpen ? '1px solid var(--primary-bright)' : '1px solid transparent',
          transition: 'all 0.15s ease'
        }}
        title="Click to inspect AI Prediction vs Ground Truth benchmarks"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: 'var(--primary-bright)',
            boxShadow: '0 0 8px var(--primary-bright)'
          }} />
          <span style={{
            fontSize: '10px',
            fontWeight: 700,
            color: 'var(--primary-bright)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em'
          }}>
            System A
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>Neural Interface</span>
          <div style={{ display: 'flex', gap: '6px', fontSize: '10px', color: 'var(--text-muted)' }} className="tabular-nums">
            <span>Obs: 100%</span>
            <span>•</span>
            <span style={{ color: 'var(--tertiary)' }}>{isAIComparisonOpen ? 'Comparing' : 'Ready'}</span>
          </div>
        </div>
      </div>

      {/* Center Live Simulation Telemetry & Player Wallet */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px'
      }}>
        {/* Live Bank Funds / Wallet Pill */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          backgroundColor: 'rgba(15, 23, 42, 0.85)',
          padding: '4px 12px',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid rgba(255, 215, 0, 0.35)',
          boxShadow: '0 0 12px rgba(255, 215, 0, 0.12)'
        }} className="tabular-nums" title="Player Bank Account Balance & Daily Operating Net Rate">
          <span className="material-symbols-outlined" style={{ fontSize: '15px', color: '#ffd700' }}>
            account_balance_wallet
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: 800, color: '#ffffff', letterSpacing: '0.02em' }}>
              ${currentCoins.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span style={{
              fontSize: '10px',
              fontWeight: 700,
              color: rollingProfit >= 0 ? '#3fb950' : '#f85149'
            }}>
              {rollingProfit >= 0 ? '+' : '-'}${Math.abs(rollingProfit).toFixed(2)}/day
            </span>
          </div>
        </div>

        {isLevelCompleted ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: 'rgba(46, 160, 67, 0.2)',
            border: '1px solid rgba(63, 185, 80, 0.5)',
            padding: '3px 12px',
            borderRadius: 'var(--radius-lg)'
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: '15px', color: '#3fb950' }}>check_circle</span>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#3fb950', letterSpacing: '0.05em' }}>
              SECTOR {currentLevelId} STABILIZED
            </span>

            {onRestartLevel && (
              <button
                onClick={onRestartLevel}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '2px 8px',
                  backgroundColor: 'var(--surface-elevated)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-xs)',
                  fontSize: '10.5px',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  marginLeft: '4px'
                }}
                title="Reset board to initial level state"
              >
                <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>restart_alt</span>
                <span>Reset</span>
              </button>
            )}

            {currentLevelId < 10 && onNextLevel && (
              <button
                onClick={onNextLevel}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '2px 10px',
                  backgroundColor: '#3fb950',
                  color: '#05070a',
                  border: 'none',
                  borderRadius: 'var(--radius-xs)',
                  fontSize: '10.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 0 10px rgba(63, 185, 80, 0.4)'
                }}
                title="Proceed to next sector"
              >
                <span>Next Sector</span>
                <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>arrow_forward</span>
              </button>
            )}
          </div>
        ) : (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            backgroundColor: 'var(--surface-container-lowest)',
            padding: '4px 14px',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-subtle)',
            fontSize: '11px'
          }} className="tabular-nums">
            <span style={{ color: 'var(--primary-bright)', fontWeight: 700 }}>TICK {time.tick}</span>
            <span style={{ color: 'var(--border-subtle)' }}>•</span>
            <span style={{ color: 'var(--text-primary)' }}>Day {time.day}</span>
            <span style={{ color: 'var(--border-subtle)' }}>•</span>
            <span style={{ color: 'var(--secondary)', fontWeight: 600 }}>{time.season}</span>
            <span style={{ color: 'var(--border-subtle)' }}>•</span>
            <span style={{ color: 'var(--text-primary)' }}>
              Wind: {globalEnv.globalWindSpeed.toFixed(1)} m/s ({globalEnv.globalWindDirection}°)
            </span>
            <span style={{ color: 'var(--border-subtle)' }}>•</span>
            <span style={{ color: 'var(--warning-bright)' }}>{globalEnv.baseSolarIrradiance.toFixed(0)} W/m²</span>
            <span style={{ color: 'var(--border-subtle)' }}>•</span>
            <span style={{ color: 'var(--cyan-bright)' }}>Hydro {totalFlowQ.toFixed(1)} m³/s</span>
          </div>
        )}

        {/* Active Perturbation / Event Pill */}
        {activeEvent && !isLevelCompleted && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: activeEvent.severity === 'critical' ? 'var(--error-container)' : 'var(--warning-container)',
            padding: '2px 8px 2px 10px',
            borderRadius: 'var(--radius-full)',
            fontSize: '10px',
            color: activeEvent.severity === 'critical' ? 'var(--error-bright)' : 'var(--warning-bright)',
            fontWeight: 600,
            animation: 'pulse 2s infinite'
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>warning</span>
            <span>EVENT: {activeEvent.title}</span>
            {onDismissActiveEvent && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDismissActiveEvent();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '14px',
                  height: '14px',
                  padding: 0,
                  backgroundColor: 'rgba(0, 0, 0, 0.25)',
                  border: 'none',
                  borderRadius: '50%',
                  color: 'currentColor',
                  cursor: 'pointer',
                  marginLeft: '2px'
                }}
                title="Dismiss event notice"
              >
                <span className="material-symbols-outlined" style={{ fontSize: '10px' }}>close</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* AI System B & Seed Controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '12px', minWidth: '220px' }}>
        <div
          onClick={onToggleAIComparison}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            cursor: 'pointer',
            padding: '4px 8px',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: isAIComparisonOpen ? 'var(--surface-container-high)' : 'transparent',
            border: isAIComparisonOpen ? '1px solid var(--secondary)' : '1px solid transparent',
            transition: 'all 0.15s ease'
          }}
          title="Click to inspect AI Prediction vs Ground Truth benchmarks"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{
              fontSize: '10px',
              fontWeight: 700,
              color: 'var(--secondary)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em'
            }}>
              BDH Model
            </span>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: 'var(--secondary)',
              boxShadow: '0 0 8px var(--secondary)'
            }} />
          </div>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>World-Model Eval</span>
        </div>

        {/* Rule Book Button */}
        {onOpenRuleBook && (
          <button
            onClick={onOpenRuleBook}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 9px',
              backgroundColor: 'rgba(255, 215, 0, 0.15)',
              color: '#ffd700',
              borderRadius: 'var(--radius-xs)',
              fontSize: '11px',
              fontWeight: 700,
              border: '1px solid rgba(255, 215, 0, 0.4)',
              boxShadow: '0 0 8px rgba(255, 215, 0, 0.2)',
              cursor: 'pointer'
            }}
            title="Open Game Manual & Placement Rule Book"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>menu_book</span>
            <span>Rule Book</span>
          </button>
        )}

        {/* Campaign Map Button */}
        {onOpenCampaign && (
          <button
            onClick={onOpenCampaign}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '4px 10px',
              backgroundColor: 'rgba(56, 139, 253, 0.2)',
              color: 'var(--primary-bright)',
              borderRadius: 'var(--radius-xs)',
              fontSize: '11px',
              fontWeight: 700,
              border: '1px solid rgba(56, 139, 253, 0.5)',
              boxShadow: '0 0 10px rgba(56, 139, 253, 0.25)',
              cursor: 'pointer'
            }}
            title="Open Energy Ecosystem Campaign Map (Levels 1–10)"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>map</span>
            <span>{activeLevelNumber ? `Level ${activeLevelNumber}` : 'Campaign'}</span>
          </button>
        )}

        {/* Seed Selector buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            onClick={() => onSelectSeed(42)}
            style={{
              padding: '3px 8px',
              backgroundColor: seed === 42 ? 'var(--primary-container)' : 'var(--surface-elevated)',
              color: seed === 42 ? 'var(--on-primary-container)' : 'var(--text-primary)',
              borderRadius: 'var(--radius-xs)',
              fontSize: '10px',
              fontWeight: 700,
              border: seed === 42 ? '1px solid var(--border-active)' : '1px solid var(--border-subtle)'
            }}
            title="Load Section 39 Walkthrough Map (Seed 42)"
          >
            Seed 42
          </button>
          <button
            onClick={() => onSelectSeed(101)}
            style={{
              padding: '3px 8px',
              backgroundColor: seed === 101 ? 'var(--primary-container)' : 'var(--surface-elevated)',
              color: seed === 101 ? 'var(--on-primary-container)' : 'var(--text-primary)',
              borderRadius: 'var(--radius-xs)',
              fontSize: '10px',
              fontWeight: 700,
              border: seed === 101 ? '1px solid var(--border-active)' : '1px solid var(--border-subtle)'
            }}
            title="Load Level 1 Campaign Map (Seed 101)"
          >
            Seed 101
          </button>
        </div>

        {/* Audio Mute/Unmute Toggle (Section 11) */}
        <button
          onClick={handleToggleSound}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '3px 8px',
            backgroundColor: soundMuted ? 'var(--surface-elevated)' : 'rgba(56, 139, 253, 0.25)',
            color: soundMuted ? 'var(--text-muted)' : 'var(--primary-bright)',
            borderRadius: 'var(--radius-xs)',
            fontSize: '10px',
            fontWeight: 600,
            border: `1px solid ${soundMuted ? 'var(--border-subtle)' : 'rgba(56, 139, 253, 0.5)'}`,
            cursor: 'pointer'
          }}
          title={soundMuted ? 'Sound: OFF (Click to Enable Ambient Audio)' : 'Sound: ON (Click to Mute Audio)'}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
            {soundMuted ? 'volume_off' : 'volume_up'}
          </span>
          <span>{soundMuted ? 'Sound: OFF' : 'Sound: ON'}</span>
        </button>

        {/* Determinism Status */}
        <div style={{
          padding: '3px 7px',
          borderRadius: 'var(--radius-xs)',
          backgroundColor: isDeterministic ? 'var(--success-glow)' : 'var(--error-container)',
          color: isDeterministic ? 'var(--success)' : 'var(--error-bright)',
          fontSize: '10px',
          fontWeight: 700,
          letterSpacing: '0.04em'
        }}>
          {isDeterministic ? 'DETERMINISTIC' : 'DIVERGENCE'}
        </div>
      </div>
    </header>
  );
};
