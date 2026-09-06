import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { WorldGenerator } from './sim/generator.ts';
import { SimulationEngine } from './sim/engine.ts';
import type { CellState } from './sim/types.ts';
import type { WorldState } from './sim/contracts/WorldState.ts';
import type { SimulationEvent } from './sim/contracts/SimulationEvent.ts';
import { WorldCanvas } from './components/viewport/WorldCanvas.tsx';
import { XRayControls, type XRayLayer } from './components/viewport/XRayControls.tsx';
import { TopHUD } from './components/ui/TopHUD.tsx';
import { BottomControlDock, InteractionMode, SelectedBuildTool } from './components/ui/BottomControlDock.tsx';
import { EventFeed } from './components/ui/EventFeed.tsx';
import { RightContextPanel } from './components/inspection/RightContextPanel.tsx';
import { CausalInspector } from './components/inspection/CausalInspector.tsx';
import { AIComparisonCard } from './components/inspection/AIComparisonCard.tsx';
import { CausalTracer, type CausalTrace } from './sim/causalTracer.ts';
import { runPhase1Verification } from './sim/verification/phase1Check.ts';

// Level System Imports (Section 21)
import type { LevelId } from './levels/LevelConfig.ts';
import { LEVEL_DEFINITIONS } from './levels/LevelDefinitions.ts';
import { LevelEngine } from './levels/LevelEngine.ts';
import { LevelObjectives } from './levels/LevelObjectives.ts';
import { LevelProgress } from './levels/LevelProgress.ts';
import { ObjectiveHUD } from './components/levels/ObjectiveHUD.tsx';
import { LevelBriefingModal } from './components/levels/LevelBriefingModal.tsx';
import { LevelCompleteModal } from './components/levels/LevelCompleteModal.tsx';
import { LevelCampaignModal } from './components/levels/LevelCampaignModal.tsx';

import './styles/index.css';

