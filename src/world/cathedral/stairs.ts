import { JOINT, type GeoBuilder } from "../../geo/Builder";
import { planeSurface, stripPanel, type Opening } from "../../geo/surface";
import type { V2, V3 } from "../../core/math";
import { DOME, FLOOR, STEPS } from "../dims";
import type { Ctx } from "./kit";

/**
 * The climb, 528 steps in three stages as at St Paul's (the Cathedral's own counts):
 *  1. 257 shallow steps from the cathedral floor to the Whispering Gallery: a wide stone spiral
 *     in the south-west quarter of the crossing, and a curved flight inside the base of the drum;
 *  2. 119 steeper steps (376) inside the thickness of the drum, following its inward lean,
 *     out through the attic onto the Stone Gallery;
 *  3. 152 steps (528) between the brick cone and the outer timber dome, winding once and a half
 *     round the cone, then across a catwalk inside the cone and up an iron spiral into the
 *     lantern and out onto the Golden Gallery.
 * Rises, step counts and the heights of the galleries are the real ones; the plan of the stairs
 * is a plausible reconstruction.
 */

const F = FLOOR;
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

/** The brick cone's outer surface radius at height y. */
export const coneR = (y: number) => 14.85 - 0.37 * (y - DOME.stoneGallery);

export const ROUTE = {
  /** Spiral 1 in the south-west quarter. */
  c1: [-15.5, 15.5] as V2,
  r1: 2.25,
  n1: 221,
  top1: 28.5,
  /** Curved flight from the spiral to the gallery (36 steps). */
  n1b: 36,
  r1b: 18.8,
  /** Spiral in the peristyle buttress from the gallery (105 steps), then a flight of 14 in the attic. */
  wgDoor2: 67.5 * DEG,
  r2: 18.75,
  n2a: 105,
  top2: 52.5,
  n2b: 14,
  attic1: 50.625 * DEG,
  n2: 119,
  /** Door from the Stone Gallery into the attic, the cone helix, the spiral in the lantern. */
  attic2: 5.625 * DEG,
  n3a: 141,
  n3b: 11,
  helixTop: 83.0,
  lanternDoor: 90 * DEG,
} as const;

export interface StairZone {
  /** Steps climbed at the bottom of this zone. */
  base: number;
  y0: number;
  y1: number;
  steps: number;
  test(x: number, y: number, z: number): boolean;
}

/** Everything the game needs to know about the stairs (step counting, lamps). */
export interface StairInfo {
  zones: StairZone[];
  lamps: V3[];
  /** Angle of the door by which the first stair reaches the gallery. */
  wgDoor1: number;
}

// ------------------------------------------------------------------------------ helpers

/** A solid wedge step of a spiral around (cx, cz): angles a0..a1 (from +x towards +z). */
function wedge(b: GeoBuilder, cx: number, cz: number, rIn: number, rOut: number, a0: number, a1: number, yTop: number, thick: number, riserAt: number) {
  const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / (8 * DEG)));
  const P = (r: number, a: number, y: number): V3 => [cx + r * Math.cos(a), y, cz + r * Math.sin(a)];
  const top: V3[] = [], bot: V3[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    top.push(P(rOut, a, yTop));
    bot.push(P(rOut, a, yTop - thick));
  }
  const topIn: V3[] = [], botIn: V3[] = [];
  for (let i = n; i >= 0; i--) {
    const a = a0 + ((a1 - a0) * i) / n;
    topIn.push(P(rIn, a, yTop));
    botIn.push(P(rIn, a, yTop - thick));
  }
  // top and bottom as quads between the arcs
  for (let i = 0; i < n; i++) {
    const j = n - i;
    b.polyN([top[i], top[i + 1], topIn[j - 1], topIn[j]], [0, 1, 0]);
    b.polyN([bot[i], bot[i + 1], botIn[j - 1], botIn[j]], [0, -1, 0]);
    // inner face (towards the newel)
    const am = a0 + ((a1 - a0) * (i + 0.5)) / n;
    b.polyN([topIn[j], topIn[j - 1], botIn[j - 1], botIn[j]], [-Math.cos(am), 0, -Math.sin(am)]);
  }
  // riser (vertical face at riserAt, the edge where one climbs onto the step)
  const ar = riserAt;
  const side = Math.sign(a1 - a0) * (Math.abs(ar - a0) < 1e-9 ? -1 : 1);
  const tn: V3 = [-Math.sin(ar) * side, 0, Math.cos(ar) * side];
  b.polyN([P(rIn, ar, yTop - thick), P(rOut, ar, yTop - thick), P(rOut, ar, yTop), P(rIn, ar, yTop)], tn);
  const other = Math.abs(ar - a0) < 1e-9 ? a1 : a0;
  b.polyN([P(rIn, other, yTop - thick), P(rOut, other, yTop - thick), P(rOut, other, yTop), P(rIn, other, yTop)], [-tn[0], 0, -tn[2]]);
}

/** Flat sector (landing / collision tread) around (cx, cz). */
function sector(b: GeoBuilder, cx: number, cz: number, rIn: number, rOut: number, a0: number, a1: number, y: number, up = true) {
  const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / (10 * DEG)));
  const poly: V2[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    poly.push([cx + rOut * Math.cos(a), cz + rOut * Math.sin(a)]);
  }
  for (let i = n; i >= 0; i--) {
    const a = a0 + ((a1 - a0) * i) / n;
    poly.push([cx + rIn * Math.cos(a), cz + rIn * Math.sin(a)]);
  }
  b.cap(poly, y, up);
}

