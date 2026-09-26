import type { V2, V3 } from "../core/math";
import { GeoBuilder, JOINT } from "./Builder";

/**
 * Carved relief as a height field over a rectangle (u to the right, v up, metres; heights are
 * the projection in front of the background). Motifs are stamped into it — rounded masses,
 * tapering tubes, leaves, bevelled plates, letters — and build() turns it into a mesh standing
 * proud of a wall, with baked cavity darkening the hollows between the forms the way soot and
 * shadow darken real carving.
 *
 * Each primitive is first drawn into a scratch layer (max-combined), then merged into the field
 * with a blend: "max" (a separate mass), "add" (detail modelled on top of a form), "sub"
 * (grooves, incised letters). group() merges several primitives as one layer.
 *
 * Primitives take local coordinates; at() pushes a 2D placement (offset, scale, rotation,
 * mirror) and a height scale/offset, so a figure can be written once in its own units.
 */

export type Blend = "max" | "add" | "sub";

interface Xf {
  // local -> field: u = a x + c y + tx, v = b x + d y + ty
  a: number; b: number; c: number; d: number; tx: number; ty: number;
  /** Height scale and base height. */
  hs: number; hz: number;
}

export interface PlaceOpts {
  s?: number;
  rot?: number;
  mirror?: boolean;
  /** Height scale relative to the length scale (1 = as deep as it is wide). */
  depth?: number;
  /** Base height (in local height units) the placed motif rises from. */
  z?: number;
}

export interface Frame {
  o: V3;
  ex: V3;
  ey: V3;
  ez: V3;
}

export class Relief {
  readonly nu: number;
  readonly nv: number;
  readonly du: number;
  readonly dv: number;
  readonly h: Float32Array;
  private L: Float32Array;
  private bb = [Infinity, Infinity, -Infinity, -Infinity];
  private grouped = false;
  private xs: Xf[] = [{ a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0, hs: 1, hz: 0 }];
  /** Smoothing passes applied at build time (0 for finely sampled small pieces). */
  soften = 1;
  /** Optional soft clip applied at build time: returns a factor 0..1 per point. */
  mask: ((u: number, v: number) => number) | null = null;

  constructor(readonly w: number, readonly ht: number, res: number) {
    this.nu = Math.max(1, Math.round(w / res));
    this.nv = Math.max(1, Math.round(ht / res));
    this.du = w / this.nu;
    this.dv = ht / this.nv;
    this.h = new Float32Array((this.nu + 1) * (this.nv + 1));
    this.L = new Float32Array(this.h.length);
  }

  // ------------------------------------------------------------------ placement

  private get X() {
    return this.xs[this.xs.length - 1];
  }

  /** Draws fn in a local frame placed at (x, y) of the current frame. */
  at(x: number, y: number, o: PlaceOpts, fn: () => void) {
    const P = this.X;
    const s = o.s ?? 1, rot = o.rot ?? 0, m = o.mirror ? -1 : 1;
    const cr = Math.cos(rot) * s, sr = Math.sin(rot) * s;
    // local basis in the parent frame
    const la = cr * m, lb = sr * m, lc = -sr, ld = cr;
    const tx = P.a * x + P.c * y + P.tx, ty = P.b * x + P.d * y + P.ty;
    this.xs.push({
      a: P.a * la + P.c * lb, b: P.b * la + P.d * lb,
      c: P.a * lc + P.c * ld, d: P.b * lc + P.d * ld,
      tx, ty,
      hs: P.hs * s * (o.depth ?? 1),
      hz: P.hz + P.hs * (o.z ?? 0),
    });
    try {
      fn();
    } finally {
      this.xs.pop();
    }
  }

  /** Merges everything drawn in fn as one layer. */
  group(blend: Blend, fn: () => void) {
    if (this.grouped) return fn();
    this.grouped = true;
    try {
      fn();
    } finally {
      this.grouped = false;
    }
    this.commit(blend);
  }

  private done(blend: Blend) {
    if (!this.grouped) this.commit(blend);
  }

