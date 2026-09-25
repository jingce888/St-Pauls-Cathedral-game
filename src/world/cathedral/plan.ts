import type { V2 } from "../../core/math";

/**
 * Ground-floor outline of the cathedral, hand-cleaned from the OpenStreetMap footprint (way
 * 369161987, symmetrised; see tools/plan/make_plan.py) and the 1900 plan in Dimock.
 *
 * Face kinds:
 *  P pier       – a projecting pier carrying a pair of pilasters
 *  B bay        – a window bay (round-headed window below, pedimented niche above)
 *  b small bay  – a narrow bay with a niche in both storeys
 *  N niche bay  – narrow bay in the choir aisle corner
 *  S side       – the short return of a jog
 *  W west       – the wall behind the lower west portico
 *  T transept   – the wall behind a semicircular transept portico
 *  C apse bay   – curved window bay of the apse
 *  Q apse pier  – curved pier of the apse
 */
export type FaceKind = "P" | "B" | "b" | "N" | "S" | "W" | "T" | "C" | "Q";

export interface Face {
  kind: FaceKind;
  a: V2;
  b: V2;
  /** Outward unit normal (plan). */
  out: V2;
  len: number;
  /** For curved faces: the arc they belong to (apse). */
  arc?: { c: V2; r: number; th0: number; th1: number };
  /** Index of the face in the loop. */
  i: number;
}

/** North half of the loop, west to east. Each entry starts the face that runs to the next entry. */
const NORTH: [number, number, FaceKind][] = [
  [-83.05, 0.0, "W"],
  [-83.05, -13.45, "S"],
  [-83.65, -13.45, "B"],
  [-83.65, -23.75, "S"],
  [-84.35, -23.75, "P"],
  [-84.35, -27.35, "P"],
  [-80.9, -27.35, "S"],
  [-80.9, -26.75, "B"],
  [-73.85, -26.75, "S"],
  [-73.85, -27.35, "P"],
  [-70.5, -27.35, "B"],
  [-56.9, -27.35, "P"],
  [-54.0, -27.35, "P"],
  [-54.0, -26.6, "S"],
  [-53.35, -26.6, "b"],
  [-53.35, -22.65, "S"],
  [-53.85, -22.65, "P"],
  [-53.85, -19.3, "P"],
  [-53.2, -19.3, "S"],
  [-53.2, -18.75, "B"],
  [-46.55, -18.75, "S"],
  [-46.55, -19.3, "P"],
  [-42.95, -19.3, "S"],
  [-42.95, -18.75, "B"],
  [-35.95, -18.75, "S"],
  [-35.95, -19.3, "P"],
  [-32.35, -19.3, "S"],
  [-32.35, -18.75, "B"],
  [-25.4, -18.75, "b"],
  [-25.4, -21.55, "S"],
  [-25.7, -21.55, "P"],
  [-25.7, -25.7, "P"],
  [-21.55, -25.7, "S"],
  [-21.55, -25.1, "b"],
  [-19.35, -25.1, "S"],
  [-19.35, -25.7, "P"],
  [-18.75, -25.7, "B"],
  [-18.75, -32.2, "S"],
  [-19.4, -32.2, "P"],
  [-19.4, -36.2, "S"],
  [-18.5, -36.2, "S"],
  [-18.5, -36.85, "S"],
  [-17.8, -36.85, "S"],
  [-17.8, -37.7, "P"],
  [-13.65, -37.7, "S"],
  [-13.65, -37.05, "B"],
  [-9.25, -37.05, "S"],
  [-9.25, -37.6, "P"],
  [-7.15, -37.6, "S"],
  [-7.15, -37.05, "T"],
];

/** Transept and choir: mirror of the western part of the transept in x, then the choir. */
function buildNorth(): [number, number, FaceKind][] {
  const out = NORTH.slice();
  // mirror the transept's west half (from the bastion onwards) about x = 0
  const start = NORTH.findIndex(([x, z]) => x === -25.4 && z === -18.75);
  const west = NORTH.slice(start);
  // faces run from point i to i+1; mirrored order is reversed, so kinds shift by one
  const mirrored: [number, number, FaceKind][] = [];
  for (let i = west.length - 1; i >= 0; i--) {
    const [x, z] = west[i];
    const kindOfFace = i > 0 ? west[i - 1][2] : "B";
    mirrored.push([-x, z, kindOfFace]);
  }
  // the first mirrored point (7.15, -37.05) is the end of the T face; fix its kind
  mirrored[0][2] = "S";
  out.push(...mirrored);
  // the mirrored list ends at (25.4, -18.75) with kind of the bastion face; continue the choir
  out[out.length - 1][2] = "B";
  const choir: [number, number, FaceKind][] = [
    [32.1, -18.75, "S"],
    [32.1, -19.3, "P"],
    [35.8, -19.3, "S"],
    [35.8, -18.75, "B"],
    [42.65, -18.75, "S"],
    [42.65, -19.3, "P"],
    [46.1, -19.3, "S"],
    [46.1, -18.75, "B"],
    [52.75, -18.75, "S"],
    [52.75, -19.3, "P"],
    [56.45, -19.3, "S"],
    [56.45, -18.75, "N"],
    [59.1, -18.75, "S"],
    [59.1, -19.3, "P"],
    [62.85, -19.3, "S"],
    [62.85, -18.0, "S"],
    [63.6, -18.0, "P"],
    [63.6, -13.75, "S"],
    [62.95, -13.75, "B"],
    [62.95, -9.65, "S"],
    [63.55, -9.65, "P"],
  ];
  out.push(...choir);
  return out;
}

