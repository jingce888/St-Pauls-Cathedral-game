import type { V2 } from "../../core/math";
import { rng } from "../../core/rng";
import { Relief } from "../../geo/relief";

/**
 * Carved sculpture as relief height fields: figures in poses, a horse, wings, cherub heads,
 * foliage, the phoenix, the royal arms, and the compositions made from them for the three
 * pediments, the panel over the great west door, the cartouches over the transept doors, the
 * window keystones and the drops between paired pilasters.
 *
 * Figures are written in units of their standing height (feet at y = 0, facing +x) and placed
 * with Relief.at; heights (projection from the wall) are in the same units.
 */

const DEG = Math.PI / 180;
type Joint = V2;

export interface Pose {
  head: Joint; neck: Joint; pelvis: Joint;
  /** near (front) arm: shoulder, elbow, hand; far (back) arm likewise */
  sN: Joint; eN: Joint; hN: Joint;
  sF: Joint; eF: Joint; hF: Joint;
  /** near and far leg: hip, knee, foot (ankle) */
  pN: Joint; kN: Joint; fN: Joint;
  pF: Joint; kF: Joint; fF: Joint;
}

const STAND: Pose = {
  head: [0.012, 0.925], neck: [0, 0.845], pelvis: [0, 0.52],
  sN: [0.025, 0.8], eN: [0.05, 0.64], hN: [0.07, 0.5],
  sF: [-0.035, 0.8], eF: [-0.07, 0.64], hF: [-0.075, 0.5],
  pN: [0.025, 0.5], kN: [0.04, 0.27], fN: [0.06, 0.03],
  pF: [-0.03, 0.5], kF: [-0.045, 0.27], fF: [-0.06, 0.03],
};
const pose = (o: Partial<Pose>): Pose => ({ ...STAND, ...o });

export const POSES = {
  stand: STAND,
  preach: pose({ eN: [0.12, 0.76], hN: [0.2, 0.9], eF: [-0.02, 0.63], hF: [0.06, 0.64] }),
  listen: pose({ head: [0.02, 0.915], eN: [0.08, 0.66], hN: [0.05, 0.83], eF: [-0.05, 0.63], hF: [0.03, 0.6] }),
  point: pose({ eN: [0.14, 0.75], hN: [0.27, 0.8] }),
  hold: pose({ eN: [0.07, 0.64], hN: [0.1, 0.68], eF: [-0.02, 0.62], hF: [0.06, 0.66] }),
  walk: pose({
    eN: [-0.02, 0.64], hN: [-0.05, 0.5], eF: [0.07, 0.64], hF: [0.12, 0.54],
    kN: [0.1, 0.28], fN: [0.14, 0.03], kF: [-0.07, 0.26], fF: [-0.15, 0.05],
  }),
  recoil: pose({
    head: [-0.06, 0.9], neck: [-0.05, 0.82],
    sN: [-0.025, 0.78], eN: [0.07, 0.8], hN: [0.03, 0.92],
    sF: [-0.08, 0.78], eF: [-0.2, 0.82], hF: [-0.27, 0.95],
    kN: [0.07, 0.27], fN: [0.11, 0.03], kF: [-0.1, 0.27], fF: [-0.17, 0.03],
  }),
  rein: pose({
    head: [-0.03, 0.915], neck: [-0.03, 0.835], pelvis: [0.01, 0.51],
    sN: [0, 0.79], eN: [0.12, 0.74], hN: [0.23, 0.79],
    sF: [-0.05, 0.79], eF: [0.08, 0.71], hF: [0.19, 0.76],
    pN: [0.03, 0.5], kN: [0.1, 0.27], fN: [0.16, 0.03], pF: [-0.02, 0.5], kF: [-0.08, 0.27], fF: [-0.13, 0.03],
  }),
  kneel: pose({
    head: [0.05, 0.745], neck: [0.035, 0.665], pelvis: [0, 0.34],
    sN: [0.055, 0.62], eN: [0.11, 0.49], hN: [0.17, 0.55],
    sF: [0, 0.62], eF: [0.07, 0.48], hF: [0.155, 0.56],
    pN: [0.02, 0.33], kN: [0.2, 0.3], fN: [0.2, 0.03],
    pF: [-0.02, 0.32], kF: [0.02, 0.04], fF: [-0.2, 0.04],
  }),
  kneelUp: pose({
    head: [0.03, 0.755], neck: [0.02, 0.67], pelvis: [0, 0.34],
    sN: [0.04, 0.63], eN: [0.14, 0.7], hN: [0.17, 0.86],
    sF: [-0.02, 0.63], eF: [-0.1, 0.7], hF: [-0.14, 0.84],
    pN: [0.02, 0.33], kN: [0.2, 0.3], fN: [0.2, 0.03],
    pF: [-0.02, 0.32], kF: [0.02, 0.04], fF: [-0.2, 0.04],
  }),
  seated: pose({
    head: [0.02, 0.71], neck: [0.01, 0.63], pelvis: [0, 0.3],
    sN: [0.03, 0.6], eN: [0.08, 0.45], hN: [0.18, 0.42],
    sF: [-0.03, 0.6], eF: [-0.06, 0.45], hF: [0.0, 0.34],
    pN: [0.02, 0.3], kN: [0.22, 0.3], fN: [0.22, 0.03],
    pF: [-0.02, 0.29], kF: [0.18, 0.28], fF: [0.15, 0.03],
  }),
  seatedChin: pose({
    head: [0.05, 0.69], neck: [0.03, 0.62], pelvis: [0, 0.3],
    sN: [0.04, 0.59], eN: [0.16, 0.44], hN: [0.1, 0.63],
    sF: [-0.02, 0.59], eF: [-0.04, 0.44], hF: [0.06, 0.36],
    pN: [0.02, 0.3], kN: [0.22, 0.34], fN: [0.24, 0.03],
    pF: [-0.02, 0.29], kF: [0.17, 0.3], fF: [0.12, 0.03],
  }),
  fallen: pose({
    head: [0.38, 0.37], neck: [0.3, 0.3], pelvis: [0, 0.1],
    sF: [0.27, 0.27], eF: [0.27, 0.12], hF: [0.36, 0.05],
    sN: [0.31, 0.3], eN: [0.41, 0.46], hN: [0.36, 0.58],
    pN: [0, 0.1], kN: [-0.2, 0.22], fN: [-0.42, 0.04],
    pF: [-0.02, 0.08], kF: [-0.24, 0.08], fF: [-0.47, 0.03],
  }),
  recline: pose({
    head: [0.35, 0.3], neck: [0.28, 0.24], pelvis: [0, 0.1],
    sF: [0.25, 0.22], eF: [0.26, 0.06], hF: [0.34, 0.05],
    sN: [0.28, 0.24], eN: [0.18, 0.15], hN: [0.07, 0.13],
    pN: [0, 0.1], kN: [-0.22, 0.1], fN: [-0.45, 0.03],
    pF: [-0.02, 0.09], kF: [-0.2, 0.21], fF: [-0.4, 0.05],
  }),
  flee: pose({
    head: [0.11, 0.89], neck: [0.08, 0.81], pelvis: [0, 0.5],
    sN: [0.08, 0.78], eN: [-0.02, 0.66], hN: [-0.08, 0.73],
    sF: [0.06, 0.78], eF: [0.17, 0.7], hF: [0.25, 0.77],
    pN: [0.01, 0.5], kN: [0.16, 0.34], fN: [0.12, 0.1],
    pF: [-0.01, 0.49], kF: [-0.08, 0.28], fF: [-0.24, 0.12],
  }),
  support: pose({
    head: [0.04, 0.755], neck: [0.025, 0.67], pelvis: [0, 0.34],
    sN: [0.05, 0.63], eN: [0.15, 0.66], hN: [0.24, 0.76],
    sF: [-0.01, 0.63], eF: [0.04, 0.5], hF: [0.12, 0.44],
    pN: [0.02, 0.33], kN: [0.2, 0.3], fN: [0.2, 0.03],
    pF: [-0.02, 0.32], kF: [0.02, 0.04], fF: [-0.2, 0.04],
  }),
  crouch: pose({
    head: [0.09, 0.63], neck: [0.07, 0.56], pelvis: [-0.02, 0.28],
    sN: [0.07, 0.53], eN: [0.12, 0.42], hN: [0.06, 0.6],
    sF: [0.03, 0.53], eF: [-0.05, 0.47], hF: [-0.1, 0.58],
    pN: [0, 0.27], kN: [0.18, 0.3], fN: [0.14, 0.03],
    pF: [-0.03, 0.26], kF: [0.06, 0.08], fF: [-0.18, 0.03],
  }),
};

