import * as THREE from "three";
import type { V2, V3 } from "../core/math";

/**
 * Procedural geometry builder.
 *
 * Every vertex carries, besides position/normal:
 *  - uv: physical metres along the surface (u horizontal, v usually world height) so the stone
 *    shader can draw ashlar courses and block joints at their real size;
 *  - color: a "semantic paint" read by the material shaders (not a visible colour):
 *      r = joint kind  (0 none/carved, 0.33 drums: horizontal joints only, 0.66 blocks: vertical
 *                       joints only, 1 ashlar: courses + staggered vertical joints)
 *      g = exposure    (rain exposure for weathering: 1 skyward, ~0.5 vertical, 0 sheltered soffit)
 *      b = cavity      (baked occlusion: 1 open, 0 deep recess)
 */

class F32 {
  a: Float32Array;
  n = 0;
  constructor(cap = 1024) {
    this.a = new Float32Array(cap);
  }
  ensure(extra: number) {
    if (this.n + extra <= this.a.length) return;
    let cap = this.a.length * 2;
    while (cap < this.n + extra) cap *= 2;
    const b = new Float32Array(cap);
    b.set(this.a.subarray(0, this.n));
    this.a = b;
  }
  push3(x: number, y: number, z: number) {
    this.ensure(3);
    const a = this.a, n = this.n;
    a[n] = x; a[n + 1] = y; a[n + 2] = z;
    this.n = n + 3;
  }
  push2(x: number, y: number) {
    this.ensure(2);
    this.a[this.n] = x; this.a[this.n + 1] = y;
    this.n += 2;
  }
  view() {
    return this.a.subarray(0, this.n);
  }
}

class U32 {
  a: Uint32Array;
  n = 0;
  constructor(cap = 1024) {
    this.a = new Uint32Array(cap);
  }
  push3(x: number, y: number, z: number) {
    if (this.n + 3 > this.a.length) {
      const b = new Uint32Array(this.a.length * 2);
      b.set(this.a);
      this.a = b;
    }
    const a = this.a, n = this.n;
    a[n] = x; a[n + 1] = y; a[n + 2] = z;
    this.n = n + 3;
  }
}

export type Paint = { joint: number; expo: number; cav: number };

export const JOINT = { none: 0, drums: 0.33, blocks: 0.66, ashlar: 1 } as const;

/** A moulding profile: points (d = outward offset, y = height) listed bottom to top. */
export interface Profile {
  pts: V2[];
  /** per point: true = shade smoothly across this point, false = crease. Defaults to crease. */
  smooth?: boolean[];
}

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();

export class GeoBuilder {
  private P = new F32();
  private N = new F32();
  private T = new F32();
  private C = new F32();
  private I = new U32();
  count = 0;
  paint: Paint = { joint: JOINT.ashlar, expo: 1, cav: 1 };

  private m = new THREE.Matrix4();
  private nm = new THREE.Matrix3();
  private identity = true;
  private stack: { m: THREE.Matrix4; id: boolean }[] = [];
  /** Uniform scale of the current transform (for converting local lengths to uv metres). */
  private uvScale = 1;

  // ------------------------------------------------------------------ state