/** Cylinder wall around (cx, cz) with one or more rectangular openings (angle, width, y0, y1). */
function shaftWall(b: GeoBuilder, cx: number, cz: number, r: number, y0: number, y1: number, inside: boolean, openings: { a: number; w: number; y0: number; y1: number }[], seg = 64) {
  const holes = openings.map((o) => ({ ...o, h: o.w / 2 / r }));
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
    const am = (a0 + a1) / 2;
    let lo = y0, hi = y1;
    const cut = holes.find((o) => Math.abs(((am - o.a + Math.PI * 3) % TAU) - Math.PI) < o.h);
    const P = (a: number, y: number): V3 => [cx + r * Math.cos(a), y, cz + r * Math.sin(a)];
    const n: V3 = inside ? [-Math.cos(am), 0, -Math.sin(am)] : [Math.cos(am), 0, Math.sin(am)];
    if (cut) {
      if (cut.y0 > lo) b.polyN([P(a0, lo), P(a1, lo), P(a1, cut.y0), P(a0, cut.y0)], n);
      lo = cut.y1;
    }
    if (hi > lo) b.polyN([P(a0, lo), P(a1, lo), P(a1, hi), P(a0, hi)], n);
    void hi;
  }
}

/** A path of steps: centre-line points with heights; builds treads, risers, walls and ceiling. */
interface PathPt { x: number; z: number; y: number; nx: number; nz: number }

function pathStairs(b: GeoBuilder, col: GeoBuilder, pts: PathPt[], half: number, opts: { walls: boolean; head: number; rail?: GeoBuilder; thick?: number }) {
  // pts[k] = start of tread k (at the tread's height); the last point closes the last tread
  const W = (p: PathPt, s: number, y: number): V3 => [p.x + p.nx * s * half, y, p.z + p.nz * s * half];
  for (let k = 0; k < pts.length - 1; k++) {
    const p = pts[k], q = pts[k + 1];
    const y = p.y;
    const th = opts.thick ?? 0.22;
    b.withPaint({ joint: JOINT.drums, cav: 1 }, () => {
      b.polyN([W(p, -1, y), W(q, -1, y), W(q, 1, y), W(p, 1, y)], [0, 1, 0]);
      const prevY = k > 0 ? pts[k - 1].y : y - 0.2;
      // riser at p
      if (y > prevY + 1e-3) b.polyN([W(p, -1, prevY), W(p, 1, prevY), W(p, 1, y), W(p, -1, y)], [-(q.x - p.x), 0, -(q.z - p.z)]);
      // soffit
      b.polyN([W(p, -1, y - th), W(p, 1, y - th), W(q, 1, y - th), W(q, -1, y - th)], [0, -1, 0]);
    });
    col.polyN([W(p, -1.05, y), W(q, -1.05, y), W(q, 1.05, y), W(p, 1.05, y)], [0, 1, 0]);
    if (opts.walls) {
      const yc0 = y + opts.head, yc1 = q.y + opts.head;
      b.withPaint({ joint: JOINT.ashlar, cav: 0.95 }, () => {
        for (const s of [-1, 1]) {
          const n: V3 = [-p.nx * s, 0, -p.nz * s];
          b.polyN([W(p, s, y - th - 0.3), W(q, s, y - th - 0.3), W(q, s, yc1), W(p, s, yc0)], n);
        }
        b.polyN([W(p, -1, yc0), W(p, 1, yc0), W(q, 1, yc1), W(q, -1, yc1)], [0, -1, 0]);
      });
      for (const s of [-1, 1]) col.polyN([W(p, s * 0.98, y - 0.3), W(q, s * 0.98, y - 0.3), W(q, s * 0.98, y + 2.2), W(p, s * 0.98, y + 2.2)], [-p.nx * s, 0, -p.nz * s]);
    }
  }
}

/** Gilded / iron railing along a polyline: posts every ~1 m, a handrail at +1 m. */
function railing(b: GeoBuilder, col: GeoBuilder, pts: V3[], h = 1.0) {
  let acc = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (i > 0) acc += Math.hypot(p[0] - pts[i - 1][0], p[2] - pts[i - 1][2]);
    if (i === 0 || acc > 0.95 || i === pts.length - 1) {
      acc = 0;
      b.box(p[0] - 0.02, p[1], p[2] - 0.02, p[0] + 0.02, p[1] + h, p[2] + 0.02);
    }
    if (i > 0) {
      const q = pts[i - 1];
      const dx = p[0] - q[0], dz = p[2] - q[2];
      const L = Math.hypot(dx, dz) || 1;
      const nx = -dz / L * 0.025, nz = dx / L * 0.025;
      for (const yy of [h, h * 0.5]) {
        b.polyN([[q[0] - nx, q[1] + yy - 0.04, q[2] - nz], [p[0] - nx, p[1] + yy - 0.04, p[2] - nz], [p[0] - nx, p[1] + yy, p[2] - nz], [q[0] - nx, q[1] + yy, q[2] - nz]], [-nx, 0, -nz]);
        b.polyN([[q[0] + nx, q[1] + yy - 0.04, q[2] + nz], [p[0] + nx, p[1] + yy - 0.04, p[2] + nz], [p[0] + nx, p[1] + yy, p[2] + nz], [q[0] + nx, q[1] + yy, q[2] + nz]], [nx, 0, nz]);
        b.polyN([[q[0] - nx, q[1] + yy, q[2] - nz], [p[0] - nx, p[1] + yy, p[2] - nz], [p[0] + nx, p[1] + yy, p[2] + nz], [q[0] + nx, q[1] + yy, q[2] + nz]], [0, 1, 0]);
      }
      col.polyN([[q[0], q[1] - 0.3, q[2]], [p[0], p[1] - 0.3, p[2]], [p[0], p[1] + h + 0.15, p[2]], [q[0], q[1] + h + 0.15, q[2]]], [nx, 0, nz]);
    }
  }
}

// ------------------------------------------------------------------------------ the stairs