export interface FigOpts {
  dress?: "robe" | "tunic" | "nude";
  /** A cloak blowing out behind (size factor). */
  cloak?: number;
  beard?: boolean;
  helmet?: boolean;
  attrs?: ("spear" | "shield" | "sword" | "book" | "palm" | "trumpet" | "staff")[];
  wings?: boolean;
  /** Putto proportions (chubby limbs). */
  plump?: number;
  seed?: number;
}

/** Convex hull (monotone chain). */
function hull(pts: V2[]): V2[] {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o: V2, a: V2, b: V2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: V2[] = [], up: V2[] = [];
  for (const q of p) {
    while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
    lo.push(q);
  }
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
    up.push(q);
  }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

const lerp2 = (a: V2, b: V2, t: number): V2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const add2 = (a: V2, x: number, y: number): V2 => [a[0] + x, a[1] + y];

/** A figure in the given pose (local units: standing height 1, facing +x). */
export function figure(r: Relief, P: Pose, o: FigOpts = {}) {
  const dress = o.dress ?? "robe";
  const rnd = rng(o.seed ?? 7);
  const k = o.plump ?? 1;
  const robe = dress === "robe";
  // --- heights (projection) of the layers, back to front
  const hFarArm = 0.05, hFarLeg = 0.055, hTorso = 0.085, hNearLeg = 0.075, hHead = 0.09, hNearArm = 0.1;

  if (o.wings) {
    const root = lerp2(P.sF, P.neck, 0.3);
    const up = Math.atan2(P.neck[1] - P.pelvis[1], P.neck[0] - P.pelvis[0]);
    wing(r, root[0] - 0.02, root[1] - 0.02, up + 50 * DEG, 0.72, 0.058, 1);
  }
  if (o.cloak) {
    const c = o.cloak;
    const back = Math.atan2(P.neck[1] - P.pelvis[1], P.neck[0] - P.pelvis[0]) + Math.PI / 2;
    const bx = Math.cos(back), by = Math.sin(back);
    const pts: V2[] = [
      add2(P.sN, 0.02, 0.02), add2(P.sF, -0.03, 0.03),
      add2(P.sF, (bx * 0.2 - 0.05) * c, (by * 0.2 - 0.15) * c),
      add2(P.pelvis, (bx * 0.28 - 0.02) * c, (by * 0.28 - 0.12) * c - 0.05 * rnd()),
      add2(P.pelvis, bx * 0.16 * c, by * 0.16 * c - 0.2),
      add2(P.pelvis, 0, 0.05),
    ];
    r.plate(pts, 0.042, 0.05);
    for (let i = 0; i < 4; i++) {
      const t = (i + 0.5) / 4;
      r.stroke([lerp2(P.sF, P.sN, t * 0.6), lerp2(pts[3], pts[4], t)], 0.012, 0.018, 0.012, 0.01, "add");
    }
  }

  // --- far limbs
  const armR = robe ? [0.05, 0.044, 0.035] : [0.042 * k, 0.035 * k, 0.027 * k];
  r.tube([[...P.sF, armR[0], hFarArm], [...P.eF, armR[1], hFarArm], [...P.hF, armR[2], hFarArm]]);
  r.blob(P.hF[0], P.hF[1], 0.03 * k, 0.033 * k, hFarArm + 0.005);
  const legR = [0.07 * k, 0.05 * k, 0.034 * k];
  const leg = (p: Joint, kn: Joint, f: Joint, h: number) => {
    const toe = add2(f, 0.075, -0.015);
    if (robe) {
      r.tube([[...p, 0.085, h], [...kn, 0.08, h], [...add2(f, 0, 0.05), 0.082, h * 0.95]]);
      r.tube([[...add2(f, 0.01, 0.0), 0.028, h * 0.7], [...toe, 0.02, h * 0.6]]);
    } else {
      r.tube([[...p, legR[0], h], [...kn, legR[1], h], [...f, legR[2], h * 0.95]]);
      r.tube([[...f, 0.028 * k, h * 0.8], [...toe, 0.02 * k, h * 0.7]]);
    }
  };
  leg(P.pF, P.kF, P.fF, hFarLeg);

  // --- torso
  const chest = lerp2(P.pelvis, P.neck, 0.62);
  r.tube([[...P.pelvis, 0.1 * k, hTorso * 0.95], [...chest, 0.116 * k, hTorso], [...P.neck, 0.058 * k, hTorso * 0.85]]);
  r.blob(P.sN[0], P.sN[1], 0.056 * k, 0.056 * k, hTorso * 1.02);
  r.blob(P.sF[0], P.sF[1], 0.052 * k, 0.052 * k, hTorso * 0.9);
  if (robe) {
    // the skirt of the robe, falling between the legs to the hem
    const hemL = P.fN[0] < P.fF[0] ? P.fN : P.fF, hemR = P.fN[0] < P.fF[0] ? P.fF : P.fN;
    const hem: V2[] = [add2(hemR, 0.085, 0.03), add2(hemL, -0.08, 0.03)];
    const skirt = hull([add2(P.pelvis, -0.11, 0.04), add2(P.pelvis, 0.11, 0.04), add2(P.kN, 0.08, 0), add2(P.kN, 0, 0.07), add2(P.kF, -0.08, 0), add2(P.kF, 0, 0.07), hem[0], hem[1], add2(hem[0], 0, 0.1), add2(hem[1], 0, 0.1)]);
    r.plate(skirt, 0.072, 0.07);
    // folds falling from the knees and the waist to the hem
    const kMid = lerp2(P.kN, P.kF, 0.5);
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      const a = lerp2(add2(P.pelvis, (t - 0.5) * 0.16, -0.02), kMid, 0.35);
      const b = lerp2(hem[1], hem[0], 0.1 + 0.8 * t);
      r.stroke([a, lerp2(a, b, 0.5), add2(b, 0, 0.02)], 0.011, 0.018, 0.01, 0.015, "add");
    }
    // girdle and chest folds
    r.stroke([add2(P.pelvis, -0.09, 0.07), add2(P.pelvis, 0.09, 0.07)], 0.014, 0.014, 0.012, 0.012, "add");
    for (const s of [-1, 1]) r.stroke([lerp2(P.neck, s > 0 ? P.sN : P.sF, 0.6), add2(P.pelvis, s * 0.03, 0.1)], 0.01, 0.012, 0.009, 0.006, "add");
  } else if (dress === "tunic") {
    const skirt: V2[] = [add2(P.pelvis, -0.1, 0.06), add2(P.pelvis, 0.1, 0.06), add2(lerp2(P.pN, P.kN, 0.75), 0.075, 0), add2(lerp2(P.pF, P.kF, 0.75), -0.075, 0)];
    r.plate(skirt, 0.08, 0.05);
    for (let i = 0; i < 4; i++) {
      const t = (i + 0.5) / 4;
      r.stroke([add2(P.pelvis, (t - 0.5) * 0.16, 0.04), lerp2(skirt[3], skirt[2], t)], 0.01, 0.013, 0.012, 0.014, "add");
    }
    // breastplate edge and belt
    r.stroke([add2(P.pelvis, -0.09, 0.08), add2(P.pelvis, 0.09, 0.08)], 0.016, 0.016, 0.014, 0.014, "add");
    r.stroke([lerp2(P.sF, P.neck, 0.5), add2(P.neck, 0, -0.06), lerp2(P.sN, P.neck, 0.5)], 0.01, 0.01, 0.008, 0.008, "add");
  }

  // --- near leg, head, near arm
  leg(P.pN, P.kN, P.fN, hNearLeg);
  const tilt = Math.atan2(P.head[0] - P.neck[0], P.head[1] - P.neck[1]);
  const face = 1;
  r.blob(P.head[0], P.head[1], 0.064 * k, 0.078 * k, hHead, "max", -tilt * 0.6);
  // face: nose, brow, ear; hair or helmet
  const fx = Math.cos(tilt), fy = -Math.sin(tilt); // "forward" (+x) turned with the head
  const at = (dx: number, dy: number): V2 => [P.head[0] + fx * dx - fy * dy * 0 + Math.sin(tilt) * dy, P.head[1] + fy * dx + Math.cos(tilt) * dy];
  const nose = at(0.05 * face, -0.01);
  r.blob(nose[0], nose[1], 0.014, 0.022, 0.012, "add");
  if (o.helmet) {
    const hc = at(-0.004, 0.02);
    r.blob(hc[0], hc[1], 0.068, 0.06, hHead + 0.012);
    r.stroke([at(0.05, 0.05), at(0.0, 0.1), at(-0.07, 0.07), at(-0.1, 0.0)], 0.018, 0.012, hHead + 0.02, hHead, "max");
  } else {
    const hc = at(-0.012, 0.024);
    r.blob(hc[0], hc[1], 0.058, 0.052, 0.012, "add");
    r.field(hc[0] - 0.06, hc[1] - 0.05, hc[0] + 0.06, hc[1] + 0.06, (x, y) => {
      const dx = (x - hc[0]) / 0.06, dy = (y - hc[1]) / 0.055;
      const d = dx * dx + dy * dy;
      return d < 1 ? 0.006 * (1 + Math.sin(x * 210 + Math.sin(y * 170) * 2) * Math.sin(y * 190)) * (1 - d) : 0;
    });
  }
  if (o.beard) {
    const bc = at(0.022, -0.052);
    r.blob(bc[0], bc[1], 0.034, 0.03, 0.014, "add");
  }
  r.tube([[...P.sN, armR[0], hNearArm], [...P.eN, armR[1], hNearArm], [...P.hN, armR[2], hNearArm]]);
  r.blob(P.hN[0], P.hN[1], 0.032 * k, 0.035 * k, hNearArm + 0.006);
  if (robe) {
    // a loose sleeve hanging from the forearm
    const m = lerp2(P.eN, P.hN, 0.35);
    r.blob(m[0], m[1] - 0.02, 0.045, 0.06, hNearArm - 0.01, "max", Math.atan2(P.hN[1] - P.eN[1], P.hN[0] - P.eN[0]));
  }

  // --- attributes
  for (const a of o.attrs ?? []) {
    if (a === "spear" || a === "staff") {
      const up: V2 = a === "spear" ? [0.06, 0.45] : [0.02, 0.4];
      r.stroke([add2(P.hN, -up[0] * 0.9, -up[1] * 0.95), add2(P.hN, up[0], up[1])], 0.013, 0.011, hNearArm + 0.01, hNearArm + 0.01);
      if (a === "spear") r.leaf(P.hN[0] + up[0], P.hN[1] + up[1], 0.09, 0.04, Math.atan2(up[1], up[0]), hNearArm + 0.015);
    } else if (a === "shield") {
      r.blob(P.hF[0] - 0.02, P.hF[1], 0.1, 0.13, 0.075);
      r.blob(P.hF[0] - 0.02, P.hF[1], 0.03, 0.03, 0.02, "add");
      r.ring(P.hF[0] - 0.02, P.hF[1], 0.085, 0.115, 0.012, 0.012, "add");
    } else if (a === "sword") {
      r.stroke([P.hN, add2(P.hN, 0.2, -0.16)], 0.012, 0.009, hNearArm + 0.012, hNearArm + 0.01);
      r.stroke([add2(P.hN, -0.02, 0.03), add2(P.hN, 0.03, -0.03)], 0.01, 0.01, hNearArm + 0.02, hNearArm + 0.02);
    } else if (a === "book") {
      r.plate([add2(P.hF, -0.05, -0.03), add2(P.hF, 0.05, -0.04), add2(P.hF, 0.06, 0.03), add2(P.hF, -0.04, 0.04)], hTorso + 0.02, 0.012);
    } else if (a === "palm") {
      palmFrond(r, P.hN[0], P.hN[1] - 0.05, 80 * DEG, 0.55, hNearArm);
    } else if (a === "trumpet") {
      const m = at(0.05, -0.02);
      r.tube([[m[0], m[1], 0.01, hHead + 0.01], [m[0] + 0.33, m[1] + 0.12, 0.012, hHead + 0.01], [m[0] + 0.4, m[1] + 0.145, 0.035, hHead + 0.01]]);
    }
  }
}

