import React from 'react';

interface AIComparisonCardProps {
  onClose: () => void;
}

export const AIComparisonCard: React.FC<AIComparisonCardProps> = ({ onClose }) => {
  return (
    <div style={{
      position: 'fixed',
      top: '68px',
      left: '16px',
      width: '320px',
      backgroundColor: 'var(--surface-base)',
      backdropFilter: 'blur(16px)',
      borderRadius: 'var(--radius-xl)',
      border: '1px solid var(--border-subtle)',
      boxShadow: 'var(--modal-shadow)',
      padding: '14px',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      zIndex: 35,
      userSelect: 'none'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span className="material-symbols-outlined" style={{ color: 'var(--primary-bright)', fontSize: '18px' }}>
            compare_arrows
          </span>
          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
            Prediction vs Ground Truth
          </span>
        </div>
        <button
          onClick={onClose}
          style={{ color: 'var(--text-muted)', fontSize: '16px' }}
        >
          ✕
        </button>
      </div>

      <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Benchmark Metric: Basinal Runoff Surge Timing
      </div>

      {/* Comparison Bar Streams (Stitch Visual Direction) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '11px' }}>
        {/* System A */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
            <span style={{ color: 'var(--text-muted)' }}>System A (Spatial Prior)</span>
            <span style={{ color: 'var(--primary-bright)', fontWeight: 700 }} className="tabular-nums">+18.2 min (Lag)</span>
          </div>
          <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--surface-container-highest)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
            <div style={{ width: '64%', height: '100%', backgroundColor: 'var(--primary-bright)', borderRadius: 'var(--radius-full)' }} />
          </div>
        </div>

        {/* System B */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
            <span style={{ color: 'var(--text-muted)' }}>System B (Causal Tree)</span>
            <span style={{ color: 'var(--secondary)', fontWeight: 700 }} className="tabular-nums">+4.1 min (Match)</span>
          </div>
          <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--surface-container-highest)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
            <div style={{ width: '92%', height: '100%', backgroundColor: 'var(--secondary)', borderRadius: 'var(--radius-full)' }} />
          </div>
        </div>

        {/* Ground Truth Sensor Mesh */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
            <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Ground Truth (Engine State)</span>
            <span style={{ color: 'var(--tertiary)', fontWeight: 700 }} className="tabular-nums">+3.8 min (Actual)</span>
          </div>
          <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--surface-container-highest)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
            <div style={{ width: '95%', height: '100%', backgroundColor: 'var(--tertiary)', borderRadius: 'var(--radius-full)' }} />
          </div>
        </div>
      </div>

      {/* Dual Evaluation Metrics */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '6px',
        backgroundColor: 'var(--surface-container-lowest)',
        padding: '8px',
        borderRadius: 'var(--radius-sm)',
        fontSize: '10px'
      }} className="tabular-nums">
        <div>
          <span style={{ color: 'var(--text-muted)' }}>System A Conf: </span>
          <span style={{ color: 'var(--primary-bright)', fontWeight: 600 }}>87.4%</span>
        </div>
        <div>
          <span style={{ color: 'var(--text-muted)' }}>System B Conf: </span>
          <span style={{ color: 'var(--secondary)', fontWeight: 600 }}>92.1%</span>
        </div>
        <div>
          <span style={{ color: 'var(--text-muted)' }}>Causal Error: </span>
          <span style={{ color: 'var(--tertiary)', fontWeight: 600 }}>±0.3 min</span>
        </div>
        <div>
          <span style={{ color: 'var(--text-muted)' }}>Transfer Score: </span>
          <span style={{ color: 'var(--tertiary)', fontWeight: 600 }}>96.5%</span>
        </div>
      </div>
    </div>
  );
};