export function buildStairs(ctx: Ctx): StairInfo {
  const st = ctx.g("stairStone");
  const col = ctx.col;
  const lamps: V3[] = [];
  const zones: StairZone[] = [];

  // ========================================================= 1. floor -> Whispering Gallery
  const [cx, cz] = ROUTE.c1;
  const rw = ROUTE.r1;
  const rOuter = rw + 0.65;
  const rn = 0.3;
  const doorA = Math.atan2(-cz, -cx); // towards the dome's axis
  const h1 = (ROUTE.top1 - F) / ROUTE.n1;
  const per = 18 * DEG;
  const a0 = doorA - 25 * DEG;
  for (let k = 0; k < ROUTE.n1; k++) {
    const aHi = a0 - per * k, aLo = a0 - per * (k + 1);
    const y = F + h1 * (k + 1);
    st.withPaint({ joint: JOINT.drums, cav: 1 }, () => wedge(st, cx, cz, rn, rw + 0.04, aLo, aHi, y, 0.24, aHi));
    sector(col, cx, cz, rn, rw + 0.05, aLo, aHi, y);
    if (k % 10 === 5) {
      const am = (aLo + aHi) / 2;
      lamps.push([cx + (rw - 0.1) * Math.cos(am), y + 1.9, cz + (rw - 0.1) * Math.sin(am)]);
    }
  }
  // landings: entry at the floor, exit at the top
  st.withPaint({ joint: JOINT.blocks }, () => {
    sector(st, cx, cz, rn, rw + 0.04, a0, a0 + 70 * DEG, F + 0.004);
    sector(st, cx, cz, rn, rw + 0.04, a0, a0 + 70 * DEG, ROUTE.top1);
    sector(st, cx, cz, rn, rw + 0.04, a0, a0 + 70 * DEG, ROUTE.top1 - 0.25, false);
  });
  sector(col, cx, cz, rn, rw + 0.05, a0, a0 + 70 * DEG, ROUTE.top1);
  // newel, shaft walls (inside and outside), doors
  const shaftTop = ROUTE.top1 + 2.4;
  st.withPaint({ joint: JOINT.drums, cav: 0.9 }, () => st.at(cx, 0, cz, 0, () => st.lathe([[rn, F], [rn, shaftTop]], 16, { uvR: rn })));
  col.at(cx, 0, cz, 0, () => col.lathe([[rn + 0.05, F - 0.5], [rn + 0.05, shaftTop]], 12));
  const doors1 = [{ a: doorA, w: 1.15, y0: F - 0.1, y1: F + 1.98 }, { a: doorA, w: 1.15, y0: ROUTE.top1 - 0.1, y1: ROUTE.top1 + 2.05 }];
  st.withPaint({ joint: JOINT.ashlar, cav: 0.95 }, () => {
    shaftWall(st, cx, cz, rw, F - 0.05, shaftTop, true, doors1);
    st.at(cx, 0, cz, 0, () => st.cap(circleAt(rw + 0.05, 40), shaftTop, false));
  });
  const stoneInt = ctx.g("stoneInt");
  stoneInt.withPaint({ joint: JOINT.ashlar, cav: 0.95 }, () => shaftWall(stoneInt, cx, cz, rOuter, F - 0.05, INT_AISLE_TOP, false, [doors1[0]]));
  // door jambs through the wall thickness
  for (const d of doors1) jamb(st, cx, cz, rw, rOuter, d);
  shaftWall(col, cx, cz, rw - 0.02, F - 0.5, shaftTop, true, doors1.map((d) => ({ ...d, w: d.w + 0.1 })), 40);
  shaftWall(col, cx, cz, rOuter + 0.02, F - 0.5, F + 3, false, [{ ...doors1[0], w: 1.3 }], 40);
  // turret over the roofs: none needed, the shaft ends below the crossing roof
  zones.push({
    base: 0, y0: F, y1: ROUTE.top1, steps: ROUTE.n1,
    test: (x, y, z) => Math.hypot(x - cx, z - cz) < rw + 0.1 && y > F - 0.5 && y < ROUTE.top1 + 1,
  });

  // curved flight in the base of the drum to the gallery
  const rB = ROUTE.r1b;
  const aStart = Math.atan2(cz, cx); // the diagonal (135 deg)
  const h1b = (DOME.whisperingGallery - ROUTE.top1) / ROUTE.n1b;
  const goingB = 0.3;
  const ptsB: PathPt[] = [];
  // a short level landing from the shaft door to the start of the flight
  for (let k = 0; k <= ROUTE.n1b; k++) {
    const a = aStart - (1.3 + k * goingB) / rB;
    ptsB.push({ x: rB * Math.cos(a), z: rB * Math.sin(a), y: ROUTE.top1 + h1b * k, nx: Math.cos(a), nz: Math.sin(a) });
  }
  const aEndB = aStart - (1.3 + ROUTE.n1b * goingB) / rB;
  // landing between the shaft door and the flight (radial passage + first tread)
  {
    const dx = cx + (rw + 0.3) * Math.cos(doorA), dz = cz + (rw + 0.3) * Math.sin(doorA);
    const land: V2[] = [];
    const ang = [aStart + 0.8 / rB, aStart - 1.3 / rB];
    for (const a of ang) land.push([(rB + 0.75) * Math.cos(a), (rB + 0.75) * Math.sin(a)]);
    for (const a of ang.slice().reverse()) land.push([(rB - 0.75) * Math.cos(a), (rB - 0.75) * Math.sin(a)]);
    st.withPaint({ joint: JOINT.blocks }, () => st.cap(land, ROUTE.top1, true));
    col.cap(land, ROUTE.top1, true);
    // passage from the shaft door
    const pa: V2 = [dx, dz];
    const pb: V2 = [(rB + 0.2) * Math.cos(aStart), (rB + 0.2) * Math.sin(aStart)];
    corridor(st, col, pa, pb, ROUTE.top1, 0.62, 2.3);
    void pa;
  }
  pathStairs(st, col, ptsB, 0.62, { walls: true, head: 2.35 });
  // top landing and the doorway through the gallery wall
  const aWG1 = aEndB - 0.6 / rB;
  {
    const yT = DOME.whisperingGallery;
    const land: V2[] = [];
    const ang = [aEndB, aWG1 - 0.75 / rB];
    for (const a of ang) land.push([(rB + 0.62) * Math.cos(a), (rB + 0.62) * Math.sin(a)]);
    for (const a of ang.slice().reverse()) land.push([(rB - 0.62) * Math.cos(a), (rB - 0.62) * Math.sin(a)]);
    st.withPaint({ joint: JOINT.blocks }, () => st.cap(land, yT, true));
    col.cap(land, yT, true);
    corridor(st, col, [(rB - 0.4) * Math.cos(aWG1), (rB - 0.4) * Math.sin(aWG1)], [(DOME.whisperR - 0.3) * Math.cos(aWG1), (DOME.whisperR - 0.3) * Math.sin(aWG1)], yT, 0.6, 2.05);
  }
  ctx.doors.push(aWG1);
  for (let k = 6; k < ROUTE.n1b; k += 12) lamps.push([(rB + 0.55) * Math.cos(ptsB[k].x === 0 ? 0 : Math.atan2(ptsB[k].z, ptsB[k].x)), ptsB[k].y + 1.9, (rB + 0.55) * Math.sin(Math.atan2(ptsB[k].z, ptsB[k].x))]);
  zones.push({
    base: ROUTE.n1, y0: ROUTE.top1, y1: DOME.whisperingGallery, steps: ROUTE.n1b,
    test: (x, y, z) => {
      const r = Math.hypot(x, z);
      return r > rB - 0.9 && r < rB + 0.9 && y > ROUTE.top1 - 0.3 && y < DOME.whisperingGallery + 0.3;
    },
  });

  // ========================================================= 2. Whispering Gallery -> Stone Gallery
  // a tight spiral in the solid buttress of the peristyle, then a short flight inside the attic
  const y2a = DOME.whisperingGallery, y2m = ROUTE.top2, y2b = DOME.stoneGallery;
  const c2: V2 = [ROUTE.r2 * Math.cos(ROUTE.wgDoor2), ROUTE.r2 * Math.sin(ROUTE.wgDoor2)];
  const rw2 = 1.0, rn2 = 0.13;
  const door2 = ROUTE.wgDoor2 + Math.PI; // on the shaft, facing the dome's axis
  const h2 = (y2m - y2a) / ROUTE.n2a;
  const per2 = 30 * DEG;
  const b2 = door2 + 38 * DEG;
  for (let k = 0; k < ROUTE.n2a; k++) {
    const aLo = b2 + per2 * k, aHi = aLo + per2;
    const y = y2a + h2 * (k + 1);
    st.withPaint({ joint: JOINT.drums, cav: 1 }, () => wedge(st, c2[0], c2[1], rn2, rw2 + 0.03, aLo, aHi, y, 0.2, aLo));
    sector(col, c2[0], c2[1], rn2, rw2 + 0.05, aLo, aHi, y);
    if (k % 8 === 4) {
      const am = (aLo + aHi) / 2;
      lamps.push([c2[0] + (rw2 - 0.08) * Math.cos(am), y + 1.8, c2[1] + (rw2 - 0.08) * Math.sin(am)]);
    }
  }
  const shaft2Top = y2m + 2.3;
  st.withPaint({ joint: JOINT.blocks }, () => {
    sector(st, c2[0], c2[1], rn2, rw2 + 0.03, door2 - 40 * DEG, b2, y2a + 0.004);
    sector(st, c2[0], c2[1], rn2, rw2 + 0.03, door2 - 60 * DEG, door2 + 25 * DEG, y2m);
    sector(st, c2[0], c2[1], rn2, rw2 + 0.03, door2 - 60 * DEG, door2 + 25 * DEG, y2m - 0.2, false);
  });
  sector(col, c2[0], c2[1], rn2, rw2 + 0.05, door2 - 40 * DEG, b2, y2a);
  sector(col, c2[0], c2[1], rn2, rw2 + 0.05, door2 - 60 * DEG, door2 + 25 * DEG, y2m);
  st.withPaint({ joint: JOINT.drums, cav: 0.9 }, () => st.at(c2[0], 0, c2[1], 0, () => st.lathe([[rn2, y2a], [rn2, shaft2Top]], 12, { uvR: rn2 })));
  col.at(c2[0], 0, c2[1], 0, () => col.lathe([[rn2 + 0.04, y2a - 0.5], [rn2 + 0.04, shaft2Top]], 10));
  const doors2 = [{ a: door2, w: 0.95, y0: y2a - 0.1, y1: y2a + 2.0 }, { a: door2, w: 0.95, y0: y2m - 0.1, y1: y2m + 2.05 }];
  st.withPaint({ joint: JOINT.ashlar, cav: 0.95 }, () => {
    shaftWall(st, c2[0], c2[1], rw2, y2a - 0.05, shaft2Top, true, doors2, 40);
    st.at(c2[0], 0, c2[1], 0, () => st.cap(circleAt(rw2 + 0.05, 24), shaft2Top, false));
  });
  shaftWall(col, c2[0], c2[1], rw2 - 0.02, y2a - 0.5, shaft2Top, true, doors2.map((d) => ({ ...d, w: d.w + 0.1 })), 32);
  // passage from the gallery into the shaft
  {
    const aD = ROUTE.wgDoor2;
    corridor(st, col, [(DOME.whisperR - 0.3) * Math.cos(aD), (DOME.whisperR - 0.3) * Math.sin(aD)], [(ROUTE.r2 - rw2 + 0.1) * Math.cos(aD), (ROUTE.r2 - rw2 + 0.1) * Math.sin(aD)], y2a, 0.5, 2.05);
  }
  ctx.doors.push(ROUTE.wgDoor2);
  zones.push({
    base: STEPS.whispering, y0: y2a, y1: y2m, steps: ROUTE.n2a,
    test: (x, y, z) => Math.hypot(x - c2[0], z - c2[1]) < rw2 + 0.1 && y > y2a - 0.3 && y < y2m + 1,
  });
  // at the top: through the drum wall towards the axis, then 14 steps along the attic
  const rF = 16.0;
  const aF0 = ROUTE.wgDoor2;
  const h2b = (y2b - y2m) / ROUTE.n2b;
  const going2b = 0.26;
  const pts2: PathPt[] = [];
  for (let k = 0; k <= ROUTE.n2b; k++) {
    const a = aF0 - (0.6 + k * going2b) / rF;
    pts2.push({ x: rF * Math.cos(a), z: rF * Math.sin(a), y: y2m + h2b * k, nx: Math.cos(a), nz: Math.sin(a) });
  }
  {
    const aD = ROUTE.wgDoor2;
    corridor(st, col, [(ROUTE.r2 - rw2 - 0.1) * Math.cos(aD), (ROUTE.r2 - rw2 - 0.1) * Math.sin(aD)], [(rF + 0.35) * Math.cos(aD), (rF + 0.35) * Math.sin(aD)], y2m, 0.5, 2.1);
    const land: V2[] = [];
    for (const [r, a] of [[rF + 0.6, aD + 0.7 / rF], [rF + 0.6, aF0 - 0.6 / rF], [rF - 0.6, aF0 - 0.6 / rF], [rF - 0.6, aD + 0.7 / rF]] as V2[]) land.push([r * Math.cos(a), r * Math.sin(a)]);
    st.withPaint({ joint: JOINT.blocks }, () => st.cap(land, y2m, true));
    col.cap(land, y2m, true);
  }
  pathStairs(st, col, pts2, 0.55, { walls: true, head: 2.3 });
  // landing and the doorway out through the attic onto the Stone Gallery
  {
    const aEnd = aF0 - (0.6 + ROUTE.n2b * going2b) / rF;
    const aD = ROUTE.attic1;
    const land: V2[] = [];
    for (const [r, a] of [[rF + 0.55, aEnd + 0.02], [rF + 0.55, aD - 0.7 / rF], [rF - 0.55, aD - 0.7 / rF], [rF - 0.55, aEnd + 0.02]] as V2[]) land.push([r * Math.cos(a), r * Math.sin(a)]);
    st.withPaint({ joint: JOINT.blocks }, () => st.cap(land, y2b, true));
    col.cap(land, y2b, true);
    corridor(st, col, [(rF - 0.2) * Math.cos(aD), (rF - 0.2) * Math.sin(aD)], [(DOME.atticR + 0.05) * Math.cos(aD), (DOME.atticR + 0.05) * Math.sin(aD)], y2b, 0.55, 2.05);
  }
  lamps.push([(rF + 0.45) * Math.cos(aF0 - 2.5 / rF), y2m + 2.2, (rF + 0.45) * Math.sin(aF0 - 2.5 / rF)]);
  zones.push({
    base: STEPS.whispering + ROUTE.n2a, y0: y2m, y1: y2b, steps: ROUTE.n2b,
    test: (x, y, z) => {
      const r = Math.hypot(x, z);
      return Math.abs(r - rF) < 0.7 && y > y2m - 0.3 && y < y2b + 0.3;
    },
  });

  // ========================================================= 3. Stone Gallery -> Golden Gallery
  const y3a = DOME.stoneGallery, y3b = ROUTE.helixTop, y3c = DOME.goldenGallery;
  const h3 = (y3b - y3a) / ROUTE.n3a;
  const going3 = 0.27;
  const pts3: PathPt[] = [];
  let a3 = ROUTE.attic2 + 1.2 / 15.5;
  for (let k = 0; k <= ROUTE.n3a; k++) {
    const y = y3a + h3 * k;
    const r = coneR(y) + 0.72;
    pts3.push({ x: r * Math.cos(a3), z: r * Math.sin(a3), y, nx: Math.cos(a3), nz: Math.sin(a3) });
    a3 += going3 / r;
  }
  pathStairs(st, col, pts3, 0.62, { walls: false, head: 2.3, thick: 0.18 });
  // railing on the open side
  ctx.g("iron").withPaint({ cav: 1 }, () => railing(ctx.g("iron"), col, pts3.map((p) => [p.x + p.nx * 0.6, p.y, p.z + p.nz * 0.6] as V3), 1.0));
  // doorway through the attic from the Stone Gallery, and the landing inside
  {
    const aD = ROUTE.attic2;
    corridor(st, col, [(DOME.atticR + 0.05) * Math.cos(aD), (DOME.atticR + 0.05) * Math.sin(aD)], [16.2 * Math.cos(aD), 16.2 * Math.sin(aD)], y3a, 0.55, 2.05);
    const land: V2[] = [];
    const rIn = coneR(y3a) + 0.05, rOut = 16.3;
    for (const [r, a] of [[rOut, aD - 0.6 / 15], [rOut, a3 * 0 + ROUTE.attic2 + 1.25 / 15], [rIn, ROUTE.attic2 + 1.25 / 15], [rIn, aD - 0.6 / 15]] as V2[]) land.push([r * Math.cos(a), r * Math.sin(a)]);
    st.withPaint({ joint: JOINT.blocks }, () => st.cap(land, y3a, true));
    col.cap(land, y3a, true);
  }
  // the void: floor ring, attic inner wall, the cone, the timber of the outer dome
  const brick = ctx.g("coneBrick");
  const timber = ctx.g("domeTimber");
  {
    const ring = (r: number, n = 96): V2[] => Array.from({ length: n }, (_, i) => [r * Math.cos((i / n) * TAU), r * Math.sin((i / n) * TAU)] as V2);
    st.withPaint({ joint: JOINT.blocks, cav: 0.8 }, () => st.cap(ring(16.3), y3a, true, [ring(coneR(y3a))]));
    col.cap(ring(16.3), y3a, true, [ring(coneR(y3a))]);
    // attic's inner face (with the two door openings)
    const doorsAttic = [{ a: ROUTE.attic2, w: 1.15, y0: y3a - 0.1, y1: y3a + 2.05 }];
    st.withPaint({ joint: JOINT.ashlar, cav: 0.9 }, () => shaftWall(st, 0, 0, 16.3, y3a - 0.05, DOME.outerBase + 0.8, true, doorsAttic, 96));
    shaftWall(col, 0, 0, 16.28, y3a - 0.5, y3a + 3, true, doorsAttic, 64);
    // the cone (outer surface) from the gallery floor to the lantern, with the door near the top
    const aEnd3 = a3;
    const coneDoor = { a: aEnd3, w: 1.0, y0: y3b - 0.1, y1: y3b + 2.0 };
    const prof: V2[] = [];
    for (let y = y3a - 0.1; y < y3c; y += 1.2) prof.push([coneR(y), y]);
    prof.push([coneR(y3c), y3c]);
    brick.withPaint({ joint: 0, cav: 1 }, () => coneWall(brick, prof, [coneDoor], false));
    coneWall(col, prof.filter((_, i) => i % 2 === 0), [coneDoor], false, 48);
    // outer dome's inner boarding and the timber ribs
    const dome = outerInner();
    timber.withPaint({ joint: 0, cav: 1 }, () => timber.lathe(dome, 96, { inside: true, uvR: 12 }));
    for (let k = 0; k < 32; k++) {
      const a = (k / 32) * TAU;
      for (let i = 0; i < dome.length - 1; i++) {
        const [ra, ya] = dome[i], [rb, yb] = dome[i + 1];
        const c = Math.cos(a), s = Math.sin(a);
        const t: V3 = [-s * 0.09, 0, c * 0.09];
        const pa: V3 = [c * (ra - 0.02), ya, s * (ra - 0.02)], pb: V3 = [c * (rb - 0.02), yb, s * (rb - 0.02)];
        const qa: V3 = [c * (ra - 0.34), ya, s * (ra - 0.34)], qb: V3 = [c * (rb - 0.34), yb, s * (rb - 0.34)];
        timber.withPaint({ cav: 0.9 }, () => {
          timber.polyN([add(qa, t, -1), add(qb, t, -1), add(qb, t, 1), add(qa, t, 1)], [-c, 0, -s]);
          timber.polyN([add(pa, t, -1), add(pb, t, -1), add(qb, t, -1), add(qa, t, -1)], [s, 0, -c]);
          timber.polyN([add(pa, t, 1), add(pb, t, 1), add(qb, t, 1), add(qa, t, 1)], [-s, 0, c]);
        });
      }
    }
    // the light wells high in the dome
    const ll = ctx.g("lanternLight");
    for (let k = 0; k < 8; k++) {
      const a = ((k + 0.5) / 8) * TAU;
      const i = dome.findIndex(([r]) => r < 6.5);
      const [r, y] = dome[Math.max(0, i)];
      const c = Math.cos(a), s = Math.sin(a);
      ll.polyN([[c * r - s * 0.35, y, s * r + c * 0.35], [c * r + s * 0.35, y, s * r - c * 0.35], [c * (r - 0.05) + s * 0.35, y + 0.85, s * (r - 0.05) - c * 0.35], [c * (r - 0.05) - s * 0.35, y + 0.85, s * (r - 0.05) + c * 0.35]], [-c, 0.3, -s]);
    }
  }
  for (let k = 6; k < ROUTE.n3a; k += 11) {
    const p = pts3[k];
    const a = Math.atan2(p.z, p.x);
    const r = coneR(p.y) + 0.05;
    lamps.push([r * Math.cos(a), p.y + 1.7, r * Math.sin(a)]);
  }
  zones.push({
    base: STEPS.stone, y0: y3a, y1: y3b, steps: ROUTE.n3a,
    test: (x, y, z) => {
      if (y < y3a - 0.3 || y > y3b + 0.3) return false;
      const r = Math.hypot(x, z);
      return r > coneR(y) - 0.2 && r < coneR(y) + 1.9;
    },
  });

  // catwalk inside the cone and the iron spiral into the lantern
  {
    const aC = a3;
    const iron = ctx.g("iron");
    const rIn = coneR(y3b) - 0.45;
    const cw: V2[] = [[(rIn + 0.5) * Math.cos(aC) - 0.5 * Math.sin(aC), (rIn + 0.5) * Math.sin(aC) + 0.5 * Math.cos(aC)], [(rIn + 0.5) * Math.cos(aC) + 0.5 * Math.sin(aC), (rIn + 0.5) * Math.sin(aC) - 0.5 * Math.cos(aC)], [0.8 * Math.cos(aC) + 0.5 * Math.sin(aC), 0.8 * Math.sin(aC) - 0.5 * Math.cos(aC)], [0.8 * Math.cos(aC) - 0.5 * Math.sin(aC), 0.8 * Math.sin(aC) + 0.5 * Math.cos(aC)]];
    iron.withPaint({ cav: 0.9 }, () => {
      iron.cap(cw, y3b, true);
      iron.cap(cw, y3b - 0.06, false);
    });
    col.cap(cw, y3b, true);
    // doorway through the cone
    corridor(st, col, [(coneR(y3b) + 0.62) * Math.cos(aC), (coneR(y3b) + 0.62) * Math.sin(aC)], [(rIn - 0.02) * Math.cos(aC), (rIn - 0.02) * Math.sin(aC)], y3b, 0.5, 2.0);
    // railings along both sides of the catwalk
    for (const s of [-1, 1]) {
      const pa: V3 = [rIn * Math.cos(aC) - s * 0.5 * Math.sin(aC), y3b, rIn * Math.sin(aC) + s * 0.5 * Math.cos(aC)];
      const pb: V3 = [0.9 * Math.cos(aC) - s * 0.5 * Math.sin(aC), y3b, 0.9 * Math.sin(aC) + s * 0.5 * Math.cos(aC)];
      iron.withPaint({ cav: 1 }, () => railing(iron, col, [pa, pb], 1.0));
    }
    // spiral on the axis: 11 steps, 30 degrees each, from the catwalk up to the lantern floor
    const h3b = (y3c - y3b) / ROUTE.n3b;
    const aS = aC + Math.PI; // start on the far side of the newel from the catwalk end
    for (let k = 0; k < ROUTE.n3b; k++) {
      const aLo = aS + 30 * DEG * k, aHi = aLo + 30 * DEG;
      const y = y3b + h3b * (k + 1);
      iron.withPaint({ cav: 1 }, () => wedge(iron, 0, 0, 0.08, 0.85, aLo, aHi, y, 0.05, aLo));
      sector(col, 0, 0, 0.0, 0.9, aLo, aHi, y);
    }
    iron.withPaint({ cav: 1 }, () => iron.lathe([[0.08, y3b - 0.3], [0.08, y3c + 1.2]], 10));
    col.lathe([[0.12, y3b - 0.3], [0.12, y3c + 1.2]], 8);
    zones.push({
      base: STEPS.stone + ROUTE.n3a, y0: y3b, y1: y3c, steps: ROUTE.n3b,
      test: (x, y, z) => Math.hypot(x, z) < 1.0 && y > y3b - 0.3 && y < y3c + 0.3,
    });
    // the lantern room: floor round the stairwell, railing, inner walls, the door out
    const room = lanternRoom(ctx, y3c);
    void room;
  }

  // lamps: small bulkheads, and their light baked into the stair stone, brick and timber
  const lampB = ctx.g("lamp");
  for (const l of lamps) lampB.withPaint({ cav: 1, expo: 1 }, () => lampB.box(l[0] - 0.09, l[1] - 0.07, l[2] - 0.09, l[0] + 0.09, l[1] + 0.07, l[2] + 0.09));
  const light = (x: number, y: number, z: number) => {
    let s = 0;
    for (const l of lamps) {
      const dx = x - l[0], dy = y - l[1], dz = z - l[2];
      const d2 = dx * dx + dy * dy * 1.3 + dz * dz;
      if (d2 < 60) s += 1 / (1 + d2 / 2.4);
    }
    return Math.min(1, 0.06 + s * 0.95);
  };
  ctx.bake.set("stairStone", light);
  ctx.bake.set("coneBrick", light);
  ctx.bake.set("domeTimber", (x, y, z) => Math.min(1, light(x, y, z) * 0.9 + 0.04));
  ctx.bake.set("coneWash", (_x, y) => 0.25 + 0.75 * Math.max(0, Math.min(1, (y - 70) / 14)));

  return { zones, lamps, wgDoor1: aWG1 };
}