/**
 * A wing from the shoulder root (x, y) along angle ang (towards the tip), length len; the flight
 * feathers hang to side (-1: clockwise of the arm, +1: counter-clockwise).
 */
export function wing(r: Relief, x: number, y: number, ang: number, len: number, hgt: number, side: number, n = 9) {
  const tip: V2 = [x + Math.cos(ang) * len * 0.58, y + Math.sin(ang) * len * 0.58];
  // the wing's body (the covert area), a long mass along the arm, set towards the feathers
  const px = Math.cos(ang + side * Math.PI / 2), py = Math.sin(ang + side * Math.PI / 2);
  const mid = lerp2([x, y], tip, 0.45);
  r.blob(mid[0] + px * len * 0.07, mid[1] + py * len * 0.07, len * 0.36, len * 0.15, hgt * 0.95, "max", ang, 0.6);
  // flight feathers: perpendicular to the arm near the body, swept along it towards the tip
  for (let i = n - 1; i >= 0; i--) {
    const t = i / (n - 1);
    const base = lerp2([x, y], tip, 0.12 + 0.88 * t);
    const a = ang + side * (98 - 86 * Math.pow(t, 1.1)) * DEG;
    const L = len * (0.4 + 0.42 * Math.pow(t, 0.8));
    r.blob(base[0] + Math.cos(a) * L * 0.5, base[1] + Math.sin(a) * L * 0.5, L * 0.5, len * 0.075, hgt * (0.68 + 0.14 * t), "max", a, 0.6);
    r.stroke([base, [base[0] + Math.cos(a) * L * 0.85, base[1] + Math.sin(a) * L * 0.85]], len * 0.008, len * 0.004, len * 0.012, len * 0.006, "sub");
  }
  // coverts: rows of short broad feathers over the roots of the flight feathers
  for (let row = 0; row < 3; row++) {
    const m = 7 - row;
    for (let i = 0; i < m; i++) {
      const t = (i + 0.5) / m;
      const base = lerp2([x, y], tip, 0.04 + 0.9 * t);
      const a = ang + side * (88 - 55 * t) * DEG;
      const L = len * (0.26 - row * 0.06);
      r.blob(base[0] + Math.cos(a) * L * 0.5, base[1] + Math.sin(a) * L * 0.5, L * 0.52, len * 0.07, hgt * (0.98 + row * 0.07), "max", a, 0.6);
    }
  }
  r.stroke([[x, y], tip], len * 0.05, len * 0.03, hgt * 1.18, hgt * 1.05);
}

/** A palm frond: a curving stem with leaflets on both sides. */
export function palmFrond(r: Relief, x: number, y: number, ang: number, len: number, hgt: number, bend = 0.25) {
  const pts: V2[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const a = ang - bend * t;
    const d = len * t;
    pts.push([x + Math.cos(a) * d, y + Math.sin(a) * d]);
  }
  r.stroke(pts, len * 0.022, len * 0.01, hgt, hgt * 0.9);
  for (let i = 1; i < 14; i++) {
    const t = i / 14;
    const p = lerp2(pts[Math.floor(t * 8)], pts[Math.min(8, Math.floor(t * 8) + 1)], (t * 8) % 1);
    const a = ang - bend * t;
    const L = len * 0.28 * Math.sin(Math.PI * (0.2 + 0.8 * t)) + len * 0.04;
    for (const s of [-1, 1]) r.leaf(p[0], p[1], L, len * 0.05, a + s * 50 * DEG, hgt * 0.85, "max", s * 0.1);
  }
}

