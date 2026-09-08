/**
 * Cable-route reconstruction, for drawing only.
 *
 * Lifted out of the deleted local simulation because the renderer needs to draw
 * the route a generator's power takes. The BFS itself was correct; the defect in
 * the old engine was that its dispatch never used it, pricing transmission loss
 * off straight-line distance instead. Nothing here computes physics -- it walks
 * the cable graph the Python engine reported.
 */

import type { CellState, DemandZone } from '../sim/types';

export function findCablePath(
    startX: number,
    startY: number,
    grid: CellState[][],
    width: number,
    height: number,
    targetDemandZone: DemandZone
): Array<{ x: number; y: number }> | null {
    if (!targetDemandZone || !targetDemandZone.cells || !targetDemandZone.cells.length) return null;

    // Check if directly adjacent
    for (const dz of targetDemandZone.cells) {
      if (Math.abs(startX - dz.x) + Math.abs(startY - dz.y) <= 1) {
        return [{ x: startX, y: startY }, { x: dz.x, y: dz.y }];
      }
    }

    const parent = new Map<string, { x: number; y: number }>();
    const queue: Array<{ x: number; y: number }> = [];
    const visited = new Set<string>();

    const startKey = `${startX},${startY}`;
    visited.add(startKey);

    if (grid[startY][startX].cable) {
      queue.push({ x: startX, y: startY });
    } else {
      const dirs = [{ dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }];
      for (const d of dirs) {
        const nx = startX + d.dx;
        const ny = startY + d.dy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height && grid[ny][nx].cable) {
          const nKey = `${nx},${ny}`;
          visited.add(nKey);
          parent.set(nKey, { x: startX, y: startY });
          queue.push({ x: nx, y: ny });
        }
      }
    }

    let endPt: { x: number; y: number } | null = null;
    while (queue.length > 0) {
      const curr = queue.shift()!;

      for (const dz of targetDemandZone.cells) {
        if (Math.abs(curr.x - dz.x) + Math.abs(curr.y - dz.y) <= 1) {
          endPt = { x: dz.x, y: dz.y };
          parent.set(`${dz.x},${dz.y}`, curr);
          break;
        }
      }
      if (endPt) break;

      const dirs = [{ dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }];
      for (const d of dirs) {
        const nx = curr.x + d.dx;
        const ny = curr.y + d.dy;
        const nKey = `${nx},${ny}`;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height && !visited.has(nKey)) {
          if (grid[ny][nx].cable) {
            visited.add(nKey);
            parent.set(nKey, curr);
            queue.push({ x: nx, y: ny });
          }
        }
      }
    }

    if (!endPt) return null;

    // Reconstruct backwards
    const path: Array<{ x: number; y: number }> = [];
    let currKey = `${endPt.x},${endPt.y}`;
    path.unshift(endPt);

    while (parent.has(currKey)) {
      const p = parent.get(currKey)!;
      path.unshift(p);
      currKey = `${p.x},${p.y}`;
      if (p.x === startX && p.y === startY) break;
    }

    return path;
  }