const INT_AISLE_TOP = 16.2;

function add(p: V3, t: V3, k: number): V3 {
  return [p[0] + t[0] * k, p[1] + t[1] * k, p[2] + t[2] * k];
}

function circleAt(r: number, n: number): V2[] {
  return Array.from({ length: n }, (_, i) => [r * Math.cos((i / n) * TAU), r * Math.sin((i / n) * TAU)] as V2);
}

/** The reveal of a door through a round wall between radii rIn and rOut. */
function jamb(b: GeoBuilder, cx: number, cz: number, rIn: number, rOut: number, d: { a: number; w: number; y0: number; y1: number }) {
  const t: V2 = [-Math.sin(d.a), Math.cos(d.a)];
  const n: V2 = [Math.cos(d.a), Math.sin(d.a)];
  const hw = d.w / 2;
  const P = (r: number, s: number, y: number): V3 => [cx + n[0] * r + t[0] * s, y, cz + n[1] * r + t[1] * s];
  b.withPaint({ joint: JOINT.blocks, cav: 0.8 }, () => {
    for (const s of [-1, 1]) b.polyN([P(rIn - 0.05, s * hw, d.y0), P(rOut + 0.05, s * hw, d.y0), P(rOut + 0.05, s * hw, d.y1), P(rIn - 0.05, s * hw, d.y1)], [-t[0] * s, 0, -t[1] * s]);
    b.polyN([P(rIn - 0.05, -hw, d.y1), P(rOut + 0.05, -hw, d.y1), P(rOut + 0.05, hw, d.y1), P(rIn - 0.05, hw, d.y1)], [0, -1, 0]);
    b.polyN([P(rIn - 0.05, -hw, d.y0 + 0.1), P(rOut + 0.05, -hw, d.y0 + 0.1), P(rOut + 0.05, hw, d.y0 + 0.1), P(rIn - 0.05, hw, d.y0 + 0.1)], [0, 1, 0]);
  });
}