/** Laurel branch: pairs of pointed leaves along a curve (for wreaths). */
export function laurel(r: Relief, pts: V2[], leaf: number, hgt: number, seed = 1) {
  const rnd = rng(seed);
  r.stroke(pts, leaf * 0.08, leaf * 0.08, hgt * 0.6, hgt * 0.6);
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const dir = Math.atan2(b[1] - a[1], b[0] - a[0]);
    for (const s of [-1, 1]) r.leaf(a[0], a[1], leaf, leaf * 0.42, dir + s * (32 + 10 * rnd()) * DEG, hgt * (0.85 + 0.2 * rnd()));
    if (i % 3 === 1) r.blob(a[0], a[1], leaf * 0.13, leaf * 0.13, hgt * 1.1);
  }
}

/** A flame tongue rising from (x, y). */
function flame(r: Relief, x: number, y: number, h: number, w: number, hgt: number, lean: number, seed: number) {
  const rnd = rng(seed);
  const pts: [number, number, number, number][] = [];
  const ph = rnd() * 6;
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const sway = Math.sin(ph + t * 5) * w * 0.35 * t + lean * t * t * h;
    pts.push([x + sway, y + h * t, w * 0.5 * Math.pow(1 - t, 0.7) + w * 0.03, hgt * (1 - 0.5 * t)]);
  }
  r.tube(pts);
}

/** A cloud bank of billows along a path. */
export function cloud(r: Relief, x0: number, x1: number, y: number, size: number, hgt: number, seed: number) {
  const rnd = rng(seed);
  const n = Math.max(3, Math.round((x1 - x0) / (size * 0.55)));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const env = 0.5 + 0.5 * Math.sin(Math.PI * t);
    const x = x0 + (x1 - x0) * t + (rnd() - 0.5) * size * 0.3;
    const s = size * (0.55 + 0.45 * rnd()) * (0.55 + 0.45 * env);
    r.blob(x, y + (rnd() - 0.4) * size * 0.3, s, s * 0.7, hgt * (0.55 + 0.35 * rnd()) * (0.7 + 0.3 * env), "max", 0, 0.85);
    if (rnd() < 0.75) r.blob(x + (rnd() - 0.5) * size * 0.5, y + s * 0.5, s * 0.62, s * 0.5, hgt * (0.7 + 0.3 * env), "max", 0, 0.85);
  }
}

/**
 * Cherub head with wings (head radius 1 in local units): a plump face, curls, and wings
 * spreading to the sides beneath it.
 */
export function cherubHead(r: Relief, wings: "side" | "up" = "side") {
  for (const s of [-1, 1]) {
    if (wings === "side") wing(r, s * 0.4, -0.45, s > 0 ? 14 * DEG : Math.PI - 14 * DEG, 2.2, 0.34, s > 0 ? -1 : 1, 8);
    else wing(r, s * 0.45, -0.25, s > 0 ? 40 * DEG : Math.PI - 40 * DEG, 2.0, 0.32, s > 0 ? -1 : 1, 8);
  }
  // hair: a mass framing the face, worked into curls
  r.blob(0, 0.12, 1.02, 0.98, 0.56, "max", 0, 0.6);
  for (let i = 0; i <= 13; i++) {
    const a = (-25 + (230 * i) / 13) * DEG;
    r.blob(Math.cos(a) * 0.86, Math.sin(a) * 0.84 + 0.12, 0.24, 0.22, 0.2, "add", 0, 0.8);
  }
  r.blob(0, -0.04, 0.8, 0.9, 0.8, "max", 0, 0.55);
  r.group("add", () => {
    for (const s of [-1, 1]) {
      r.blob(s * 0.38, -0.3, 0.3, 0.28, 0.16);
      r.stroke([[s * 0.12, 0.3], [s * 0.3, 0.36], [s * 0.48, 0.3]], 0.07, 0.05, 0.08, 0.05);
    }
    r.blob(0, -0.72, 0.24, 0.16, 0.08);
    r.blob(0, -0.08, 0.13, 0.24, 0.22, "max", 0, 0.6);
  });
  r.group("sub", () => {
    for (const s of [-1, 1]) r.blob(s * 0.3, 0.14, 0.15, 0.075, 0.16);
    r.stroke([[-0.15, -0.43], [0, -0.48], [0.15, -0.43]], 0.05, 0.05, 0.12, 0.12);
  });
  // forelock curls
  for (let i = 0; i < 4; i++) r.blob(-0.3 + i * 0.2, 0.74, 0.13, 0.12, 0.08, "add");
}

/** Hanging drop of fruit and flowers from a ribbon bow (local: width 1, top at y = 0, hanging to y = -len). */
export function drop(r: Relief, len: number, hgt: number, seed: number) {
  const rnd = rng(seed);
  // ribbon bow
  for (const s of [-1, 1]) {
    r.ring(s * 0.22, -0.12, 0.2, 0.1, 0.05, hgt * 0.45, "max");
    r.stroke([[0, -0.15], [s * 0.18, -0.4], [s * 0.1, -0.7]], 0.05, 0.035, hgt * 0.4, hgt * 0.35);
  }
  r.blob(0, -0.14, 0.09, 0.09, hgt * 0.55);
  // the chain: alternating clusters, getting smaller downwards
  let y = -0.35;
  let i = 0;
  while (y > -len + 0.25) {
    const t = -y / len;
    const s = 0.5 * (1 - 0.55 * t);
    const kind = i % 3;
    // leaves behind each cluster
    for (const sd of [-1, 1]) r.leaf(0, y, s * 1.1, s * 0.5, -Math.PI / 2 + sd * (48 + 12 * rnd()) * DEG, hgt * 0.45, "max", sd * 0.15);
    if (kind === 0) {
      // pomegranate / apple
      r.blob(0, y - s * 0.45, s * 0.55, s * 0.55, hgt, "max", 0, 0.6);
      r.blob(0, y - s * 0.05, s * 0.14, s * 0.12, hgt * 0.95);
    } else if (kind === 1) {
      // bunch of grapes
      for (let g = 0; g < 9; g++) {
        const row = Math.floor(Math.sqrt(g * 2)), gx = (g - row * row * 0.5) * 0.3 - row * 0.12;
        r.blob(gx * s, y - s * (0.15 + row * 0.26), s * 0.17, s * 0.17, hgt * (0.8 + 0.15 * rnd()), "max", 0, 0.7);
      }
    } else {
      // flower: rosette of petals
      for (let p = 0; p < 6; p++) {
        const a = (p / 6) * Math.PI * 2 + rnd();
        r.leaf(0, y - s * 0.4, s * 0.42, s * 0.3, a, hgt * 0.8);
      }
      r.blob(0, y - s * 0.4, s * 0.14, s * 0.14, hgt);
    }
    y -= s * 1.0;
    i++;
  }
  // tassel end
  r.stroke([[0, y + 0.1], [0, y - 0.12]], 0.07, 0.02, hgt * 0.6, hgt * 0.4);
}

/** Laurel wreath (radius R) tied with a ribbon at the bottom. */
export function wreath(r: Relief, R: number, leaf: number, hgt: number, seed: number) {
  for (const s of [-1, 1]) {
    const pts: V2[] = [];
    for (let i = 0; i <= 12; i++) {
      const a = -Math.PI / 2 + s * (0.12 + (i / 12) * (Math.PI - 0.3));
      pts.push([Math.cos(a) * R, Math.sin(a) * R]);
    }
    laurel(r, pts, leaf, hgt, seed + s);
  }
  r.blob(0, -R, leaf * 0.35, leaf * 0.3, hgt * 1.1);
  for (const s of [-1, 1]) r.stroke([[0, -R], [s * leaf * 0.5, -R - leaf * 0.8], [s * leaf * 0.3, -R - leaf * 1.5]], leaf * 0.14, leaf * 0.1, hgt * 0.7, hgt * 0.6);
}

// ------------------------------------------------------------------------------ horse

