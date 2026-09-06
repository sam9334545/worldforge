import { WorldGenerator } from '../src/sim/generator.ts';
import { SimulationEngine } from '../src/sim/engine.ts';
import { EnergyNetworkEngine } from '../src/sim/energy/network.ts';

console.log('=== RUNNING PHASE 5 ENERGY & ECONOMY TESTS ===\n');

// 1. Energy Conservation Audit (Test Case 2)
{
  const world = WorldGenerator.generateWorld({ seed: 42, isWalkthroughPreset: true });
  const result = EnergyNetworkEngine.updateGrid(
    world.grid,
    world.width,
    world.height,
    world.demandZones,
    world.economy
  );

  console.log(`Grid Stats: Generated=${result.totalGeneratedKW} kW, Delivered=${result.totalDeliveredKW} kW, Loss=${result.totalTransmissionLossKW} kW, Curtailed=${result.totalCurtailedKW} kW`);
  console.log(`Revenue Earned: $${result.revenueEarned}, Maintenance: $${result.maintenanceCostPaid}`);

  if (result.isEnergyConserved) {
    console.log('✅ TEST 2 PASSED: Energy conservation audited! Generation = Delivered + Losses + Curtailed.');
  } else {
    console.error('❌ TEST 2 FAILED: Energy conservation violated.');
    process.exit(1);
  }
}

// 2. Revenue and Profit Audit (RULE-ECON-001, E19)
{
  const world = WorldGenerator.generateWorld({ seed: 42, isWalkthroughPreset: true });
  const engine = new SimulationEngine(world);

  const startCash = world.economy.cash;
  engine.step();
  const nextCash = engine.getState().economy.cash;
  const netDiff = nextCash - startCash;

  console.log(`Start Cash: $${startCash}, Next Cash: $${nextCash} (Net Profit: $${netDiff.toFixed(2)})`);
  if (nextCash > startCash) {
    console.log('✅ REVENUE & PROFIT TEST PASSED: Delivered power converted to cash minus maintenance expenses.');
  } else {
    console.error('❌ REVENUE TEST FAILED');
    process.exit(1);
  }
}

// 3. Machine Degradation and End-of-Life Shutdown (RULE-ECON-002, Test Case 15)
{
  const world = WorldGenerator.generateWorld({ seed: 42, isWalkthroughPreset: true });
  const solarCell = world.grid[1][1]; // Land solar
  solarCell.machine.ageTicks = solarCell.machine.lifespanTicks; // Fast-forward to end of life

  const engine = new SimulationEngine(world);
  engine.step();

  console.log(`Solar Machine Age: ${solarCell.machine.ageTicks}, Health: ${solarCell.machine.health}, Operating: ${solarCell.machine.isOperating}`);

  if (solarCell.machine.health <= 0 && !solarCell.machine.isOperating && solarCell.derived.powerGenerated === 0) {
    console.log('✅ TEST 15 PASSED: Machine at end-of-life automatically retires and output forces to exactly 0.');
  } else {
    console.error('❌ TEST 15 FAILED: Retired machine continued generating.');
    process.exit(1);
  }
}

console.log('\n🎉 ALL PHASE 5 ENERGY & ECONOMY TESTS PASSED!');
