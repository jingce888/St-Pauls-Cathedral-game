import { smoothstep } from "../core/math";

/**
 * The ground. Three layers of detail:
 *  - an 8 m heightmap over ±4 km generated from OpenStreetMap (tools/osm/build.mjs): Ludgate Hill
 *    falling to the Thames, the Fleet and Walbrook valleys, the river bed;
 *  - the London basin beyond it: the hills on the horizon from the Golden Gallery (Hampstead,
 *    Highgate, Alexandra Palace, Crystal Palace, Shooter's Hill...) as smooth bumps;
 *  - the churchyard itself, pinned to the levels of the cathedral's steps with a few radial basis
 *    functions: the north churchyard at +0.3 (twelve steps), the west forecourt at -0.8 (22 steps),
 *    the south churchyard at -1.55 where the ground falls away towards the river.
 * y = 0 is the level of the north churchyard, roughly 17 m above Ordnance Datum.
 */

/** Churchyard design levels [x, z, y]. */
const ANCHORS: [number, number, number][] = [
  // west forecourt: foot of the west steps, falling gently to Ludgate Hill
  [-97.2, -22, -0.8], [-97.2, -11, -0.8], [-97.2, 0, -0.8], [-97.2, 11, -0.8], [-97.2, 22, -0.8],
  [-110, -26, -0.84], [-110, 0, -0.86], [-110, 26, -0.92],
  [-126, -22, -1.0], [-126, 12, -1.08],
  // north churchyard and the foot of the north portico's round steps
  [-11.9, -36.1, 0.3], [-8.4, -44.6, 0.3], [0, -48.2, 0.3], [8.4, -44.6, 0.3], [11.9, -36.1, 0.3],
  [-38, -41, 0.3], [-64, -42, 0.22], [34, -41, 0.3], [58, -40, 0.25],
  [-90, -33, -0.35],
  // east end
  [76, -22, 0.12], [82, 0, -0.35], [76, 21, -0.95],
  // south churchyard: foot of the terrace flights
  [-14.6, 44.4, -1.55], [14.6, 44.4, -1.55], [0, 50.8, -1.62],
  [-36, 42, -1.42], [-62, 42, -1.3], [36, 42, -1.5], [60, 40, -1.3],
  [-90, 33, -1.12],
];

/** Hills of the London basin [x, z, height, sigma] in the cathedral frame. */
const HILLS: [number, number, number, number][] = [
  [-4955, -6104, 110, 1400], // Hampstead Heath
  [-2555, -6706, 100, 1100], // Highgate
  [-1279, -9142, 78, 900], // Alexandra Palace
  [-3977, -3298, 52, 520], // Primrose Hill
  [569, 10352, 103, 1600], // Crystal Palace / Sydenham Hill
  [2417, 7201, 78, 1100], // Honor Oak, One Tree Hill
  [79, 5359, 48, 1200], // Denmark Hill
  [11738, 6403, 122, 1400], // Shooter's Hill
  [6297, 4816, 46, 900], // Greenwich Park
  [6752, 6086, 40, 1500], // Blackheath
];

const SIGMA2 = 21 * 21;
const RBF_R = 230;

export class Terrain {
  readonly water: number;
  readonly bank: number;
  private readonly h: Int16Array;
  private readonly TN: number;
  private readonly TR: number;
  private readonly TH: number;
  private readonly aw: Float64Array;

  constructor(buf: ArrayBuffer) {
    const dv = new DataView(buf);
    if (dv.getUint32(0, true) !== 0x4e525254) throw new Error("terrain.bin: bad header");
    this.TN = dv.getUint16(4, true);
    this.TR = dv.getUint16(6, true);
    this.TH = dv.getUint16(8, true);
    this.water = dv.getInt16(10, true) / 100;
    this.bank = dv.getInt16(12, true) / 100;
    this.h = new Int16Array(buf, 16, this.TN * this.TN);
    this.aw = this.solveAnchors();
  }