/**
 * A horse (local: body length 1; origin at the hind hooves, facing +x). rear: 0 standing, 1
 * rearing (forelegs folded up).
 */
export function horse(r: Relief, rear: number, seed = 3) {
  const rnd = rng(seed);
  const fl = rear > 0.5;
  // far legs
  const hindF: [number, number, number, number][] = [[0.02, 0.44, 0.07, 0.1], [0.08, 0.24, 0.035, 0.1], [0.02, 0.08, 0.028, 0.1], [0.04, 0.0, 0.03, 0.1]];
  const foreF: [number, number, number, number][] = fl
    ? [[0.62, 0.42, 0.06, 0.1], [0.74, 0.32, 0.035, 0.1], [0.7, 0.18, 0.03, 0.1], [0.74, 0.12, 0.03, 0.1]]
    : [[0.62, 0.4, 0.06, 0.1], [0.64, 0.2, 0.035, 0.1], [0.65, 0.03, 0.028, 0.1], [0.67, 0.0, 0.03, 0.1]];
  r.tube(hindF);
  r.tube(foreF);
  // tail
  for (let i = 0; i < 4; i++) {
    const s = rnd();
    r.stroke([[-0.04, 0.6], [-0.14 - 0.04 * i, 0.5 + 0.02 * s], [-0.16 - 0.03 * i, 0.3 - 0.03 * i]], 0.03, 0.012, 0.11, 0.09);
  }
  // body masses
  r.blob(0.32, 0.53, 0.36, 0.15, 0.15, "max", 0, 0.6);
  r.blob(0.06, 0.55, 0.16, 0.16, 0.16, "max", 0, 0.6);
  r.blob(0.6, 0.53, 0.14, 0.16, 0.16, "max", 0, 0.6);
  // neck and head
  r.tube([[0.6, 0.58, 0.11, 0.15], [0.7, 0.74, 0.08, 0.14], [0.77, 0.87, 0.06, 0.13]]);
  r.tube([[0.77, 0.9, 0.06, 0.13], [0.92, 0.8, 0.034, 0.11]]);
  r.blob(0.8, 0.84, 0.06, 0.05, 0.135);
  r.stroke([[0.77, 0.95], [0.75, 1.02]], 0.018, 0.008, 0.12, 0.11);
  r.blob(0.92, 0.8, 0.012, 0.012, 0.01, "sub");
  r.blob(0.81, 0.88, 0.012, 0.01, 0.012, "sub");
  // mane
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const p = lerp2([0.62, 0.66], [0.75, 0.94], t);
    r.stroke([p, [p[0] - 0.06, p[1] - 0.03 - 0.02 * rnd()]], 0.018, 0.008, 0.015, 0.01, "add");
  }
  // near legs
  const hindN: [number, number, number, number][] = [[0.08, 0.45, 0.08, 0.17], [0.14, 0.26, 0.04, 0.17], [0.07, 0.09, 0.03, 0.17], [0.1, 0.0, 0.032, 0.17]];
  const foreN: [number, number, number, number][] = fl
    ? [[0.58, 0.42, 0.065, 0.18], [0.68, 0.36, 0.038, 0.18], [0.64, 0.22, 0.03, 0.18], [0.68, 0.17, 0.032, 0.18]]
    : [[0.58, 0.4, 0.065, 0.18], [0.6, 0.2, 0.038, 0.18], [0.6, 0.03, 0.03, 0.18], [0.62, 0.0, 0.032, 0.18]];
  r.tube(hindN);
  r.tube(foreN);
  // saddle cloth and bridle
  r.plate([[0.2, 0.66], [0.44, 0.66], [0.42, 0.46], [0.22, 0.45]], 0.012, 0.02, "add");
  r.stroke([[0.8, 0.9], [0.86, 0.78], [0.92, 0.82]], 0.008, 0.008, 0.015, 0.015, "add");
}

// ------------------------------------------------------------------------------ compositions

/** Tympanum mask: a triangle of half-width hw and height th (relief origin at the bottom-left corner). */
function triangleMask(hw: number, th: number, margin: number) {
  return (u: number, v: number) => {
    const lim = th * (1 - Math.abs(u - hw) / hw) - margin;
    const d = lim - v;
    return d <= 0 ? 0 : Math.min(1, d / 0.25);
  };
}

/**
 * West pediment: the Conversion of St Paul (Francis Bird, 1706) — Saul struck down on the road
 * to Damascus by the light from heaven, his horse rearing, his companions recoiling and fleeing.
 * Size: tympanum base 2 hw, height th (metres).
 */
export function conversionOfPaul(hw: number, th: number, res = 0.04): Relief {
  const r = new Relief(2 * hw, th, res);
  r.mask = triangleMask(hw, th, 0.12);
  const c = hw;
  // glory: the light breaking through clouds near the apex, rays falling on Saul
  cloud(r, c - 2.1, c - 0.1, th - 1.3, 0.34, 0.26, 11);
  for (let i = 0; i < 8; i++) {
    const a = (-98 - i * 9) * DEG;
    r.wedge(c - 1.1, th - 1.4, a, 1.25 + 0.35 * ((i * 3) % 4) / 3, 0.03, 0.14, 0.07);
  }
  // the horse rearing away from the light
  r.at(c + 0.25, 0.1, { s: 3.2, rot: 30 * DEG, depth: 1.25 }, () => horse(r, 1, 5));
  // Saul fallen at its feet, arm raised against the light
  r.at(c - 1.55, 0.1, { s: 3.4, mirror: true, depth: 1.3, z: 0.02 }, () => figure(r, POSES.fallen, { dress: "tunic", cloak: 1.3, beard: true, seed: 1 }));
  // a companion holding the bridle
  r.at(c + 3.5, 0.1, { s: 2.9, mirror: true, depth: 1.2 }, () => figure(r, POSES.rein, { dress: "tunic", helmet: true, cloak: 0.9, seed: 2 }));
  // companions on the left recoiling, kneeling, crouching
  r.at(c - 4.0, 0.1, { s: 2.7, depth: 1.2 }, () => figure(r, POSES.recoil, { dress: "tunic", helmet: true, cloak: 1, attrs: ["shield"], seed: 3 }));
  r.at(c - 6.0, 0.1, { s: 2.15, depth: 1.2 }, () => figure(r, POSES.kneelUp, { dress: "tunic", helmet: true, cloak: 0.7, seed: 4 }));
  r.at(c - 7.75, 0.1, { s: 1.6, depth: 1.2 }, () => figure(r, POSES.crouch, { dress: "tunic", helmet: true, attrs: ["shield"], seed: 5 }));
  // on the right one flees, one cowers
  r.at(c + 5.6, 0.1, { s: 2.05, depth: 1.2 }, () => figure(r, POSES.flee, { dress: "tunic", helmet: true, cloak: 1.1, attrs: ["spear"], seed: 8 }));
  r.at(c + 7.45, 0.1, { s: 1.65, mirror: true, depth: 1.2 }, () => figure(r, POSES.crouch, { dress: "tunic", helmet: true, attrs: ["shield"], seed: 9 }));
  // reclining figures in the corners
  r.at(c - 9.05, 0.1, { s: 1.55, depth: 1.1 }, () => figure(r, POSES.recline, { dress: "robe", seed: 6 }));
  r.at(c + 9.05, 0.1, { s: 1.55, mirror: true, depth: 1.1 }, () => figure(r, POSES.recline, { dress: "tunic", helmet: true, seed: 7 }));
  // a dropped spear, and the ground
  r.stroke([[c - 3.4, 0.2], [c - 0.9, 0.34]], 0.045, 0.04, 0.13, 0.13);
  r.plate([[0, 0], [2 * hw, 0], [2 * hw, 0.12], [0, 0.12]], 0.1, 0.04);
  return r;
}

/**
 * North pediment: the royal arms within the Garter, crowned, supported by angels with palm
 * branches (after Grinling Gibbons).
 */
