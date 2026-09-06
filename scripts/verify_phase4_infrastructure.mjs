import { WorldGenerator } from '../src/sim/generator.ts';
import { PlacementEngine } from '../src/sim/rules.ts';
import { SimulationEngine } from '../src/sim/engine.ts';
import { MASTER_TERRAIN_TABLE } from '../src/sim/constants.ts';

console.log('=== RUNNING PHASE 4 INFRASTRUCTURE & PLACEMENT TESTS ===\n');

const world = WorldGenerator.generateWorld({ seed: 42, isWalkthroughPreset: true });
const engine = new SimulationEngine(world);

// 1. Placement on Unreinforced Mud (RULE-PLACE-003, Test Case 12 & 13)
{
  // Place a Mud cell at [2, 8]
  const mudCell = world.grid[8][2];
  mudCell.baseTerrain = { ...MASTER_TERRAIN_TABLE['T03'] };
  mudCell.derived.effectiveStability = mudCell.baseTerrain.stability;
  mudCell.overlays = [];
  mudCell.machine = null;

  const result = PlacementEngine.canPlace('WindTurbine', mudCell, world);
  console.log(`Placement on unreinforced Mud: valid=${result.valid}, reason="${result.reason}"`);

  if (!result.valid && result.firstFailingRule === 'RULE-PLACE-003') {
    console.log('✅ TEST 12 PASSED: Placement on unreinforced Mud rejected with exact stability requirement.');
  } else {
    console.error('❌ TEST 12 FAILED: Expected rejection due to stability < 0.70');
    process.exit(1);
  }

  // Reinforce with Gravel overlay
  const reinforceGravel = PlacementEngine.canReinforce('Gravel', mudCell);
  if (reinforceGravel.valid) {
    mudCell.overlays.push('Gravel');
    mudCell.derived.effectiveStability += 0.25; // now 0.55
  }

  // Try placing wind turbine again (0.55 < 0.70, still invalid)
  const resultAfterGravel = PlacementEngine.canPlace('WindTurbine', mudCell, world);
  if (!resultAfterGravel.valid && mudCell.derived.effectiveStability === 0.55) {
    console.log('✅ 1-TIER REINFORCEMENT TEST PASSED: Stability raised to 0.55, still correctly requires >= 0.70.');
  } else {
    console.error('❌ 1-TIER TEST FAILED');
    process.exit(1);
  }

  // Tier 2 reinforcement (+Stone overlay -> 0.55 + 0.40 = 0.95)
  mudCell.overlays.push('Stone');
  mudCell.derived.effectiveStability += 0.40;
  const resultAfterTier2 = PlacementEngine.canPlace('WindTurbine', mudCell, world);
  if (resultAfterTier2.valid) {
    console.log('✅ TEST 13 PASSED: Reinforced Mud (Tier 2 stability 0.95) successfully clears placement threshold!');
  } else {
    console.error('❌ TEST 13 FAILED: Placement should succeed after 2-tier reinforcement.');
    process.exit(1);
  }
}

// 2. Floating Solar Velocity Limit (RULE-PLACE-006, Test Case 14)
{
  const riverCell = world.grid[6][7]; // Water cell
  riverCell.dynamic.velocity = 2.5; // Exceeds V_float_max (1.5 m/s)
  const result = PlacementEngine.canPlace('FloatSolar', riverCell, world);
  console.log(`Floating solar on fast river (v=2.5 m/s): valid=${result.valid}, reason="${result.reason}"`);

  if (!result.valid && result.firstFailingRule === 'RULE-PLACE-006') {
    console.log('✅ TEST 14 PASSED: Floating solar rejected on fast river exceeding V_float_max.');
  } else {
    console.error('❌ TEST 14 FAILED: Expected rejection for velocity > V_float_max');
    process.exit(1);
  }
}

// 3. Land Solar on Water rejection
{
  const riverCell = world.grid[6][7];
  const result = PlacementEngine.canPlace('LandSolar', riverCell, world);
  if (!result.valid) {
    console.log('✅ LAND SOLAR ON WATER TEST PASSED: Land solar rejected on water.');
  } else {
    console.error('❌ Expected rejection of LandSolar on water');
    process.exit(1);
  }
}

// 4. Engine Action Application Test (Engine deducts cash, places machine)
{
  const initialCash = world.economy.cash;
  const testCell = world.grid[2][5]; // Grass cell, stable 0.70
  testCell.machine = null;

  const actionResult = engine.step({
    type: 'PLACE',
    machineType: 'LandSolar',
    x: 5,
    y: 2,
    orientation: 180,
  });

  const finalCash = engine.getState().economy.cash;
  const cumulativeCost = engine.getState().economy.cumulativeCost;
  console.log(`Initial Cash: $${initialCash}, Final Cash: $${finalCash} (Tick revenue earned, build cost $5000 deducted)`);

  if (actionResult.validationResult?.valid && testCell.machine?.type === 'LandSolar' && cumulativeCost >= 5000) {
    console.log('✅ ENGINE ACTION TEST PASSED: Simulation engine validated placement, deducted build cost, and placed machine on cell.');
  } else {
    console.error('❌ ENGINE ACTION TEST FAILED');
    process.exit(1);
  }
}

console.log('\n🎉 ALL PHASE 4 INFRASTRUCTURE & PLACEMENT TESTS PASSED!');
