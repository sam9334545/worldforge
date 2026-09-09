import React, { useState, useEffect } from 'react';
import { runBenchmark, type BenchmarkRunResponse } from '../../services/api.ts';

interface AIComparisonCardProps {
  onClose: () => void;
  seed?: number;
}

const LEVEL_TO_SEED: Record<number, number> = {
  1: 1,
  2: 2,
  3: 3,
  4: 4,
  5: 5,
  6: 101,
  7: 102,
  8: 103,
  9: 104,
  10: 105,
};

const getSeedForLevel = (lvl: number): number => {
  return LEVEL_TO_SEED[lvl] ?? (lvl <= 5 ? lvl : 100 + (lvl - 5));
};

const getLevelForSeed = (s: number): number => {
  for (const [lvlStr, seedVal] of Object.entries(LEVEL_TO_SEED)) {
    if (seedVal === s) return Number(lvlStr);
  }
  if (s >= 1 && s <= 5) return s;
  if (s >= 101 && s <= 105) return s - 100 + 5;
  return 1;
};

export const AIComparisonCard: React.FC<AIComparisonCardProps> = ({ onClose, seed = 42 }) => {
  const [selectedAgent, setSelectedAgent] = useState<'heuristic' | 'lookup' | 'random' | 'hebbian' | 'donothing'>('heuristic');
  const [selectedLevel, setSelectedLevel] = useState<number>(() => getLevelForSeed(seed));
  const [maxSteps, setMaxSteps] = useState<number>(500);
  const [loading, setLoading] = useState<boolean>(false);
  const [benchmarkResult, setBenchmarkResult] = useState<BenchmarkRunResponse | null>(null);
  const [evaluatedAgents, setEvaluatedAgents] = useState<Record<string, BenchmarkRunResponse>>({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sync selectedLevel when seed changes from parent
  useEffect(() => {
    setSelectedLevel(getLevelForSeed(seed));
  }, [seed]);

  const handleRunEvaluation = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const targetSeed = getSeedForLevel(selectedLevel);
      const res = await runBenchmark({
        seed: targetSeed,
        agent_type: selectedAgent,
        max_steps: maxSteps,
        decision_interval: 168,
      });
      setBenchmarkResult(res);
      setEvaluatedAgents((prev) => ({
        ...prev,
        [selectedAgent]: res,
      }));
    } catch (err: any) {
      setErrorMsg(err.message || 'Benchmark evaluation failed');
    } finally {
      setLoading(false);
    }
  };

  const heuristicData = evaluatedAgents['heuristic'] ?? (benchmarkResult?.agent_type === 'heuristic' ? benchmarkResult : null);
  const hebbianData = evaluatedAgents['hebbian'] ?? (benchmarkResult?.agent_type === 'hebbian' ? benchmarkResult : null);
  const lookupData = evaluatedAgents['lookup'] ?? (benchmarkResult?.agent_type === 'lookup' ? benchmarkResult : null);
  const randomData = evaluatedAgents['random'] ?? (benchmarkResult?.agent_type === 'random' ? benchmarkResult : null);
  const doNothingData = evaluatedAgents['donothing'] ?? (benchmarkResult?.agent_type === 'donothing' ? benchmarkResult : null);

  const heuristicScore = heuristicData ? heuristicData.scoring_metrics.score : null;
  const hebbianScore = hebbianData ? hebbianData.scoring_metrics.score : null;
  const lookupScore = lookupData ? lookupData.scoring_metrics.score : null;
  const randomScore = randomData ? randomData.scoring_metrics.score : null;
  const doNothingScore = doNothingData ? doNothingData.scoring_metrics.score : null;

  return (
    <div
      style={{
        position: 'fixed',
        top: '68px',
        left: '16px',
        width: '360px',
        maxHeight: 'calc(100vh - 100px)',
        overflowY: 'auto',
        backgroundColor: 'var(--surface-base)',
        backdropFilter: 'blur(16px)',
        borderRadius: 'var(--radius-xl)',
        border: '1px solid var(--border-subtle)',
        boxShadow: 'var(--modal-shadow)',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        zIndex: 35,
        userSelect: 'none',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span className="material-symbols-outlined" style={{ color: 'var(--primary-bright)', fontSize: '20px' }}>
            model_training
          </span>
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
            AI Benchmark Evaluation
          </span>
        </div>
        <button
          onClick={onClose}
          style={{ color: 'var(--text-muted)', fontSize: '16px', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          ✕
        </button>
      </div>

      <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Backend: Python WorldForge Engine (Port 8000)
      </div>

      {/* Benchmark Controls */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '11px' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <label style={{ color: 'var(--text-muted)', width: '60px' }}>Agent:</label>
          <select
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(e.target.value as any)}
            style={{
              flex: 1,
              backgroundColor: 'var(--surface-container-highest)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              padding: '4px 8px',
              fontSize: '11px',
            }}
          >
            <option value="heuristic">Heuristic (Reasoning)</option>
            <option value="hebbian">Hebbian / BDH (Fast-Weights)</option>
            <option value="lookup">Lookup (Memorization)</option>
            <option value="random">Random (Stochastic)</option>
            <option value="donothing">DoNothing (Floor)</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <label style={{ color: 'var(--text-muted)', width: '60px' }}>Level:</label>
          <select
            value={selectedLevel}
            onChange={(e) => setSelectedLevel(parseInt(e.target.value, 10))}
            style={{
              width: '110px',
              backgroundColor: 'var(--surface-container-highest)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              padding: '4px 6px',
              fontSize: '11px',
            }}
          >
            <optgroup label="Training Split (Seeds 1–5)">
              <option value={1}>Level 1 (Seed 1)</option>
              <option value={2}>Level 2 (Seed 2)</option>
              <option value={3}>Level 3 (Seed 3)</option>
              <option value={4}>Level 4 (Seed 4)</option>
              <option value={5}>Level 5 (Seed 5)</option>
            </optgroup>
            <optgroup label="Held-Out Test Split (Seeds 101–105)">
              <option value={6}>Level 6 (Seed 101)</option>
              <option value={7}>Level 7 (Seed 102)</option>
              <option value={8}>Level 8 (Seed 103)</option>
              <option value={9}>Level 9 (Seed 104)</option>
              <option value={10}>Level 10 (Seed 105)</option>
            </optgroup>
          </select>
          {selectedLevel <= 5 ? (
            <span
              style={{
                backgroundColor: 'rgba(56, 189, 248, 0.15)',
                color: '#38bdf8',
                padding: '3px 8px',
                borderRadius: '4px',
                fontSize: '10px',
                fontWeight: 600,
                border: '1px solid rgba(56, 189, 248, 0.3)',
                whiteSpace: 'nowrap',
              }}
            >
              Training (Seed #{getSeedForLevel(selectedLevel)})
            </span>
          ) : (
            <span
              style={{
                backgroundColor: 'rgba(168, 85, 247, 0.15)',
                color: '#c084fc',
                padding: '3px 8px',
                borderRadius: '4px',
                fontSize: '10px',
                fontWeight: 600,
                border: '1px solid rgba(168, 85, 247, 0.3)',
                whiteSpace: 'nowrap',
              }}
            >
              Held-Out Test (Seed #{getSeedForLevel(selectedLevel)})
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <label style={{ color: 'var(--text-muted)', width: '60px' }}>Steps:</label>
          <input
            type="number"
            value={maxSteps}
            onChange={(e) => setMaxSteps(Math.max(10, parseInt(e.target.value, 10) || 100))}
            style={{
              width: '80px',
              backgroundColor: 'var(--surface-container-highest)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              padding: '4px 6px',
              fontSize: '11px',
            }}
          />
          <button
            onClick={handleRunEvaluation}
            disabled={loading}
            style={{
              flex: 1,
              backgroundColor: loading ? 'var(--surface-container-highest)' : 'var(--primary-bright)',
              color: loading ? 'var(--text-muted)' : '#000',
              fontWeight: 700,
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              padding: '6px 10px',
              cursor: loading ? 'wait' : 'pointer',
              fontSize: '11px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
            }}
          >
            {loading ? 'Evaluating...' : 'Run Benchmark'}
          </button>
        </div>
      </div>

      {errorMsg && (
        <div style={{ color: '#ff6b6b', fontSize: '10px', padding: '4px 8px', backgroundColor: 'rgba(255,0,0,0.1)', borderRadius: '4px' }}>
          {errorMsg}
        </div>
      )}

      {/* Live Benchmark Execution Results */}
      {benchmarkResult && (
        <div
          style={{
            backgroundColor: 'var(--surface-container-lowest)',
            padding: '10px',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            fontSize: '11px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                Score ({benchmarkResult.agent_type.toUpperCase()})
              </span>
              <span
                style={{
                  fontSize: '9px',
                  fontWeight: 600,
                  padding: '1px 5px',
                  borderRadius: '3px',
                  backgroundColor:
                    benchmarkResult.seed_category === 'held_out'
                      ? 'rgba(168, 85, 247, 0.2)'
                      : 'rgba(56, 189, 248, 0.2)',
                  color: benchmarkResult.seed_category === 'held_out' ? '#c084fc' : '#38bdf8',
                }}
              >
                Level {selectedLevel} (Seed #{benchmarkResult.seed})
              </span>
            </div>
            <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--primary-bright)' }} className="tabular-nums">
              {benchmarkResult.scoring_metrics.score} / 100
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '10px' }} className="tabular-nums">
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Transmission Eff: </span>
              <span style={{ color: 'var(--secondary)', fontWeight: 600 }}>
                {(benchmarkResult.transmission_efficiency.delivery_efficiency * 100).toFixed(1)}%
              </span>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Loss Rate: </span>
              <span style={{ color: 'var(--tertiary)', fontWeight: 600 }}>
                {(benchmarkResult.transmission_efficiency.loss_rate * 100).toFixed(1)}%
              </span>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Delivered: </span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                {benchmarkResult.transmission_efficiency.mwh_delivered.toFixed(1)} MWh
              </span>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Generated: </span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                {benchmarkResult.transmission_efficiency.mwh_generated.toFixed(1)} MWh
              </span>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Machines Built: </span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                {benchmarkResult.scoring_metrics.machines_built}
              </span>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Wall Time: </span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                {benchmarkResult.performance_logs.wall_time_seconds.toFixed(2)}s
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Ground Truth & Comparative Benchmark Models */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '11px' }}>
        {/* 1. Heuristic World-Model */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
            <span style={{ color: 'var(--text-muted)' }}>Heuristic World-Model</span>
            <span style={{ color: 'var(--secondary)', fontWeight: 700 }} className="tabular-nums">
              {heuristicScore !== null ? `${heuristicScore.toFixed(1)} pts` : 'Reasoning Prior'}
            </span>
          </div>
          <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--surface-container-highest)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
            <div
              style={{
                width: heuristicScore !== null ? `${Math.min(100, Math.max(0, heuristicScore))}%` : '0%',
                height: '100%',
                backgroundColor: 'var(--secondary)',
                borderRadius: 'var(--radius-full)',
                transition: 'width 0.4s ease-out',
              }}
            />
          </div>
        </div>

        {/* 2. Hebbian / BDH Fast-Weights Agent */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
            <span style={{ color: 'var(--text-muted)' }}>BDH Model (Hebbian Fast-Weights)</span>
            <span style={{ color: '#38bdf8', fontWeight: 700 }} className="tabular-nums">
              {hebbianScore !== null ? `${hebbianScore.toFixed(1)} pts` : 'Associative Memory'}
            </span>
          </div>
          <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--surface-container-highest)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
            <div
              style={{
                width: hebbianScore !== null ? `${Math.min(100, Math.max(0, hebbianScore))}%` : '0%',
                height: '100%',
                backgroundColor: '#38bdf8',
                borderRadius: 'var(--radius-full)',
                transition: 'width 0.4s ease-out',
              }}
            />
          </div>
        </div>

        {/* 3. Lookup Table Prior */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
            <span style={{ color: 'var(--text-muted)' }}>Lookup Table Prior</span>
            <span style={{ color: 'var(--primary-bright)', fontWeight: 700 }} className="tabular-nums">
              {lookupScore !== null ? `${lookupScore.toFixed(1)} pts` : 'Memorized Prior'}
            </span>
          </div>
          <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--surface-container-highest)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
            <div
              style={{
                width: lookupScore !== null ? `${Math.min(100, Math.max(0, lookupScore))}%` : '0%',
                height: '100%',
                backgroundColor: 'var(--primary-bright)',
                borderRadius: 'var(--radius-full)',
                transition: 'width 0.4s ease-out',
              }}
            />
          </div>
        </div>

        {/* 3. Random Exploration Policy */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
            <span style={{ color: 'var(--text-muted)' }}>Random Stochastic Agent</span>
            <span style={{ color: '#eab308', fontWeight: 700 }} className="tabular-nums">
              {randomScore !== null ? `${randomScore.toFixed(1)} pts` : 'Exploratory Baseline'}
            </span>
          </div>
          <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--surface-container-highest)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
            <div
              style={{
                width: randomScore !== null ? `${Math.min(100, Math.max(0, randomScore))}%` : '0%',
                height: '100%',
                backgroundColor: '#eab308',
                borderRadius: 'var(--radius-full)',
                transition: 'width 0.4s ease-out',
              }}
            />
          </div>
        </div>

        {/* 4. DoNothing Floor Baseline */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
            <span style={{ color: 'var(--text-muted)' }}>DoNothing Baseline</span>
            <span style={{ color: '#94a3b8', fontWeight: 700 }} className="tabular-nums">
              {doNothingScore !== null ? `${doNothingScore.toFixed(1)} pts` : 'Inaction Floor'}
            </span>
          </div>
          <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--surface-container-highest)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
            <div
              style={{
                width: doNothingScore !== null ? `${Math.min(100, Math.max(0, doNothingScore))}%` : '0%',
                height: '100%',
                backgroundColor: '#94a3b8',
                borderRadius: 'var(--radius-full)',
                transition: 'width 0.4s ease-out',
              }}
            />
          </div>
        </div>

        {/* 5. Ground Truth Determinism Baseline */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
            <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Ground Truth Engine</span>
            <span style={{ color: 'var(--tertiary)', fontWeight: 700 }} className="tabular-nums">
              {benchmarkResult ? `Seed #${benchmarkResult.seed} (${benchmarkResult.performance_logs.total_ticks} ticks)` : 'Deterministic Kernel'}
            </span>
          </div>
          <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--surface-container-highest)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
            <div
              style={{
                width: benchmarkResult ? '100%' : '0%',
                height: '100%',
                backgroundColor: 'var(--tertiary)',
                borderRadius: 'var(--radius-full)',
                transition: 'width 0.4s ease-out',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