export function royalArms(hw: number, th: number, res = 0.04): Relief {
  const r = new Relief(2 * hw, th, res);
  r.mask = triangleMask(hw, th, 0.1);
  const c = hw;
  // mantling: acanthus behind the shield
  for (const s of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const a = (s > 0 ? 0 : Math.PI) + s * (-50 + i * 22) * DEG;
      r.leaf(c + s * 0.4, 1.6, 1.05 - i * 0.05, 0.42, a, 0.2, "max", s * 0.15);
    }
  }
  // garter ring and the shield
  r.ring(c, 1.55, 0.95, 1.12, 0.13, 0.3);
  r.ring(c, 1.55, 0.95, 1.12, 0.03, 0.04, "sub");
  const shield: V2[] = [[c - 0.72, 2.45], [c + 0.72, 2.45], [c + 0.72, 1.3], [c + 0.45, 0.8], [c, 0.55], [c - 0.45, 0.8], [c - 0.72, 1.3]];
  r.plate(shield, 0.34, 0.08);
  r.group("sub", () => {
    r.stroke([[c, 2.4], [c, 0.62]], 0.025, 0.025, 0.05, 0.05);
    r.stroke([[c - 0.7, 1.55], [c + 0.7, 1.55]], 0.025, 0.025, 0.05, 0.05);
  });
  // charges: three lions passant (England), a lion rampant (Scotland), the harp (Ireland), lilies (France)
  const lion = (x: number, y: number, s: number) => {
    r.blob(x, y, 0.13 * s, 0.05 * s, 0.05, "add");
    r.blob(x + 0.12 * s, y + 0.04 * s, 0.05 * s, 0.05 * s, 0.06, "add");
    r.stroke([[x - 0.12 * s, y], [x - 0.18 * s, y + 0.08 * s]], 0.015 * s, 0.01 * s, 0.03, 0.03, "add");
  };
  for (let i = 0; i < 3; i++) lion(c - 0.36, 2.25 - i * 0.2, 1);
  for (let i = 0; i < 3; i++) lion(c + 0.34, 1.12 - i * 0.18, 0.8);
  r.blob(c + 0.36, 2.02, 0.12, 0.22, 0.06, "add", 0.3);
  r.stroke([[c + 0.25, 1.85], [c + 0.3, 2.2], [c + 0.48, 2.3]], 0.03, 0.02, 0.05, 0.05, "add");
  r.stroke([[c - 0.5, 1.4], [c - 0.46, 0.95], [c - 0.2, 0.85]], 0.03, 0.03, 0.06, 0.06, "add");
  for (let i = 0; i < 4; i++) r.stroke([[c - 0.46 + i * 0.07, 1.36], [c - 0.43 + i * 0.07, 0.98]], 0.008, 0.008, 0.03, 0.03, "add");
  // crown
  r.plate([[c - 0.6, 2.62], [c + 0.6, 2.62], [c + 0.62, 2.85], [c - 0.62, 2.85]], 0.3, 0.05);
  for (const s of [-1, 0, 1]) r.stroke([[c + s * 0.55, 2.84], [c + s * 0.38, 3.2], [c, 3.3]], 0.05, 0.04, 0.26, 0.24);
  r.blob(c, 3.38, 0.1, 0.1, 0.26);
  r.stroke([[c, 3.44], [c, 3.62]], 0.035, 0.035, 0.24, 0.24);
  r.stroke([[c - 0.08, 3.55], [c + 0.08, 3.55]], 0.03, 0.03, 0.24, 0.24);
  for (let i = -4; i <= 4; i++) r.blob(c + i * 0.13, 2.74, 0.035, 0.035, 0.035, "add");
  // supporters: angels kneeling with palm branches; putti on clouds towards the corners
  for (const s of [-1, 1]) {
    r.at(c + s * 2.3, 0.1, { s: 3.05, mirror: s > 0, depth: 1.15 }, () => {
      figure(r, POSES.support, { dress: "robe", wings: true, seed: 20 + s });
      palmFrond(r, 0.12, 0.42, 100 * DEG, 0.5, 0.11, 0.35);
    });
    palmFrond(r, c + s * 3.4, 0.25, s > 0 ? 12 * DEG : Math.PI - 12 * DEG, 2.5, 0.16, s > 0 ? -0.12 : 0.12);
    cloud(r, c + s * 6.0 - 1.4, c + s * 6.0 + 1.4, 0.3, 0.3, 0.16, 30 + s);
    r.at(c + s * 5.7, 0.2, { s: 1.75, mirror: s > 0, depth: 1.0, z: 0.03 }, () => figure(r, POSES.recline, { dress: "nude", plump: 1.45, wings: true, seed: 33 + s }));
    r.at(c + s * 7.7, 0.45, { s: 0.2, depth: 0.9 }, () => cherubHead(r, "side"));
  }
  r.plate([[0, 0], [2 * hw, 0], [2 * hw, 0.1], [0, 0.1]], 0.08, 0.03);
  return r;
}

/**
 * South pediment: the phoenix rising from the flames, over the word RESURGAM (Caius Gabriel
 * Cibber, 1698) — the stone Wren's workmen found in the ruins, inscribed "I shall rise again".
 */
export function phoenix(hw: number, th: number, res = 0.04): Relief {
  const r = new Relief(2 * hw, th, res);
  r.mask = triangleMask(hw, th, 0.1);
  const c = hw;
  // the tablet with the inscription
  r.plate([[c - 2.3, 0.1], [c + 2.3, 0.1], [c + 2.3, 0.68], [c - 2.3, 0.68]], 0.16, 0.05);
  const size = 0.36, w = Relief.textWidth("RESURGAM", size, 0.3);
  r.text("RESURGAM", c - w / 2, 0.21, size, 0.09, "sub", 0.3);
  // the pyre and the flames
  r.plate([[c - 1.9, 0.68], [c + 1.9, 0.68], [c + 1.5, 1.0], [c - 1.5, 1.0]], 0.2, 0.06);
  for (let i = 0; i < 4; i++) r.stroke([[c - 1.7 + i * 0.2, 0.75 + i * 0.06], [c + 1.7 - i * 0.2, 0.75 + i * 0.06]], 0.035, 0.035, 0.04, 0.04, "add");
  for (let i = 0; i < 13; i++) {
    const t = i / 12;
    const x = c - 1.8 + 3.6 * t;
    const h = 0.7 + 0.8 * Math.sin(Math.PI * t) + 0.2 * ((i * 7) % 3) / 3;
    flame(r, x, 0.95, h, 0.3, 0.26, (t - 0.5) * 0.35, 40 + i);
  }
  // wings raised and spread
  for (const s of [-1, 1]) {
    wing(r, c + s * 0.35, 2.05, s > 0 ? 18 * DEG : Math.PI - 18 * DEG, 3.4, 0.24, s > 0 ? -1 : 1, 11);
  }
  // tail feathers falling into the flames
  for (let i = -2; i <= 2; i++) r.leaf(c + i * 0.08, 1.75, 1.0 - Math.abs(i) * 0.1, 0.22, -Math.PI / 2 + i * 14 * DEG, 0.28, "max", i * 0.05);
  // body, neck and head turned up towards the sun
  r.blob(c, 1.95, 0.42, 0.5, 0.42, "max", 0, 0.6);
  r.tube([[c, 2.3, 0.2, 0.4], [c + 0.08, 2.65, 0.14, 0.38], [c + 0.02, 2.95, 0.13, 0.38]]);
  r.blob(c + 0.04, 3.02, 0.17, 0.15, 0.4, "max", 0, 0.6);
  r.tube([[c + 0.18, 3.0, 0.06, 0.38], [c + 0.36, 2.95, 0.015, 0.34]]);
  r.blob(c + 0.07, 3.06, 0.03, 0.025, 0.05, "sub");
  for (let i = 0; i < 4; i++) r.stroke([[c - 0.02 + i * 0.03, 3.12], [c - 0.14 + i * 0.05, 3.4 - i * 0.03]], 0.03, 0.012, 0.36, 0.3);
  // breast feathers
  r.field(c - 0.45, 1.5, c + 0.45, 2.45, (x, y) => {
    const dx = (x - c) / 0.4, dy = (y - 1.95) / 0.48;
    const d = dx * dx + dy * dy;
    return d < 1 ? 0.012 * (1 - d) * (0.5 + 0.5 * Math.cos(y * 38 + Math.abs(x - c) * 18)) : 0;
  });
  // rays of the sun behind, and palm branches and smoke towards the corners
  for (const s of [-1, 1]) {
    palmFrond(r, c + s * 2.5, 0.2, s > 0 ? 8 * DEG : Math.PI - 8 * DEG, 3.0, 0.15, s > 0 ? -0.2 : 0.2);
    cloud(r, c + s * 5.4 - 1.2, c + s * 5.4 + 1.2, 0.35, 0.34, 0.16, 50 + s);
  }
  r.plate([[0, 0], [2 * hw, 0], [2 * hw, 0.1], [0, 0.1]], 0.08, 0.03);
  return r;
}

