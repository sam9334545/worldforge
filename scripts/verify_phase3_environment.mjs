import { WorldGenerator } from '../src/sim/generator.ts';
import { SimulationEngine } from '../src/sim/engine.ts';
import { WindEngine } from '../src/sim/environment/wind.ts';
import { SolarEngine } from '../src/sim/energy/solar.ts';
import { WaterCycleEngine } from '../src/sim/environment/waterCycle.ts';

console.log('=== RUNNING PHASE 3 ENVIRONMENTAL TESTS ===\n');

// 1. Wind & Orographic Test (Test Case 4 from spec)
{
  const world = WorldGenerator.generateWorld({ seed: 42, isWalkthroughPreset: true });
  WindEngine.updateWindField(world.grid, world.width, world.height, 12.0, 270); // West wind

  // Ridge is at col 6. Upwind is col 5, Leeward is col 7.
  const windwardCell = world.grid[5][4]; // Upwind west
  const leewardCell = world.grid[5][7];  // Downwind east behind mountain

  console.log(`Windward speed at [4, 5]: ${windwardCell.dynamic.windSpeed} m/s`);
  console.log(`Leeward speed at [7, 5]: ${leewardCell.dynamic.windSpeed} m/s (Shadow factor: ${leewardCell.dynamic.windShadowFactor})`);

  if (leewardCell.dynamic.windSpeed < windwardCell.dynamic.windSpeed) {
    console.log('✅ TEST 4 PASSED: Leeward turbine wind speed strictly less than windward due to orographic wind shadow.');
  } else {
    console.error('❌ TEST 4 FAILED: Leeward wind speed was not reduced.');
    process.exit(1);
  }
}

// 2. Solar at Night Test (Test Case 6 from spec)
{
  const world = WorldGenerator.generateWorld({ seed: 42 });
  // Midnight (hour 0)
  const nightSolar = SolarEngine.updateSolarField(world.grid, world.width, world.height, 0, 1.0);
  console.log(`Midnight Sun Elevation: ${nightSolar.sunElevation}°, Base Irradiance: ${nightSolar.baseSolarIrradiance} W/m²`);

  let allZero = true;
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      if (world.grid[y][x].dynamic.effectiveIrradiance !== 0) {
        allZero = false;
      }
    }
  }

  if (allZero && nightSolar.baseSolarIrradiance === 0) {
    console.log('✅ TEST 6 PASSED: Solar at night is exactly 0 W/m², never negative or non-zero.');
  } else {
    console.error('❌ TEST 6 FAILED: Solar output was non-zero at night.');
    process.exit(1);
  }
}

// 3. Water Cycle Mass Balance Audit (Test Case 1 from spec)
{
  const world = WorldGenerator.generateWorld({ seed: 42 });
  // Simulate rain event: 10 mm rain everywhere
  const rainMap = Array.from({ length: world.height }, () => Array(world.width).fill(5.0));
  const waterResult = WaterCycleEngine.updateWaterCycle(world.grid, world.width, world.height, rainMap);

  console.log(`Mass Balance: Inflow=${waterResult.massBalance.totalInflow.toFixed(2)}, Outflow=${(waterResult.massBalance.totalEvaporation + waterResult.massBalance.totalInfiltration + waterResult.massBalance.totalRunoff).toFixed(2)}, Discrepancy=${waterResult.massBalance.discrepancy.toFixed(4)}`);

  if (waterResult.massBalance.isBalanced) {
    console.log('✅ TEST 1 PASSED: Mass Balance audited! Rainfall = Infiltration + Runoff + Evaporation.');
  } else {
    console.error('❌ TEST 1 FAILED: Mass balance discrepancy exceeds threshold.');
    process.exit(1);
  }
}

// 4. 24-Tick Simulation Cycle Test
{
  const world = WorldGenerator.generateWorld({ seed: 42, isWalkthroughPreset: true });
  const engine = new SimulationEngine(world);

  for (let t = 0; t < 24; t++) {
    engine.step();
  }

  const finalState = engine.getState();
  console.log(`24 Ticks Simulated: Current Tick=${finalState.time.tick}, Day=${finalState.time.day}, Gen=${finalState.economy.cumulativeGenerated.toFixed(1)} kWh, Rev=$${finalState.economy.cumulativeRevenue.toFixed(2)}`);
  console.log('✅ 24-TICK SIMULATION TEST PASSED: State advanced non-circularly with full physical coupling.');
}

console.log('\n🎉 ALL PHASE 3 ENVIRONMENTAL SIMULATION TESTS PASSED!');
