/**
 * Verification Script: Level Progression System (Section 21)
 */

import { LEVEL_DEFINITIONS } from '../src/levels/LevelDefinitions.ts';
import { LevelEngine } from '../src/levels/LevelEngine.ts';
import { LevelObjectives } from '../src/levels/LevelObjectives.ts';
import { LevelProgress } from '../src/levels/LevelProgress.ts';

console.log('--- VERIFYING LEVEL PROGRESSION SYSTEM (LEVELS 1–10) ---');

// 1. Verify all 10 levels are defined
for (let i = 1; i <= 10; i++) {
  const cfg = LEVEL_DEFINITIONS[i];
  if (!cfg) {
    console.error(`❌ Level ${i} is missing from LEVEL_DEFINITIONS!`);
    process.exit(1);
  }
  console.log(`✓ Level ${i}: ${cfg.name} (${cfg.subtitle}) - Target: ${cfg.objective.targetPowerKW} kW - Grid Required: ${cfg.requireGridConnection}`);
}

// 2. Test world initialization for each level
for (let i = 1; i <= 10; i++) {
  const cfg = LEVEL_DEFINITIONS[i];
  const { worldState, engine } = LevelEngine.buildWorldForLevel(cfg);

  // Check dimensions
  if (worldState.width !== cfg.dimensions.width || worldState.height !== cfg.dimensions.height) {
    console.error(`❌ Level ${i} dimension mismatch! Expected ${cfg.dimensions.width}x${cfg.dimensions.height}, got ${worldState.width}x${worldState.height}`);
    process.exit(1);
  }

  // Check starting cash
  if (worldState.economy.cash !== cfg.startingCash) {
    console.error(`❌ Level ${i} starting cash mismatch!`);
    process.exit(1);
  }

  // Check terrain restriction
  const allowedSet = new Set(cfg.allowedTerrain);
  for (let y = 0; y < worldState.height; y++) {
    for (let x = 0; x < worldState.width; x++) {
      const tid = worldState.grid[y][x].baseTerrain.id;
      if (!allowedSet.has(tid)) {
        console.error(`❌ Level ${i} contains disallowed terrain ${tid} at (${x},${y})`);
        process.exit(1);
      }
    }
  }

  // Step simulation 1 tick
  const stepRes = engine.step();
  if (!stepRes || !stepRes.state) {
    console.error(`❌ Level ${i} simulation step failed!`);
    process.exit(1);
  }

  // Evaluate initial objective (should not be completed yet)
  const evalResult = LevelObjectives.evaluate(cfg, stepRes.state, 0);
  if (evalResult.isCompleted) {
    console.error(`❌ Level ${i} cannot be completed with 0 generation!`);
    process.exit(1);
  }
}

console.log('✓ All 10 levels instantiate clean, deterministic worlds conforming to terrain restrictions');

// 3. Test Level Objectives evaluation on simulated success
const lvl1 = LEVEL_DEFINITIONS[1];
const { worldState: testWorld } = LevelEngine.buildWorldForLevel(lvl1);
// Manually place power on cell
testWorld.grid[0][0].derived.powerGenerated = 200;

let sustained = 0;
for (let t = 0; t < 5; t++) {
  const res = LevelObjectives.evaluate(lvl1, testWorld, sustained);
  sustained = res.sustainedTicks;
}
const finalEval = LevelObjectives.evaluate(lvl1, testWorld, sustained);
if (!finalEval.isCompleted) {
  console.error(`❌ Level 1 should be completed after 5 sustained ticks of 200 kW!`);
  process.exit(1);
}
console.log('✓ Level objective sustained evaluation verified');

console.log('✅ LEVEL PROGRESSION VERIFICATION SUCCESSFUL: All 10 levels comply with Section 21!');