  /**
   * Stamps f (local coordinates -> local height, <= 0 outside) over the local box
   * [x0, x1] x [y0, y1] into the scratch layer.
   */
  private stamp(x0: number, y0: number, x1: number, y1: number, f: (x: number, y: number) => number) {
    const X = this.X;
    let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
    for (const [x, y] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]) {
      const u = X.a * x + X.c * y + X.tx, v = X.b * x + X.d * y + X.ty;
      u0 = Math.min(u0, u); u1 = Math.max(u1, u);
      v0 = Math.min(v0, v); v1 = Math.max(v1, v);
    }
    const i0 = Math.max(0, Math.floor(u0 / this.du)), i1 = Math.min(this.nu, Math.ceil(u1 / this.du));
    const j0 = Math.max(0, Math.floor(v0 / this.dv)), j1 = Math.min(this.nv, Math.ceil(v1 / this.dv));
    if (i0 > i1 || j0 > j1) return;
    // inverse of the 2x2 part
    const det = X.a * X.d - X.b * X.c;
    const ia = X.d / det, ib = -X.b / det, ic = -X.c / det, id = X.a / det;
    const W = this.nu + 1, L = this.L;
    for (let j = j0; j <= j1; j++) {
      const v = j * this.dv - X.ty;
      for (let i = i0; i <= i1; i++) {
        const u = i * this.du - X.tx;
        const hl = f(ia * u + ic * v, ib * u + id * v);
        if (hl <= 0) continue;
        const hv = X.hz + X.hs * hl;
        const k = j * W + i;
        if (hv > L[k]) L[k] = hv;
      }
    }
    const bb = this.bb;
    bb[0] = Math.min(bb[0], i0); bb[1] = Math.min(bb[1], j0);
    bb[2] = Math.max(bb[2], i1); bb[3] = Math.max(bb[3], j1);
  }

  private commit(blend: Blend) {
    const [i0, j0, i1, j1] = this.bb;
    if (i0 > i1) return;
    const W = this.nu + 1, L = this.L, H = this.h;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = j * W + i;
        const x = L[k];
        if (x === 0) continue;
        L[k] = 0;
        if (blend === "max") H[k] = Math.max(H[k], x);
        else if (blend === "add") H[k] += x;
        else H[k] = Math.max(0, H[k] - x);
      }
    }
    this.bb = [Infinity, Infinity, -Infinity, -Infinity];
  }

  // ------------------------------------------------------------------ primitives

  /** Rounded mass: ellipse with radii rx, ry turned by rot, domed to height hgt (profile power p). */
  blob(x: number, y: number, rx: number, ry: number, hgt: number, blend: Blend = "max", rot = 0, p = 0.5) {
    const R = Math.max(rx, ry);
    const c = Math.cos(rot), s = Math.sin(rot);
    this.stamp(x - R, y - R, x + R, y + R, (lx, ly) => {
      const dx = lx - x, dy = ly - y;
      const qx = (dx * c + dy * s) / rx, qy = (-dx * s + dy * c) / ry;
      const d2 = qx * qx + qy * qy;
      return d2 >= 1 ? 0 : hgt * Math.pow(1 - d2, p);
    });
    this.done(blend);
  }

  /** Tapering tube through points [x, y, radius, height]; round in section, round ends. */
  tube(pts: [number, number, number, number][], blend: Blend = "max", p = 0.5) {
    for (let k = 0; k < pts.length - 1; k++) {
      const [ax, ay, ar, ah] = pts[k], [bx, by, br, bh] = pts[k + 1];
      const R = Math.max(ar, br);
      const ex = bx - ax, ey = by - ay, l2 = ex * ex + ey * ey || 1e-12;
      this.stamp(Math.min(ax, bx) - R, Math.min(ay, by) - R, Math.max(ax, bx) + R, Math.max(ay, by) + R, (x, y) => {
        let t = ((x - ax) * ex + (y - ay) * ey) / l2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const dx = x - ax - ex * t, dy = y - ay - ey * t;
        const r = ar + (br - ar) * t;
        const d2 = (dx * dx + dy * dy) / (r * r);
        return d2 >= 1 ? 0 : (ah + (bh - ah) * t) * Math.pow(1 - d2, p);
      });
    }
    if (pts.length === 1) this.blob(pts[0][0], pts[0][1], pts[0][2], pts[0][2], pts[0][3], blend);
    else this.done(blend);
  }

  /** A smooth tube along a polyline of [x, y] with radius and height interpolated from r0/h0 to r1/h1. */
  stroke(pts: V2[], r0: number, r1: number, h0: number, h1: number, blend: Blend = "max", p = 0.5) {
    let total = 0;
    const acc = [0];
    for (let i = 1; i < pts.length; i++) acc.push((total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])));
    this.tube(pts.map((q, i) => {
      const t = total > 0 ? acc[i] / total : 0;
      return [q[0], q[1], r0 + (r1 - r0) * t, h0 + (h1 - h0) * t];
    }), blend, p);
  }

  /**
   * Leaf: pointed ellipse from (x, y) along angle ang, length len, width wid, with a midrib
   * groove and a gentle arch along its length.
   */
  leaf(x: number, y: number, len: number, wid: number, ang: number, hgt: number, blend: Blend = "max", bend = 0) {
    const c = Math.cos(ang), s = Math.sin(ang);
    const R = len;
    this.stamp(x - R, y - R, x + R, y + R, (lx, ly) => {
      const dx = lx - x, dy = ly - y;
      const l = dx * c + dy * s;
      if (l <= 0 || l >= len) return 0;
      const t = l / len;
      let w = -dx * s + dy * c;
      w -= bend * len * t * t; // curling tip
      const hw = (wid / 2) * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.8)), 0.75);
      const q = w / hw;
      if (q * q >= 1) return 0;
      const rib = 1 - 0.3 * Math.exp(-(q * q) / 0.02);
      return hgt * Math.sqrt(1 - q * q) * (0.55 + 0.45 * Math.sin(Math.PI * t)) * rib;
    });
    this.done(blend);
  }

  /** Flat-topped plate over a polygon with a rounded bevel of width bevel. */
  plate(poly: V2[], hgt: number, bevel: number, blend: Blend = "max") {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of poly) {
      x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    this.stamp(x0, y0, x1, y1, (x, y) => {
      if (!inPoly(x, y, poly)) return 0;
      const d = edgeDist(x, y, poly);
      const t = Math.min(1, d / bevel);
      return hgt * Math.sqrt(t * (2 - t));
    });
    this.done(blend);
  }

  /** Tube round an ellipse (a ring, a garter, a wreath's core). */
  ring(cx: number, cy: number, rx: number, ry: number, r: number, hgt: number, blend: Blend = "max", a0 = 0, a1 = Math.PI * 2) {
    const n = Math.max(12, Math.ceil(((a1 - a0) * Math.max(rx, ry)) / (r * 0.8)));
    const pts: [number, number, number, number][] = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, r, hgt]);
    }
    this.tube(pts, blend);
  }

  /** A wedge (a ray of light, a flame) from (x, y) along ang: width w0 at the root, w1 at the end. */
  wedge(x: number, y: number, ang: number, len: number, w0: number, w1: number, hgt: number, blend: Blend = "max") {
    const c = Math.cos(ang), s = Math.sin(ang), px = -s, py = c;
    const ex = x + c * len, ey = y + s * len;
    this.plate([[x + px * w0 / 2, y + py * w0 / 2], [ex + px * w1 / 2, ey + py * w1 / 2], [ex - px * w1 / 2, ey - py * w1 / 2], [x - px * w0 / 2, y - py * w0 / 2]], hgt, Math.max(w0, w1) * 0.35, blend);
  }

  /** Arbitrary height function over a local box (for textures such as hair, clouds, feathers). */
  field(x0: number, y0: number, x1: number, y1: number, f: (x: number, y: number) => number, blend: Blend = "add") {
    this.stamp(x0, y0, x1, y1, f);
    this.done(blend);
  }

  /** Capital letters (stroke font) starting at (x, y) with cap height size. */
  text(str: string, x: number, y: number, size: number, hgt: number, blend: Blend = "sub", spacing = 0.28) {
    const r = size * 0.075;
    let cx = x;
    this.group(blend, () => {
      for (const ch of str) {
        const g = GLYPHS[ch];
        if (!g) {
          cx += size * 0.6;
          continue;
        }
        for (const line of g.s) this.tube(line.map(([gx, gy]) => [cx + gx * size, y + gy * size, r, hgt]));
        cx += (g.w + spacing) * size;
      }
    });
  }

  /** Width of a text run (for centring). */
  static textWidth(str: string, size: number, spacing = 0.28) {
    let w = 0;
    for (const ch of str) w += ((GLYPHS[ch]?.w ?? 0.32) + spacing) * size;
    return w - spacing * size;
  }

  // ------------------------------------------------------------------ mesh

  /**
   * Builds the relief into b. frame: world origin of the panel's bottom-left corner and its
   * axes (ex to the viewer's right, ey up, ez out of the wall). sink: how far the background
   * level sits behind the frame's plane (so the relief grows out of the wall without z-fighting).
   * cavR/cavK: radius (m) and strength of the baked cavity.
   */
  build(b: GeoBuilder, frame: Frame = { o: [0, 0, 0], ex: [1, 0, 0], ey: [0, 1, 0], ez: [0, 0, 1] }, opts: { sink?: number; cavR?: number; cavK?: number; minCav?: number; soften?: number } = {}) {
    const { sink = 0.02, cavR = 0.08, cavK = 5, minCav = 0.3, soften = this.soften } = opts;
    const W = this.nu + 1, Hn = this.nv + 1;
    const du = this.du, dv = this.dv;
    if (this.mask) {
      for (let j = 0; j < Hn; j++) for (let i = 0; i < W; i++) this.h[j * W + i] *= this.mask(i * du, j * dv);
    }
    // a light smoothing turns the one-cell cliffs at the edges of forms into chamfers (no stair-stepping)
    let H = this.h;
    for (let k = 0; k < soften; k++) H = smooth3(H, W, Hn);
    // local average height: a hollow sits below its surroundings
    const rc = Math.max(1, Math.round(cavR / Math.min(du, dv)));
    const blur = boxBlur(boxBlur(H, W, Hn, rc), W, Hn, rc);
    const idx = new Int32Array(W * Hn).fill(-1);
    const { o, ex, ey, ez } = frame;
    const det = ez[0] * (ex[1] * ey[2] - ex[2] * ey[1]) + ez[1] * (ex[2] * ey[0] - ex[0] * ey[2]) + ez[2] * (ex[0] * ey[1] - ex[1] * ey[0]);
    const flip = det < 0;
    const old = b.paint;
    b.paint = { joint: JOINT.none, expo: old.expo, cav: 1 };
    const vert = (i: number, j: number) => {
      const k = j * W + i;
      if (idx[k] >= 0) return idx[k];
      const hv = H[k];
      const hl = H[j * W + Math.max(0, i - 1)], hr = H[j * W + Math.min(W - 1, i + 1)];
      const hd = H[Math.max(0, j - 1) * W + i], hu = H[Math.min(Hn - 1, j + 1) * W + i];
      const gx = (hr - hl) / (du * ((i > 0 ? 1 : 0) + (i < W - 1 ? 1 : 0)));
      const gy = (hu - hd) / (dv * ((j > 0 ? 1 : 0) + (j < Hn - 1 ? 1 : 0)));
      let nx = -gx, ny = -gy, nz = 1;
      const nl = Math.hypot(nx, ny, nz);
      nx /= nl; ny /= nl; nz /= nl;
      const u = i * du, v = j * dv, z = hv - sink;
      b.paint.cav = old.cav * Math.max(minCav, Math.min(1, 1 - cavK * Math.max(0, blur[k] - hv)));
      idx[k] = b.v(
        o[0] + ex[0] * u + ey[0] * v + ez[0] * z,
        o[1] + ex[1] * u + ey[1] * v + ez[1] * z,
        o[2] + ex[2] * u + ey[2] * v + ez[2] * z,
        ex[0] * nx + ey[0] * ny + ez[0] * nz,
        ex[1] * nx + ey[1] * ny + ez[1] * nz,
        ex[2] * nx + ey[2] * ny + ez[2] * nz,
        u, v,
      );
      return idx[k];
    };
    const eps = 2e-4;
    let quads = 0;
    for (let j = 0; j < Hn - 1; j++) {
      for (let i = 0; i < W - 1; i++) {
        const k = j * W + i;
        if (H[k] < eps && H[k + 1] < eps && H[k + W] < eps && H[k + W + 1] < eps) continue;
        const a = vert(i, j), c = vert(i + 1, j), d = vert(i + 1, j + 1), e = vert(i, j + 1);
        // split along the diagonal whose ends differ less in height (keeps ridges crisp)
        const alt = Math.abs(H[k] - H[k + W + 1]) > Math.abs(H[k + 1] - H[k + W]);
        if (!alt) {
          if (flip) { b.tri(a, d, c); b.tri(a, e, d); } else { b.tri(a, c, d); b.tri(a, d, e); }
        } else {
          if (flip) { b.tri(a, e, c); b.tri(c, e, d); } else { b.tri(a, c, e); b.tri(c, d, e); }
        }
        quads++;
      }
    }
    b.paint = old;
    return quads * 2;
  }
}

