import type { V3 } from "../core/math";
import type { GeoBuilder } from "./Builder";

/**
 * Sweeps a circle along a 3D polyline (parallel-transport frames, so it never twists).
 * radius: constant or a function of the normalised length t in 0..1.
 */
export function tube(b: GeoBuilder, pts: V3[], radius: number | ((t: number) => number), segs = 8, caps = false) {
  const n = pts.length;
  if (n < 2) return;
  const rad = typeof radius === "number" ? () => radius : radius;
  const len: number[] = [0];
  for (let i = 1; i < n; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]));
  const total = len[n - 1] || 1;
  const tan = (i: number): V3 => {
    const a = pts[Math.max(0, i - 1)], c = pts[Math.min(n - 1, i + 1)];
    const d: V3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const l = Math.hypot(d[0], d[1], d[2]) || 1;
    return [d[0] / l, d[1] / l, d[2] / l];
  };
  // initial normal: any vector perpendicular to the first tangent
  let t0 = tan(0);
  let nrm: V3 = Math.abs(t0[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  nrm = norm(sub(nrm, scale(t0, dot(nrm, t0))));
  const rings: number[][] = [];
  for (let i = 0; i < n; i++) {
    const t = tan(i);
    if (i > 0) {
      // transport the normal: remove its component along the new tangent
      nrm = norm(sub(nrm, scale(t, dot(nrm, t))));
    }
    t0 = t;
    const bin = cross(t, nrm);
    const r = rad(len[i] / total);
    const ring: number[] = [];
    for (let k = 0; k <= segs; k++) {
      const a = (k / segs) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      const dx = nrm[0] * c + bin[0] * s, dy = nrm[1] * c + bin[1] * s, dz = nrm[2] * c + bin[2] * s;
      const p = pts[i];
      ring.push(b.v(p[0] + dx * r, p[1] + dy * r, p[2] + dz * r, dx, dy, dz, (k / segs) * Math.PI * 2 * Math.max(r, 0.01), len[i]));
    }
    rings.push(ring);
  }
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < segs; k++) b.orientQuad(rings[i][k], rings[i][k + 1], rings[i + 1][k + 1], rings[i + 1][k]);
  if (caps) {
    for (const [i, sgn] of [[0, -1], [n - 1, 1]] as [number, number][]) {
      const t = tan(i);
      const c = b.v(pts[i][0], pts[i][1], pts[i][2], t[0] * sgn, t[1] * sgn, t[2] * sgn, 0, 0);
      for (let k = 0; k < segs; k++) b.orientTri(c, rings[i][k], rings[i][k + 1]);
    }
  }
}

/**
 * A twisted (Solomonic) column shaft between y0 and y1 about (x, z): radius r with `lobes`
 * helical ridges of relative depth amp, turning `turns` times.
 */
export function twistedShaft(b: GeoBuilder, x: number, z: number, y0: number, y1: number, r: number, turns: number, lobes = 2, amp = 0.16, segs = 32) {
  const rings = Math.ceil(((y1 - y0) / r) * 3);
  const R = (a: number, y: number) => {
    const ph = ((y - y0) / (y1 - y0)) * turns * Math.PI * 2;
    return r * (1 + amp * Math.cos(lobes * a - ph));
  };
  const idx: number[][] = [];
  for (let j = 0; j <= rings; j++) {
    const y = y0 + ((y1 - y0) * j) / rings;
    idx.push([]);
    for (let k = 0; k <= segs; k++) {
      const a = (k / segs) * Math.PI * 2;
      const rr = R(a, y);
      // normal from the partial derivatives of the surface (r(a, y) cos a, y, r(a, y) sin a)
      const e = 1e-3;
      const dra = (R(a + e, y) - R(a - e, y)) / (2 * e), dry = (R(a, y + e) - R(a, y - e)) / (2 * e);
      const ta: V3 = [dra * Math.cos(a) - rr * Math.sin(a), 0, dra * Math.sin(a) + rr * Math.cos(a)];
      const ty: V3 = [dry * Math.cos(a), 1, dry * Math.sin(a)];
      let nn = norm(cross(ty, ta));
      if (nn[0] * Math.cos(a) + nn[2] * Math.sin(a) < 0) nn = [-nn[0], -nn[1], -nn[2]];
      idx[j].push(b.v(x + rr * Math.cos(a), y, z + rr * Math.sin(a), nn[0], nn[1], nn[2], a * r, y));
    }
  }
  for (let j = 0; j < rings; j++) for (let k = 0; k < segs; k++) b.orientQuad(idx[j][k], idx[j][k + 1], idx[j + 1][k + 1], idx[j + 1][k]);
}

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function norm(a: V3): V3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}
