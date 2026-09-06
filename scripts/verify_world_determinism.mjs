import { WorldGenerator } from '../src/sim/generator.ts';
import { computeStateHash } from '../src/sim/stateHash.ts';

const worldA = WorldGenerator.generateWorld({ seed: 42 });
const hashA = computeStateHash(worldA);

const worldB = WorldGenerator.generateWorld({ seed: 42 });
const hashB = computeStateHash(worldB);

console.log(`World A Hash: ${hashA}`);
console.log(`World B Hash: ${hashB}`);

if (hashA === hashB) {
  console.log('✅ PHASE 1 COMPLETE: Same seed produces bit-identical world state hash!');
} else {
  console.error('❌ PHASE 1 FAILED: Hash mismatch');
  process.exit(1);
}
