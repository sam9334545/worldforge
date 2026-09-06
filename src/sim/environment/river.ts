/**
 * River Flow Simulation Engine
 * Section 12 & 22 of energy-ecosystem-spec.md
 * Rules: RULE-RIVER-001, RULE-HYDRO-001
 * Equations: E14, E15, E16, E17
 */

import type { CellState } from '../types.ts';

export class RiverEngine {
  /**
   * Updates river cells in downstream topological order:
   * 1. Routes runoff from surrounding land cells into water cells
   * 2. Sums flow from upstream water cells
   * 3. Calculates Q, waterLevel, and flow velocity = Q / (w * d)
   */
  public static updateRiverFlow(
    grid: CellState[][],
    width: number,
    height: number,
    runoffInflow: Map<string, number>,
    baseflowMultiplier = 1.0
  ): void {
    // 1. Collect all water cells
    const waterCells: Array<{ x: number; y: number; cell: CellState }> = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const cell = grid[y][x];
        if (cell.baseTerrain.id === 'T06') {
          waterCells.push({ x, y, cell });
        }
      }
    }

    if (waterCells.length === 0) return;

    // 2. Sort water cells in topological order: higher waterLevel / source first to lower downstream
    // Water level determines flow gradient
    waterCells.sort((a, b) => b.cell.dynamic.waterLevel - a.cell.dynamic.waterLevel);

    // 3. Flow propagation pass (Section 12, RULE-RIVER-001)
    for (const item of waterCells) {
      const { x, y, cell } = item;
      const key = `${x},${y}`;

      const localRunoff = runoffInflow.get(key) || 0;
      const baseflow = 12.0 * baseflowMultiplier; // nominal seasonal river baseflow

      // Inflow = baseflow + local land runoff
      let Q = baseflow + localRunoff;

      // 4-neighbor flow routing to lowest water neighbor (tie-break N > E > S > W)
      const neighbors = [
        { dx: 0, dy: -1, dir: 0 }, // N
        { dx: 1, dy: 0, dir: 1 },  // E
        { dx: 0, dy: 1, dir: 2 },  // S
        { dx: -1, dy: 0, dir: 3 }, // W
      ];

      let downstreamTarget: { x: number; y: number; dir: number } | null = null;
      let lowestWaterLevel = cell.dynamic.waterLevel;

      for (const n of neighbors) {
        const nx = x + n.dx;
        const ny = y + n.dy;

        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const neighborCell = grid[ny][nx];
          if (neighborCell.baseTerrain.id === 'T06') {
            if (neighborCell.dynamic.waterLevel < lowestWaterLevel) {
              lowestWaterLevel = neighborCell.dynamic.waterLevel;
              downstreamTarget = { x: nx, y: ny, dir: n.dir };
            }
          }
        }
      }

      if (downstreamTarget) {
        cell.dynamic.flowDirection = downstreamTarget.dir;
        // Pass flow Q to downstream neighbor
        const targetKey = `${downstreamTarget.x},${downstreamTarget.y}`;
        runoffInflow.set(targetKey, (runoffInflow.get(targetKey) || 0) + Q * 0.7);
      } else {
        cell.dynamic.flowDirection = null; // Stagnant or terminus
      }

      cell.dynamic.flowRateQ = Number(Q.toFixed(2));

      // Equation E15: velocity = Q / (channelWidth * channelDepth)
      const w = Math.max(1.0, cell.dynamic.channelWidth || 4.0);
      const d = Math.max(1.0, cell.dynamic.channelDepth || 2.0);
      const v = Q / (w * d);
      cell.dynamic.velocity = Number(v.toFixed(2));
    }
  }
}
