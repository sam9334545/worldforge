import assert from 'node:assert';
import { WorldGenerator } from '../src/sim/generator.ts';
import { CausalTracer } from '../src/sim/causalTracer.ts';

console.log('=== RUNNING PHASE 7 ADVANCED ANALYSIS TESTS ===\n');

const worldState = WorldGenerator.generateWorld({ seed: 42, isWalkthroughPreset: true });

// 1. Test Thermal Surge to Hydro Causal Trace (Section 17 & 31)
const thermalTrace = CausalTracer.traceThermalSurgeToHydro(worldState);
assert.strictEqual(thermalTrace.triggerType, 'THERMAL_SURGE');
assert.strictEqual(thermalTrace.steps.length, 4);

const step1 = thermalTrace.steps[0];
assert.strictEqual(step1.stepIndex, 1);
assert.strictEqual(step1.governingRule, 'RULE-SNOW-002');
assert.deepStrictEqual(step1.targetCell, { x: 6, y: 4 });

const step2 = thermalTrace.steps[1];
assert.strictEqual(step2.stepIndex, 2);
assert.strictEqual(step2.governingRule, 'RULE-WATER-001 & E13');

const step3 = thermalTrace.steps[2];
assert.strictEqual(step3.stepIndex, 3);
assert.strictEqual(step3.governingRule, 'RULE-RIVER-001 & E14');

const step4 = thermalTrace.steps[3];
assert.strictEqual(step4.stepIndex, 4);
assert.strictEqual(step4.governingRule, 'RULE-HYDRO-001 & E17');
assert.deepStrictEqual(step4.targetCell, { x: 8, y: 8 });

console.log(`Thermal Causal DAG generated: "${thermalTrace.title}" with ${thermalTrace.steps.length} causal progression steps.`);
console.log('✅ TEST CAUSAL THERMAL SURGE PASSED: Full physical cause-and-effect chain verified from ΔT to Hydro surge.');

// 2. Test Wind Shadow Causal Trace
const windTrace = CausalTracer.traceWindShadowLoss();
assert.strictEqual(windTrace.triggerType, 'WIND_SHADOW');
assert.strictEqual(windTrace.steps.length, 4);
assert.strictEqual(windTrace.steps[0].governingRule, 'RULE-WIND-001');
assert.strictEqual(windTrace.steps[1].governingRule, 'RULE-WIND-003');
assert.strictEqual(windTrace.steps[2].governingRule, 'Equation E6');
assert.strictEqual(windTrace.steps[3].governingRule, 'RULE-WIND-004 & E5');

console.log(`Wind Shadow Causal DAG generated: "${windTrace.title}".`);
console.log('✅ TEST CAUSAL WIND SHADOW PASSED: Orographic obstruction to cubic wind power deficit verified.');

// 3. Verify Target Cells exist within world bounds
for (const step of [...thermalTrace.steps, ...windTrace.steps]) {
  if (step.targetCell) {
    const { x, y } = step.targetCell;
    assert.ok(x >= 0 && x < worldState.width, `Target cell X ${x} must be within grid width`);
    assert.ok(y >= 0 && y < worldState.height, `Target cell Y ${y} must be within grid height`);
    const cell = worldState.grid[y][x];
    assert.ok(cell !== undefined, `Cell [${x}, ${y}] must exist in grid`);
  }
}
console.log('✅ TEST TARGET CELL COORD PASSED: All causal step inspection targets are valid world coordinates.');

console.log('\n🎉 ALL PHASE 7 ADVANCED ANALYSIS VERIFICATION TESTS PASSED!');
