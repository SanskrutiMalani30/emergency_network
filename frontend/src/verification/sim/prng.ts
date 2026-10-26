/**
 * RESQMesh — Seeded PRNG for Deterministic Protocol Simulation
 * Mulberry32 implementation: fast, high quality 32-bit state generator.
 * Produces 100% reproducible test scenarios, attack vectors, and evaluation runs.
 */

export class PRNG {
  private state: number;

  constructor(seed: number | string = 1337) {
    this.state = typeof seed === 'string' ? PRNG.hashString(seed) : seed >>> 0;
    if (this.state === 0) this.state = 0x6d2b79f5;
  }

  /**
   * Hashes a string seed to a 32-bit unsigned integer using FNV-1a.
   */
  public static hashString(str: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  /**
   * Returns a uniform pseudo-random float in [0, 1).
   */
  public next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Returns a uniform pseudo-random integer in [min, max] inclusive.
   */
  public nextInt(min: number, max: number): number {
    const lo = Math.ceil(min);
    const hi = Math.floor(max);
    return Math.floor(this.next() * (hi - lo + 1)) + lo;
  }

  /**
   * Returns a uniform pseudo-random float in [min, max).
   */
  public nextFloat(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /**
   * Returns a normally distributed value using Box-Muller transform.
   */
  public nextGaussian(mean: number = 0, stdDev: number = 1): number {
    let u1 = this.next();
    let u2 = this.next();
    // Avoid 0 to prevent log(0)
    while (u1 <= 1e-15) u1 = this.next();
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return mean + z0 * stdDev;
  }

  /**
   * Picks a random element from an array.
   */
  public choice<T>(arr: T[]): T {
    if (arr.length === 0) throw new Error('Cannot pick from empty array');
    const idx = Math.floor(this.next() * arr.length);
    return arr[idx];
  }

  /**
   * Samples k distinct elements without replacement.
   */
  public sample<T>(arr: T[], k: number): T[] {
    const copy = [...arr];
    const n = copy.length;
    const count = Math.min(k, n);
    for (let i = 0; i < count; i++) {
      const j = i + Math.floor(this.next() * (n - i));
      const temp = copy[i];
      copy[i] = copy[j];
      copy[j] = temp;
    }
    return copy.slice(0, count);
  }

  /**
   * Fisher-Yates array shuffle (returns new array).
   */
  public shuffle<T>(arr: T[]): T[] {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const temp = copy[i];
      copy[i] = copy[j];
      copy[j] = temp;
    }
    return copy;
  }

  /**
   * Returns a boolean with probability `p` of being true.
   */
  public bool(p: number = 0.5): boolean {
    return this.next() < p;
  }

  /**
   * Derives a child PRNG from this instance's current stream.
   */
  public fork(childOffset?: number | string): PRNG {
    const derivedSeed = (this.state + (childOffset ? (typeof childOffset === 'string' ? PRNG.hashString(childOffset) : childOffset) : 0xdeadbeef)) ^ Math.imul(this.nextInt(1, 0xffff), 0x5bd1e995);
    return new PRNG(derivedSeed >>> 0);
  }
}
