import * as THREE from "three";
import type { V2, V3 } from "../core/math";
import type { GeoBuilder, Profile } from "./Builder";

/**
 * Walls as parametric surfaces: s runs horizontally along the wall (metres of arc length), y is
 * the world height. The same code builds straight walls and the curved walls of the apse, the
 * drum and the porticoes.
 */
export interface Surface {
  point(s: number, y: number, depth?: number): V3;
  /** Outward unit normal at s. */
  normal(s: number): V3;
  /** Unit tangent (direction of increasing s) at s. */
  tangent(s: number): V3;
}

export function planeSurface(a: V2, dir: V2, out: V2): Surface {
  return {
    point: (s, y, d = 0) => [a[0] + dir[0] * s - out[0] * d, y, a[1] + dir[1] * s - out[1] * d],
    normal: () => [out[0], 0, out[1]],
    tangent: () => [dir[0], 0, dir[1]],
  };
}

/**
 * Circular wall of radius r around centre c. s = 0 at angle th0 (radians, measured from +x
 * towards +z), increasing with `sign` (+1 = towards +z). `inside` flips the normal (a concave
 * face seen from the centre, e.g. the inside of the dome).
 */
export function arcSurface(c: V2, r: number, th0: number, sign = 1, inside = false): Surface {
  const ang = (s: number) => th0 + (sign * s) / r;
  return {
    point: (s, y, d = 0) => {
      const a = ang(s);
      const rr = inside ? r + d : r - d;
      return [c[0] + rr * Math.cos(a), y, c[1] + rr * Math.sin(a)];
    },
    normal: (s) => {
      const a = ang(s);
      return inside ? [-Math.cos(a), 0, -Math.sin(a)] : [Math.cos(a), 0, Math.sin(a)];
    },
    tangent: (s) => {
      const a = ang(s);
      return [-Math.sin(a) * sign, 0, Math.cos(a) * sign];
    },
  };
}

export type Head = "flat" | "round" | "segment" | "circle";
export interface Opening {
  s0: number;
  s1: number;
  y0: number;
  /** Top of the straight jambs (springing); for circles, the circle's top. */
  y1: number;
  head: Head;
  /** Rise of a segmental head. */
  rise?: number;
}

/** Height range of an opening at position s, or null. */
export function openingRange(o: Opening, s: number): [number, number] | null {
  if (s < o.s0 - 1e-6 || s > o.s1 + 1e-6) return null;
  const w = o.s1 - o.s0, c = (o.s0 + o.s1) / 2, h = w / 2;
  const t = Math.min(1, Math.abs(s - c) / h);
  switch (o.head) {
    case "flat": return [o.y0, o.y1];
    case "round": return [o.y0, o.y1 + h * Math.sqrt(Math.max(0, 1 - t * t))];
    case "segment": {
      const rise = o.rise ?? w * 0.15;
      const R = (h * h + rise * rise) / (2 * rise);
      return [o.y0, o.y1 + Math.sqrt(Math.max(0, R * R - (t * h) ** 2)) - (R - rise)];
    }
    case "circle": {
      const r = (o.y1 - o.y0) / 2, cy = (o.y0 + o.y1) / 2;
      const dy = Math.sqrt(Math.max(0, 1 - t * t)) * r;
      return [cy - dy, cy + dy];
    }
  }
}

/** Outline of an opening in (s, y), counter-clockwise, starting bottom-left. */
export function openingOutline(o: Opening, seg = 12): V2[] {
  const pts: V2[] = [];
  const w = o.s1 - o.s0, c = (o.s0 + o.s1) / 2, h = w / 2;
  if (o.head === "circle") {
    const r = (o.y1 - o.y0) / 2, cy = (o.y0 + o.y1) / 2;
    for (let i = 0; i < seg * 2; i++) {
      const a = -Math.PI / 2 - (i / (seg * 2)) * Math.PI * 2;
      pts.push([c + Math.cos(a) * h, cy + Math.sin(a) * r]);
    }
    return pts.reverse();
  }
  pts.push([o.s0, o.y0], [o.s1, o.y0], [o.s1, o.y1]);
  if (o.head === "flat") pts.push([o.s0, o.y1]);
  else {
    for (let i = 1; i < seg; i++) {
      const s = o.s1 - (w * i) / seg;
      pts.push([s, openingRange(o, s)![1]]);
    }
    pts.push([o.s0, o.y1]);
  }
  return pts;
}

/**
 * Builds the wall surface between s0..s1, y0..y1 with the openings cut out, as vertical strips.
 * `maxStrip` controls tessellation (for curved walls and arched heads).
 */
