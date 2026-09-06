import React, { useState } from 'react';

export type XRayLayer =
  | 'none'
  | 'elevation'
  | 'wind'
  | 'solar'
  | 'hydro'
  | 'snow'
  | 'network'
  | 'ai';

interface XRayControlsProps {
  activeLayer: XRayLayer;
  onSelectLayer: (layer: XRayLayer) => void;
}

export const XRayControls: React.FC<XRayControlsProps> = ({
  activeLayer,
  onSelectLayer
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);

  const layers: Array<{ id: XRayLayer; label: string; icon: string; category: string; color: string }> = [
    { id: 'none', label: 'Default View', icon: 'view_in_ar', category: 'General', color: '#afc6ff' },
    { id: 'wind', label: 'Wind Vector Field', icon: 'air', category: 'Environment', color: '#79c0ff' },
    { id: 'solar', label: 'Solar Exposure', icon: 'wb_sunny', category: 'Environment', color: '#ffea79' },
    { id: 'hydro', label: 'River & Runoff Flow', icon: 'waves', category: 'Environment', color: '#388bfd' },
    { id: 'snow', label: 'Snow & Snowmelt', icon: 'ac_unit', category: 'Environment', color: '#dee2ec' },
    { id: 'elevation', label: 'Elevation Contours', icon: 'landscape', category: 'Environment', color: '#6fdd78' },
    { id: 'network', label: 'Energy Grid Conduits', icon: 'bolt', category: 'Energy', color: '#8bfb91' },
    { id: 'ai', label: 'AI Prediction Mesh', icon: 'grain', category: 'Analysis', color: '#aac7ff' },
  ];

  const currentItem = layers.find(l => l.id === activeLayer) || layers[0];

  return (
    <div style={{
      position: 'absolute',
      top: '64px',
      left: '16px',
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
      zIndex: 25,
      userSelect: 'none'
    }}>
      {/* Compact Toggle Button Pill */}
      <button
        onClick={() => setIsOpen(o => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 12px',
          borderRadius: 'var(--radius-full)',
          backgroundColor: 'rgba(10, 14, 22, 0.85)',
          backdropFilter: 'blur(16px)',
          border: '1px solid var(--border-subtle)',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
          color: 'var(--text-primary)',
          fontSize: '11px',
          fontWeight: 600
        }}
        title="Toggle Multi-Spectral World X-Ray Layers"
      >
        <span className="material-symbols-outlined" style={{ fontSize: '16px', color: currentItem.color }}>
          {currentItem.icon}
        </span>
        <span>{currentItem.id === 'none' ? 'X-Ray Layers' : currentItem.label}</span>
        <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--text-muted)' }}>
          {isOpen ? 'expand_less' : 'expand_more'}
        </span>
      </button>

      {/* Layer Tray */}
      {isOpen && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
          backgroundColor: 'rgba(10, 14, 22, 0.92)',
          backdropFilter: 'blur(20px)',
          padding: '6px',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-subtle)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
          minWidth: '185px'
        }}>
          {layers.map(layer => {
            const isActive = activeLayer === layer.id;

            return (
              <button
                key={layer.id}
                onClick={() => {
                  onSelectLayer(layer.id);
                  setIsOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 10px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '11px',
                  fontWeight: isActive ? 700 : 500,
                  backgroundColor: isActive ? 'var(--surface-elevated)' : 'transparent',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                  borderLeft: isActive ? `3px solid ${layer.color}` : '3px solid transparent',
                  textAlign: 'left',
                  transition: 'all 0.12s ease'
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px', color: layer.color }}>
                  {layer.icon}
                </span>
                <span>{layer.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