  static async load(url: string): Promise<Terrain> {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${url}: ${r.status}`);
    return new Terrain(await r.arrayBuffer());
  }

  /** The 8 m heightmap, bilinear. */
  private grid(x: number, z: number): number {
    const { TN, TR, TH, h } = this;
    let fx = (x + TH) / TR, fz = (z + TH) / TR;
    fx = fx < 0 ? 0 : fx > TN - 1.001 ? TN - 1.001 : fx;
    fz = fz < 0 ? 0 : fz > TN - 1.001 ? TN - 1.001 : fz;
    const i = Math.floor(fx), j = Math.floor(fz);
    const tx = fx - i, tz = fz - j;
    const k = j * TN + i;
    const a = h[k], b = h[k + 1], c = h[k + TN], d = h[k + TN + 1];
    return ((a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz) * 0.01;
  }

  /** The London basin beyond the heightmap. */
  private basin(x: number, z: number): number {
    let y = -10 + 7 * smoothstep(1500, 7000, -z) + 3 * smoothstep(3000, 9000, z);
    for (const [hx, hz, a, s] of HILLS) {
      const dx = x - hx, dz = z - hz;
      const d2 = dx * dx + dz * dz;
      if (d2 < 9 * s * s) y += a * Math.exp(-d2 / (s * s));
    }
    return y;
  }

  /** Terrain without the churchyard design. */
  raw(x: number, z: number): number {
    const e = Math.max(Math.abs(x), Math.abs(z));
    if (e < 3400) return this.grid(x, z);
    const w = smoothstep(3400, 3950, e);
    if (w >= 1) return this.basin(x, z);
    return this.grid(x, z) * (1 - w) + this.basin(x, z) * w;
  }

  /** Final ground height at (x, z). */
  height(x: number, z: number): number {
    let y = this.raw(x, z);
    if (x > -RBF_R && x < RBF_R && z > -RBF_R && z < RBF_R) {
      const aw = this.aw;
      for (let i = 0; i < ANCHORS.length; i++) {
        const dx = x - ANCHORS[i][0], dz = z - ANCHORS[i][1];
        const d2 = dx * dx + dz * dz;
        if (d2 < 16 * SIGMA2) y += aw[i] * Math.exp(-d2 / SIGMA2);
      }
    }
    return y;
  }

  /** Surface normal from central differences. */
  normal(x: number, z: number, out: [number, number, number] = [0, 1, 0], e = 1): [number, number, number] {
    const dx = this.height(x + e, z) - this.height(x - e, z);
    const dz = this.height(x, z + e) - this.height(x, z - e);
    const nx = -dx, ny = 2 * e, nz = -dz;
    const l = Math.hypot(nx, ny, nz);
    out[0] = nx / l;
    out[1] = ny / l;
    out[2] = nz / l;
    return out;
  }

  /** Solves for the RBF weights so the ground passes through every anchor. */
  private solveAnchors(): Float64Array {
    const n = ANCHORS.length;
    const A = new Float64Array(n * n), b = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const [xi, zi, yi] = ANCHORS[i];
      b[i] = yi - this.raw(xi, zi);
      for (let j = 0; j < n; j++) {
        const dx = xi - ANCHORS[j][0], dz = zi - ANCHORS[j][1];
        A[i * n + j] = Math.exp(-(dx * dx + dz * dz) / SIGMA2) + (i === j ? 1e-4 : 0);
      }
    }
    // Gaussian elimination with partial pivoting
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(A[r * n + c]) > Math.abs(A[p * n + c])) p = r;
      if (p !== c) {
        for (let k = 0; k < n; k++) [A[c * n + k], A[p * n + k]] = [A[p * n + k], A[c * n + k]];
        [b[c], b[p]] = [b[p], b[c]];
      }
      const d = A[c * n + c];
      for (let r = c + 1; r < n; r++) {
        const f = A[r * n + c] / d;
        if (f === 0) continue;
        for (let k = c; k < n; k++) A[r * n + k] -= f * A[c * n + k];
        b[r] -= f * b[c];
      }
    }
    const w = new Float64Array(n);
    for (let r = n - 1; r >= 0; r--) {
      let s = b[r];
      for (let k = r + 1; k < n; k++) s -= A[r * n + k] * w[k];
      w[r] = s / A[r * n + r];
    }
    return w;
  }
}