export const APSE = { cx: 61.0, rBay: 8.7, rPier: 9.35, thEnd: -74.0, pier: [-38.5, -18.5] as V2 };

/** The full closed loop (screen-clockwise in the x-right / z-down plan). */
export function planLoop(): Face[] {
  const north = buildNorth();
  const pts: V2[] = north.map(([x, z]) => [x, z]);
  const kinds: FaceKind[] = north.map(([, , k]) => k);
  // apse: from the last choir point (63.55, -8.7) around to the axis, then mirrored
  const apsePts: { p: V2; k: FaceKind; arc?: Face["arc"] }[] = [];
  const toXY = (r: number, deg: number): V2 => [APSE.cx + r * Math.cos((deg * Math.PI) / 180), r * Math.sin((deg * Math.PI) / 180)];
  const arcSeg = (r: number, d0: number, d1: number, k: FaceKind) => {
    const n = Math.max(2, Math.ceil(Math.abs(d1 - d0) / 5));
    for (let i = 0; i < n; i++) {
      const a0 = d0 + ((d1 - d0) * i) / n, a1 = d0 + ((d1 - d0) * (i + 1)) / n;
      apsePts.push({ p: toXY(r, a0), k, arc: { c: [APSE.cx, 0], r, th0: a0, th1: a1 } });
    }
  };
  // the choir's last pier ends at (63.55, -8.7); the apse starts there at r = rBay
  pts[pts.length - 1] = [63.55, -9.65];
  arcSeg(APSE.rBay, APSE.thEnd, APSE.pier[0], "C");
  apsePts.push({ p: toXY(APSE.rBay, APSE.pier[0]), k: "S" });
  arcSeg(APSE.rPier, APSE.pier[0], APSE.pier[1], "Q");
  apsePts.push({ p: toXY(APSE.rPier, APSE.pier[1]), k: "S" });
  arcSeg(APSE.rBay, APSE.pier[1], 0, "C");
  // connect the last choir point to the apse start
  const northPts = pts.concat(apsePts.map((a) => a.p));
  const northKinds = kinds.slice(0, -1).concat(["S"] as FaceKind[]).concat(apsePts.map((a) => a.k));
  const northArcs: (Face["arc"] | undefined)[] = [...kinds.map((): Face["arc"] | undefined => undefined), ...apsePts.map((a) => a.arc)];
  // full loop: north half + mirrored south half (reversed)
  const P: V2[] = northPts.slice();
  const K: FaceKind[] = northKinds.slice();
  const A: (Face["arc"] | undefined)[] = northArcs.slice();
  // apse crown point on the axis
  P.push([APSE.cx + APSE.rBay, 0]);
  K.push("C");
  const lastArc = northArcs[northArcs.length - 1]!;
  A.push({ c: [APSE.cx, 0], r: APSE.rBay, th0: 0, th1: -lastArc.th0 });
  for (let i = northPts.length - 1; i >= 1; i--) {
    const [x, z] = northPts[i];
    P.push([x, -z]);
    // the face from mirrored point i to mirrored point i-1 has the kind of face i-1 (north)
    K.push(northKinds[i - 1]);
    const arc = northArcs[i - 1];
    A.push(arc ? { c: arc.c, r: arc.r, th0: -arc.th1, th1: -arc.th0 } : undefined);
  }
  // close at the west: the south W face runs from (-83.05, 13.45) ... the loop's last point is
  // the mirror of north[1] = (-83.05, 13.45); the closing face back to (-83.05, 0) is W.
  const faces: Face[] = [];
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) continue;
    faces.push({ kind: K[i], a, b, out: [dz / len, -dx / len], len, arc: A[i], i: faces.length });
  }
  // the first face (W) and the last one (closing W) together form the wall behind the portico
  return faces;
}

/** Plain polygon of the loop (for prisms, roofs, collision). */
export function planPolygon(): V2[] {
  return planLoop().map((f) => f.a);
}