/** A straight level passage from a to b (floor at y, half-width hw, clear height h). */
function corridor(b: GeoBuilder, col: GeoBuilder, a: V2, c: V2, y: number, hw: number, h: number, ceiling = true) {
  const L = Math.hypot(c[0] - a[0], c[1] - a[1]);
  if (L < 0.02) return;
  const d: V2 = [(c[0] - a[0]) / L, (c[1] - a[1]) / L];
  const n: V2 = [-d[1], d[0]];
  const P = (p: V2, s: number, yy: number): V3 => [p[0] + n[0] * s, yy, p[1] + n[1] * s];
  b.withPaint({ joint: JOINT.ashlar, cav: 0.9 }, () => {
    b.polyN([P(a, -hw, y), P(c, -hw, y), P(c, hw, y), P(a, hw, y)], [0, 1, 0]);
    if (ceiling) b.polyN([P(a, -hw, y + h), P(c, -hw, y + h), P(c, hw, y + h), P(a, hw, y + h)], [0, -1, 0]);
    for (const s of [-1, 1]) b.polyN([P(a, s * hw, y - 0.2), P(c, s * hw, y - 0.2), P(c, s * hw, y + h), P(a, s * hw, y + h)], [-n[0] * s, 0, -n[1] * s]);
  });
  col.polyN([P(a, -hw - 0.1, y), P(c, -hw - 0.1, y), P(c, hw + 0.1, y), P(a, hw + 0.1, y)], [0, 1, 0]);
  for (const s of [-1, 1]) col.polyN([P(a, s * hw, y - 0.3), P(c, s * hw, y - 0.3), P(c, s * hw, y + 2.2), P(a, s * hw, y + 2.2)], [-n[0] * s, 0, -n[1] * s]);
}