  push(t?: THREE.Matrix4) {
    this.stack.push({ m: this.m.clone(), id: this.identity });
    if (t) {
      this.m.multiply(t);
      this.identity = false;
      this.nm.getNormalMatrix(this.m);
      this.uvScale = Math.cbrt(Math.abs(this.m.determinant()));
    }
    return this;
  }
  pop() {
    const s = this.stack.pop();
    if (!s) throw new Error("GeoBuilder.pop without push");
    this.m.copy(s.m);
    this.identity = s.id;
    this.nm.getNormalMatrix(this.m);
    this.uvScale = Math.cbrt(Math.abs(this.m.determinant()));
    return this;
  }
  /** Run fn with an extra transform applied. */
  with(t: THREE.Matrix4, fn: () => void) {
    this.push(t);
    try {
      fn();
    } finally {
      this.pop();
    }
  }
  at(x: number, y: number, z: number, rotY = 0, fn: () => void, scale = 1) {
    const t = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY),
      new THREE.Vector3(scale, scale, scale),
    );
    this.with(t, fn);
  }
  withPaint(p: Partial<Paint>, fn: () => void) {
    const old = { ...this.paint };
    Object.assign(this.paint, p);
    try {
      fn();
    } finally {
      this.paint = old;
    }
  }

  // ------------------------------------------------------------ primitives

  /** Adds a vertex (local coords, transformed by the current matrix). Returns its index. */
  v(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, w: number, expo?: number): number {
    if (!this.identity) {
      _v.set(x, y, z).applyMatrix4(this.m);
      _n.set(nx, ny, nz).applyMatrix3(this.nm).normalize();
      x = _v.x; y = _v.y; z = _v.z;
      nx = _n.x; ny = _n.y; nz = _n.z;
      u *= this.uvScale; w *= this.uvScale;
    }
    this.P.push3(x, y, z);
    this.N.push3(nx, ny, nz);
    this.T.push2(u, w);
    const p = this.paint;
    const e = expo ?? autoExpo(ny);
    this.C.push3(p.joint, Math.min(1, e * p.expo), p.cav);
    return this.count++;
  }

  tri(a: number, b: number, c: number) {
    this.I.push3(a, b, c);
  }
  /** Quad a-b-c-d, counter-clockwise seen from the front. */
  quad(a: number, b: number, c: number, d: number) {
    this.I.push3(a, b, c);
    this.I.push3(a, c, d);
  }

  /**
   * Planar convex polygon (counter-clockwise seen from the front) with a flat normal and
   * physical uvs: vertical faces get u along the face and v = height; horizontal faces get x/z.
   */
  poly(pts: V3[], expo?: number) {
    if (pts.length < 3) return;
    const n = faceNormal(pts);
    const base = this.count;
    const [tu, tv] = uvAxes(n);
    for (const p of pts) this.v(p[0], p[1], p[2], n[0], n[1], n[2], dot3(p, tu), dot3(p, tv), expo);
    for (let i = 1; i < pts.length - 1; i++) this.tri(base, base + i, base + i + 1);
  }

  /** Planar convex polygon oriented to face the given normal direction (winding fixed if needed). */
  polyN(pts: V3[], n: V3, expo?: number) {
    const fn = faceNormal(pts);
    this.poly(fn[0] * n[0] + fn[1] * n[1] + fn[2] * n[2] >= 0 ? pts : pts.slice().reverse(), expo);
  }

  /** Planar polygon with holes, triangulated with earcut. Points in a local 2D frame (origin, ex, ey). */
  polyHoles(outer: V2[], holes: V2[][], origin: V3, ex: V3, ey: V3, expo?: number) {
    const n = cross3(ex, ey);
    normalize3(n);
    const contour = outer.map((p) => new THREE.Vector2(p[0], p[1]));
    const hs = holes.map((h) => h.map((p) => new THREE.Vector2(p[0], p[1])));
    // earcut wants outer CCW, holes CW (in the 2D frame)
    if (THREE.ShapeUtils.isClockWise(contour)) contour.reverse();
    for (const h of hs) if (!THREE.ShapeUtils.isClockWise(h)) h.reverse();
    const tris = THREE.ShapeUtils.triangulateShape(contour, hs);
    const all = contour.concat(...hs);
    const base = this.count;
    const [tu, tv] = uvAxes(n);
    for (const p of all) {
      const x = origin[0] + ex[0] * p.x + ey[0] * p.y;
      const y = origin[1] + ex[1] * p.x + ey[1] * p.y;
      const z = origin[2] + ex[2] * p.x + ey[2] * p.y;
      const q: V3 = [x, y, z];
      this.v(x, y, z, n[0], n[1], n[2], dot3(q, tu), dot3(q, tv), expo);
    }
    for (const t of tris) {
      // keep triangles counter-clockwise in the 2D frame so their normal is ex x ey
      const a = all[t[0]], b = all[t[1]], c = all[t[2]];
      const cr = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      if (cr >= 0) this.tri(base + t[0], base + t[1], base + t[2]);
      else this.tri(base + t[0], base + t[2], base + t[1]);
    }
  }

  /** Axis-aligned box. `skip` lists faces to omit: px nx py ny pz nz. */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, skip = "") {
    if (x0 > x1) [x0, x1] = [x1, x0];
    if (y0 > y1) [y0, y1] = [y1, y0];
    if (z0 > z1) [z0, z1] = [z1, z0];
    if (!skip.includes("px")) this.poly([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]]);
    if (!skip.includes("nx")) this.poly([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]]);
    if (!skip.includes("py")) this.poly([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]]);
    if (!skip.includes("ny")) this.poly([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]]);
    if (!skip.includes("pz")) this.poly([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]);
    if (!skip.includes("nz")) this.poly([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]]);
  }

  /** Box given by centre/half extents, rotated about Y. */
  obox(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, rotY = 0, skip = "") {
    if (rotY === 0) return this.box(cx - hx, cy - hy, cz - hz, cx + hx, cy + hy, cz + hz, skip);
    this.at(cx, cy, cz, rotY, () => this.box(-hx, -hy, -hz, hx, hy, hz, skip));
  }

  /**
   * Vertical prism from a plan polygon (x, z pairs, any winding) between y0 and y1.
   */
  prism(poly: V2[], y0: number, y1: number, opts: { top?: boolean; bottom?: boolean; sides?: boolean; inside?: boolean } = {}) {
    const { top = true, bottom = false, sides = true, inside = false } = opts;
    const pts = ensureCW(poly); // screen-clockwise in x-right/z-down => outward = (dz, -dx)
    if (sides) {
      let u = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        const dx = b[0] - a[0], dz = b[1] - a[1];
        const len = Math.hypot(dx, dz);
        if (len < 1e-6) continue;
        let nx = dz / len, nz = -dx / len;
        if (inside) { nx = -nx; nz = -nz; }
        const i0 = this.v(a[0], y0, a[1], nx, 0, nz, u, y0);
        const i1 = this.v(b[0], y0, b[1], nx, 0, nz, u + len, y0);
        const i2 = this.v(b[0], y1, b[1], nx, 0, nz, u + len, y1);
        const i3 = this.v(a[0], y1, a[1], nx, 0, nz, u, y1);
        this.orientQuad(i0, i1, i2, i3);
        u += len;
      }
    }
    if (top) this.cap(pts, y1, true);
    if (bottom) this.cap(pts, y0, false);
  }

  /** Horizontal polygon cap (plan points x,z) facing up or down. */
  cap(poly: V2[], y: number, up: boolean, holes: V2[][] = []) {
    const contour = poly.map((p) => new THREE.Vector2(p[0], p[1]));
    const hs = holes.map((h) => h.map((p) => new THREE.Vector2(p[0], p[1])));
    const tris = THREE.ShapeUtils.triangulateShape(contour, hs);
    const all = contour.concat(...hs);
    const base = this.count;
    const ny = up ? 1 : -1;
    for (const p of all) this.v(p.x, y, p.y, 0, ny, 0, p.x, p.y);
    for (const t of tris) {
      // triangulateShape returns CCW in (x, y) = (x, z). Seen from +y (looking down, z toward
      // viewer-bottom), CCW in math (x right, z up) is clockwise on screen, so flip for up-facing.
      const [a, b, c] = t;
      const pa = all[a], pb = all[b], pc = all[c];
      const cr = (pb.x - pa.x) * (pc.y - pa.y) - (pb.y - pa.y) * (pc.x - pa.x);
      // For an up-facing triangle seen from above we need cr < 0 (see derivation in faceNormal).
      if ((cr < 0) === up) this.tri(base + a, base + b, base + c);
      else this.tri(base + a, base + c, base + b);
    }
  }

  /**
   * Surface of revolution around the local Y axis. profile: (r, y) from bottom to top.
   * a0..a1 in radians (0 = +x, increasing towards -z, i.e. counter-clockwise seen from above).
   */
  lathe(
    profile: V2[],
    segs: number,
    opts: { a0?: number; a1?: number; smooth?: boolean[] | boolean; inside?: boolean; uvR?: number } = {},
  ) {
    const { a0 = 0, a1 = Math.PI * 2, inside = false } = opts;
    const full = Math.abs(a1 - a0 - Math.PI * 2) < 1e-6;
    const sm = opts.smooth;
    const smoothAt = (i: number) => (sm === true ? true : Array.isArray(sm) ? !!sm[i] : false);
    // Profile segment normals in (r, y): outward = (dy, -dr) for bottom->top listing.
    const segN: V2[] = [];
    for (let i = 0; i < profile.length - 1; i++) {
      const dr = profile[i + 1][0] - profile[i][0], dy = profile[i + 1][1] - profile[i][1];
      const l = Math.hypot(dr, dy) || 1;
      segN.push([dy / l, -dr / l]);
    }
    // arc length along profile for v
    const vlen: number[] = [0];
    for (let i = 1; i < profile.length; i++) vlen.push(vlen[i - 1] + Math.hypot(profile[i][0] - profile[i - 1][0], profile[i][1] - profile[i - 1][1]));
    const uvR = opts.uvR;
    for (let s = 0; s < profile.length - 1; s++) {
      // each profile segment is a ring strip; normals at its two ends depend on smoothing
      const pA = profile[s], pB = profile[s + 1];
      const nA = smoothAt(s) && s > 0 ? avg2(segN[s - 1], segN[s]) : segN[s];
      const nB = smoothAt(s + 1) && s + 1 < segN.length ? avg2(segN[s], segN[s + 1]) : segN[s];
      const ring = segs + 1;
      const base = this.count;
      for (let k = 0; k <= segs; k++) {
        const a = a0 + ((a1 - a0) * k) / segs;
        const c = Math.cos(a), sn = -Math.sin(a);
        for (const [p, nn, vv] of [[pA, nA, vlen[s]], [pB, nB, vlen[s + 1]]] as [V2, V2, number][]) {
          const r = p[0];
          let nx = nn[0] * c, ny = nn[1], nz = nn[0] * sn;
          if (inside) { nx = -nx; ny = -ny; nz = -nz; }
          const u = (uvR ?? Math.max(r, 0.05)) * a;
          this.v(r * c, p[1], r * sn, nx, ny, nz, u, uvR !== undefined ? p[1] : vv + p[1] * 0);
        }
      }
      for (let k = 0; k < segs; k++) {
        const i0 = base + k * 2, i1 = i0 + 1, j0 = base + (k + 1) * 2, j1 = j0 + 1;
        // counter-clockwise seen from outside: (k,A) -> (k+1,A) -> (k+1,B) -> (k,B) with angle
        // increasing counter-clockwise from above.
        this.orientQuad(i0, j0, j1, i1);
      }
      void ring;
      void full;
    }
  }

  /** Closed vertical cylinder (optionally capped). */
  cylinder(r: number, y0: number, y1: number, segs: number, caps = true, inside = false) {
    this.lathe([[r, y0], [r, y1]], segs, { inside, uvR: r });
    if (caps) {
      const ring: V2[] = [];
      for (let k = 0; k < segs; k++) {
        const a = (k / segs) * Math.PI * 2;
        ring.push([r * Math.cos(a), -r * Math.sin(a)]);
      }
      this.cap(ring, y1, true);
      this.cap(ring, y0, false);
    }
  }

  /**
   * Sweeps a profile along a plan path (x, z pairs) at the profile's own heights.
   * Outward offset direction is (dz, -dx) for each segment (screen-clockwise loops in the
   * x-right/z-down plan point outward); pass flip to reverse.
   */
  sweep(profile: Profile, path: V2[], closed: boolean, opts: { flip?: boolean; u0?: number; capEnds?: boolean } = {}) {
    const flip = opts.flip ? -1 : 1;
    const n = path.length;
    if (n < 2) return;
    const segCount = closed ? n : n - 1;
    const segNrm: V2[] = [];
    const segLen: number[] = [];
    for (let i = 0; i < segCount; i++) {
      const a = path[i], b = path[(i + 1) % n];
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const l = Math.hypot(dx, dz) || 1e-9;
      segLen.push(l);
      segNrm.push([(flip * dz) / l, (-flip * dx) / l]);
    }
    // miter offsets per path vertex
    const miter: V2[] = [];
    for (let i = 0; i < n; i++) {
      let nPrev: V2 | null = null, nNext: V2 | null = null;
      if (closed) {
        nPrev = segNrm[(i - 1 + segCount) % segCount];
        nNext = segNrm[i % segCount];
      } else {
        if (i > 0) nPrev = segNrm[i - 1];
        if (i < segCount) nNext = segNrm[i];
      }
      if (!nPrev) nPrev = nNext!;
      if (!nNext) nNext = nPrev;
      let mx = nPrev[0] + nNext[0], mz = nPrev[1] + nNext[1];
      const ml = Math.hypot(mx, mz);
      if (ml < 1e-6) { mx = nNext[0]; mz = nNext[1]; } else { mx /= ml; mz /= ml; }
      const cosHalf = Math.max(0.2, mx * nNext[0] + mz * nNext[1]);
      miter.push([mx / cosHalf, mz / cosHalf]);
    }
    const pts = profile.pts;
    const sm = profile.smooth ?? [];
    // profile 2D normals (d, y): outward for bottom->top listing = (dy, -dd)
    const pn: V2[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const dd = pts[i + 1][0] - pts[i][0], dy = pts[i + 1][1] - pts[i][1];
      const l = Math.hypot(dd, dy) || 1;
      pn.push([dy / l, -dd / l]);
    }
    let u = opts.u0 ?? 0;
    for (let s = 0; s < segCount; s++) {
      const ia = s, ib = (s + 1) % n;
      const A = path[ia], B = path[ib];
      const mA = miter[ia], mB = miter[ib];
      const nrm = segNrm[s];
      const uA = u, uB = u + segLen[s];
      for (let k = 0; k < pts.length - 1; k++) {
        const p0 = pts[k], p1 = pts[k + 1];
        const n0 = sm[k] && k > 0 ? avg2(pn[k - 1], pn[k]) : pn[k];
        const n1 = sm[k + 1] && k + 1 < pn.length ? avg2(pn[k], pn[k + 1]) : pn[k];
        const e0 = autoExpo(n0[1]), e1 = autoExpo(n1[1]);
        const a0 = this.v(A[0] + mA[0] * p0[0], p0[1], A[1] + mA[1] * p0[0], nrm[0] * n0[0], n0[1], nrm[1] * n0[0], uA, p0[1], e0);
        const b0 = this.v(B[0] + mB[0] * p0[0], p0[1], B[1] + mB[1] * p0[0], nrm[0] * n0[0], n0[1], nrm[1] * n0[0], uB, p0[1], e0);
        const b1 = this.v(B[0] + mB[0] * p1[0], p1[1], B[1] + mB[1] * p1[0], nrm[0] * n1[0], n1[1], nrm[1] * n1[0], uB, p1[1], e1);
        const a1 = this.v(A[0] + mA[0] * p1[0], p1[1], A[1] + mA[1] * p1[0], nrm[0] * n1[0], n1[1], nrm[1] * n1[0], uA, p1[1], e1);
        this.orientQuad(a0, b0, b1, a1);
      }
      u = uB;
    }
    if (!closed && opts.capEnds) {
      // flat end caps (profile polygon closed back to d=0)
      for (const [idx, sign] of [[0, -1], [n - 1, 1]] as [number, number][]) {
        const P = path[idx], mm = miter[idx];
        const seg = idx === 0 ? 0 : segCount - 1;
        const a = path[seg], b = path[(seg + 1) % n];
        const dx = b[0] - a[0], dz = b[1] - a[1];
        const l = Math.hypot(dx, dz) || 1;
        const t: V3 = [(sign * dx) / l, 0, (sign * dz) / l];
        const poly3: V3[] = [];
        poly3.push([P[0], pts[0][1], P[1]]);
        for (const p of pts) poly3.push([P[0] + mm[0] * p[0], p[1], P[1] + mm[1] * p[0]]);
        poly3.push([P[0], pts[pts.length - 1][1], P[1]]);
        this.polyOriented(poly3, t);
      }
    }
  }

  /** Polygon (possibly concave) in 3D, oriented to face `dir`. */
  polyOriented(pts: V3[], dir: V3) {
    // local frame
    const n = normalize3([...dir] as V3);
    const up: V3 = Math.abs(n[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    const ex = normalize3(cross3(up, n));
    const ey = cross3(n, ex);
    const o = pts[0];
    const flat: V2[] = pts.map((p) => [dot3(sub3(p, o), ex), dot3(sub3(p, o), ey)]);
    this.polyHoles(flat, [], o, ex, ey);
  }

  /** Orients a quad so its winding agrees with the average vertex normal. */
  orientQuad(a: number, b: number, c: number, d: number) {
    const P = this.P.a, N = this.N.a;
    const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2];
    const e1x = P[b * 3] - ax, e1y = P[b * 3 + 1] - ay, e1z = P[b * 3 + 2] - az;
    const e2x = P[c * 3] - ax, e2y = P[c * 3 + 1] - ay, e2z = P[c * 3 + 2] - az;
    let cx = e1y * e2z - e1z * e2y, cy = e1z * e2x - e1x * e2z, cz = e1x * e2y - e1y * e2x;
    if (cx * cx + cy * cy + cz * cz < 1e-14) {
      // degenerate first triangle: use a, c, d
      const e3x = P[d * 3] - ax, e3y = P[d * 3 + 1] - ay, e3z = P[d * 3 + 2] - az;
      cx = e2y * e3z - e2z * e3y; cy = e2z * e3x - e2x * e3z; cz = e2x * e3y - e2y * e3x;
    }
    const nx = N[a * 3] + N[c * 3], ny = N[a * 3 + 1] + N[c * 3 + 1], nz = N[a * 3 + 2] + N[c * 3 + 2];
    if (cx * nx + cy * ny + cz * nz >= 0) this.quad(a, b, c, d);
    else this.quad(a, d, c, b);
  }

  /** Orients a triangle to agree with its vertex normals. */
  orientTri(a: number, b: number, c: number) {
    const P = this.P.a, N = this.N.a;
    const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2];
    const e1x = P[b * 3] - ax, e1y = P[b * 3 + 1] - ay, e1z = P[b * 3 + 2] - az;
    const e2x = P[c * 3] - ax, e2y = P[c * 3 + 1] - ay, e2z = P[c * 3 + 2] - az;
    const cx = e1y * e2z - e1z * e2y, cy = e1z * e2x - e1x * e2z, cz = e1x * e2y - e1y * e2x;
    const nx = N[a * 3] + N[b * 3] + N[c * 3], ny = N[a * 3 + 1] + N[b * 3 + 1] + N[c * 3 + 1], nz = N[a * 3 + 2] + N[b * 3 + 2] + N[c * 3 + 2];
    if (cx * nx + cy * ny + cz * nz >= 0) this.tri(a, b, c);
    else this.tri(a, c, b);
  }

  /**
   * A flat wall panel in a vertical plane with openings. The panel spans (u0..u1, y0..y1) in the
   * plane through `origin` spanned by the horizontal unit vector `ex` (plan) and +y; the face
   * normal is ex × y reversed so that it points to `outward` (given as the plan normal).
   * holes: polygons in (u, y) panel coordinates.
   */
  wallPanel(origin: V3, ex: V2, outward: V2, u0: number, u1: number, y0: number, y1: number, holes: V2[][] = []) {
    const exv: V3 = [ex[0], 0, ex[1]];
    const eyv: V3 = [0, 1, 0];
    // make sure (ex, ey) frame normal points outward; if not, mirror u
    const nrm = cross3(exv, eyv);
    const flipU = nrm[0] * outward[0] + nrm[2] * outward[1] < 0;
    const e1: V3 = flipU ? [-exv[0], 0, -exv[2]] : exv;
    const outer: V2[] = flipU
      ? [[-u1, y0], [-u0, y0], [-u0, y1], [-u1, y1]]
      : [[u0, y0], [u1, y0], [u1, y1], [u0, y1]];
    const hs = holes.map((h) => h.map((p) => [flipU ? -p[0] : p[0], p[1]] as V2));
    this.polyHoles(outer, hs, origin, e1, eyv);
  }

  /** Reveal (the inner faces of an opening) given the opening outline in panel coords. */
  reveal(origin: V3, ex: V2, outward: V2, outline: V2[], depth: number) {
    // extrude the outline inwards by depth; faces point into the opening
    const n = outline.length;
    const pt = (p: V2, d: number): V3 => [
      origin[0] + ex[0] * p[0] - outward[0] * d,
      origin[1] + p[1],
      origin[2] + ex[1] * p[0] - outward[1] * d,
    ];
    let u = 0;
    // centroid for normal direction
    let cx = 0, cy = 0;
    for (const p of outline) { cx += p[0]; cy += p[1]; }
    cx /= n; cy /= n;
    for (let i = 0; i < n; i++) {
      const a = outline[i], b = outline[(i + 1) % n];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 1e-6) continue;
      // inward normal in panel space (towards centroid)
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      let nu = -(b[1] - a[1]), nyy = b[0] - a[0];
      if (nu * (cx - mx) + nyy * (cy - my) < 0) { nu = -nu; nyy = -nyy; }
      const l = Math.hypot(nu, nyy);
      nu /= l; nyy /= l;
      const nx = ex[0] * nu, nz = ex[1] * nu;
      const p0 = pt(a, 0), p1 = pt(b, 0), p2 = pt(b, depth), p3 = pt(a, depth);
      const i0 = this.v(p0[0], p0[1], p0[2], nx, nyy, nz, u, 0);
      const i1 = this.v(p1[0], p1[1], p1[2], nx, nyy, nz, u + len, 0);
      const i2 = this.v(p2[0], p2[1], p2[2], nx, nyy, nz, u + len, depth);
      const i3 = this.v(p3[0], p3[1], p3[2], nx, nyy, nz, u, depth);
      this.orientQuad(i0, i1, i2, i3);
      u += len;
    }
  }

  /** Appends another builder's geometry (already in world space). */
  append(other: GeoBuilder) {
    const off = this.count;
    const n = other.count;
    this.P.ensure(n * 3); this.N.ensure(n * 3); this.T.ensure(n * 2); this.C.ensure(n * 3);
    this.P.a.set(other.P.view(), this.P.n); this.P.n += n * 3;
    this.N.a.set(other.N.view(), this.N.n); this.N.n += n * 3;
    this.T.a.set(other.T.view(), this.T.n); this.T.n += n * 2;
    this.C.a.set(other.C.view(), this.C.n); this.C.n += n * 3;
    const idx = other.I.a.subarray(0, other.I.n);
    for (let i = 0; i < idx.length; i += 3) this.I.push3(idx[i] + off, idx[i + 1] + off, idx[i + 2] + off);
    this.count += n;
  }

  get triangles() {
    return this.I.n / 3;
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.P.view().slice(), 3));
    // normals: signed bytes, normalised
    const nsrc = this.N.view();
    const n8 = new Int8Array(nsrc.length);
    for (let i = 0; i < nsrc.length; i++) n8[i] = Math.max(-127, Math.min(127, Math.round(nsrc[i] * 127)));
    g.setAttribute("normal", new THREE.BufferAttribute(n8, 3, true));
    g.setAttribute("uv", new THREE.BufferAttribute(this.T.view().slice(), 2));
    const csrc = this.C.view();
    const c8 = new Uint8Array(csrc.length);
    for (let i = 0; i < csrc.length; i++) c8[i] = Math.max(0, Math.min(255, Math.round(csrc[i] * 255)));
    g.setAttribute("color", new THREE.BufferAttribute(c8, 3, true));
    const idx = this.I.a.subarray(0, this.I.n);
    g.setIndex(this.count > 65535 ? new THREE.BufferAttribute(idx.slice(), 1) : new THREE.BufferAttribute(Uint16Array.from(idx), 1));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }

  /** Rewrites the second paint channel from a function of position (e.g. baked lamp light). */
  mapPaintG(fn: (x: number, y: number, z: number) => number) {
    const P = this.P.view(), C = this.C.view();
    for (let i = 0; i < this.count; i++) C[i * 3 + 1] = Math.max(0, Math.min(1, fn(P[i * 3], P[i * 3 + 1], P[i * 3 + 2])));
  }

  /** Raw access for collision building. */
  rawPositions() {
    return this.P.view();
  }
  rawIndex() {
    return this.I.a.subarray(0, this.I.n);
  }
}