/**
 * Panel over the great west door: St Paul preaching to the Bereans (Francis Bird). Raised
 * moulded frame, the apostle on a step at the left, his hearers seated and standing before a
 * colonnade.
 */
export function paulPreaching(w: number, h: number, res = 0.025): Relief {
  const r = new Relief(w, h, res);
  const f = 0.14;
  // frame
  r.plate([[0, 0], [w, 0], [w, h], [0, h]], 0.12, 0.05);
  r.plate([[f, f], [w - f, f], [w - f, h - f], [f, h - f]], 0.12, 0.02, "sub");
  const gy = f + 0.06;
  // background architecture: colonnade and a temple front
  for (let x = f + 0.5; x < w - f - 0.3; x += 0.55) r.plate([[x - 0.07, gy], [x + 0.07, gy], [x + 0.07, h - f - 0.35], [x - 0.07, h - f - 0.35]], 0.035, 0.015);
  r.plate([[f + 0.2, h - f - 0.38], [w - f - 0.2, h - f - 0.38], [w - f - 0.2, h - f - 0.2], [f + 0.2, h - f - 0.2]], 0.04, 0.015);
  r.plate([[w * 0.64, h - f - 0.2], [w * 0.84, h - f - 0.2], [w * 0.74, h - f - 0.06]], 0.04, 0.02);
  // ground
  r.plate([[f, f], [w - f, f], [w - f, gy], [f, gy]], 0.06, 0.02);
  // the apostle on a step
  r.plate([[f + 0.2, gy], [f + 1.3, gy], [f + 1.3, gy + 0.2], [f + 0.2, gy + 0.2]], 0.1, 0.03);
  r.at(f + 0.8, gy + 0.2, { s: 1.85, depth: 1.05 }, () => figure(r, POSES.preach, { dress: "robe", cloak: 0.7, beard: true, attrs: ["book"], seed: 31 }));
  // hearers: back row in lower relief, front row seated and standing
  const back: [number, keyof typeof POSES, boolean][] = [[2.3, "listen", true], [3.4, "stand", true], [4.6, "hold", true], [5.7, "listen", true], [6.5, "stand", true]];
  back.forEach(([x, p, m], i) => {
    if (x > w - f - 0.3) return;
    r.at(f + x, gy, { s: 1.7, mirror: m, depth: 0.6 }, () => figure(r, POSES[p], { dress: "robe", beard: i % 2 === 0, seed: 40 + i }));
  });
  const front: [number, keyof typeof POSES, boolean, number][] = [[1.9, "seatedChin", true, 1.75], [2.9, "kneel", true, 1.8], [4.0, "seated", true, 1.75], [5.1, "point", true, 1.78], [6.1, "seatedChin", true, 1.75]];
  front.forEach(([x, p, m, s], i) => {
    if (x > w - f - 0.4) return;
    if (p.startsWith("seated")) r.plate([[f + x - 0.28, gy], [f + x + 0.08, gy], [f + x + 0.08, gy + 0.52], [f + x - 0.28, gy + 0.52]], 0.12, 0.03);
    r.at(f + x, gy, { s, mirror: m, depth: 1.1, z: 0.06 }, () => figure(r, POSES[p], { dress: i === 3 ? "tunic" : "robe", cloak: i === 1 ? 0.6 : 0, beard: i % 2 === 1, seed: 50 + i }));
  });
  return r;
}

/**
 * Cartouche over a transept door: a scrolled oval frame round a laurel wreath, a cherub head
 * above, palm branches and drops at the sides (w x h metres).
 */
export function cartouche(w: number, h: number, res = 0.03, seed = 1): Relief {
  const r = new Relief(w, h, res);
  const cx = w / 2, cy = h * 0.47;
  const rx = w * 0.27, ry = h * 0.3;
  for (const s of [-1, 1]) {
    palmFrond(r, cx + s * 0.3, cy - ry * 0.85, s > 0 ? 38 * DEG : Math.PI - 38 * DEG, h * 0.5, 0.12, s > 0 ? -0.35 : 0.35);
    // C-scrolls on the sides of the frame
    const sc: V2[] = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const a = -Math.PI / 2 + t * Math.PI * 1.6;
      const rr = 0.32 * (1 - 0.55 * t);
      sc.push([cx + s * (rx + 0.1 + Math.cos(a) * rr), cy - ry * 0.35 + Math.sin(a) * rr + t * 0.7]);
    }
    r.stroke(sc, 0.09, 0.05, 0.22, 0.2);
    r.at(cx + s * (rx + 0.42), cy - ry * 0.3, { s: 0.5, depth: 0.5 }, () => drop(r, 3.1, 0.3, seed + s));
  }
  // acanthus leaves on the frame
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    r.leaf(cx + Math.cos(a) * rx * 1.02, cy + Math.sin(a) * ry * 1.02, 0.3, 0.16, a + Math.PI / 2, 0.24, "max", 0.2);
  }
  r.ring(cx, cy, rx, ry, 0.13, 0.26);
  r.ring(cx, cy, rx - 0.07, ry - 0.07, 0.035, 0.04, "sub");
  // the field and the wreath
  r.blob(cx, cy, rx - 0.1, ry - 0.1, 0.1, "max", 0, 0.3);
  r.at(cx, cy, { s: 1, depth: 1, z: 0.08 }, () => wreath(r, Math.min(rx, ry) * 0.62, 0.22, 0.12, seed));
  r.blob(cx, cy, 0.17, 0.17, 0.2, "max", 0, 0.7);
  // cherub head above, a shell below
  r.at(cx, cy + ry + 0.25, { s: 0.3, depth: 0.95 }, () => cherubHead(r, "up"));
  for (let i = 0; i < 9; i++) {
    const a = Math.PI + 0.25 + (i / 8) * (Math.PI - 0.5);
    r.stroke([[cx, cy - ry - 0.02], [cx + Math.cos(a) * 0.45, cy - ry - 0.02 + Math.sin(a) * 0.4]], 0.05, 0.08, 0.2, 0.16);
  }
  return r;
}

/** Keystone cherub (instanced): head radius 0.2 m, wings ~1.2 m across; origin at the chin line. */
export function keystoneCherub(res = 0.012): Relief {
  const s = 0.2;
  const r = new Relief(1.3, 0.8, res);
  r.at(0.65, 0.4, { s, depth: 0.7 }, () => cherubHead(r, "side"));
  r.soften = 0;
  return r;
}

/** A hanging drop between paired pilasters (w x len metres, instanced). */
export function pierDrop(w: number, len: number, res = 0.02, seed = 3): Relief {
  const r = new Relief(w, len, res);
  r.at(w / 2, len - 0.02, { s: w, depth: 0.85 }, () => drop(r, (len - 0.05) / w, 0.3, seed));
  return r;
}

/**
 * Scrolling acanthus (Grinling Gibbons' vocabulary): a wave stem along the band with a spiral
 * curling off each bend, leaves along the spirals and a flower at every spiral's eye.
 */
