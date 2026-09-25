/** Small deterministic random helpers so the world is identical on every load. */

/** mulberry32: fast 32-bit seeded PRNG returning floats in [0, 1). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer hash of 2 ints -> [0,1). Stable, order dependent. */
export function hash2(x: number, y: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function hash1(x: number): number {
  return hash2(x, 0x9e3779b9);
}

/** Random in [a, b). */
export const range = (r: () => number, a: number, b: number) => a + (b - a) * r();

/** Pick an element. */
export const pick = <T>(r: () => number, arr: readonly T[]): T => arr[Math.floor(r() * arr.length) % arr.length];
