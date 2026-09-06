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
import './styles/index.css';

export function App() {
  // Master simulation engine instance ref
  const engineRef = useRef<SimulationEngine | null>(null);

  // Initial world state
  const [worldState, setWorldState] = useState<WorldState>(() => {
    const initial = WorldGenerator.generateWorld({ seed: 42, isWalkthroughPreset: true });
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

  // Phase 7 Advanced Analysis state
  const [activeXRayLayer, setActiveXRayLayer] = useState<XRayLayer>('none');
  const [showAIComparison, setShowAIComparison] = useState<boolean>(false);
  const [activeCausalTrace, setActiveCausalTrace] = useState<CausalTrace | null>(null);

  // Camera focus & Construction pulse states
  const [focusCoord, setFocusCoord] = useState<{ x: number; y: number } | null>(null);
  const [constructionPulse, setConstructionPulse] = useState<{ x: number; y: number; time: number } | null>(null);

  // Verification check
  const verification = useMemo(() => runPhase1Verification(), []);

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
  }, [selectedCell]);

  // Automated playback loop
  useEffect(() => {
    if (!isPlaying) return;
    const intervalMs = Math.max(100, Math.floor(1000 / speed));
    const timer = setInterval(() => {
      handleStepTick();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [isPlaying, speed, handleStepTick]);

  // Handle seed regeneration
  const handleSelectSeed = (seed: number) => {
    const next = WorldGenerator.generateWorld({ seed, isWalkthroughPreset: seed === 42 });
    engineRef.current = new SimulationEngine(next);
    setWorldState(next);
    setSelectedCell(null);
    setHoveredCell(null);
    setActiveEvent(null);
    setIsPlaying(false);
  };

  // Handle reset to walkthrough initial state
  const handleReset = () => {
    handleSelectSeed(worldState.seed);
  };

  // Build placement handler (UI receives validation from simulation engine)
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
      setSelectedCell(stepResult.state.grid[cell.y][cell.x]);

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
        // Trigger 300ms visual construction shockwave!
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
      setSelectedCell(stepResult.state.grid[cell.y][cell.x]);
      setConstructionPulse({ x: cell.x, y: cell.y, time: performance.now() });
    }
  };

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

    // Inject a Sudden Thermal Shift (+4.2°C) or Storm
    const perturbEvent: SimulationEvent = {
      id: `evt-perturb-${Date.now()}`,
      tick: worldState.time.tick,
      type: 'THERMAL_ANOMALY',
      severity: 'warning',
      title: 'Sudden Thermal Anomaly (+4.2°C)',
      description: 'Isotherm elevates rapidly. Alpine snowmelt runoff surge imminent.',
      location: { x: 6, y: 4 }, // Mountain peak
    };

    worldState.globalEnv.ambientTemperature += 4.2;
    worldState.events.unshift(perturbEvent);
    setActiveEvent(perturbEvent);
    setFocusCoord({ x: 6, y: 4 });

    // Step simulation to propagate consequence through equations
    const result = engineRef.current.step();
    setWorldState({ ...result.state });

    // Open causal explainability DAG
    setActiveCausalTrace(CausalTracer.traceThermalSurgeToHydro(result.state));
  };

  // Focus event on world map
  const handleSelectEvent = (event: SimulationEvent) => {
    setActiveEvent(event);
    if (event.location) {
      const cell = worldState.grid[event.location.y][event.location.x];
      setSelectedCell(cell);
      setFocusCoord({ x: event.location.x, y: event.location.y });
    }
    if (event.type === 'THERMAL_ANOMALY') {
      setActiveCausalTrace(CausalTracer.traceThermalSurgeToHydro(worldState));
    }
  };

  // Explain root cause handler ("Why Did This Happen?")
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
    setSelectedCell(worldState.grid[pos.y][pos.x]);
    setFocusCoord({ x: pos.x, y: pos.y });
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
        {/* Multi-spectral X-Ray Layer Controls (Compact Floating Pill) */}
        <XRayControls
          activeLayer={activeXRayLayer}
          onSelectLayer={handleSelectXRayLayer}
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
            activeXRayLayer={activeXRayLayer}
            focusCoord={focusCoord}
            constructionPulse={constructionPulse}
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
        {selectedCell && (
          <RightContextPanel
            selectedCell={selectedCell}
            worldState={worldState}
            onClose={() => setSelectedCell(null)}
            onRemoveMachine={handleRemoveMachine}
            onExplainCause={handleExplainCause}
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
      />

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
        <span>TerraForge AI Simulation Kernel v1.0 • Spec Source: energy-ecosystem-spec.md</span>
        <span>Deterministic Seed: #{worldState.seed} • State Hash: #{worldState.stateHash} • Update Loop: 21-Step Non-Circular</span>
      </footer>
    </div>
  );
}

export default App;
