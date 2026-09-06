/**
 * Phase 1 Determinism Verification Test
 */

import { WorldGenerator } from '../generator';
import { computeStateHash } from '../stateHash';

export function runPhase1Verification(): { success: boolean; hash1: string; hash2: string; message: string } {
  const world1 = WorldGenerator.generateWorld({ seed: 42 });
  const hash1 = computeStateHash(world1);
  world1.stateHash = hash1;

  const world2 = WorldGenerator.generateWorld({ seed: 42 });
  const hash2 = computeStateHash(world2);
  world2.stateHash = hash2;

  const match = hash1 === hash2;
  const message = match
    ? `VERIFICATION PASSED: Deterministic state hash matches (${hash1}) across independent runs.`
    : `VERIFICATION FAILED: Hash mismatch (${hash1} !== ${hash2})`;

  return {
    success: match,
    hash1,
    hash2,
    message
  };
}