/** Frame for a panel whose bottom-centre is at c on a wall facing n (plan or 3D normal). */
export function panelFrame(c: V3, n: V2 | V3, w: number): Frame {
  const nz: V3 = n.length === 3 ? [n[0], 0, (n as V3)[2]] : [n[0], 0, (n as V2)[1]];
  const l = Math.hypot(nz[0], nz[2]) || 1;
  nz[0] /= l; nz[2] /= l;
  // viewer's right = up x n
  const ex: V3 = [nz[2], 0, -nz[0]];
  return { o: [c[0] - ex[0] * w / 2, c[1], c[2] - ex[2] * w / 2], ex, ey: [0, 1, 0], ez: nz };
}

// ---------------------------------------------------------------------------------- helpers

function inPoly(x: number, y: number, pts: V2[]) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function edgeDist(x: number, y: number, pts: V2[]) {
  let best = Infinity;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const ax = pts[j][0], ay = pts[j][1], ex = pts[i][0] - ax, ey = pts[i][1] - ay;
    const l2 = ex * ex + ey * ey || 1e-12;
    let t = ((x - ax) * ex + (y - ay) * ey) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    best = Math.min(best, Math.hypot(x - ax - ex * t, y - ay - ey * t));
  }
  return best;
}

/** 3x3 binomial filter that leaves the background (zero) untouched where nothing is near. */
function smooth3(src: Float32Array, W: number, H: number): Float32Array {
  const out = new Float32Array(src.length);
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      let acc = 0, wsum = 0;
      for (let dj = -1; dj <= 1; dj++) {
        const jj = Math.min(H - 1, Math.max(0, j + dj));
        for (let di = -1; di <= 1; di++) {
          const ii = Math.min(W - 1, Math.max(0, i + di));
          const w = (di === 0 ? 2 : 1) * (dj === 0 ? 2 : 1);
          acc += src[jj * W + ii] * w;
          wsum += w;
        }
      }
      out[j * W + i] = acc / wsum;
    }
  }
  return out;
}

