import type { CellState } from '../../sim/types';
import type { WorldState } from '../../sim/contracts/WorldState';

interface BasicGridRendererProps {
  worldState: WorldState;
  selectedCell: { x: number; y: number } | null;
  onSelectCell: (cell: CellState) => void;
}

export const BasicGridRenderer: React.FC<BasicGridRendererProps> = ({
  worldState,
  selectedCell,
  onSelectCell
}) => {
  const { grid, width, height } = worldState;

  // Material color scheme
  const getTerrainColor = (id: string) => {
    switch (id) {
      case 'T01': return '#2a5834'; // Grass
      case 'T02': return '#c2a649'; // Sand
      case 'T03': return '#59402b'; // Mud
      case 'T04': return '#424754'; // Stone
      case 'T05': return '#dee2ec'; // Snow
      case 'T06': return '#0072e3'; // Water
      case 'T07': return '#6e7681'; // Gravel
      default: return '#1b2027';
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
      height: '100%',
      padding: '20px'
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${width}, 54px)`,
        gridTemplateRows: `repeat(${height}, 54px)`,
        gap: '2px',
        backgroundColor: 'var(--surface-container-lowest)',
        padding: '8px',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-subtle)',
        boxShadow: 'var(--glass-shadow)'
      }}>
        {grid.flatMap((row: CellState[], y: number) =>
          row.map((cell: CellState, x: number) => {
            const isSelected = selectedCell?.x === x && selectedCell?.y === y;
            const bg = getTerrainColor(cell.baseTerrain.id);

            return (
              <div
                key={`${x}-${y}`}
                onClick={() => onSelectCell(cell)}
                style={{
                  position: 'relative',
                  backgroundColor: bg,
                  borderRadius: 'var(--radius-xs)',
                  border: isSelected ? '2px solid var(--border-active)' : '1px solid rgba(255,255,255,0.05)',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '10px',
                  color: cell.baseTerrain.id === 'T05' ? '#090f15' : '#f0f6fc',
                  fontWeight: 600,
                  transition: 'all 0.1s ease',
                  boxShadow: isSelected ? '0 0 10px rgba(88, 166, 255, 0.4)' : 'none'
                }}
                title={`[${x}, ${y}] ${cell.baseTerrain.name} (Elev: ${cell.baseTerrain.elevation})`}
              >
                {/* Elevation badge */}
                <span style={{
                  position: 'absolute',
                  top: '2px',
                  left: '3px',
                  fontSize: '9px',
                  opacity: 0.8
                }}>
                  {cell.baseTerrain.elevation}m
                </span>

                {/* Machine indicator */}
                {cell.machine && (
                  <span
                    className="material-symbols-outlined"
                    style={{
                      fontSize: '18px',
                      color: cell.machine.type === 'LandSolar' ? '#ffea79'
                        : cell.machine.type === 'WindTurbine' ? '#afc6ff'
                        : '#79c0ff'
                    }}
                  >
                    {cell.machine.type === 'LandSolar' ? 'solar_power'
                      : cell.machine.type === 'WindTurbine' ? 'mode_fan'
                      : 'water_drop'}
                  </span>
                )}

                {/* Overlay badge if present */}
                {cell.overlays.length > 0 && (
                  <span style={{
                    position: 'absolute',
                    bottom: '2px',
                    right: '3px',
                    fontSize: '8px',
                    background: 'rgba(0,0,0,0.6)',
                    padding: '0 2px',
                    borderRadius: '2px',
                    color: '#8bfb91'
                  }}>
                    {cell.overlays[0][0]}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
