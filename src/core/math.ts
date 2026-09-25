export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;
export const FT = 0.3048;

export const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
/** Frame-rate independent exponential approach factor. */
export const damp = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);

export type V2 = [number, number];
export type V3 = [number, number, number];

/** Signed area of a polygon given as [x, z] pairs (positive when counter-clockwise in x-right / z-up). */
export function polyArea(pts: V2[]): number {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] - pts[i][0]) * (pts[j][1] + pts[i][1]);
  return a / 2;
}

export function pointInPoly(x: number, z: number, pts: V2[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], zi = pts[i][1], xj = pts[j][0], zj = pts[j][1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Distance from point to segment in 2D. */
export function distToSeg(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const ex = bx - ax, ez = bz - az;
  const l2 = ex * ex + ez * ez || 1e-12;
  const t = clamp(((px - ax) * ex + (pz - az) * ez) / l2, 0, 1);
  return Math.hypot(px - (ax + ex * t), pz - (az + ez * t));
}
