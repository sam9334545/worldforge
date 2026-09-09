import React, { useState } from 'react';

interface RuleBookModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenCampaign?: () => void;
}

type TabType = 'basics' | 'modalities' | 'grid' | 'terrain' | 'environment';

export const RuleBookModal: React.FC<RuleBookModalProps> = ({
  isOpen,
  onClose,
  onOpenCampaign
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('basics');
  const [autoShow, setAutoShow] = useState<boolean>(() => {
    try {
      return localStorage.getItem('worldforge_show_rulebook_v1') !== 'false';
    } catch {
      return true;
    }
  });

  const handleToggleAutoShow = (checked: boolean) => {
    setAutoShow(checked);
    try {
      localStorage.setItem('worldforge_show_rulebook_v1', checked ? 'true' : 'false');
    } catch {
      // Ignore
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(5, 7, 12, 0.88)',
      backdropFilter: 'blur(16px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 130,
      padding: '20px',
      userSelect: 'none'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '860px',
        maxHeight: '90vh',
        backgroundColor: 'var(--surface-elevated, #0f172a)',
        border: '1px solid var(--border-subtle, #1e293b)',
        borderRadius: 'var(--radius-xl, 16px)',
        boxShadow: '0 24px 64px rgba(0, 0, 0, 0.75)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Modal Header */}
        <div style={{
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          padding: '16px 24px',
          borderBottom: '1px solid var(--border-subtle, #1e293b)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '24px', color: '#ffd700' }}>
              menu_book
            </span>
            <div>
              <div style={{ fontSize: '10px', fontWeight: 800, color: '#ffd700', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                GRID FIELD MANUAL & SPECIFICATION
              </div>
              <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#ffffff', margin: '2px 0 0 0' }}>
                TerraForge Operations Rule Book
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: 'var(--text-secondary, #94a3b8)',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>close</span>
          </button>
        </div>

        {/* Navigation Tabs */}
        <div style={{
          display: 'flex',
          backgroundColor: 'rgba(10, 15, 28, 0.95)',
          borderBottom: '1px solid var(--border-subtle, #1e293b)',
          padding: '0 16px',
          gap: '6px'
        }}>
          {[
            { id: 'basics', label: '1. Core Objective', icon: 'flag' },
            { id: 'modalities', label: '2. Generation Modalities', icon: 'bolt' },
            { id: 'grid', label: '3. Conduits & Grid', icon: 'cable' },
            { id: 'terrain', label: '4. Terrain & Soil Stabilization', icon: 'architecture' },
            { id: 'environment', label: '5. Environmental Cycles', icon: 'cyclone' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabType)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '12px 14px',
                fontSize: '11.5px',
                fontWeight: 700,
                color: activeTab === tab.id ? '#38bdf8' : '#94a3b8',
                backgroundColor: 'transparent',
                border: 'none',
                borderBottom: activeTab === tab.id ? '2px solid #38bdf8' : '2px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Scrollable Content Body */}
        <div style={{
          padding: '24px',
          overflowY: 'auto',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '16px'
        }}>
          {activeTab === 'basics' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{
                backgroundColor: 'rgba(56, 189, 248, 0.08)',
                border: '1px solid rgba(56, 189, 248, 0.25)',
                borderRadius: '10px',
                padding: '14px 16px'
              }}>
                <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#38bdf8', margin: '0 0 6px 0' }}>
                  ⚡ Sustained Operating Profit & Grid Delivery
                </h3>
                <p style={{ fontSize: '12px', lineHeight: '1.6', color: '#cbd5e1', margin: 0 }}>
                  In TerraForge, your mission is to design, construct, and optimize a sustainable renewable microgrid.
                  Each sector poses a target power delivery capacity and operating profit standard that must be sustained
                  over consecutive in-game simulation ticks (1 tick = 1 hour, 24 ticks = 1 in-game day).
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{
                  backgroundColor: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '10px',
                  padding: '12px 14px'
                }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#ffd700', marginBottom: '4px' }}>
                    💰 Operating Economy Rate
                  </div>
                  <p style={{ fontSize: '11.5px', lineHeight: '1.5', color: '#94a3b8', margin: 0 }}>
                    <strong>Daily Profit = Delivered Revenue - Maintenance Costs</strong> (computed over a 24-tick sliding window).
                    Capital construction costs do not penalize your daily rate, but draining your cash balance prevents further expansion.
                  </p>
                </div>

                <div style={{
                  backgroundColor: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '10px',
                  padding: '12px 14px'
                }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#3fb950', marginBottom: '4px' }}>
                    🏆 Victory & Sector Clearance
                  </div>
                  <p style={{ fontSize: '11.5px', lineHeight: '1.5', color: '#94a3b8', margin: 0 }}>
                    Hold delivered power ≥ Target kW for the required sustained tick duration to stabilize the sector.
                    Your built infrastructure remains saved so you can revisit and inspect your creations anytime!
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'modalities' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Land Solar */}
              <div style={{
                backgroundColor: 'rgba(15, 23, 42, 0.7)',
                border: '1px solid rgba(255, 215, 0, 0.25)',
                borderRadius: '10px',
                padding: '12px 16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '18px', color: '#ffd700' }}>solar_power</span>
                    <strong style={{ fontSize: '13px', color: '#ffffff' }}>Land Solar ($5,000 • 200 kW rated)</strong>
                  </div>
                  <span style={{ fontSize: '10px', color: '#ffd700', fontWeight: 700, backgroundColor: 'rgba(255, 215, 0, 0.12)', padding: '2px 8px', borderRadius: '4px' }}>
                    Efficiency: 20% • Maint: $2/tick
                  </span>
                </div>
                <p style={{ fontSize: '11.5px', color: '#cbd5e1', lineHeight: '1.5', margin: 0 }}>
                  <strong>How to use:</strong> Place on stable dry terrain (Sand, Grass, Stone). Requires effective soil stability ≥ 0.70.
                  Produces power proportional to instantaneous solar irradiance. Forbidden on Water and Snow peaks.
                </p>
              </div>

              {/* Floating Solar */}
              <div style={{
                backgroundColor: 'rgba(15, 23, 42, 0.7)',
                border: '1px solid rgba(0, 229, 255, 0.25)',
                borderRadius: '10px',
                padding: '12px 16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '18px', color: '#00e5ff' }}>wb_sunny</span>
                    <strong style={{ fontSize: '13px', color: '#ffffff' }}>Floating Solar ($7,500 • 220 kW rated)</strong>
                  </div>
                  <span style={{ fontSize: '10px', color: '#00e5ff', fontWeight: 700, backgroundColor: 'rgba(0, 229, 255, 0.12)', padding: '2px 8px', borderRadius: '4px' }}>
                    Efficiency: 22% (+10% Cooling Bonus)
                  </span>
                </div>
                <p style={{ fontSize: '11.5px', color: '#cbd5e1', lineHeight: '1.5', margin: 0 }}>
                  <strong>How to use:</strong> Build directly onto calm water or lake cells. Receives water evaporative cooling yield boost.
                  <strong>Constraint:</strong> Maximum river velocity cannot exceed 1.5 m/s (high velocity currents destabilize pontoons).
                </p>
              </div>

              {/* Wind Turbine */}
              <div style={{
                backgroundColor: 'rgba(15, 23, 42, 0.7)',
                border: '1px solid rgba(56, 139, 253, 0.25)',
                borderRadius: '10px',
                padding: '12px 16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '18px', color: '#38bdf8' }}>wind_power</span>
                    <strong style={{ fontSize: '13px', color: '#ffffff' }}>Wind Turbine ($12,000 • 500 kW rated)</strong>
                  </div>
                  <span style={{ fontSize: '10px', color: '#38bdf8', fontWeight: 700, backgroundColor: 'rgba(56, 139, 253, 0.12)', padding: '2px 8px', borderRadius: '4px' }}>
                    Betz Efficiency: 45% • Maint: $8/tick
                  </span>
                </div>
                <p style={{ fontSize: '11.5px', color: '#cbd5e1', lineHeight: '1.5', margin: 0 }}>
                  <strong>How to use:</strong> Exploits wind kinetic energy (power scales with wind velocity cubed). Must maintain at least <strong>2-tile spacing</strong> from neighboring turbines.
                  Rotate yaw orientation with the <kbd style={{ backgroundColor: '#1e293b', padding: '1px 5px', borderRadius: '3px', border: '1px solid #475569' }}>R</kbd> key to align with wind direction.
                  Avoid placing in leeward mountain wind shadows!
                </p>
              </div>

              {/* Hydro Turbine */}
              <div style={{
                backgroundColor: 'rgba(15, 23, 42, 0.7)',
                border: '1px solid rgba(168, 85, 247, 0.25)',
                borderRadius: '10px',
                padding: '12px 16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '18px', color: '#c084fc' }}>waves</span>
                    <strong style={{ fontSize: '13px', color: '#ffffff' }}>Hydro Turbine ($20,000 • 800 kW rated)</strong>
                  </div>
                  <span style={{ fontSize: '10px', color: '#c084fc', fontWeight: 700, backgroundColor: 'rgba(168, 85, 247, 0.12)', padding: '2px 8px', borderRadius: '4px' }}>
                    Hydraulic Efficiency: 85% • Maint: $12/tick
                  </span>
                </div>
                <p style={{ fontSize: '11.5px', color: '#cbd5e1', lineHeight: '1.5', margin: 0 }}>
                  <strong>How to use:</strong> Build on river cells with flow rate Q ≥ 1.0 m³/s. Generates steady baseline power independent of day/night cycles.
                  Density cap forbids directly adjacent hydro installations.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'grid' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{
                backgroundColor: 'rgba(0, 229, 255, 0.08)',
                border: '1px solid rgba(0, 229, 255, 0.25)',
                borderRadius: '10px',
                padding: '14px 16px'
              }}>
                <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#00e5ff', margin: '0 0 6px 0' }}>
                  🔌 High-Voltage Cable Conduits ($100 / cell)
                </h3>
                <p style={{ fontSize: '12px', lineHeight: '1.6', color: '#cbd5e1', margin: 0 }}>
                  From Level 6 onward, power generated by machines must physically reach the designated <strong>Demand Zone intake tiles</strong> through high-voltage conduits.
                  Generators not connected via an unbroken cable path deliver 0 kW and earn no revenue!
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{
                  backgroundColor: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '10px',
                  padding: '12px 14px'
                }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#38bdf8', marginBottom: '4px' }}>
                    📍 How to Route Conduits
                  </div>
                  <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '11.5px', color: '#94a3b8', lineHeight: '1.5' }}>
                    <li>Select the <strong>Conduit Tool</strong> in the bottom dock.</li>
                    <li>Click individual cells or drag across multiple cells to create a path.</li>
                    <li>Terminals must touch the glowing <strong>⚡ DEMAND INTAKE</strong> tiles.</li>
                    <li>You can place turbines and solar panels directly on top of cables!</li>
                  </ul>
                </div>

                <div style={{
                  backgroundColor: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '10px',
                  padding: '12px 14px'
                }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#ffd700', marginBottom: '4px' }}>
                    ⚡ Resistive Transmission Losses
                  </div>
                  <p style={{ fontSize: '11.5px', lineHeight: '1.5', color: '#94a3b8', margin: 0 }}>
                    Longer transmission routes incur resistive losses (approx 1.2% per cell).
                    Optimize conduit paths to keep distances minimal and prioritize high-tier demand zones ($0.15 - $0.22/kWh).
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'terrain' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{
                backgroundColor: 'rgba(139, 251, 145, 0.08)',
                border: '1px solid rgba(139, 251, 145, 0.25)',
                borderRadius: '10px',
                padding: '14px 16px'
              }}>
                <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#8bfb91', margin: '0 0 6px 0' }}>
                  🏗️ Soil Stability & Foundation Overlays
                </h3>
                <p style={{ fontSize: '12px', lineHeight: '1.6', color: '#cbd5e1', margin: 0 }}>
                  Heavy turbines and solar arrays require a solid foundation (Effective Stability ≥ 0.70).
                  Soft soils like Mud/Clay (stability 0.30) reject construction until reinforced.
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{
                  backgroundColor: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid rgba(139, 251, 145, 0.25)',
                  borderRadius: '10px',
                  padding: '12px 14px'
                }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#8bfb91', marginBottom: '4px' }}>
                    Gravel Stabilizer ($500)
                  </div>
                  <p style={{ fontSize: '11.5px', lineHeight: '1.5', color: '#94a3b8', margin: 0 }}>
                    Increases effective stability by <strong>+0.25</strong>.
                    Essential for reinforcing Sand and Mud cells before construction or cable laying.
                  </p>
                </div>

                <div style={{
                  backgroundColor: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '10px',
                  padding: '12px 14px'
                }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#e2e8f0', marginBottom: '4px' }}>
                    Stone Anchor Footing ($1,000)
                  </div>
                  <p style={{ fontSize: '11.5px', lineHeight: '1.5', color: '#94a3b8', margin: 0 }}>
                    Increases effective stability by <strong>+0.40</strong>.
                    Provides maximum geotechnical anchor support on marshland and foothills.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'environment' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{
                backgroundColor: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid rgba(255, 215, 0, 0.08)',
                borderRadius: '10px',
                padding: '12px 14px'
              }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#ffd700', marginBottom: '4px' }}>
                  ☀️ Diurnal Solar Cycles & Seasons
                </div>
                <p style={{ fontSize: '11.5px', lineHeight: '1.5', color: '#94a3b8', margin: 0 }}>
                  Sun elevation follows a strict astronomical sinusoidal curve. Peak irradiance occurs at noon (Tick 12).
                  Summer provides longest daylight hours; Winter has low solar elevation angles.
                </p>
              </div>

              <div style={{
                backgroundColor: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid rgba(56, 139, 253, 0.15)',
                borderRadius: '10px',
                padding: '12px 14px'
              }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#38bdf8', marginBottom: '4px' }}>
                  ⛰️ Mountain Orographic Winds & Wind Shadows
                </div>
                <p style={{ fontSize: '11.5px', lineHeight: '1.5', color: '#94a3b8', margin: 0 }}>
                  Wind accelerates over mountain crests due to orographic compression. However, leeward cells directly behind high ridges
                  experience severe wind shadows (up to 60% velocity drops). Use the <strong>Wind X-Ray layer</strong> to spot optimal turbine sites!
                </p>
              </div>

              <div style={{
                backgroundColor: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid rgba(168, 85, 247, 0.15)',
                borderRadius: '10px',
                padding: '12px 14px'
              }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#c084fc', marginBottom: '4px' }}>
                  ❄️ Alpine Thaw & Hydrological Surges
                </div>
                <p style={{ fontSize: '11.5px', lineHeight: '1.5', color: '#94a3b8', margin: 0 }}>
                  In high alpine sectors, sub-zero winter temperatures accumulate snowpacks. As spring arrives, thermal warming triggers
                  massive runoff surges, boosting hydro flow rate Q and turbine output exponentially.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div style={{
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          padding: '14px 24px',
          borderTop: '1px solid var(--border-subtle, #1e293b)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '11.5px',
            color: '#94a3b8',
            cursor: 'pointer'
          }}>
            <input
              type="checkbox"
              checked={autoShow}
              onChange={(e) => handleToggleAutoShow(e.target.checked)}
              style={{ cursor: 'pointer', accentColor: '#38bdf8' }}
            />
            <span>Show Rule Book on Level 1 start / reload</span>
          </label>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {onOpenCampaign && (
              <button
                onClick={() => {
                  onClose();
                  onOpenCampaign();
                }}
                style={{
                  padding: '8px 16px',
                  backgroundColor: 'rgba(56, 139, 253, 0.15)',
                  color: '#38bdf8',
                  border: '1px solid rgba(56, 139, 253, 0.35)',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Campaign Map
              </button>
            )}

            <button
              onClick={onClose}
              style={{
                padding: '9px 20px',
                backgroundColor: '#38bdf8',
                color: '#05070a',
                border: 'none',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 800,
                cursor: 'pointer',
                boxShadow: '0 0 16px rgba(56, 189, 248, 0.35)'
              }}
            >
              Enter Simulation &rarr;
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