export function stripPanel(b: GeoBuilder, surf: Surface, s0: number, s1: number, y0: number, y1: number, openings: Opening[], maxStrip = 1.2) {
  const cuts = new Set<number>([s0, s1]);
  for (const o of openings) {
    if (o.s1 < s0 || o.s0 > s1) continue;
    cuts.add(Math.max(s0, o.s0));
    cuts.add(Math.min(s1, o.s1));
    if (o.head !== "flat") {
      const n = 12;
      for (let i = 1; i < n; i++) cuts.add(o.s0 + ((o.s1 - o.s0) * i) / n);
    }
  }
  const sorted = [...cuts].sort((a, c) => a - c);
  const xs: number[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], c = sorted[i + 1];
    const n = Math.max(1, Math.ceil((c - a) / maxStrip));
    for (let k = 0; k < n; k++) xs.push(a + ((c - a) * k) / n);
  }
  xs.push(sorted[sorted.length - 1]);
  for (let i = 0; i < xs.length - 1; i++) {
    const sa = xs[i], sb = xs[i + 1];
    if (sb - sa < 1e-5) continue;
    const mid = (sa + sb) / 2;
    // holes covering this strip (evaluated at both edges; an opening covers the strip if it covers its middle)
    const holes: { a: [number, number]; b: [number, number] }[] = [];
    for (const o of openings) {
      if (mid < o.s0 || mid > o.s1) continue;
      const ra = openingRange(o, Math.max(sa, o.s0)) ?? [o.y0, o.y0];
      const rb = openingRange(o, Math.min(sb, o.s1)) ?? [o.y0, o.y0];
      holes.push({ a: ra, b: rb });
    }
    holes.sort((h1, h2) => h1.a[0] - h2.a[0]);
    let ya = y0, yb = y0;
    for (const h of holes) {
      quadStrip(b, surf, sa, sb, ya, yb, Math.max(ya, Math.min(y1, h.a[0])), Math.max(yb, Math.min(y1, h.b[0])));
      ya = Math.max(ya, Math.min(y1, h.a[1]));
      yb = Math.max(yb, Math.min(y1, h.b[1]));
    }
    quadStrip(b, surf, sa, sb, ya, yb, y1, y1);
  }
}

function quadStrip(b: GeoBuilder, surf: Surface, sa: number, sb: number, ya0: number, yb0: number, ya1: number, yb1: number) {
  if (ya1 - ya0 < 1e-5 && yb1 - yb0 < 1e-5) return;
  const na = surf.normal(sa), nb = surf.normal(sb);
  const p0 = surf.point(sa, ya0), p1 = surf.point(sb, yb0), p2 = surf.point(sb, yb1), p3 = surf.point(sa, ya1);
  const i0 = b.v(p0[0], p0[1], p0[2], na[0], na[1], na[2], sa, ya0);
  const i1 = b.v(p1[0], p1[1], p1[2], nb[0], nb[1], nb[2], sb, yb0);
  const i2 = b.v(p2[0], p2[1], p2[2], nb[0], nb[1], nb[2], sb, yb1);
  const i3 = b.v(p3[0], p3[1], p3[2], na[0], na[1], na[2], sa, ya1);
  if (ya1 - ya0 < 1e-5) b.orientTri(i0, i1, i2);
  else if (yb1 - yb0 < 1e-5) b.orientTri(i0, i1, i3);
  else b.orientQuad(i0, i1, i2, i3);
}

/** Reveal faces of an opening outline, from the surface to `depth` inside the wall. */
export function revealOnSurface(b: GeoBuilder, surf: Surface, outline: V2[], depth: number, closed = true) {
  const n = outline.length;
  let cs = 0, cy = 0;
  for (const p of outline) { cs += p[0]; cy += p[1]; }
  cs /= n; cy /= n;
  let u = 0;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = outline[i], c = outline[(i + 1) % n];
    const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
    if (len < 1e-6) continue;
    // inward normal in (s, y) (towards the opening centre)
    let ns = -(c[1] - a[1]), ny = c[0] - a[0];
    const ms = (a[0] + c[0]) / 2, my = (a[1] + c[1]) / 2;
    if (ns * (cs - ms) + ny * (cy - my) < 0) { ns = -ns; ny = -ny; }
    const l = Math.hypot(ns, ny);
    ns /= l; ny /= l;
    const t = surf.tangent(ms);
    const nx = t[0] * ns, nz = t[2] * ns;
    const q0 = surf.point(a[0], a[1], 0), q1 = surf.point(c[0], c[1], 0);
    const q2 = surf.point(c[0], c[1], depth), q3 = surf.point(a[0], a[1], depth);
    const i0 = b.v(q0[0], q0[1], q0[2], nx, ny, nz, u, 0);
    const i1 = b.v(q1[0], q1[1], q1[2], nx, ny, nz, u + len, 0);
    const i2 = b.v(q2[0], q2[1], q2[2], nx, ny, nz, u + len, depth);
    const i3 = b.v(q3[0], q3[1], q3[2], nx, ny, nz, u, depth);
    b.orientQuad(i0, i1, i2, i3);
    u += len;
  }
}

/** A flat (or curved-following) panel filling an outline at a given depth, facing outward. */
export function fillOnSurface(b: GeoBuilder, surf: Surface, outline: V2[], depth: number, facing: 1 | -1 = 1) {
  const contour = outline.map((p) => new THREE.Vector2(p[0], p[1]));
  if (THREE.ShapeUtils.isClockWise(contour)) contour.reverse();
  const tris = THREE.ShapeUtils.triangulateShape(contour, []);
  const base = b.count;
  for (const p of contour) {
    const q = surf.point(p.x, p.y, depth);
    const n = surf.normal(p.x);
    b.v(q[0], q[1], q[2], n[0] * facing, n[1] * facing, n[2] * facing, p.x, p.y);
  }
  for (const t of tris) b.orientTri(base + t[0], base + t[1], base + t[2]);
}