/** Cone (or any lathe profile) wall with rectangular door openings, seen from outside. */
function coneWall(b: GeoBuilder, prof: V2[], doors: { a: number; w: number; y0: number; y1: number }[], inside: boolean, seg = 96) {
  for (let j = 0; j < prof.length - 1; j++) {
    const [ra, ya] = prof[j], [rb, yb] = prof[j + 1];
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU, am = (a0 + a1) / 2;
      const rm = (ra + rb) / 2;
      const cut = doors.find((d) => Math.abs(((am - d.a + Math.PI * 3) % TAU) - Math.PI) < d.w / 2 / rm && (ya + yb) / 2 > d.y0 && (ya + yb) / 2 < d.y1);
      if (cut) continue;
      const slope = (ra - rb) / Math.max(1e-6, yb - ya);
      let nx = Math.cos(am), ny = slope, nz = Math.sin(am);
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      if (inside) { nx = -nx; ny = -ny; nz = -nz; }
      b.polyN([[ra * Math.cos(a0), ya, ra * Math.sin(a0)], [ra * Math.cos(a1), ya, ra * Math.sin(a1)], [rb * Math.cos(a1), yb, rb * Math.sin(a1)], [rb * Math.cos(a0), yb, rb * Math.sin(a0)]], [nx, ny, nz]);
    }
  }
}