export function App() {
  // Master simulation engine instance ref
  const engineRef = useRef<SimulationEngine | null>(null);

  // Campaign Level State (Section 21)
  const [currentLevelId, setCurrentLevelId] = useState<LevelId>(1);
  const activeLevel = useMemo(() => LEVEL_DEFINITIONS[currentLevelId], [currentLevelId]);
  const [sustainedTicks, setSustainedTicks] = useState<number>(0);
  const [showCampaignModal, setShowCampaignModal] = useState<boolean>(false);
  const [showBriefingModal, setShowBriefingModal] = useState<boolean>(false);
  const [showVictoryModal, setShowVictoryModal] = useState<boolean>(false);
  const [starsEarned, setStarsEarned] = useState<number>(1);

  // Initial world state configured to Seed 42 by default (Section 39 Walkthrough world)
  const [worldState, setWorldState] = useState<WorldState>(() => {
    const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const requestedSeed = params?.get('seed') ? parseInt(params.get('seed')!, 10) : 42;

    if (requestedSeed === 42) {
      const initial = WorldGenerator.generateWorld({ seed: 42, isWalkthroughPreset: true });
      engineRef.current = new SimulationEngine(initial);
      return initial;
    }

    const matched = Object.values(LEVEL_DEFINITIONS).find(l => l.seed === requestedSeed);
    if (matched) {
      const { worldState: initial, engine } = LevelEngine.buildWorldForLevel(matched);
      engineRef.current = engine;
      return initial;
    }

    const initial = WorldGenerator.generateWorld({ seed: requestedSeed, isWalkthroughPreset: false });
    engineRef.current = new SimulationEngine(initial);
    return initial;
  });

  // UI state
  const [selectedCell, setSelectedCell] = useState<CellState | null>(null);
  const [hoveredCell, setHoveredCell] = useState<{ x: number; y: number } | null>(null);
  const [mode, setMode] = useState<InteractionMode>('simulate');
  const [selectedTool, setSelectedTool] = useState<SelectedBuildTool>(null);

  // Playback state
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [speed, setSpeed] = useState<number>(1);
  const [activeEvent, setActiveEvent] = useState<SimulationEvent | null>(null);

  // Advanced Analysis state
  const [activeXRayLayer, setActiveXRayLayer] = useState<XRayLayer>('none');
  const [showAIComparison, setShowAIComparison] = useState<boolean>(false);
  const [activeCausalTrace, setActiveCausalTrace] = useState<CausalTrace | null>(null);

  // Camera focus & Construction pulse states
  const [focusCoord, setFocusCoord] = useState<{ x: number; y: number } | null>(null);
  const [constructionPulse, setConstructionPulse] = useState<{ x: number; y: number; time: number } | null>(null);

  // Verification check
  const verification = useMemo(() => runPhase1Verification(), []);

  // Level selection handler
  const handleSelectLevel = useCallback((levelId: LevelId) => {
    const cfg = LEVEL_DEFINITIONS[levelId];
    const { worldState: newWorld, engine } = LevelEngine.buildWorldForLevel(cfg);
    engineRef.current = engine;
    setCurrentLevelId(levelId);
    setWorldState(newWorld);
    setSustainedTicks(0);
    setSelectedCell(null);
    setHoveredCell(null);
    setActiveEvent(null);
    setIsPlaying(false);
    setActiveXRayLayer('none');
    setSelectedTool(null);
    setShowCampaignModal(false);
    setShowVictoryModal(false);
    setShowBriefingModal(true);
  }, []);

  // Level restart handler
  const handleRestartLevel = useCallback(() => {
    handleSelectLevel(currentLevelId);
  }, [currentLevelId, handleSelectLevel]);

  // Next level handler
  const handleNextLevel = useCallback(() => {
    if (currentLevelId < 10) {
      handleSelectLevel((currentLevelId + 1) as LevelId);
    }
  }, [currentLevelId, handleSelectLevel]);

  // Step simulation tick
  const handleStepTick = useCallback(() => {
    if (!engineRef.current) return;
    const result = engineRef.current.step();
    setWorldState({ ...result.state });

    // Check for recent critical events
    if (result.events.length > 0) {
      setActiveEvent(result.events[0]);
    }

    // Refresh selected cell if open
    if (selectedCell) {
      setSelectedCell(result.state.grid[selectedCell.y][selectedCell.x]);
    }

    // Evaluate active level objectives
    setSustainedTicks(prevTicks => {
      const evalRes = LevelObjectives.evaluate(activeLevel, result.state, prevTicks);
      if (evalRes.isCompleted && !showVictoryModal) {
        const outcome = LevelProgress.recordCompletion(
          currentLevelId,
          evalRes.currentPowerKW,
          evalRes.currentProfit
        );
        setStarsEarned(outcome.starsEarned);
        setShowVictoryModal(true);
        setIsPlaying(false);
      }
      return evalRes.sustainedTicks;
    });
  }, [selectedCell, activeLevel, currentLevelId, showVictoryModal]);

  // Automated playback loop
  useEffect(() => {
    if (!isPlaying) return;
    const intervalMs = Math.max(100, Math.floor(1000 / speed));
    const timer = setInterval(() => {
      handleStepTick();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [isPlaying, speed, handleStepTick]);

  // Real-time level objective evaluation
  const levelEvaluation = useMemo(() => {
    return LevelObjectives.evaluate(activeLevel, worldState, sustainedTicks);
  }, [activeLevel, worldState, sustainedTicks]);

  // Ensure the URL reflects seed 42 whenever the website opens without a seed query
  useEffect(() => {
    if (typeof window !== 'undefined' && window.history) {
      const params = new URLSearchParams(window.location.search);
      if (!params.has('seed')) {
        const url = new URL(window.location.href);
        url.searchParams.set('seed', '42');
        window.history.replaceState(null, '', url.toString());
      }
    }
  }, []);

  // Handle seed regeneration
  const handleSelectSeed = (seed: number) => {
    if (typeof window !== 'undefined' && window.history) {
      const url = new URL(window.location.href);
      url.searchParams.set('seed', seed.toString());
      window.history.replaceState(null, '', url.toString());
    }

    if (seed === 42) {
      const next = WorldGenerator.generateWorld({ seed: 42, isWalkthroughPreset: true });
      engineRef.current = new SimulationEngine(next);
      setWorldState(next);
    } else {
      const matched = Object.values(LEVEL_DEFINITIONS).find(l => l.seed === seed);
      if (matched) {
        handleSelectLevel(matched.id);
        return;
      }
      const next = WorldGenerator.generateWorld({ seed, isWalkthroughPreset: false });
      engineRef.current = new SimulationEngine(next);
      setWorldState(next);
    }
    setSelectedCell(null);
    setHoveredCell(null);
    setActiveEvent(null);
    setIsPlaying(false);
  };

  // Reset to current level start or seed 42 start
  const handleReset = () => {
    if (worldState.seed === 42) {
      handleSelectSeed(42);
    } else {
      handleRestartLevel();
    }
  };

  // Build placement handler
  const handleBuild = (cell: CellState) => {
    if (!engineRef.current || !selectedTool) return;

    if (selectedTool.kind === 'machine') {
      const stepResult = engineRef.current.step({
        type: 'PLACE',
        machineType: selectedTool.type,
        x: cell.x,
        y: cell.y,
        orientation: 180,
      });

      setWorldState({ ...stepResult.state });
      if (mode !== 'build') {
        setSelectedCell(stepResult.state.grid[cell.y][cell.x]);
      }

      if (stepResult.validationResult && !stepResult.validationResult.valid) {
        setActiveEvent({
          id: `evt-reject-${Date.now()}`,
          tick: stepResult.state.time.tick,
          type: 'PLACEMENT_REJECTED',
          severity: 'warning',
          title: `Placement Rejected: ${selectedTool.type}`,
          description: stepResult.validationResult.reason || 'Placement violates specification rules.',
          location: { x: cell.x, y: cell.y },
        });
      } else {
        // Trigger visual construction shockwave
        setConstructionPulse({ x: cell.x, y: cell.y, time: performance.now() });
      }
    } else if (selectedTool.kind === 'overlay') {
      const stepResult = engineRef.current.step({
        type: 'REINFORCE',
        overlayType: selectedTool.type,
        x: cell.x,
        y: cell.y,
      });

      setWorldState({ ...stepResult.state });
      if (mode !== 'build') {
        setSelectedCell(stepResult.state.grid[cell.y][cell.x]);
      }
      setConstructionPulse({ x: cell.x, y: cell.y, time: performance.now() });
    }
  };

  // Cable Route building handler (Section 2.2)
  const handleBuildCablePath = useCallback((path: Array<{ x: number; y: number }>) => {
    if (!engineRef.current) return;
    for (const pt of path) {
      engineRef.current.step({
        type: 'PLACE',
        machineType: 'Cable',
        x: pt.x,
        y: pt.y,
      });
    }
    const updated = engineRef.current.getSimulationState();
    setWorldState({ ...updated });
    if (path.length > 0) {
      const last = path[path.length - 1];
      setConstructionPulse({ x: last.x, y: last.y, time: performance.now() });
    }
  }, []);

  // Machine Orientation / Yaw rotation handler (Level 3+ Wind, Level 4+ Solar)
  const handleRotateMachine = useCallback((cell: CellState, deltaAngle = 45) => {
    if (!engineRef.current || !cell.machine) return;
    const currentAngle = cell.machine.orientation ?? 180;
    const newAngle = ((currentAngle + deltaAngle) % 360 + 360) % 360;
    const result = engineRef.current.step({
      type: 'SET_ORIENTATION',
      x: cell.x,
      y: cell.y,
      orientation: newAngle,
    });
    setWorldState({ ...result.state });
    if (selectedCell && selectedCell.x === cell.x && selectedCell.y === cell.y) {
      setSelectedCell(result.state.grid[cell.y][cell.x]);
    }
  }, [selectedCell]);

  // Keyboard shortcut listener: 'R' rotates hovered/selected machine
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') {
        const target = hoveredCell || (selectedCell ? { x: selectedCell.x, y: selectedCell.y } : null);
        if (target && worldState.grid[target.y]?.[target.x]?.machine) {
          handleRotateMachine(worldState.grid[target.y][target.x]);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hoveredCell, selectedCell, worldState.grid, handleRotateMachine]);

  // Decommission machine handler
  const handleRemoveMachine = (cell: CellState) => {
    if (!engineRef.current) return;
    const result = engineRef.current.step({
      type: 'REMOVE',
      x: cell.x,
      y: cell.y,
    });
    setWorldState({ ...result.state });
    setSelectedCell(result.state.grid[cell.y][cell.x]);
  };

  // Weather Perturbation Trigger ("Perturb Weather")
  const handlePerturbWeather = () => {
    if (!engineRef.current) return;

    const perturbEvent: SimulationEvent = {
      id: `evt-perturb-${Date.now()}`,
      tick: worldState.time.tick,
      type: 'THERMAL_ANOMALY',
      severity: 'warning',
      title: 'Sudden Thermal Anomaly (+4.2°C)',
      description: 'Isotherm elevates rapidly. Alpine snowmelt runoff surge imminent.',
      location: { x: Math.min(worldState.width - 1, 6), y: Math.min(worldState.height - 1, 4) },
    };

    worldState.globalEnv.ambientTemperature += 4.2;
    worldState.events.unshift(perturbEvent);
    setActiveEvent(perturbEvent);
    setFocusCoord(perturbEvent.location!);

    const result = engineRef.current.step();
    setWorldState({ ...result.state });
    setActiveCausalTrace(CausalTracer.traceThermalSurgeToHydro(result.state));
  };

  // Focus event on world map
  const handleSelectEvent = (event: SimulationEvent) => {
    setActiveEvent(event);
    if (event.location && worldState.grid[event.location.y]?.[event.location.x]) {
      const cell = worldState.grid[event.location.y][event.location.x];
      setSelectedCell(cell);
      setFocusCoord({ x: event.location.x, y: event.location.y });
    }
    if (event.type === 'THERMAL_ANOMALY') {
      setActiveCausalTrace(CausalTracer.traceThermalSurgeToHydro(worldState));
    }
  };

  // Explain root cause handler
  const handleExplainCause = (type: 'thermal' | 'wind') => {
    if (type === 'thermal') {
      setActiveCausalTrace(CausalTracer.traceThermalSurgeToHydro(worldState));
    } else {
      setActiveCausalTrace(CausalTracer.traceWindShadowLoss());
    }
  };

  // X-Ray Layer Selection handler
  const handleSelectXRayLayer = (layer: XRayLayer) => {
    setActiveXRayLayer(layer);
    if (layer === 'ai') {
      setShowAIComparison(true);
    }
  };

  // Focus cell from causal trace step
  const handleFocusCausalCell = (pos: { x: number; y: number }) => {
    if (worldState.grid[pos.y]?.[pos.x]) {
      setSelectedCell(worldState.grid[pos.y][pos.x]);
      setFocusCoord({ x: pos.x, y: pos.y });
    }
  };

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      backgroundColor: 'var(--bg-abyss)',
      overflow: 'hidden',
      position: 'relative'
    }}>
      {/* 1. TOP HUD (Floating 44px Bar) */}
      <TopHUD
        worldState={worldState}
        activeEvent={activeEvent}
        onSelectSeed={handleSelectSeed}
        isDeterministic={verification.success}
        onToggleAIComparison={() => setShowAIComparison(s => !s)}
        isAIComparisonOpen={showAIComparison}
        onOpenCampaign={() => setShowCampaignModal(true)}
        activeLevelNumber={currentLevelId}
      />

      {/* 2. EVENT FEED (Top-Right Floating RimWorld-style Cards) */}
      <EventFeed
        events={worldState.events}
        onSelectEvent={handleSelectEvent}
      />

      {/* 3. MAIN VIEWPORT (Occupies 100% full screen under floating HUD) */}
      <main style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden'
      }}>
        {/* Dynamic Objective Progress HUD */}
        <ObjectiveHUD
          level={activeLevel}
          evaluation={levelEvaluation}
          onOpenCampaign={() => setShowCampaignModal(true)}
          onRestartLevel={handleRestartLevel}
        />

        {/* Multi-spectral X-Ray Layer Controls */}
        <XRayControls
          activeLayer={activeXRayLayer}
          onSelectLayer={handleSelectXRayLayer}
          unlockedLayers={activeLevel.unlockedXRayLayers}
        />

        {/* AI Prediction vs Ground Truth Benchmark Card */}
        {showAIComparison && (
          <AIComparisonCard onClose={() => setShowAIComparison(false)} />
        )}

        <div style={{ width: '100%', height: '100%', position: 'relative' }}>
          <WorldCanvas
            worldState={worldState}
            selectedCell={selectedCell ? { x: selectedCell.x, y: selectedCell.y } : null}
            onSelectCell={setSelectedCell}
            hoveredCell={hoveredCell}
            setHoveredCell={setHoveredCell}
            buildTool={mode === 'build' ? selectedTool : null}
            onBuild={handleBuild}
            onBuildCablePath={handleBuildCablePath}
            activeXRayLayer={activeXRayLayer}
            focusCoord={focusCoord}
            constructionPulse={constructionPulse}
            levelId={currentLevelId}
            mode={mode}
          />
        </div>

        {/* Causal Explainability DAG ("Why Did This Happen?") */}
        {activeCausalTrace && (
          <CausalInspector
            trace={activeCausalTrace}
            onFocusCell={handleFocusCausalCell}
            onClose={() => setActiveCausalTrace(null)}
          />
        )}

        {/* 4. RIGHT CONTEXT PANEL (Floating Slide-Over Glass Drawer) */}
        {selectedCell && mode !== 'build' && (
          <RightContextPanel
            selectedCell={selectedCell}
            worldState={worldState}
            onClose={() => setSelectedCell(null)}
            onRemoveMachine={handleRemoveMachine}
            onExplainCause={handleExplainCause}
            onRotateMachine={handleRotateMachine}
            onSelectXRayLayer={setActiveXRayLayer}
          />
        )}
      </main>

      {/* 5. BOTTOM CONTROL DOCK */}
      <BottomControlDock
        mode={mode}
        setMode={setMode}
        selectedTool={selectedTool}
        setSelectedTool={setSelectedTool}
        isPlaying={isPlaying}
        onTogglePlay={() => setIsPlaying(p => !p)}
        onStepTick={handleStepTick}
        speed={speed}
        setSpeed={setSpeed}
        onPerturbWeather={handlePerturbWeather}
        onReset={handleReset}
        unlockedMachines={activeLevel.unlockedMachines}
        unlockedOverlays={activeLevel.unlockedOverlays}
      />

      {/* 6. MODALS */}
      {/* Level Briefing Cinematic Modal */}
      {showBriefingModal && (
        <LevelBriefingModal
          level={activeLevel}
          onStartSimulation={() => {
            setShowBriefingModal(false);
            setIsPlaying(true);
          }}
          onOpenCampaign={() => {
            setShowBriefingModal(false);
            setShowCampaignModal(true);
          }}
        />
      )}

      {/* Level Victory & Rewards Modal */}
      {showVictoryModal && (
        <LevelCompleteModal
          level={activeLevel}
          evaluation={levelEvaluation}
          starsEarned={starsEarned}
          onNextLevel={handleNextLevel}
          onReplayLevel={handleRestartLevel}
          onOpenCampaign={() => {
            setShowVictoryModal(false);
            setShowCampaignModal(true);
          }}
        />
      )}

      {/* Visual Campaign Map Modal */}
      {showCampaignModal && (
        <LevelCampaignModal
          currentLevelId={currentLevelId}
          onSelectLevel={handleSelectLevel}
          onClose={() => setShowCampaignModal(false)}
        />
      )}

      {/* Footer System Telemetry */}
      <footer style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: '24px',
        backgroundColor: 'var(--surface-container-lowest)',
        borderTop: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 var(--hud-padding)',
        fontSize: '10px',
        color: 'var(--text-muted)',
        zIndex: 20
      }} className="tabular-nums">
        <span>TerraForge AI Simulation Kernel v1.0 • Campaign Sector {currentLevelId.toString().padStart(2, '0')}: {activeLevel.name}</span>
        <span>Deterministic Seed: #{worldState.seed} • State Hash: #{worldState.stateHash} • Update Loop: 21-Step Non-Circular</span>
      </footer>
    </div>
  );
}

export default App;
