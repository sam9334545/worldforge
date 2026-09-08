/**
 * WorldForge viewer.
 *
 * All physics, market clearing and accounting happen in the Python engine; this
 * component renders what the engine reports and posts actions back to it. There
 * is no simulation in this app.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { RemoteSimulationEngine } from './api/RemoteSimulationEngine';
import { API_BASE, type PlacementMasks, type RemoteWorld } from './api/client';
import type { CellState, MachineType, OverlayType } from './sim/types';
import type { WorldState } from './sim/contracts/WorldState';
import { WorldCanvas } from './components/viewport/WorldCanvas';
import { XRayControls, type XRayLayer } from './components/viewport/XRayControls';
import { CellInspector } from './components/inspection/CellInspector';
import type { SelectedBuildTool, InteractionMode } from './components/ui/BottomControlDock';
import './styles/index.css';

const MACHINES: Array<{ type: MachineType; label: string }> = [
  { type: 'LandSolar', label: 'Solar' },
  { type: 'FloatSolar', label: 'Float' },
  { type: 'WindTurbine', label: 'Wind' },
  { type: 'HydroTurbine', label: 'Hydro' },
  { type: 'Cable', label: 'Cable' },
];
const OVERLAYS: OverlayType[] = ['Gravel', 'Stone'];
const SPEEDS = [1, 6, 24, 168];

function money(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `$${(v / 1e3).toFixed(0)}k`;
  return `$${v.toFixed(0)}`;
}

export function RemoteApp() {
  const engineRef = useRef<RemoteSimulationEngine>(new RemoteSimulationEngine());
  const [world, setWorld] = useState<RemoteWorld | null>(null);
  const [status, setStatus] = useState<string>('connecting to engine...');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [selected, setSelected] = useState<CellState | null>(null);
  const [hovered, setHovered] = useState<{ x: number; y: number } | null>(null);
  const [tool, setTool] = useState<SelectedBuildTool>(null);
  const [mode, setMode] = useState<InteractionMode>('simulate');
  const [xray, setXray] = useState<XRayLayer>('none');
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(6);
  const [log, setLog] = useState<string[]>([]);
  const [masks, setMasks] = useState<PlacementMasks | null>(null);

  const note = useCallback((msg: string) => {
    setLog((prev) => [msg, ...prev].slice(0, 12));
  }, []);

  // -- session -----------------------------------------------------------
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const seed = params.get('seed') ? parseInt(params.get('seed')!, 10) : 42;
    let cancelled = false;

    (async () => {
      try {
        const w = await engineRef.current.init(seed);
        if (cancelled) return;
        setWorld(w);
        setStatus(`seed ${seed} - ${w.width}x${w.height}`);
        note(`world created on seed ${seed}`);
      } catch (e) {
        if (cancelled) return;
        setError(
          `Cannot reach the engine at ${API_BASE}. Start it with:\n\n` +
          `    wfbench api --port 8000\n\n${(e as Error).message}`,
        );
        setStatus('disconnected');
      }
    })();
    return () => { cancelled = true; };
  }, [note]);

  // -- playback ----------------------------------------------------------
  useEffect(() => {
    if (!playing || !engineRef.current.ready) return;
    let stop = false;

    const loop = async () => {
      while (!stop) {
        try {
          const w = await engineRef.current.advance(speed);
          if (stop) return;
          setWorld(w);
          if (w.lastTick?.events?.length) w.lastTick.events.forEach(note);
          if (w.terminated) {
            setPlaying(false);
            note(`run ended: ${w.terminationReason}`);
            return;
          }
        } catch (e) {
          setPlaying(false);
          note(`advance failed: ${(e as Error).message}`);
          return;
        }
        await new Promise((r) => setTimeout(r, 120));
      }
    };
    void loop();
    return () => { stop = true; };
  }, [playing, speed, note]);

  // Placement validity comes from the engine, refreshed whenever the world
  // changes -- a build or a reinforcement can make neighbouring cells illegal.
  useEffect(() => {
    if (!world || !engineRef.current.ready) return;
    let cancelled = false;
    void engineRef.current.placementMasks()
      .then((m) => { if (!cancelled) setMasks(m); })
      .catch(() => { /* shading falls back to permissive */ });
    return () => { cancelled = true; };
  }, [world]);

  const checkPlacement = useCallback(
    (kind: MachineType | OverlayType, x: number, y: number) => {
      const grid = masks?.masks?.[kind];
      if (!grid) return { valid: true, reason: '' };
      const valid = grid[y]?.[x] ?? false;
      return { valid, reason: valid ? '' : `${kind} cannot be built here` };
    },
    [masks],
  );

  // Keep the open inspector pointed at fresh state.
  useEffect(() => {
    if (world && selected) {
      const fresh = world.grid[selected.y]?.[selected.x];
      if (fresh) setSelected(fresh);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world]);

  // -- actions -----------------------------------------------------------
  const runAction = useCallback(async (fn: () => Promise<{ ok: boolean; message: string }>) => {
    setBusy(true);
    try {
      const r = await fn();
      note(`${r.ok ? 'OK' : 'refused'} - ${r.message}`);
      setWorld(engineRef.current.getSimulationState());
    } catch (e) {
      note(`error: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, [note]);

  const handleBuild = useCallback((cell: CellState) => {
    if (!tool) return;
    if (tool.kind === 'overlay') {
      void runAction(() => engineRef.current.executeAction({
        type: 'REINFORCE', x: cell.x, y: cell.y, overlayType: tool.type,
      }));
      return;
    }
    if (tool.type === 'Cable') {
      void runAction(() => engineRef.current.executeAction({
        type: 'PLACE_CABLE', path: [{ x: cell.x, y: cell.y }],
      }));
      return;
    }
    void runAction(() => engineRef.current.executeAction({
      type: 'PLACE', machineType: tool.type, x: cell.x, y: cell.y,
    }));
  }, [tool, runAction]);

  const handleCablePath = useCallback((path: Array<{ x: number; y: number }>) => {
    void runAction(() => engineRef.current.executeAction({ type: 'PLACE_CABLE', path }));
  }, [runAction]);

  const stepOnce = useCallback(() => {
    void runAction(async () => {
      const w = await engineRef.current.advance(1);
      setWorld(w);
      return { ok: true, message: `tick ${w.time.tick}` };
    });
  }, [runAction]);

  // -- render ------------------------------------------------------------
  if (error) {
    return (
      <div style={{ padding: 32, fontFamily: 'ui-monospace, monospace', color: '#e6edf3',
                    background: '#0d1117', minHeight: '100vh' }}>
        <h2 style={{ color: '#f85149' }}>Engine unreachable</h2>
        <pre style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{error}</pre>
      </div>
    );
  }

  if (!world) {
    return (
      <div style={{ padding: 32, fontFamily: 'ui-monospace, monospace',
                    color: '#8b949e', background: '#0d1117', minHeight: '100vh' }}>
        {status}
      </div>
    );
  }

  const eco = world.economy;
  const bar: React.CSSProperties = {
    display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap',
    padding: '8px 14px', background: '#161b22', borderBottom: '1px solid #30363d',
    color: '#e6edf3', fontFamily: 'ui-monospace, monospace', fontSize: 12,
  };
  const btn = (active: boolean): React.CSSProperties => ({
    padding: '4px 10px', borderRadius: 5, cursor: 'pointer', fontSize: 12,
    border: `1px solid ${active ? '#2f81f7' : '#30363d'}`,
    background: active ? '#1f6feb33' : '#21262d', color: '#e6edf3',
  });

  return (
    <div style={{ background: '#0d1117', minHeight: '100vh' }}>
      <div style={bar}>
        <strong style={{ color: '#2f81f7' }}>WorldForge</strong>
        <span>{world.time.season} Y{world.time.year} D{world.time.day} {String(world.time.hour).padStart(2, '0')}:00</span>
        <span>tick {world.time.tick}</span>
        <span title="clearing price">${world.market.price.toFixed(2)}/MWh</span>
        <span>cash {money(eco.cash)}</span>
        <span>equity {money(eco.equityValue)}</span>
        <span>debt {money(eco.debt)}</span>
        <span>{eco.installedCapacityKw.toFixed(0)} kW</span>
        <span>CF {(eco.capacityFactor * 100).toFixed(1)}%</span>
        <span style={{ marginLeft: 'auto', color: '#8b949e' }}>{status}</span>
        <span style={{ color: '#8b949e' }} title="determinism fingerprint">#{world.stateHash}</span>
      </div>

      <div style={bar}>
        <button style={btn(playing)} onClick={() => setPlaying((p) => !p)}>
          {playing ? 'Pause' : 'Play'}
        </button>
        <button style={btn(false)} onClick={stepOnce} disabled={busy || playing}>Step</button>
        {SPEEDS.map((s) => (
          <button key={s} style={btn(speed === s)} onClick={() => setSpeed(s)}>
            {s === 1 ? '1h' : s === 24 ? '1d' : s === 168 ? '1w' : `${s}h`}
          </button>
        ))}
        <span style={{ color: '#8b949e', marginLeft: 10 }}>build:</span>
        <button style={btn(tool === null)} onClick={() => { setTool(null); setMode('inspect'); }}>
          none
        </button>
        {MACHINES.map((m) => (
          <button key={m.type}
                  style={btn(tool?.kind === 'machine' && tool.type === m.type)}
                  onClick={() => { setTool({ kind: 'machine', type: m.type }); setMode('build'); }}>
            {m.label}
          </button>
        ))}
        {OVERLAYS.map((o) => (
          <button key={o}
                  style={btn(tool?.kind === 'overlay' && tool.type === o)}
                  onClick={() => { setTool({ kind: 'overlay', type: o }); setMode('build'); }}>
            {o}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
          <WorldCanvas
            worldState={world as unknown as WorldState}
            selectedCell={selected ? { x: selected.x, y: selected.y } : null}
            onSelectCell={setSelected}
            hoveredCell={hovered}
            setHoveredCell={setHovered}
            buildTool={tool}
            onBuild={handleBuild}
            onBuildCablePath={handleCablePath}
            activeXRayLayer={xray}
            mode={mode}
            checkPlacement={checkPlacement}
          />
          <div style={{ position: 'absolute', top: 10, left: 10 }}>
            <XRayControls activeLayer={xray} onSelectLayer={setXray} />
          </div>
        </div>

        <div style={{ width: 330, flexShrink: 0 }}>
          {selected && (
            <CellInspector cell={selected} onClose={() => setSelected(null)}
                           onSelectXRayLayer={setXray} />
          )}
          <div style={{ padding: 12, color: '#8b949e', fontFamily: 'ui-monospace, monospace',
                        fontSize: 11, lineHeight: 1.7 }}>
            <div style={{ color: '#e6edf3', marginBottom: 6 }}>Activity</div>
            {log.length === 0 && <div>no events yet</div>}
            {log.map((l, i) => (
              <div key={i} style={{ opacity: 1 - i * 0.06 }}>{l}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