/** The inner surface of the outer dome's timber boarding, 0.35 m inside the lead. */
function outerInner(): V2[] {
  const r0 = DOME.outerR, y0 = DOME.outerBase + 0.6;
  const thTop = Math.acos(DOME.outerTopR / r0);
  const Hh = (DOME.outerTop - y0) / Math.sin(thTop);
  const pts: V2[] = [[15.45, DOME.outerBase + 0.8]];
  for (let i = 0; i <= 24; i++) {
    const th = (i / 24) * thTop;
    pts.push([r0 * Math.cos(th) - 0.35, y0 + Hh * Math.sin(th) - 0.2]);
  }
  return pts;
}

/** The small room inside the lantern where the spiral arrives; the door to the Golden Gallery. */
function lanternRoom(ctx: Ctx, y: number) {
  const st = ctx.g("stairStone");
  const col = ctx.col;
  const iron = ctx.g("iron");
  const half = DOME.lanternHalf - 0.55 - 0.5; // inner face of the main stage
  const c = 0.8;
  const oct: V2[] = [[half, -half + c], [half, half - c], [half - c, half], [-half + c, half], [-half, half - c], [-half, -half + c], [-half + c, -half], [half - c, -half]];
  const hole = circleAt(0.98, 24);
  st.withPaint({ joint: JOINT.blocks, cav: 0.85 }, () => {
    st.cap(oct, y, true, [hole]);
    st.cap(oct, y - 0.25, false, [hole]);
    st.lathe([[0.98, y - 0.25], [0.98, y]], 24, { inside: true });
  });
  col.cap(oct, y, true, [hole]);
  // railing round the stairwell, open where the spiral arrives
  const pts: V3[] = [];
  const aOpen = ROUTE.lanternDoor;
  for (let i = 0; i <= 20; i++) {
    const a = aOpen + 0.55 + (i / 20) * (TAU - 1.1);
    pts.push([1.02 * Math.cos(a), y, 1.02 * Math.sin(a)]);
  }
  iron.withPaint({ cav: 1 }, () => railing(iron, col, pts, 1.0));
  // walls (inside faces): the lantern's windows on the four main faces, the doorway to the south
  const yWin0 = y + 0.45 + 0.6, yWin1 = DOME.lanternMainTop - 0.7 - 1.3;
  for (let i = 0; i < 8; i++) {
    const a = oct[i], b = oct[(i + 1) % 8];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const d: V2 = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
    const nIn: V2 = [-d[1], d[0]];
    const surf = planeSurface(a, d, nIn);
    const main = i % 2 === 0;
    const isDoor = i === 2;
    const ops: Opening[] = main ? [{ s0: L / 2 - 0.55, s1: L / 2 + 0.55, y0: isDoor ? y - 0.3 : yWin0, y1: yWin1, head: "round" }] : [];
    st.withPaint({ joint: JOINT.ashlar, cav: 0.9 }, () => stripPanel(st, surf, 0, L, y - 0.25, DOME.lanternMainTop - 0.2, ops, 1.0));
    stripPanel(col, surf, 0, L, y - 0.3, y + 2.4, isDoor ? ops : [], 2);
  }
  // the passage out through the podium to the gallery
  corridor(st, col, [0, half - 0.02], [0, DOME.lanternHalf + 0.12], y, 0.55, 0.47, false);
  // ceiling with the light of the lantern
  ctx.g("lanternLight").cap(oct, DOME.lanternMainTop - 0.2, false);
  return oct;
}
