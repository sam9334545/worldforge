import { DeterministicPRNG } from '../src/sim/prng.ts';

// Test PRNG reproducibility
const prng1 = new DeterministicPRNG(42);
const prng2 = new DeterministicPRNG(42);

let match = true;
for (let i = 0; i < 1000; i++) {
  const v1 = prng1.next();
  const v2 = prng2.next();
  if (v1 !== v2) {
    match = false;
    console.error(`Mismatch at step ${i}: ${v1} !== ${v2}`);
    break;
  }
}

if (match) {
  console.log('✅ PRNG DETERMINISM TEST PASSED (1000 steps match perfectly)');
} else {
  process.exit(1);
}
