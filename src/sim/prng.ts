/**
 * Seeded Deterministic PRNG Stream
 * Section 36 of energy-ecosystem-spec.md
 * 
 * Mulberry32 implementation ensuring bit-identical reproducibility
 * across different machines and browsers for identical seeds and action logs.
 */

export class DeterministicPRNG {
  private state: number;
  private readonly initialSeed: number;

  constructor(seed: number) {
    this.initialSeed = Math.floor(seed) || 42;
    this.state = this.initialSeed;
  }

  public getSeed(): number {
    return this.initialSeed;
  }

  public getState(): number {
    return this.state;
  }

  public setState(state: number): void {
    this.state = state;
  }

  /**
   * Generates a deterministic pseudorandom 32-bit float in [0, 1)
   */
  public next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  public nextInt(min: number, max: number): number {
    const r = this.next();
    return Math.floor(min + r * (max - min + 1));
  }

  public nextFloat(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /**
   * Box-Muller transform for deterministic Gaussian distribution
   */
  public nextGaussian(mean = 0, stdDev = 1): number {
    let u = 0;
    let v = 0;
    while (u === 0) u = this.next();
    while (v === 0) v = this.next();
    const num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return mean + num * stdDev;
  }
}