// ---------------------------------------------------------------- helpers

/** Rain exposure from the normal's vertical component. */
export function autoExpo(ny: number): number {
  if (ny > 0.35) return 0.75 + 0.25 * ny;
  if (ny < -0.2) return 0.05;
  return 0.45 + 0.3 * ny;
}

function avg2(a: V2, b: V2): V2 {
  const x = a[0] + b[0], y = a[1] + b[1];
  const l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
}
export function dot3(a: V3, b: V3) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
export function cross3(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
export function sub3(a: V3, b: V3): V3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
export function normalize3(a: V3): V3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  a[0] /= l; a[1] /= l; a[2] /= l;
  return a;
}
/** Newell normal of a polygon, CCW = front. */
export function faceNormal(pts: V3[]): V3 {
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    x += (a[1] - b[1]) * (a[2] + b[2]);
    y += (a[2] - b[2]) * (a[0] + b[0]);
    z += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return normalize3([x, y, z]);
}
/** uv projection axes for a face normal: vertical faces -> (horizontal tangent, up). */
export function uvAxes(n: V3): [V3, V3] {
  if (Math.abs(n[1]) > 0.7) return [[1, 0, 0], [0, 0, 1]];
  const h = Math.hypot(n[0], n[2]) || 1;
  return [[-n[2] / h, 0, n[0] / h], [0, 1, 0]];
}

/** Returns the polygon in screen-clockwise order for the x-right / z-down plan. */
export function ensureCW(poly: V2[]): V2[] {
  // shoelace in (x, z): positive => counter-clockwise in math orientation (x right, z up),
  // which is clockwise on screen (z down).
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1]);
  return a > 0 ? poly.slice() : poly.slice().reverse();
}
