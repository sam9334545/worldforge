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
import { RuleBookModal } from './components/ui/RuleBookModal.tsx';
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

import { audioSystem } from './utils/audioSystem.ts';

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
  const [isLevelCompleted, setIsLevelCompleted] = useState<boolean>(false);
  const [starsEarned, setStarsEarned] = useState<number>(1);

  // Rule Book modal state (requirement 2: auto-shows on reload / Level 1 start)
  const [showRuleBook, setShowRuleBook] = useState<boolean>(() => {
    try {
      return localStorage.getItem('worldforge_show_rulebook_v1') !== 'false';
    } catch {
      return true;
    }
  });

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

  // Level selection handler with previous structure restoration capability (requirement 3)
  const handleSelectLevel = useCallback((levelId: LevelId, restorePrevious = false) => {
    // Persist current level's structure snapshot
    if (worldState.grid && currentLevelId) {
      LevelProgress.saveLevelGridSnapshot(currentLevelId, worldState.grid, worldState.economy.cash);
    }

    const cfg = LEVEL_DEFINITIONS[levelId];
    const snap = restorePrevious ? LevelProgress.getLevelGridSnapshot(levelId) : null;
    const { worldState: newWorld, engine } = LevelEngine.buildWorldForLevel(cfg, snap);
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
    setIsLevelCompleted(false);
    setShowBriefingModal(true);
  }, [currentLevelId, worldState.grid, worldState.economy.cash]);

  // Level restart handler
  const handleRestartLevel = useCallback(() => {
    handleSelectLevel(currentLevelId, false);
  }, [currentLevelId, handleSelectLevel]);

  // Next level handler
  const handleNextLevel = useCallback(() => {
    if (currentLevelId < 10) {
      handleSelectLevel((currentLevelId + 1) as LevelId, false);
    }
  }, [currentLevelId, handleSelectLevel]);

  // Event dismissal handler (requirement 1: dismiss notification with cross button)
  const handleDismissEvent = useCallback((eventId: string) => {
    setWorldState(prev => ({
      ...prev,
      events: prev.events.filter(e => e.id !== eventId)
    }));
    if (activeEvent?.id === eventId) {
      setActiveEvent(null);
    }
  }, [activeEvent]);

  // Helper to clone world state for React state immutability and wallet reactivity
  const cloneState = (s: WorldState): WorldState => {
    const currentCoins = s.player?.coins ?? s.economy.cash;
    return {
      ...s,
      player: s.player ? { ...s.player, coins: currentCoins } : { coins: currentCoins, id: 1 },
      economy: {
        ...s.economy,
        cash: currentCoins,
        coins: currentCoins,
        tickProfitHistory: [...(s.economy.tickProfitHistory || [])],
      },
    };
  };

  // Step simulation tick
  const handleStepTick = useCallback(() => {
    if (!engineRef.current) return;
    const result = engineRef.current.step();
    setWorldState(cloneState(result.state));

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
      if (evalRes.isCompleted && !isLevelCompleted) {
        const outcome = LevelProgress.recordCompletion(
          currentLevelId,
          evalRes.currentPowerKW,
          evalRes.currentProfit
        );
        // Also save snapshot on winning
        LevelProgress.saveLevelGridSnapshot(currentLevelId, result.state.grid, result.state.economy.cash);
        setStarsEarned(outcome.starsEarned);
        setIsLevelCompleted(true);
        setShowVictoryModal(true);
        setIsPlaying(false);
        audioSystem.playVictorySound();
      }
      return evalRes.sustainedTicks;
    });
  }, [selectedCell, activeLevel, currentLevelId, isLevelCompleted]);

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
        handleSelectLevel(matched.id, false);
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

      if (mode !== 'build') {
        setSelectedCell(stepResult.state.grid[cell.y][cell.x]);
      }

      if (stepResult.validationResult && !stepResult.validationResult.valid) {
        const errorReason = stepResult.validationResult.errorReason || stepResult.validationResult.reason || 'Placement violates specification rules.';
        audioSystem.playErrorSound();
        const rejectEvent: SimulationEvent = {
          id: `evt-reject-${Date.now()}`,
          tick: stepResult.state.time.tick,
          type: 'PLACEMENT_REJECTED',
          severity: 'warning',
          title: `Cannot Place: ${errorReason}`,
          description: stepResult.validationResult.reason || errorReason,
          location: { x: cell.x, y: cell.y },
        };
        setWorldState(prev => ({
          ...cloneState(stepResult.state),
          events: [rejectEvent, ...prev.events.filter(e => e.id !== rejectEvent.id)],
        }));
        setActiveEvent(rejectEvent);
      } else {
        setWorldState(cloneState(stepResult.state));
        audioSystem.playPlacementSound(selectedTool.type);
        setConstructionPulse({ x: cell.x, y: cell.y, time: performance.now() });
        LevelProgress.saveLevelGridSnapshot(currentLevelId, stepResult.state.grid, stepResult.state.economy.cash);
      }
    } else if (selectedTool.kind === 'overlay') {
      const stepResult = engineRef.current.step({
        type: 'REINFORCE',
        overlayType: selectedTool.type,
        x: cell.x,
        y: cell.y,
      });

      if (mode !== 'build') {
        setSelectedCell(stepResult.state.grid[cell.y][cell.x]);
      }

      if (stepResult.validationResult && !stepResult.validationResult.valid) {
        const errorReason = stepResult.validationResult.errorReason || stepResult.validationResult.reason || 'Overlay violates rules.';
        audioSystem.playErrorSound();
        const rejectEvent: SimulationEvent = {
          id: `evt-reject-${Date.now()}`,
          tick: stepResult.state.time.tick,
          type: 'PLACEMENT_REJECTED',
          severity: 'warning',
          title: `Cannot Reinforce: ${errorReason}`,
          description: stepResult.validationResult.reason || errorReason,
          location: { x: cell.x, y: cell.y },
        };
        setWorldState(prev => ({
          ...cloneState(stepResult.state),
          events: [rejectEvent, ...prev.events.filter(e => e.id !== rejectEvent.id)],
        }));
        setActiveEvent(rejectEvent);
      } else {
        setWorldState(cloneState(stepResult.state));
        audioSystem.playOverlaySound();
        setConstructionPulse({ x: cell.x, y: cell.y, time: performance.now() });
        LevelProgress.saveLevelGridSnapshot(currentLevelId, stepResult.state.grid, stepResult.state.economy.cash);
      }
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
    audioSystem.playPlacementSound('Cable');
    const updated = engineRef.current.getSimulationState();
    setWorldState(cloneState(updated));
    LevelProgress.saveLevelGridSnapshot(currentLevelId, updated.grid, updated.economy.cash);
    if (path.length > 0) {
      const last = path[path.length - 1];
      setConstructionPulse({ x: last.x, y: last.y, time: performance.now() });
    }
  }, [currentLevelId]);

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
    setWorldState(cloneState(result.state));
    LevelProgress.saveLevelGridSnapshot(currentLevelId, result.state.grid, result.state.economy.cash);
    if (selectedCell && selectedCell.x === cell.x && selectedCell.y === cell.y) {
      setSelectedCell(result.state.grid[cell.y][cell.x]);
    }
  }, [selectedCell, currentLevelId]);

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
    audioSystem.playDemolishSound();
    setWorldState(cloneState(result.state));
    LevelProgress.saveLevelGridSnapshot(currentLevelId, result.state.grid, result.state.economy.cash);
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

    audioSystem.playThunderSound();
    const result = engineRef.current.step();
    setWorldState(cloneState(result.state));
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
        onOpenRuleBook={() => setShowRuleBook(true)}
        onDismissActiveEvent={() => setActiveEvent(null)}
        activeLevelNumber={currentLevelId}
        isLevelCompleted={isLevelCompleted}
        onRestartLevel={handleRestartLevel}
        onNextLevel={handleNextLevel}
        currentLevelId={currentLevelId}
      />

      {/* 2. EVENT FEED (Top-Right Floating Cards with Dismiss Button) */}
      <EventFeed
        events={worldState.events}
        onSelectEvent={handleSelectEvent}
        onDismissEvent={handleDismissEvent}
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
      {/* Rule Book & Operations Manual (Requirement 2) */}
      <RuleBookModal
        isOpen={showRuleBook}
        onClose={() => setShowRuleBook(false)}
        onOpenCampaign={() => {
          setShowRuleBook(false);
          setShowCampaignModal(true);
        }}
      />

      {/* Level Briefing Cinematic Modal (Includes New Unlock Descriptions - Requirement 4) */}
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
          onKeepViewing={() => {
            setShowVictoryModal(false);
          }}
        />
      )}

      {/* Visual Campaign Map Modal (Includes Previous Structure Inspection & Choice - Requirement 3) */}
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