function boxBlur(src: Float32Array, W: number, H: number, r: number): Float32Array {
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
  for (let j = 0; j < H; j++) {
    let acc = 0;
    const row = j * W;
    for (let i = -r; i <= r; i++) acc += src[row + Math.min(W - 1, Math.max(0, i))];
    for (let i = 0; i < W; i++) {
      tmp[row + i] = acc / (2 * r + 1);
      acc += src[row + Math.min(W - 1, i + r + 1)] - src[row + Math.max(0, i - r)];
    }
  }
  for (let i = 0; i < W; i++) {
    let acc = 0;
    for (let j = -r; j <= r; j++) acc += tmp[Math.min(H - 1, Math.max(0, j)) * W + i];
    for (let j = 0; j < H; j++) {
      out[j * W + i] = acc / (2 * r + 1);
      acc += tmp[Math.min(H - 1, j + r + 1) * W + i] - tmp[Math.max(0, j - r) * W + i];
    }
  }
  return out;
}

/** Stroke glyphs in a unit cap-height box: w = advance width, s = polylines. */
const GLYPHS: Record<string, { w: number; s: V2[][] }> = {
  A: { w: 0.8, s: [[[0, 0], [0.4, 1], [0.8, 0]], [[0.17, 0.38], [0.63, 0.38]]] },
  B: { w: 0.68, s: [[[0, 0], [0, 1], [0.45, 1], [0.6, 0.9], [0.62, 0.72], [0.48, 0.55], [0, 0.55]], [[0.48, 0.55], [0.66, 0.42], [0.68, 0.16], [0.52, 0], [0, 0]]] },
  E: { w: 0.62, s: [[[0.62, 1], [0, 1], [0, 0], [0.62, 0]], [[0, 0.52], [0.5, 0.52]]] },
  F: { w: 0.58, s: [[[0.58, 1], [0, 1], [0, 0]], [[0, 0.52], [0.46, 0.52]]] },
  G: { w: 0.8, s: [[[0.78, 0.82], [0.62, 0.98], [0.38, 1], [0.12, 0.88], [0, 0.6], [0, 0.4], [0.12, 0.12], [0.38, 0], [0.62, 0.02], [0.8, 0.14], [0.8, 0.44], [0.5, 0.44]]] },
  M: { w: 0.9, s: [[[0, 0], [0.04, 1], [0.45, 0.2], [0.86, 1], [0.9, 0]]] },
  R: { w: 0.7, s: [[[0, 0], [0, 1], [0.48, 1], [0.64, 0.9], [0.66, 0.66], [0.5, 0.54], [0, 0.54]], [[0.36, 0.54], [0.7, 0]]] },
  S: { w: 0.66, s: [[[0.64, 0.86], [0.5, 0.99], [0.2, 1], [0.03, 0.86], [0.04, 0.64], [0.22, 0.54], [0.46, 0.47], [0.64, 0.34], [0.65, 0.12], [0.48, 0], [0.18, 0], [0, 0.14]]] },
  U: { w: 0.72, s: [[[0, 1], [0, 0.26], [0.1, 0.06], [0.36, 0], [0.62, 0.06], [0.72, 0.26], [0.72, 1]]] },
  N: { w: 0.76, s: [[[0, 0], [0, 1], [0.76, 0], [0.76, 1]]] },
  T: { w: 0.7, s: [[[0, 1], [0.7, 1]], [[0.35, 1], [0.35, 0]]] },
  I: { w: 0.1, s: [[[0.05, 0], [0.05, 1]]] },
  O: { w: 0.84, s: [[[0.42, 1], [0.14, 0.88], [0, 0.5], [0.14, 0.12], [0.42, 0], [0.7, 0.12], [0.84, 0.5], [0.7, 0.88], [0.42, 1]]] },
  C: { w: 0.74, s: [[[0.74, 0.84], [0.54, 0.99], [0.34, 1], [0.1, 0.86], [0, 0.5], [0.1, 0.14], [0.34, 0], [0.56, 0.01], [0.74, 0.16]]] },
  L: { w: 0.58, s: [[[0, 1], [0, 0], [0.58, 0]]] },
  P: { w: 0.64, s: [[[0, 0], [0, 1], [0.44, 1], [0.62, 0.88], [0.64, 0.66], [0.46, 0.52], [0, 0.52]]] },
  D: { w: 0.76, s: [[[0, 0], [0, 1], [0.36, 1], [0.66, 0.86], [0.76, 0.5], [0.66, 0.14], [0.36, 0], [0, 0]]] },
  V: { w: 0.8, s: [[[0, 1], [0.4, 0], [0.8, 1]]] },
  H: { w: 0.72, s: [[[0, 0], [0, 1]], [[0.72, 0], [0.72, 1]], [[0, 0.52], [0.72, 0.52]]] },
  X: { w: 0.72, s: [[[0, 0], [0.72, 1]], [[0, 1], [0.72, 0]]] },
  "·": { w: 0.12, s: [[[0.06, 0.45], [0.06, 0.5]]] },
};