/**
 * Sweeps a profile along a path lying on the surface. Profile points are (lat, proj): lat is
 * the in-surface offset away from the path (to the path's left in (s, y) when `outLeft`),
 * proj the projection out of the surface.
 */
export function sweepOnSurface(b: GeoBuilder, surf: Surface, profile: Profile, path: V2[], closed: boolean, opts: { outwardFrom?: V2 } = {}) {
  const n = path.length;
  const segCount = closed ? n : n - 1;
  // in-plane offset directions at each vertex (mitred), pointing away from `outwardFrom`
  const segN: V2[] = [];
  const ref = opts.outwardFrom;
  for (let i = 0; i < segCount; i++) {
    const a = path[i], c = path[(i + 1) % n];
    const ds = c[0] - a[0], dy = c[1] - a[1];
    const l = Math.hypot(ds, dy) || 1;
    let ns = dy / l, ny = -ds / l;
    if (ref) {
      const ms = (a[0] + c[0]) / 2 - ref[0], my = (a[1] + c[1]) / 2 - ref[1];
      if (ns * ms + ny * my < 0) { ns = -ns; ny = -ny; }
    }
    segN.push([ns, ny]);
  }
  const miter: V2[] = [];
  for (let i = 0; i < n; i++) {
    let p = closed ? segN[(i - 1 + segCount) % segCount] : segN[Math.max(0, i - 1)];
    let q = closed ? segN[i % segCount] : segN[Math.min(segCount - 1, i)];
    if (!p) p = q;
    if (!q) q = p;
    let ms = p[0] + q[0], my = p[1] + q[1];
    const ml = Math.hypot(ms, my) || 1;
    ms /= ml; my /= ml;
    const k = 1 / Math.max(0.25, ms * q[0] + my * q[1]);
    miter.push([ms * k, my * k]);
  }
  const pts = profile.pts, sm = profile.smooth ?? [];
  const pn: V2[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const dl = pts[i + 1][0] - pts[i][0], dp = pts[i + 1][1] - pts[i][1];
    const l = Math.hypot(dl, dp) || 1;
    // profile (lat, proj), listed from the path outwards over the top of the moulding (lat 0 up to
    // its face, out, back down to the wall): the solid lies to the right of the direction of travel
    pn.push([-dp / l, dl / l]);
  }
  const place = (i: number, lat: number, proj: number): V3 => {
    const s = path[i][0] + miter[i][0] * lat, y = path[i][1] + miter[i][1] * lat;
    return surf.point(s, y, -proj);
  };
  let u = 0;
  for (let sgi = 0; sgi < segCount; sgi++) {
    const ia = sgi, ib = (sgi + 1) % n;
    const segLen = Math.hypot(path[ib][0] - path[ia][0], path[ib][1] - path[ia][1]);
    const t = surf.tangent((path[ia][0] + path[ib][0]) / 2);
    const nrm = surf.normal((path[ia][0] + path[ib][0]) / 2);
    const sN = segN[sgi];
    for (let k = 0; k < pts.length - 1; k++) {
      const n0 = sm[k] && k > 0 ? avg(pn[k - 1], pn[k]) : pn[k];
      const n1 = sm[k + 1] && k + 1 < pn.length ? avg(pn[k], pn[k + 1]) : pn[k];
      const toN = (nn: V2): V3 => {
        // nn[0]: along the in-plane offset direction, nn[1]: along the surface normal
        const ls = sN[0] * nn[0], ly = sN[1] * nn[0];
        return [t[0] * ls + nrm[0] * nn[1], ly + nrm[1] * nn[1], t[2] * ls + nrm[2] * nn[1]];
      };
      const N0 = toN(n0), N1 = toN(n1);
      const a0 = place(ia, pts[k][0], pts[k][1]), b0 = place(ib, pts[k][0], pts[k][1]);
      const b1 = place(ib, pts[k + 1][0], pts[k + 1][1]), a1 = place(ia, pts[k + 1][0], pts[k + 1][1]);
      const i0 = b.v(a0[0], a0[1], a0[2], N0[0], N0[1], N0[2], u, pts[k][0]);
      const i1 = b.v(b0[0], b0[1], b0[2], N0[0], N0[1], N0[2], u + segLen, pts[k][0]);
      const i2 = b.v(b1[0], b1[1], b1[2], N1[0], N1[1], N1[2], u + segLen, pts[k + 1][0]);
      const i3 = b.v(a1[0], a1[1], a1[2], N1[0], N1[1], N1[2], u, pts[k + 1][0]);
      b.orientQuad(i0, i1, i2, i3);
    }
    u += segLen;
  }
}

function avg(a: V2, b: V2): V2 {
  const x = a[0] + b[0], y = a[1] + b[1];
  const l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
}