export function acanthus(r: Relief, x0: number, y0: number, w: number, h: number, hgt: number, seed = 1) {
  const rnd = rng(seed);
  const n = Math.max(1, Math.round(w / (h * 1.5)));
  const stem: V2[] = [];
  for (let i = 0; i <= 12 * n; i++) {
    const t = i / (12 * n);
    stem.push([x0 + w * t, y0 + h / 2 + h * 0.22 * Math.sin(Math.PI * 2 * n * t)]);
  }
  r.stroke(stem, h * 0.05, h * 0.05, hgt * 0.7, hgt * 0.7);
  for (let k = 0; k < 2 * n; k++) {
    const up = k % 2 === 0 ? 1 : -1;
    const cx = x0 + (w * (k + 0.5)) / (2 * n);
    const cy = y0 + h / 2 + up * h * 0.16;
    // spiral curling away from the stem
    const sp: V2[] = [];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      const a = up * (Math.PI * 0.5 + t * Math.PI * 1.7) + (up > 0 ? 0 : Math.PI);
      const rr = h * 0.3 * (1 - 0.75 * t);
      sp.push([cx + Math.cos(a) * rr * 1.2, cy + Math.sin(a) * rr]);
    }
    r.stroke(sp, h * 0.045, h * 0.02, hgt * 0.8, hgt * 0.75);
    for (let i = 1; i < 12; i += 2) {
      const p = sp[i], q = sp[i + 1];
      const a = Math.atan2(q[1] - p[1], q[0] - p[0]) + up * (0.9 + 0.2 * rnd());
      r.leaf(p[0], p[1], h * (0.26 - i * 0.012), h * 0.14, a, hgt * (0.9 + 0.1 * rnd()), "max", up * 0.2);
    }
    const eye = sp[14];
    r.blob(eye[0], eye[1], h * 0.09, h * 0.09, hgt, "max", 0, 0.7);
    for (let p = 0; p < 5; p++) r.blob(eye[0] + Math.cos(p * 1.26) * h * 0.08, eye[1] + Math.sin(p * 1.26) * h * 0.08, h * 0.05, h * 0.05, hgt * 0.8, "max", 0, 0.7);
  }
}

/** A band of acanthus (w x h metres) for friezes, pipe shades and cresting. */
export function acanthusBand(w: number, h: number, res = 0.02, seed = 1): Relief {
  const r = new Relief(w, h, res);
  acanthus(r, 0.02, 0.02, w - 0.04, h - 0.04, h * 0.35, seed);
  return r;
}

/**
 * Spandrel of an arcade arch: a reclining winged Fame blowing a trumpet towards the crown of
 * the arch, a palm branch by the pier. Local frame: the arch centre at u = 0 (or u = w when
 * mirrored), v = 0 at the arch's centre height; the extrados of radius re is masked out.
 */
export function fameSpandrel(w: number, h: number, re: number, mirror: boolean, res = 0.045): Relief {
  const r = new Relief(w, h, res);
  const cx = mirror ? w : 0;
  r.mask = (u, v) => {
    const d = Math.hypot(u - cx, v) - (re + 0.06);
    const top = h - 0.06 - v, side = mirror ? u - 0.05 : w - 0.05 - u;
    const m = Math.min(d / 0.12, top / 0.08, side / 0.05);
    return m <= 0 ? 0 : Math.min(1, m);
  };
  r.at(cx, 0, { s: 1, mirror }, () => {
    // the figure lies along the extrados, head towards the crown, trumpet raised
    const a = 47 * DEG, rr = re + 0.12;
    r.at(Math.cos(a) * rr, Math.sin(a) * rr, { s: 3.5, mirror: true, rot: -43 * DEG, depth: 0.6 }, () =>
      figure(r, POSES.recline, { dress: "robe", wings: true, cloak: 0.8, attrs: ["trumpet"], seed: 60 }));
    // a palm branch rising by the pier
    palmFrond(r, w - 0.38, 0.1, 93 * DEG, 3.3, 0.1, 0.12);
  });
  return r;
}

/**
 * Wall monument (w x h): an obelisk backdrop, a mourning figure leaning on an urn (variant 0),
 * a portrait medallion held by a putto (1), or a reclining effigy (2); an inscription below.
 */
export function monumentRelief(w: number, h: number, variant: number, res = 0.022): Relief {
  const r = new Relief(w, h, res);
  const c = w / 2;
  // obelisk backdrop and moulded frame
  r.plate([[c - w * 0.42, h * 0.3], [c + w * 0.42, h * 0.3], [c + w * 0.3, h - 0.05], [c - w * 0.3, h - 0.05]], 0.05, 0.03);
  // inscription tablet
  r.plate([[c - w * 0.4, 0.05], [c + w * 0.4, 0.05], [c + w * 0.4, h * 0.26], [c - w * 0.4, h * 0.26]], 0.1, 0.03);
  const lines = ["IN MEMORIAM", "PIETATIS", "CAVSA · POSVIT"];
  lines.forEach((t, i) => {
    const sz = Math.min(0.11, (w * 0.7) / (t.length * 0.9));
    const tw = Relief.textWidth(t, sz, 0.3);
    r.text(t.replace(/V/g, "V"), c - tw / 2, h * 0.26 - 0.08 - (i + 1) * sz * 1.7, sz, 0.035, "sub", 0.3);
  });
  if (variant % 3 === 0) {
    // an urn on a pedestal, a draped woman leaning on it
    r.plate([[c + 0.1, h * 0.3], [c + 0.6, h * 0.3], [c + 0.6, h * 0.48], [c + 0.1, h * 0.48]], 0.14, 0.03);
    r.blob(c + 0.35, h * 0.58, 0.2, 0.16, 0.16, "max", 0, 0.6);
    r.stroke([[c + 0.35, h * 0.62], [c + 0.35, h * 0.72]], 0.07, 0.09, 0.14, 0.14);
    r.blob(c + 0.35, h * 0.74, 0.1, 0.03, 0.14);
    r.at(c - 0.2, h * 0.3, { s: h * 0.55, depth: 0.85 }, () => figure(r, pose({ head: [0.06, 0.88], neck: [0.04, 0.8], eN: [0.14, 0.74], hN: [0.1, 0.84], eF: [0.1, 0.62], hF: [0.2, 0.66] }), { dress: "robe", cloak: 0.4, seed: 70 + variant }));
  } else if (variant % 3 === 1) {
    // portrait medallion (a bust in profile) held up by two putti
    const my = h * 0.64;
    r.ring(c, my, 0.38, 0.47, 0.055, 0.13);
    r.blob(c, my, 0.34, 0.43, 0.05, "max", 0, 0.3);
    r.group("max", () => {
      r.blob(c, my - 0.27, 0.26, 0.12, 0.1, "max", 0, 0.6);
      r.tube([[c + 0.02, my - 0.18, 0.07, 0.11], [c + 0.03, my - 0.02, 0.06, 0.11]]);
      r.blob(c + 0.03, my + 0.1, 0.12, 0.15, 0.13, "max", -0.15, 0.6);
    });
    r.blob(c + 0.14, my + 0.07, 0.03, 0.045, 0.03, "add");
    r.blob(c - 0.02, my + 0.16, 0.12, 0.08, 0.02, "add");
    for (const sgn of [-1, 1]) {
      r.at(c + sgn * 0.42, h * 0.3, { s: 1.1, mirror: sgn > 0, depth: 0.8 }, () => figure(r, POSES.support, { dress: "nude", plump: 1.5, wings: true, seed: 80 + variant + sgn }));
    }
  } else {
    // a sarcophagus with the effigy reclining on it
    r.plate([[c - w * 0.36, h * 0.3], [c + w * 0.36, h * 0.3], [c + w * 0.33, h * 0.45], [c - w * 0.33, h * 0.45]], 0.16, 0.04);
    r.at(c, h * 0.45, { s: w * 0.62, depth: 0.7 }, () => figure(r, POSES.recline, { dress: "robe", seed: 90 + variant }));
    r.at(c, h * 0.8, { s: 0.22, depth: 0.8 }, () => cherubHead(r, "side"));
  }
  return r;
}

/** Acanthus frieze for the interior entablature (w x h, instanced along the friezes). */
export function friezeBand(w: number, h: number, res = 0.03, seed = 5): Relief {
  const r = new Relief(w, h, res);
  acanthus(r, 0, 0.03, w, h - 0.06, h * 0.3, seed);
  return r;
}
