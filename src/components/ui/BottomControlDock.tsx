import React from 'react';
import type { MachineType, OverlayType } from '../../sim/types.ts';

export type InteractionMode = 'simulate' | 'build' | 'inspect';

export type SelectedBuildTool =
  | { kind: 'machine'; type: MachineType }
  | { kind: 'overlay'; type: OverlayType }
  | null;

interface BottomControlDockProps {
  mode: InteractionMode;
  setMode: (mode: InteractionMode) => void;
  selectedTool: SelectedBuildTool;
  setSelectedTool: (tool: SelectedBuildTool) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onStepTick: () => void;
  speed: number;
  setSpeed: (speed: number) => void;
  onPerturbWeather: () => void;
  onReset: () => void;
  unlockedMachines?: MachineType[];
  unlockedOverlays?: OverlayType[];
}

export const BottomControlDock: React.FC<BottomControlDockProps> = ({
  mode,
  setMode,
  selectedTool,
  setSelectedTool,
  isPlaying,
  onTogglePlay,
  onStepTick,
  speed,
  setSpeed,
  onPerturbWeather,
  onReset,
  unlockedMachines,
  unlockedOverlays
}) => {
  return (
    <nav aria-label="Simulation Controls" style={{
      position: 'fixed',
      bottom: '16px',
      left: '50%',
      transform: 'translateX(-50%)',
      backgroundColor: 'var(--glass-bg)',
      backdropFilter: 'blur(16px)',
      padding: '6px 16px',
      borderRadius: 'var(--radius-xl)',
      border: '1px solid var(--border-subtle)',
      boxShadow: 'var(--modal-shadow)',
      display: 'flex',
      alignItems: 'center',
      gap: '16px',
      zIndex: 40,
      userSelect: 'none'
    }}>
      {/* Mode Segmented Switcher */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        backgroundColor: 'var(--surface-container-lowest)',
        padding: '3px',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-subtle)'
      }}>
        <button
          onClick={() => { setMode('simulate'); setSelectedTool(null); }}
          style={{
            padding: '5px 12px',
            borderRadius: 'var(--radius-sm)',
            fontSize: '11px',
            fontWeight: 600,
            backgroundColor: mode === 'simulate' ? 'var(--primary-container)' : 'transparent',
            color: mode === 'simulate' ? 'var(--on-primary-container)' : 'var(--text-muted)'
          }}
        >
          Simulate
        </button>
        <button
          onClick={() => { setMode('build'); if (!selectedTool) setSelectedTool({ kind: 'machine', type: 'LandSolar' }); }}
          style={{
            padding: '5px 12px',
            borderRadius: 'var(--radius-sm)',
            fontSize: '11px',
            fontWeight: 600,
            backgroundColor: mode === 'build' ? 'var(--primary-container)' : 'transparent',
            color: mode === 'build' ? 'var(--on-primary-container)' : 'var(--text-muted)'
          }}
        >
          Build
        </button>
        <button
          onClick={() => { setMode('inspect'); setSelectedTool(null); }}
          style={{
            padding: '5px 12px',
            borderRadius: 'var(--radius-sm)',
            fontSize: '11px',
            fontWeight: 600,
            backgroundColor: mode === 'inspect' ? 'var(--primary-container)' : 'transparent',
            color: mode === 'inspect' ? 'var(--on-primary-container)' : 'var(--text-muted)'
          }}
        >
          Inspect
        </button>
      </div>

      <div style={{ width: '1px', height: '24px', backgroundColor: 'var(--border-subtle)' }} />

      {/* Mode Contextual Tools */}
      {mode === 'build' ? (
        /* Build Palette */
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {/* Solar */}
          {(!unlockedMachines || unlockedMachines.includes('LandSolar')) && (
            <button
              onClick={() => setSelectedTool({ kind: 'machine', type: 'LandSolar' })}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '5px 10px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '11px',
                fontWeight: 600,
                backgroundColor: selectedTool?.kind === 'machine' && selectedTool.type === 'LandSolar' ? 'var(--surface-container-highest)' : 'var(--surface-container)',
                color: selectedTool?.kind === 'machine' && selectedTool.type === 'LandSolar' ? 'var(--warning-bright)' : 'var(--text-primary)',
                border: selectedTool?.kind === 'machine' && selectedTool.type === 'LandSolar' ? '1px solid var(--border-active)' : '1px solid transparent'
              }}
              title="Land Solar ($5,000) • Requires stability >= 0.70"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>solar_power</span>
              <span>Solar</span>
            </button>
          )}

          {/* Floating Solar */}
          {(!unlockedMachines || unlockedMachines.includes('FloatSolar')) && (
            <button
              onClick={() => setSelectedTool({ kind: 'machine', type: 'FloatSolar' })}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '5px 10px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '11px',
                fontWeight: 600,
                backgroundColor: selectedTool?.kind === 'machine' && selectedTool.type === 'FloatSolar' ? 'var(--surface-container-highest)' : 'var(--surface-container)',
                color: selectedTool?.kind === 'machine' && selectedTool.type === 'FloatSolar' ? 'var(--cyan-bright)' : 'var(--text-primary)',
                border: selectedTool?.kind === 'machine' && selectedTool.type === 'FloatSolar' ? '1px solid var(--border-active)' : '1px solid transparent'
              }}
              title="Floating Solar ($7,500) • Requires water velocity <= 1.5 m/s"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>water</span>
              <span>Float Solar</span>
            </button>
          )}

          {/* Wind Turbine */}
          {(!unlockedMachines || unlockedMachines.includes('WindTurbine')) && (
            <button
              onClick={() => setSelectedTool({ kind: 'machine', type: 'WindTurbine' })}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '5px 10px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '11px',
                fontWeight: 600,
                backgroundColor: selectedTool?.kind === 'machine' && selectedTool.type === 'WindTurbine' ? 'var(--surface-container-highest)' : 'var(--surface-container)',
                color: selectedTool?.kind === 'machine' && selectedTool.type === 'WindTurbine' ? 'var(--primary-bright)' : 'var(--text-primary)',
                border: selectedTool?.kind === 'machine' && selectedTool.type === 'WindTurbine' ? '1px solid var(--border-active)' : '1px solid transparent'
              }}
              title="Wind Turbine ($12,000) • Requires stability >= 0.70 & wake clearance >= 2.0"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>mode_fan</span>
              <span>Turbine</span>
            </button>
          )}

          {/* Hydro Station */}
          {(!unlockedMachines || unlockedMachines.includes('HydroTurbine')) && (
            <button
              onClick={() => setSelectedTool({ kind: 'machine', type: 'HydroTurbine' })}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '5px 10px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '11px',
                fontWeight: 600,
                backgroundColor: selectedTool?.kind === 'machine' && selectedTool.type === 'HydroTurbine' ? 'var(--surface-container-highest)' : 'var(--surface-container)',
                color: selectedTool?.kind === 'machine' && selectedTool.type === 'HydroTurbine' ? 'var(--tertiary)' : 'var(--text-primary)',
                border: selectedTool?.kind === 'machine' && selectedTool.type === 'HydroTurbine' ? '1px solid var(--border-active)' : '1px solid transparent'
              }}
              title="Hydro Turbine ($20,000) • Requires flowRate Q >= 5.0 m³/s"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>waves</span>
              <span>Hydro</span>
            </button>
          )}

          {/* Cable Conduit */}
          {(!unlockedMachines || unlockedMachines.includes('Cable')) && (
            <button
              onClick={() => setSelectedTool({ kind: 'machine', type: 'Cable' })}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '5px 10px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '11px',
                fontWeight: 600,
                backgroundColor: selectedTool?.kind === 'machine' && selectedTool.type === 'Cable' ? 'var(--surface-container-highest)' : 'var(--surface-container)',
                color: selectedTool?.kind === 'machine' && selectedTool.type === 'Cable' ? 'var(--cyan-bright)' : 'var(--text-muted)',
                border: selectedTool?.kind === 'machine' && selectedTool.type === 'Cable' ? '1px solid var(--border-active)' : '1px solid transparent'
              }}
              title="Cable Conduit ($100/cell) • Drag or click path to connect generators to Demand Zones"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>cable</span>
              <span>Conduit</span>
            </button>
          )}

          {/* Soil Stabilizer (Gravel Overlay) */}
          {(!unlockedOverlays || unlockedOverlays.includes('Gravel')) && (
            <button
              onClick={() => setSelectedTool({ kind: 'overlay', type: 'Gravel' })}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '5px 10px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '11px',
                fontWeight: 600,
                backgroundColor: selectedTool?.kind === 'overlay' && selectedTool.type === 'Gravel' ? 'var(--surface-container-highest)' : 'var(--surface-container)',
                color: selectedTool?.kind === 'overlay' && selectedTool.type === 'Gravel' ? '#8bfb91' : 'var(--text-muted)',
                border: selectedTool?.kind === 'overlay' && selectedTool.type === 'Gravel' ? '1px solid var(--border-active)' : '1px solid transparent'
              }}
              title="Gravel Overlay ($500) • Increases effective stability by +0.25 (RULE-OVERLAY-001)"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>architecture</span>
              <span>Stabilizer</span>
            </button>
          )}
        </div>
      ) : (
        /* Playback Controls & Mode Guidance */
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {mode === 'inspect' && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'rgba(56, 189, 248, 0.12)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              color: 'var(--primary-bright)',
              fontSize: '11px',
              fontWeight: 600
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>search</span>
              <span>Inspect Mode: Click any cell or machine to analyze</span>
            </div>
          )}
          {/* Play / Pause */}
          <button
            onClick={onTogglePlay}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: isPlaying ? 'var(--primary-container)' : 'var(--surface-elevated)',
              color: isPlaying ? 'var(--on-primary-container)' : 'var(--text-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid var(--border-subtle)'
            }}
            title={isPlaying ? 'Pause Simulation' : 'Run Simulation'}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
              {isPlaying ? 'pause' : 'play_arrow'}
            </span>
          </button>

          {/* Step 1 Tick */}
          <button
            onClick={onStepTick}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--surface-elevated)',
              color: 'var(--text-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid var(--border-subtle)'
            }}
            title="Step 1 Tick (1 Hour)"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>skip_next</span>
          </button>

          {/* Speed Multiplier Pill */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: 'var(--surface-container-lowest)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-subtle)',
            padding: '2px'
          }} className="tabular-nums">
            {[1, 2, 5, 10].map(s => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                style={{
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-xs)',
                  fontSize: '11px',
                  fontWeight: 600,
                  backgroundColor: speed === s ? 'var(--primary-container)' : 'transparent',
                  color: speed === s ? 'var(--on-primary-container)' : 'var(--text-muted)'
                }}
              >
                {s}x
              </button>
            ))}
          </div>

          {/* Replay / Reset */}
          <button
            onClick={onReset}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--surface-elevated)',
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid var(--border-subtle)'
            }}
            title="Reset to Initial Walkthrough State"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>replay</span>
          </button>
        </div>
      )}

      <div style={{ width: '1px', height: '24px', backgroundColor: 'var(--border-subtle)' }} />

      {/* Quick Action: Weather Perturbation */}
      <button
        onClick={onPerturbWeather}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 12px',
          borderRadius: 'var(--radius-sm)',
          backgroundColor: 'var(--primary-container)',
          color: 'var(--on-primary-container)',
          fontSize: '11px',
          fontWeight: 600,
          boxShadow: 'var(--glass-shadow)',
          transition: 'all 0.15s ease'
        }}
        title="Inject sudden thermal shift (+4.2°C) or storm event to test causal ecosystem propagation"
      >
        <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>cyclone</span>
        <span>Perturb Weather</span>
      </button>
    </nav>
  );
};
