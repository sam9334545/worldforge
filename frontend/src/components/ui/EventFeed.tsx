import React from 'react';
import type { SimulationEvent } from '../../sim/contracts/SimulationEvent.ts';

interface EventFeedProps {
  events: SimulationEvent[];
  onSelectEvent: (event: SimulationEvent) => void;
}

export const EventFeed: React.FC<EventFeedProps> = ({ events, onSelectEvent }) => {
  // Show last 4 most recent events
  const recentEvents = events.slice(0, 4);

  if (recentEvents.length === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      top: '68px',
      right: '16px',
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
      zIndex: 30,
      maxWidth: '300px',
      pointerEvents: 'auto',
      userSelect: 'none'
    }}>
      {recentEvents.map(evt => {
        const isCritical = evt.severity === 'critical';
        const isWarning = evt.severity === 'warning';

        return (
          <div
            key={evt.id}
            onClick={() => onSelectEvent(evt)}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '8px',
              padding: '8px 12px',
              backgroundColor: isCritical ? 'rgba(147, 0, 10, 0.85)' : isWarning ? 'rgba(210, 153, 34, 0.25)' : 'var(--glass-bg)',
              backdropFilter: 'blur(8px)',
              borderRadius: 'var(--radius-md)',
              border: `1px solid ${isCritical ? 'var(--error-bright)' : isWarning ? 'var(--warning-bright)' : 'var(--border-subtle)'}`,
              boxShadow: 'var(--glass-shadow)',
              cursor: 'pointer',
              transition: 'transform 0.1s ease, border-color 0.15s ease'
            }}
            title="Click to focus on affected area and inspect causal factors"
          >
            <span
              className="material-symbols-outlined"
              style={{
                fontSize: '16px',
                marginTop: '1px',
                color: isCritical ? 'var(--error-bright)' : isWarning ? 'var(--warning-bright)' : 'var(--primary-bright)'
              }}
            >
              {isCritical ? 'error' : isWarning ? 'warning' : 'info'}
            </span>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {evt.title}
                </span>
                <span style={{ fontSize: '9px', color: 'var(--text-muted)' }} className="tabular-nums">
                  T+{evt.tick}
                </span>
              </div>
              <p style={{ fontSize: '10px', color: 'var(--text-variant)', lineHeight: '14px', margin: 0 }}>
                {evt.description}
              </p>
              {evt.location && (
                <span style={{ fontSize: '9px', color: 'var(--primary-bright)', marginTop: '2px' }}>
                  Location: [{evt.location.x}, {evt.location.y}] • Focus &rarr;
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
