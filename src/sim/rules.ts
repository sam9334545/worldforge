/**
 * Placement Validation and Overlay Rules Engine
 * Sections 15, 16, 22 of energy-ecosystem-spec.md
 * Master Compatibility Matrices G & H
 * Rules: RULE-PLACE-001..008, RULE-OVERLAY-001
 */

import { CONFIGURABLE_PARAMS, MACHINE_CONFIGS } from './constants.ts';
import type { CellState, MachineType, OverlayType } from './types.ts';
import type { WorldState } from './contracts/WorldState.ts';
import type { ValidationResult } from './contracts/SimulationStepResult.ts';

export class PlacementEngine {
  /**
   * Section 15: CAN_PLACE(machine, cell, worldState) -> VALID | INVALID(reason)
   * Fail-fast 8-stage sequential validation.
   */
  public static canPlace(
    machineType: MachineType,
    cell: CellState,
    worldState: WorldState,
    _requireGridConnection = false
  ): ValidationResult {
    const config = MACHINE_CONFIGS[machineType];
    if (!config) {
      return { valid: false, reason: `Unknown machine type: ${machineType}` };
    }

    // Check if a machine already occupies this cell
    if (cell.machine && machineType !== 'Cable') {
      return {
        valid: false,
        reason: `Cell [${cell.x}, ${cell.y}] is already occupied by a ${cell.machine.type}.`,
        failedCheckIndex: 0,
        firstFailingRule: 'RULE-PLACE-000'
      };
    }

    // CHECK 1: Terrain Compatibility (Master Matrix G)
    const allowed = cell.baseTerrain.allowedMachines.includes(machineType);
    if (!allowed) {
      if (cell.baseTerrain.id === 'T05' && (machineType === 'LandSolar' || machineType === 'FloatSolar')) {
        return {
          valid: false,
          failedCheckIndex: 1,
          firstFailingRule: 'RULE-PLACE-001',
          reason: `Solar is forbidden on Snow/Peak due to low sun-angle incidence and snow accumulation.`
        };
      }
      if (cell.baseTerrain.id === 'T06' && machineType === 'LandSolar') {
        return {
          valid: false,
          failedCheckIndex: 1,
          firstFailingRule: 'RULE-PLACE-001',
          reason: `Land Solar cannot be placed directly on Water (requires dry terrain).`
        };
      }
      if (cell.baseTerrain.id !== 'T06' && machineType === 'HydroTurbine') {
        return {
          valid: false,
          failedCheckIndex: 1,
          firstFailingRule: 'RULE-PLACE-001',
          reason: `Hydro Turbine requires a Water/River cell.`
        };
      }
      return {
        valid: false,
        failedCheckIndex: 1,
        firstFailingRule: 'RULE-PLACE-001',
        reason: `${machineType} is not permitted on ${cell.baseTerrain.name} terrain.`
      };
    }

    // CHECK 2: Overlay Compatibility (Master Matrix H)
    for (const overlay of cell.overlays) {
      if (cell.baseTerrain.forbiddenOverlays.includes(overlay)) {
        return {
          valid: false,
          failedCheckIndex: 2,
          firstFailingRule: 'RULE-PLACE-002',
          reason: `Overlay ${overlay} conflicts with ${cell.baseTerrain.name}.`
        };
      }
    }

    // CHECK 3: Effective Stability Requirement (Section 15 check #3, RULE-PLACE-003)
    // Solar and Wind require effective stability >= 0.70
    const effectiveStability = cell.derived.effectiveStability;
    if (effectiveStability < config.minStability) {
      const terrainNote = cell.overlays.length > 0 ? `reinforced with ${cell.overlays.join('+')}` : `unreinforced ${cell.baseTerrain.name}`;
      return {
        valid: false,
        failedCheckIndex: 3,
        firstFailingRule: 'RULE-PLACE-003',
        reason: `${machineType} requires stability >= ${config.minStability.toFixed(2)}, cell has ${effectiveStability.toFixed(2)} (${terrainNote}). Reinforce with Gravel first.`
      };
    }

    // CHECK 4: Water Compatibility & Velocity (RULE-PLACE-004 & RULE-PLACE-006)
    if (machineType === 'FloatSolar') {
      if (cell.baseTerrain.id !== 'T06') {
        return {
          valid: false,
          failedCheckIndex: 4,
          firstFailingRule: 'RULE-PLACE-004',
          reason: `Floating Solar requires a Water/Lake cell.`
        };
      }
      // Velocity check
      const maxVel = CONFIGURABLE_PARAMS.V_float_max;
      if (cell.dynamic.velocity > maxVel) {
        return {
          valid: false,
          failedCheckIndex: 4,
          firstFailingRule: 'RULE-PLACE-006',
          reason: `Floating solar exceeds maximum supported water velocity (${cell.dynamic.velocity.toFixed(2)} m/s > ${maxVel} m/s). Fast currents would destabilize platform.`
        };
      }
    }

    if (machineType === 'HydroTurbine') {
      if (cell.dynamic.flowRateQ < 1.0) {
        return {
          valid: false,
          failedCheckIndex: 4,
          firstFailingRule: 'RULE-PLACE-004',
          reason: `Hydro Turbine requires sufficient water flow (flowRate Q >= 1.0 m³/s, current is ${cell.dynamic.flowRateQ.toFixed(1)} m³/s).`
        };
      }
    }

    // CHECK 5: Slope / Elevation Clearance
    // Cannot place on extreme cliffs (elevation difference with neighbors > 2)
    const { grid, width, height } = worldState;
    const neighbors = [
      { dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }
    ];
    let maxSlopeDiff = 0;
    for (const n of neighbors) {
      const nx = cell.x + n.dx;
      const ny = cell.y + n.dy;
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const diff = Math.abs(grid[ny][nx].baseTerrain.elevation - cell.baseTerrain.elevation);
        maxSlopeDiff = Math.max(maxSlopeDiff, diff);
      }
    }
    if (maxSlopeDiff > 3) {
      return {
        valid: false,
        failedCheckIndex: 5,
        firstFailingRule: 'RULE-PLACE-005',
        reason: `Slope too steep for construction (elevation gradient delta ${maxSlopeDiff} exceeds threshold).`
      };
    }

