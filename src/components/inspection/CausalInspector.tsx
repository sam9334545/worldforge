import React, { useState } from 'react';
import type { CausalTrace, CausalStep } from '../../sim/causalTracer.ts';

interface CausalInspectorProps {
  trace: CausalTrace;
  onFocusCell: (cell: { x: number; y: number }) => void;
  onClose: () => void;
}

export const CausalInspector: React.FC<CausalInspectorProps> = ({
  trace,
  onFocusCell,
  onClose
}) => {
  const [activeStepIndex, setActiveStepIndex] = useState<number>(1);

  const handleStepClick = (step: CausalStep) => {
    setActiveStepIndex(step.stepIndex);
    if (step.targetCell) {
      onFocusCell(step.targetCell);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      bottom: '80px',
      right: '16px',
      width: '360px',
      backgroundColor: 'var(--surface-base)',
      backdropFilter: 'blur(16px)',
      borderRadius: 'var(--radius-xl)',
      border: '1px solid var(--border-active)',
      boxShadow: 'var(--modal-shadow)',
      padding: '16px',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      zIndex: 38,
      userSelect: 'none'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="material-symbols-outlined" style={{ color: 'var(--primary-bright)', fontSize: '20px' }}>
            account_tree
          </span>
          <div>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
              Causal Root Trace
            </span>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: '18px' }}>
              {trace.title}
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          style={{ color: 'var(--text-muted)', fontSize: '16px' }}
        >
          ✕
        </button>
      </div>

      <p style={{ fontSize: '11px', color: 'var(--text-variant)', lineHeight: '16px', margin: 0 }}>
        {trace.summary}
      </p>

      {/* 4-Step Causal Progression Chain */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
        {trace.steps.map(step => {
          const isSelected = activeStepIndex === step.stepIndex;

          return (
            <div
              key={step.stepIndex}
              onClick={() => handleStepClick(step)}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                padding: '8px 10px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: isSelected ? 'var(--surface-elevated)' : 'var(--surface-container-lowest)',
                border: `1px solid ${isSelected ? 'var(--border-active)' : 'var(--border-subtle)'}`,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {/* Step number badge */}
              <div style={{
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                backgroundColor: isSelected ? 'var(--primary-container)' : 'var(--surface-container-high)',
                color: isSelected ? 'var(--on-primary-container)' : 'var(--text-muted)',
                fontSize: '10px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: '1px'
              }}>
                {step.stepIndex}
              </div>

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: isSelected ? 'var(--text-primary)' : 'var(--text-on-surface)' }}>
                    {step.title}
                  </span>
                  <span style={{ fontSize: '10px', color: 'var(--tertiary)', fontWeight: 700 }} className="tabular-nums">
                    {step.observedDelta}
                  </span>
                </div>

                <p style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: '14px', margin: 0 }}>
                  {step.description}
                </p>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                  <span style={{ fontSize: '9px', color: 'var(--secondary)', backgroundColor: 'rgba(0,0,0,0.3)', padding: '1px 5px', borderRadius: '2px' }}>
                    {step.governingRule}
                  </span>
                  {step.targetCell && (
                    <span style={{ fontSize: '9px', color: 'var(--primary-bright)', fontWeight: 600 }}>
                      Inspect [{step.targetCell.x}, {step.targetCell.y}] &rarr;
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