    // CHECK 6: Machine Wake / Spacing (Turbine clearance)
    if (machineType === 'WindTurbine') {
      for (const n of neighbors) {
        const nx = cell.x + n.dx;
        const ny = cell.y + n.dy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          if (grid[ny][nx].machine?.type === 'WindTurbine') {
            return {
              valid: false,
              failedCheckIndex: 6,
              firstFailingRule: 'RULE-PLACE-006',
              reason: `Wind turbine wake interference: adjacent cell [${nx}, ${ny}] already hosts a turbine.`
            };
          }
        }
      }
    }

    // CHECK 7: Neighbor density for Hydro
    if (machineType === 'HydroTurbine') {
      for (const n of neighbors) {
        const nx = cell.x + n.dx;
        const ny = cell.y + n.dy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          if (grid[ny][nx].machine?.type === 'HydroTurbine') {
            return {
              valid: false,
              failedCheckIndex: 7,
              firstFailingRule: 'RULE-PLACE-007',
              reason: `Hydro density cap exceeded: neighboring water cell [${nx}, ${ny}] already has a hydro installation.`
            };
          }
        }
      }
    }

    // All checks passed!
    return { valid: true };
  }

  /**
   * Validates overlay placement (RULE-OVERLAY-001, Master Matrix H)
   */
  public static canReinforce(overlayType: OverlayType, cell: CellState): ValidationResult {
    // Water and Snow cannot be reinforced with Gravel
    if (cell.baseTerrain.id === 'T05' || cell.baseTerrain.id === 'T06') {
      return {
        valid: false,
        reason: `Cannot place ${overlayType} overlay on ${cell.baseTerrain.name}.`
      };
    }

    // Check if cell already has this overlay
    if (cell.overlays.includes(overlayType)) {
      return {
        valid: false,
        reason: `Cell already has a ${overlayType} overlay.`
      };
    }

    // Gravel can overlay Grass, Sand, Mud, Stone (Matrix H)
    if (overlayType === 'Gravel') {
      return { valid: true };
    }

    // Stone can overlay Mud after Gravel (Tier 2 reinforcement)
    if (overlayType === 'Stone') {
      if (!cell.overlays.includes('Gravel') && cell.baseTerrain.id === 'T03') {
        return {
          valid: false,
          reason: `Stone reinforcement on Mud requires Gravel base overlay first.`
        };
      }
      return { valid: true };
    }

    return { valid: true };
  }
}
