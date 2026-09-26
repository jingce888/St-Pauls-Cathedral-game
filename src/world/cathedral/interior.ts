import { JOINT, type GeoBuilder } from "../../geo/Builder";
import { fillOnSurface, openingOutline, planeSurface, revealOnSurface, stripPanel, sweepOnSurface, type Opening, type Surface } from "../../geo/surface";
import { P, cornice, entablature } from "../../geo/profiles";
import type { V2, V3 } from "../../core/math";
import { DOME, FLOOR } from "../dims";
import { pilaster, type Ctx } from "./kit";
import { planLoop } from "./plan";
import { groupRuns, runOpenings } from "./walls";
import { coneR } from "./stairs";

/**
 * The interior on the visitors' route: the nave entered through the great west door, the
 * crossing under the dome on its eight piers and arches, the Whispering Gallery, the drum and
 * Thornhill's painted inner dome with the oculus, and above it the whitewashed brick cone rising
 * to the light of the lantern. Choir and transepts are built to the same system (arcades,
 * giant pilasters, entablature, clerestory, saucer domes) so every view out of the crossing
 * finds architecture.
 */

const F = FLOOR;
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

export const INT = {
  xW: -77.4,
  xE: 61.0,
  zA: 17.15,
  zT: 35.3,
  zV: 6.25,
  zP: 9.4,
  apseR: 7.1,
  aisleSpring: 14.4,
  aisleRise: 1.6,
  arcSpring: F + 9.8,
  arcCrown: 16.0,
  entBot: F + 15.0,
  entTop: F + 17.4,
  vaultSpring: F + 23.9,
  vaultRise: 3.8,
  /** The crossing: octagon of the eight piers (circumradius), arches spring from the entablature. */
  octR: 17.5,
  pierEnd: 24.5,
  crossSpring: F + 17.4,
  wgSoffit: DOME.whisperingGallery - 0.4,
  wgBand: DOME.whisperingGallery - 1.4,
  /** Whispering Gallery: back wall and railing radii. */
  wgWall: DOME.whisperR,
  wgRail: DOME.whisperR - DOME.whisperWalkW,
  drumTop: DOME.innerSpring - 0.5,
  drumTopR: DOME.innerR + 0.3,
} as const;

/** Centre (|z|) of the two side doors in the west front. */
export const WEST_SIDE_DOOR = 9.875;

/** Bay boundaries (x) of the nave and choir vaults, and the transept (|z|). */
export const NAVE_X = [INT.xW, -66.4, -55.5, -44.6, -33.7, -INT.pierEnd];
export const CHOIR_X = [INT.pierEnd, 33.7, 44.6, 55.5, INT.xE];
export const TRANSEPT_Z = [INT.pierEnd, INT.zT];
export const PIER_HALF = 1.7;
const mid = (a: number[]) => a.slice(0, -1).map((x, i) => (x + a[i + 1]) / 2);
/** Clerestory window centres (shared with the exterior clerestory in roofs.ts). */
export const CLERESTORY_X = [...mid(NAVE_X).slice(1), ...mid(CHOIR_X)];

/** Inward-facing wall from a to b (plan): s along a->b, normal into the room. */
function wallSurf(a: V2, b: V2): { surf: Surface; len: number; dir: V2; inw: V2 } {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const dir: V2 = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  const inw: V2 = [-dir[1], dir[0]];
  return { surf: planeSurface(a, dir, inw), len, dir, inw };
}

/** A shallow "saucer" vault over a rectangle, seen from below. */
function saucer(b: GeoBuilder, x0: number, x1: number, z0: number, z1: number, ys: number, rise: number, n = 12) {
  const hx = (x1 - x0) / 2, hz = (z1 - z0) / 2, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const idx: number[][] = [];
  for (let j = 0; j <= n; j++) {
    idx.push([]);
    for (let i = 0; i <= n; i++) {
      const u = -1 + (2 * i) / n, v = -1 + (2 * j) / n;
      const x = cx + u * hx, z = cz + v * hz;
      const y = ys + rise * (1 - (u * u + v * v) / 2);
      // downward normal of y = f(x, z): (fx, -1, fz)
      const fx = (-rise * u) / hx, fz = (-rise * v) / hz;
      const l = Math.hypot(fx, 1, fz);
      idx[j].push(b.v(x, y, z, fx / l, -1 / l, fz / l, x, z));
    }
  }
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) b.orientQuad(idx[j][i], idx[j][i + 1], idx[j + 1][i + 1], idx[j + 1][i]);
}

/** Arched band under the seam between two saucers (a transverse rib), along z at x (or along x at z). */
function band(b: GeoBuilder, at: number, s0: number, s1: number, ys: number, rise: number, w: number, depth: number, alongZ: boolean) {
  const n = 16;
  const P3 = (s: number, y: number, o: number): V3 => (alongZ ? [at + o, y, s] : [s, y, at + o]);
  const h = (s1 - s0) / 2, c = (s0 + s1) / 2;
  const pts: { s: number; y: number }[] = [];
  for (let i = 0; i <= n; i++) {
    const s = s0 + ((s1 - s0) * i) / n;
    const v = (s - c) / h;
    pts.push({ s, y: ys + (rise * (1 - v * v)) / 2 });
  }
  for (let i = 0; i < n; i++) {
    const a = pts[i], c2 = pts[i + 1];
    // underside
    b.polyN([P3(a.s, a.y - depth, -w / 2), P3(c2.s, c2.y - depth, -w / 2), P3(c2.s, c2.y - depth, w / 2), P3(a.s, a.y - depth, w / 2)], [0, -1, 0]);
    for (const k of [-1, 1]) {
      const nn: V3 = alongZ ? [k, 0, 0] : [0, 0, k];
      b.polyN([P3(a.s, a.y - depth, (k * w) / 2), P3(c2.s, c2.y - depth, (k * w) / 2), P3(c2.s, c2.y + 0.05, (k * w) / 2), P3(a.s, a.y + 0.05, (k * w) / 2)], nn);
    }
  }
}

export function buildInterior(ctx: Ctx) {
  const st = ctx.g("stoneInt");
  const col = ctx.col;

  // ------------------------------------------------------------------------ floor
  const apse: V2[] = [];
  for (let i = 0; i <= 16; i++) {
    const a = -90 + (180 * i) / 16;
    apse.push([INT.xE + INT.apseR * Math.cos(a * DEG), INT.apseR * Math.sin(a * DEG)]);
  }
  const outline: V2[] = [
    [INT.xW, -INT.zA], [-INT.zA, -INT.zA], [-INT.zA, -INT.zT], [INT.zA, -INT.zT], [INT.zA, -INT.zA], [INT.xE, -INT.zA],
    ...apse,
    [INT.xE, INT.zA], [INT.zA, INT.zA], [INT.zA, INT.zT], [-INT.zA, INT.zT], [-INT.zA, INT.zA], [INT.xW, INT.zA],
  ];
  ctx.g("marble").withPaint({ cav: 1 }, () => ctx.g("marble").cap(outline, F, true));
  col.cap(outline, F, true);

  // ------------------------------------------------------------------------ outer walls (inner faces)
  interiorShell(ctx, outline);

  // ------------------------------------------------------------------------ arcades and clerestories
  // nave and choir: both sides; transepts: both sides of each arm
  const arcadeRuns: { a: V2; b: V2; piers: number[]; bays: number[] }[] = [];
  for (const s of [-1, 1]) {
    arcadeRuns.push({ a: [NAVE_X[0], s * INT.zV], b: [NAVE_X[NAVE_X.length - 1], s * INT.zV], piers: NAVE_X.slice(1, -1), bays: NAVE_X });
    arcadeRuns.push({ a: [CHOIR_X[0], s * INT.zV], b: [CHOIR_X[CHOIR_X.length - 1], s * INT.zV], piers: CHOIR_X.slice(1, -1), bays: CHOIR_X });
    for (const t of [-1, 1]) arcadeRuns.push({ a: [s * INT.zV, t * TRANSEPT_Z[0]], b: [s * INT.zV, t * TRANSEPT_Z[1]], piers: [], bays: TRANSEPT_Z.map((v) => t * v) });
  }
  for (const r of arcadeRuns) arcade(ctx, r.a, r.b, r.piers);

  // ------------------------------------------------------------------------ vaults
  const vault = (x0: number, x1: number, z0: number, z1: number, mat: "stoneInt" | "mosaic") => {
    const b = ctx.g(mat);
    b.withPaint({ joint: JOINT.none, cav: 0.9 }, () => saucer(b, Math.min(x0, x1), Math.max(x0, x1), Math.min(z0, z1), Math.max(z0, z1), INT.vaultSpring, INT.vaultRise));
  };
  for (let i = 0; i < NAVE_X.length - 1; i++) vault(NAVE_X[i], NAVE_X[i + 1], -INT.zV, INT.zV, "stoneInt");
  for (let i = 0; i < CHOIR_X.length - 1; i++) vault(CHOIR_X[i], CHOIR_X[i + 1], -INT.zV, INT.zV, "mosaic");
  for (const t of [-1, 1]) vault(-INT.zV, INT.zV, t * TRANSEPT_Z[0], t * TRANSEPT_Z[1], "stoneInt");
  st.withPaint({ joint: JOINT.blocks, cav: 0.8 }, () => {
    for (const x of [...NAVE_X.slice(1, -1), ...CHOIR_X.slice(1, -1)]) band(st, x, -INT.zV, INT.zV, INT.vaultSpring, INT.vaultRise, 1.5, 0.45, true);
  });
  // aisle saucers
  const aisle = (x0: number, x1: number, z0: number, z1: number) =>
    st.withPaint({ joint: JOINT.none, cav: 0.85 }, () => saucer(st, Math.min(x0, x1), Math.max(x0, x1), Math.min(z0, z1), Math.max(z0, z1), INT.aisleSpring, INT.aisleRise, 8));
  const naveAisleX = [...NAVE_X, -INT.zA, -INT.zP];
  const choirAisleX = [INT.zP, INT.zA, ...CHOIR_X];
  for (const s of [-1, 1]) {
    for (let i = 0; i < naveAisleX.length - 1; i++) aisle(naveAisleX[i], naveAisleX[i + 1], s * INT.zP, s * INT.zA);
    for (let i = 0; i < choirAisleX.length - 1; i++) aisle(choirAisleX[i], choirAisleX[i + 1], s * INT.zP, s * INT.zA);
    for (const t of [-1, 1]) {
      aisle(s * INT.zP, s * INT.zA, t * INT.zA, t * 26.2);
      aisle(s * INT.zP, s * INT.zA, t * 26.2, t * INT.zT);
    }
  }
  // apse semi-dome with mosaic
  {
    const prof: V2[] = [];
    const ys = INT.vaultSpring - 3.0;
    for (let i = 0; i <= 12; i++) {
      const t = (i / 12) * (Math.PI / 2);
      prof.push([INT.apseR * Math.cos(t), ys + INT.apseR * 0.95 * Math.sin(t)]);
    }
    const m = ctx.g("mosaic");
    m.withPaint({ joint: 0, cav: 0.9 }, () => m.at(INT.xE, 0, 0, 0, () => m.lathe(prof, 24, { a0: -Math.PI / 2, a1: Math.PI / 2, inside: true, smooth: true })));
  }

  // ------------------------------------------------------------------------ the crossing
  crossing(ctx);
  whisperingGallery(ctx);
  drumAndDome(ctx);
}

// ============================================================================ shell

function interiorShell(ctx: Ctx, outline: V2[]) {
  const st = ctx.g("stoneInt");
  const glass = ctx.g("glass");
  const col = ctx.col;
  // exterior window openings, to be matched on the inner faces
  const runs = groupRuns(planLoop());
  const ext: { a: V2; dir: V2; out: V2; o: Opening; len: number }[] = [];
  for (const run of runs) {
    if (run.faces[0].arc) continue;
    const op = runOpenings(run);
    const f = run.faces[0];
    const dir: V2 = [(f.b[0] - f.a[0]) / f.len, (f.b[1] - f.a[1]) / f.len];
    for (const o of [...op.lower, ...op.upper]) ext.push({ a: f.a, dir, out: f.out, o, len: f.len });
  }
  const n = outline.length;
  for (let i = 0; i < n; i++) {
    const a = outline[i], b = outline[(i + 1) % n];
    const { surf, len, dir, inw } = wallSurf(a, b);
    if (len < 0.05) continue;
    const isApse = a[0] >= INT.xE - 1e-6 && b[0] >= INT.xE - 1e-6 && Math.abs(a[1]) < INT.apseR + 0.01 && Math.abs(b[1]) < INT.apseR + 0.01;
    // window openings from the exterior face that lies just outside this wall
    const ops: { o: Opening; depth: number }[] = [];
    for (const e of ext) {
      if (e.out[0] * -inw[0] + e.out[1] * -inw[1] < 0.99) continue;
      const d = (e.a[0] - a[0]) * -inw[0] + (e.a[1] - a[1]) * -inw[1];
      if (d < 0.3 || d > 3.6) continue;
      const q0 = [e.a[0] + e.dir[0] * e.o.s0, e.a[1] + e.dir[1] * e.o.s0], q1 = [e.a[0] + e.dir[0] * e.o.s1, e.a[1] + e.dir[1] * e.o.s1];
      let s0 = (q0[0] - a[0]) * dir[0] + (q0[1] - a[1]) * dir[1];
      let s1 = (q1[0] - a[0]) * dir[0] + (q1[1] - a[1]) * dir[1];
      if (s0 > s1) [s0, s1] = [s1, s0];
      if (s0 < 0.3 || s1 > len - 0.3) continue;
      ops.push({ o: { ...e.o, s0, s1 }, depth: d - 0.84 });
    }
    // doors: the great west door and the two side doors of the west front, the transept doors
    const isWest = Math.abs(a[0] - INT.xW) < 1e-6 && Math.abs(b[0] - INT.xW) < 1e-6;
    const isTransEnd = Math.abs(Math.abs(a[1]) - INT.zT) < 1e-6 && Math.abs(Math.abs(b[1]) - INT.zT) < 1e-6;
    const doors: { o: Opening; depth: number }[] = [];
    if (isWest) {
      doors.push({ o: { s0: len / 2 - 2.15, s1: len / 2 + 2.15, y0: F, y1: F + 8.9, head: "flat" }, depth: 1.62 });
      for (const zc of [WEST_SIDE_DOOR, -WEST_SIDE_DOOR]) {
        const sc = (zc - a[1]) * dir[1];
        doors.push({ o: { s0: sc - 1.2, s1: sc + 1.2, y0: F, y1: F + 5.6, head: "flat" }, depth: 83.05 - 1.2 + INT.xW + 0.02 });
      }
    }
    if (isTransEnd) doors.push({ o: { s0: len / 2 - 1.55, s1: len / 2 + 1.55, y0: F, y1: F + 6.3, head: "flat" }, depth: 37.05 - INT.zT - 1.2 + 0.02 });
    const centralEnd = isWest || isTransEnd || isApse;
    const top = centralEnd ? INT.vaultSpring + INT.vaultRise + 0.2 : INT.arcCrown + 0.3;
    const openings = [...ops.map((x) => x.o), ...doors.map((d) => d.o)];
    st.withPaint({ joint: JOINT.ashlar, cav: 0.95 }, () => stripPanel(st, surf, 0, len, F - 0.05, top, openings, isApse ? 0.6 : 2.0));
    for (const { o, depth } of ops) {
      const outl = openingOutline(o, 12);
      st.withPaint({ joint: JOINT.blocks, cav: 0.8 }, () => revealOnSurface(st, surf, outl, depth + 0.02));
      // surround
      st.withPaint({ joint: JOINT.none }, () => sweepOnSurface(st, surf, new P(0, 0).to(0, 0.08).to(0.26, 0.08).to(0.26, 0).build(), outl.slice(1).concat([outl[0]]), false, { outwardFrom: [(o.s0 + o.s1) / 2, o.y0] }));
    }
    for (const { o: door, depth } of doors) {
      const outl = openingOutline(door, 4);
      // jambs, soffit and the floor of the passage through the wall
      st.withPaint({ joint: JOINT.blocks, cav: 0.75 }, () => revealOnSurface(st, surf, outl, depth));
      ctx.g("marble").withPaint({ cav: 0.9 }, () => {
        const p0 = surf.point(door.s0, F + 0.003, -0.02), p1 = surf.point(door.s1, F + 0.003, depth + 0.05);
        ctx.g("marble").box(Math.min(p0[0], p1[0]), F - 0.2, Math.min(p0[2], p1[2]), Math.max(p0[0], p1[0]), F + 0.003, Math.max(p0[2], p1[2]), "ny");
      });
      st.withPaint({ joint: JOINT.none }, () => sweepOnSurface(st, surf, new P(0, 0).to(0, 0.12).to(0.4, 0.12).to(0.4, 0).build(), outl.slice(1).concat([outl[0]]), false, { outwardFrom: [(door.s0 + door.s1) / 2, door.y0] }));
      // collision: floor through the wall and the two jambs
      const q0 = surf.point(door.s0, F, -0.3), q1 = surf.point(door.s1, F, depth + 1.4);
      col.box(Math.min(q0[0], q1[0]), F - 0.6, Math.min(q0[2], q1[2]), Math.max(q0[0], q1[0]), F, Math.max(q0[2], q1[2]), "nx px nz pz ny");
      for (const sj of [door.s0, door.s1]) {
        const j0 = surf.point(sj, F - 0.5, 0), j1 = surf.point(sj, F - 0.5, depth + 1.3);
        col.polyN([j0, j1, [j1[0], F + 4, j1[2]], [j0[0], F + 4, j0[2]]], [dir[0] * (sj === door.s0 ? 1 : -1), 0, dir[1] * (sj === door.s0 ? 1 : -1)]);
      }
    }
    // skirting / plinth
    st.withPaint({ joint: JOINT.none, cav: 0.9 }, () => {
      const segs: [number, number][] = [];
      let s = 0;
      for (const o of openings.filter((x) => x.y0 < F + 0.6).sort((x, y) => x.s0 - y.s0)) {
        if (o.s0 > s) segs.push([s, o.s0]);
        s = Math.max(s, o.s1);
      }
      if (s < len) segs.push([s, len]);
      for (const [s0, s1] of segs) {
        if (s1 - s0 < 0.05) continue;
        const p0 = surf.point(s0, 0), p1 = surf.point(s1, 0);
        st.sweep(new P(0.12, F).up(0.45).to(0.06, F + 0.55).to(0, F + 0.6).build(), [[p0[0], p0[2]], [p1[0], p1[2]]], false, { flip: true });
      }
    });
    // collision: the wall up to head height, with the doors left open
    const colOps = doors.map((d) => d.o);
    col.withPaint({}, () => stripPanel(col, surf, 0, len, F - 0.5, F + 4, colOps, 4));
    void glass;
  }
}

// ============================================================================ arcades

/**
 * One side of a vessel: arcade of round arches on piers (with giant pilasters towards the
 * vessel), the entablature, and the clerestory with its windows up to the vault.
 */
function arcade(ctx: Ctx, a: V2, b: V2, piers: number[]) {
  const st = ctx.g("stoneInt");
  // faces: the vessel face at |offset| zV, the aisle face at zP
  const alongX = Math.abs(a[1] - b[1]) < 1e-6;
  const side = alongX ? Math.sign(a[1]) : Math.sign(a[0]);
  const coord = (p: V2) => (alongX ? p[0] : p[1]);
  const lo = Math.min(coord(a), coord(b)), hi = Math.max(coord(a), coord(b));
  const make = (off: number, facing: number) => {
    // wall along the axis at |offset| = off, normal pointing `facing` (sign along the offset axis)
    const p0: V2 = alongX ? [lo, side * off] : [side * off, lo];
    const dir: V2 = alongX ? [1, 0] : [0, 1];
    const nrm: V2 = alongX ? [0, facing] : [facing, 0];
    return planeSurface(p0, dir, nrm);
  };
  const vessel = make(INT.zV, -side);
  const aisle = make(INT.zP, side);
  const L = hi - lo;
  // arches between piers (piers are given by their centre coordinates)
  const edges = [lo, ...piers.flatMap((p) => [p - PIER_HALF, p + PIER_HALF]), hi];
  const ops: Opening[] = [];
  for (let i = 0; i < edges.length; i += 2) {
    const s0 = edges[i] - lo + (i === 0 ? 0.9 : 0), s1 = edges[i + 1] - lo - (i + 1 === edges.length - 1 ? 0.9 : 0);
    if (s1 - s0 < 1) continue;
    ops.push({ s0, s1, y0: F - 0.2, y1: INT.arcSpring, head: "segment", rise: INT.arcCrown - INT.arcSpring });
  }
  st.withPaint({ joint: JOINT.ashlar, cav: 0.95 }, () => {
    stripPanel(st, vessel, 0, L, F - 0.05, INT.entBot, ops, 2.0);
    stripPanel(st, aisle, 0, L, F - 0.05, INT.arcCrown + 0.4, ops, 2.0);
  });
  for (const o of ops) {
    const outl = openingOutline({ ...o, y0: F - 0.05 }, 14);
    st.withPaint({ joint: JOINT.blocks, cav: 0.85 }, () => revealOnSurface(st, vessel, outl, INT.zP - INT.zV));
    // archivolt
    const arc = outl.slice(2, -1);
    st.withPaint({ joint: JOINT.none }, () => sweepOnSurface(st, vessel, new P(0, 0).to(0, 0.1).to(0.12, 0.1).to(0.12, 0.3).to(0.2, 0.3).to(0.2, 0).build(), arc, false, { outwardFrom: [(o.s0 + o.s1) / 2, INT.arcSpring] }));
    // keystone
    const ks = (o.s0 + o.s1) / 2;
    const kp = vessel.point(ks, INT.arcCrown - 0.1, -0.02);
    st.withPaint({ joint: JOINT.none }, () => st.at(kp[0], 0, kp[2], alongX ? (side > 0 ? Math.PI : 0) : (side > 0 ? -Math.PI / 2 : Math.PI / 2), () => st.box(-0.35, INT.arcCrown - 0.45, 0, 0.35, INT.arcCrown + 0.55, 0.22, "nz")));
  }
  // giant pilasters on the vessel face of each pier
  for (const p of piers) pilaster(ctx, vessel, p - lo, F, INT.entBot, 1.45, 0.22, "capXflat");
  // impost mouldings at the springing on the pier faces
  st.withPaint({ joint: JOINT.none }, () => {
    for (let i = 0; i < edges.length; i += 2) {
      // no-op placeholder for symmetry; imposts are part of the archivolt sweep
    }
  });
  // entablature on the vessel face
  const e0 = vessel.point(0, 0), e1 = vessel.point(L, 0);
  const path: V2[] = [[e0[0], e0[2]], [e1[0], e1[2]]];
  st.withPaint({ joint: JOINT.blocks, cav: 0.9 }, () => st.sweep(entablature(INT.entTop - INT.entBot, INT.entBot, 0.75, { frieze: 0.3 }), path, false, { flip: alongX ? side > 0 : side < 0 }));
  // clerestory wall with windows up to the vault
  const cler = make(INT.zV, -side);
  const wins: Opening[] = [];
  if (alongX) {
    for (const x of CLERESTORY_X) {
      if (x - 1.6 < lo + 0.5 || x + 1.6 > hi - 0.5) continue;
      wins.push({ s0: x - lo - 1.6, s1: x - lo + 1.6, y0: 22.7, y1: 24.9, head: "segment", rise: 1.2 });
    }
  }
  const top = INT.vaultSpring + INT.vaultRise;
  st.withPaint({ joint: JOINT.ashlar, cav: 0.95 }, () => stripPanel(st, cler, 0, L, INT.entTop - 0.02, top, wins, 2.0));
  for (const o of wins) {
    const outl = openingOutline(o, 10);
    st.withPaint({ joint: JOINT.blocks, cav: 0.8 }, () => revealOnSurface(st, cler, outl, 8.2 - INT.zV - 0.78));
  }
  // collision: the pier faces and arch openings at floor level
  ctx.col.withPaint({}, () => {
    stripPanel(ctx.col, vessel, 0, L, F - 0.5, F + 4, ops.map((o) => ({ ...o, y0: F - 0.6, head: "flat" as const, y1: F + 4.5 })), 4);
    stripPanel(ctx.col, aisle, 0, L, F - 0.5, F + 4, ops.map((o) => ({ ...o, y0: F - 0.6, head: "flat" as const, y1: F + 4.5 })), 4);
    for (const o of ops) revealOnSurface(ctx.col, vessel, openingOutline({ ...o, y0: F - 0.5, y1: F + 4, head: "flat" }, 1), INT.zP - INT.zV);
  });
}

// ============================================================================ crossing

function octagon(r: number): V2[] {
  const pts: V2[] = [];
  for (let k = 0; k < 8; k++) {
    const a = (22.5 + 45 * k) * DEG;
    pts.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  return pts;
}

function crossing(ctx: Ctx) {
  const st = ctx.g("stoneInt");
  const col = ctx.col;
  // the eight piers
  const piers: V2[][] = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const A: V2[] = [[16.17, 6.25], [16.17, 6.7], [13.7, 9.17], [13.93, INT.zP], [INT.pierEnd, INT.zP], [INT.pierEnd, 6.25]];
      piers.push(A.map(([x, z]) => [sx * x, sz * z] as V2));
      piers.push(A.map(([x, z]) => [sx * z, sz * x] as V2));
    }
  }
  for (const p of piers) {
    st.withPaint({ joint: JOINT.ashlar, cav: 0.95 }, () => st.prism(p, F - 0.05, INT.crossSpring, { top: false }));
    col.prism(p, F - 0.5, F + 4, { top: false });
  }
  // giant pilasters on the diagonal faces
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const a: V2 = [sx * 16.17, sz * 6.7], b: V2 = [sx * 13.7, sz * 9.17];
      const a2: V2 = [sx * 6.7, sz * 16.17], b2: V2 = [sx * 9.17, sz * 13.7];
      for (const [p, q] of [[a, b], [a2, b2]] as [V2, V2][]) {
        const L = Math.hypot(q[0] - p[0], q[1] - p[1]);
        const dir: V2 = [(q[0] - p[0]) / L, (q[1] - p[1]) / L];
        // the face looks towards the crossing centre
        let nrm: V2 = [-dir[1], dir[0]];
        if (nrm[0] * -p[0] + nrm[1] * -p[1] < 0) nrm = [-nrm[0], -nrm[1]];
        pilaster(ctx, planeSurface(p, dir, nrm), L / 2, F, INT.entBot, 1.45, 0.22, "capXflat");
      }
    }
  }
  // entablature along the faces of each pier (it breaks at the arches)
  const oct = octagon(INT.octR);
  const ent = entablature(INT.entTop - INT.entBot, INT.entBot, 0.75, { frieze: 0.3 });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const pa: V2[] = [[INT.pierEnd, 6.25], [16.17, 6.25], [16.17, 6.7], [13.7, 9.17], [13.93, INT.zP]];
      st.withPaint({ joint: JOINT.blocks, cav: 0.9 }, () => {
        st.sweep(ent, pa.map(([x, z]) => [sx * x, sz * z] as V2), false, { flip: sx * sz > 0, capEnds: true });
        st.sweep(ent, pa.map(([x, z]) => [sx * z, sz * x] as V2), false, { flip: sx * sz < 0, capEnds: true });
      });
    }
  }
  // upper octagon wall with the eight arches
  const top = INT.wgBand;
  for (let k = 0; k < 8; k++) {
    const p = oct[k], q = oct[(k + 1) % 8];
    const L = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const dir: V2 = [(q[0] - p[0]) / L, (q[1] - p[1]) / L];
    let nrm: V2 = [-dir[1], dir[0]];
    if (nrm[0] * -p[0] + nrm[1] * -p[1] < 0) nrm = [-nrm[0], -nrm[1]];
    const surf = planeSurface(p, dir, nrm);
    const midA = Math.atan2((p[1] + q[1]) / 2, (p[0] + q[0]) / 2) / DEG;
    const axis = Math.abs(((midA % 90) + 90) % 90) < 1;
    const half = axis ? INT.zV : 3.2;
    const o: Opening = { s0: L / 2 - half, s1: L / 2 + half, y0: INT.crossSpring - 0.01, y1: INT.crossSpring, head: "round" };
    st.withPaint({ joint: JOINT.ashlar, cav: 0.95 }, () => stripPanel(st, surf, 0, L, INT.crossSpring, top, [o], 1.0));
    const outl = openingOutline(o, 18).filter((pt) => pt[1] >= INT.crossSpring - 0.001);
    const depth = axis ? INT.pierEnd - 16.17 : 1.6;
    st.withPaint({ joint: JOINT.blocks, cav: 0.85 }, () => revealOnSurface(st, surf, outl, depth, false));
    // archivolt on the crossing face
    st.withPaint({ joint: JOINT.none }, () => sweepOnSurface(st, surf, new P(0, 0).to(0, 0.12).to(0.18, 0.12).to(0.18, 0.4).to(0.28, 0.4).to(0.28, 0).build(), outl.slice(1, -1), false, { outwardFrom: [L / 2, INT.crossSpring] }));
    // gold mosaic spandrels above the arch
    const m = ctx.g("mosaic");
    const crown = INT.crossSpring + half;
    if (top - crown > 1.5) {
      m.withPaint({ joint: 0, cav: 1 }, () => fillOnSurface(m, surf, [[0.4, crown + 0.6], [L - 0.4, crown + 0.6], [L - 0.4, top - 0.5], [0.4, top - 0.5]], -0.01));
    }
    // back of the arch: close the opening above the lower vaults behind it
    const back = planeSurface([p[0] - nrm[0] * depth, p[1] - nrm[1] * depth], dir, nrm);
    const floorBehind = axis ? INT.vaultSpring + INT.vaultRise : INT.aisleSpring + INT.aisleRise;
    const clip = outl.filter((pt) => pt[1] > floorBehind - 0.2);
    if (clip.length > 2) {
      const poly: V2[] = [[L / 2 - half, floorBehind - 0.2], ...clip.filter((pt) => pt[0] > L / 2 - half + 0.01 && pt[0] < L / 2 + half - 0.01), [L / 2 + half, floorBehind - 0.2]];
      st.withPaint({ joint: JOINT.ashlar, cav: 0.8 }, () => fillOnSurface(st, back, poly, 0));
    } else if (axis) {
      // the vessel's vault end above the arch: fill between the arch and the vault crown line
      const ys = INT.vaultSpring, rise = INT.vaultRise;
      const lun: V2[] = [];
      for (let i = 0; i <= 16; i++) {
        const s = L / 2 - half + (2 * half * i) / 16;
        const v = (s - L / 2) / half;
        lun.push([s, ys + (rise * (1 - v * v)) / 2]);
      }
      const arc = outl.slice(1, -1).reverse();
      // (it faces the vessel, away from the crossing)
      const poly: V2[] = [[L / 2 - half, INT.crossSpring], ...arc.filter((pt) => pt[1] > INT.crossSpring + 0.01), [L / 2 + half, INT.crossSpring], ...lun.reverse()];
      st.withPaint({ joint: JOINT.ashlar, cav: 0.85 }, () => fillOnSurface(st, back, poly.filter((_, i, arr) => i === 0 || Math.hypot(arr[i][0] - arr[i - 1][0], arr[i][1] - arr[i - 1][1]) > 1e-4), 0, -1));
    }
  }
  // band from the octagon to the circle of the gallery (the pendentive zone, simplified)
  const n = 128;
  st.withPaint({ joint: JOINT.blocks, cav: 0.9 }, () => {
    const ring: [number, number][] = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * TAU;
      // radius of the octagon along direction a
      const rel = ((((a / DEG - 22.5) % 45) + 45) % 45) - 22.5;
      const rOct = (INT.octR * Math.cos(22.5 * DEG)) / Math.cos((rel + 22.5 - 22.5) * DEG);
      ring.push([a, rOct]);
    }
    for (let i = 0; i < n; i++) {
      const [a0, r0] = ring[i], [a1, r1] = ring[i + 1];
      const p0: V3 = [r0 * Math.cos(a0), INT.wgBand, r0 * Math.sin(a0)], p1: V3 = [r1 * Math.cos(a1), INT.wgBand, r1 * Math.sin(a1)];
      const q0: V3 = [INT.wgWall * Math.cos(a0), INT.wgSoffit, INT.wgWall * Math.sin(a0)], q1: V3 = [INT.wgWall * Math.cos(a1), INT.wgSoffit, INT.wgWall * Math.sin(a1)];
      const am = (a0 + a1) / 2;
      st.polyN([p0, p1, q1, q0], [-Math.cos(am), -0.3, -Math.sin(am)]);
    }
  });
}

// ============================================================================ Whispering Gallery

function circle(r: number, n = 128): V2[] {
  const pts: V2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    pts.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  return pts;
}

function whisperingGallery(ctx: Ctx) {
  const st = ctx.g("stoneInt");
  const iron = ctx.g("iron");
  const y = DOME.whisperingGallery;
  const rW = INT.wgWall, rR = INT.wgRail;
  // floor, soffit and edge
  ctx.g("marble").withPaint({ cav: 1 }, () => ctx.g("marble").cap(circle(rW + 0.05, 160), y, true, [circle(rR, 160)]));
  st.withPaint({ joint: JOINT.none, cav: 0.85 }, () => {
    st.cap(circle(rW + 0.05, 160), INT.wgSoffit, false, [circle(rR - 0.2, 160)]);
    st.lathe([[rR - 0.2, INT.wgSoffit], [rR - 0.2, y - 0.12], [rR - 0.05, y - 0.05], [rR - 0.05, y]], 160, { inside: false, smooth: false });
  });
  // corbel table under the gallery
  st.withPaint({ joint: JOINT.blocks, cav: 0.9 }, () => {
    for (let k = 0; k < 96; k++) {
      const a = (k / 96) * TAU;
      const c = Math.cos(a), s = Math.sin(a);
      st.at(c * (rR + 0.25), 0, s * (rR + 0.25), -a + Math.PI / 2, () => st.box(-0.16, INT.wgSoffit - 0.55, -0.45, 0.16, INT.wgSoffit, 0.2, "py"));
    }
  });
  // the railing: posts, rails and a moulded top rail
  iron.withPaint({ cav: 1 }, () => {
    const posts = 260;
    for (let k = 0; k < posts; k++) {
      const a = (k / posts) * TAU;
      const c = Math.cos(a), s = Math.sin(a);
      const r = rR + 0.07;
      iron.box(c * r - 0.012, y, s * r - 0.012, c * r + 0.012, y + 1.02, s * r + 0.012);
    }
    iron.lathe([[rR + 0.03, y + 1.0], [rR + 0.13, y + 1.0], [rR + 0.13, y + 1.08], [rR + 0.03, y + 1.08]], 128);
    iron.lathe([[rR + 0.05, y + 0.12], [rR + 0.1, y + 0.12], [rR + 0.1, y + 0.16], [rR + 0.05, y + 0.16]], 128);
  });
  // stone bench along the wall (visitors sit here to whisper), broken at the doors
  const col = ctx.col;
  const gapW = 0.9 / rW;
  const spans: [number, number][] = [];
  const ds = ctx.doors.map((d) => ((d % TAU) + TAU) % TAU).sort((p, q) => p - q);
  if (ds.length === 0) spans.push([0, TAU]);
  for (let i = 0; i < ds.length; i++) {
    const a = ds[i] + gapW, b = (i + 1 < ds.length ? ds[i + 1] : ds[0] + TAU) - gapW;
    if (b > a) spans.push([a, b]);
  }
  for (const [a, b] of spans) {
    const n = Math.max(2, Math.ceil((b - a) / (TAU / 128)));
    // lathe angles run from +x towards -z: negate
    st.withPaint({ joint: JOINT.blocks, cav: 0.9 }, () => st.lathe([[rW - 0.42, y], [rW - 0.42, y + 0.45], [rW, y + 0.47]], n, { a0: -b, a1: -a, inside: true }));
    col.lathe([[rW - 0.42, y - 0.2], [rW - 0.42, y + 2.5]], n, { a0: -b, a1: -a, inside: true });
  }
  // collision
  col.cap(circle(rW + 0.3, 96), y, true, [circle(rR, 96)]);
  col.lathe([[rR + 0.1, y - 0.2], [rR + 0.1, y + 1.15]], 96);
}

// ============================================================================ drum, dome, cone

/** A leaning (conical) wall as a Surface: s = angle x rRef, seen from inside. */
function coneSurf(r0: number, y0: number, r1: number, y1: number, rRef: number): Surface {
  const rAt = (y: number) => r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
  return {
    point: (s, y, d = 0) => {
      const a = s / rRef;
      const r = rAt(y) + d;
      return [r * Math.cos(a), y, r * Math.sin(a)];
    },
    normal: (s) => {
      const a = s / rRef;
      return [-Math.cos(a), 0, -Math.sin(a)];
    },
    tangent: (s) => {
      const a = s / rRef;
      return [-Math.sin(a), 0, Math.cos(a)];
    },
  };
}

function drumAndDome(ctx: Ctx) {
  const st = ctx.g("stoneInt");
  const y0 = DOME.whisperingGallery, y1 = INT.drumTop;
  const r0 = INT.wgWall, r1 = INT.drumTopR;
  const rRef = (r0 + r1) / 2;
  const surf = coneSurf(r0, y0, r1, y1, rRef);
  const Ls = TAU * rRef;
  // windows (in threes, as outside) and niches with statues between the groups
  const wins: Opening[] = [];
  const niches: Opening[] = [];
  for (let m = 0; m < 8; m++) {
    for (let j = -1; j <= 1; j++) {
      const a = (45 * m + 11.25 * j) * DEG;
      wins.push({ s0: a * rRef - 0.85, s1: a * rRef + 0.85, y0: 37.6, y1: 44.2, head: "round" });
    }
    const an = (45 * m + 22.5) * DEG;
    niches.push({ s0: an * rRef - 1.0, s1: an * rRef + 1.0, y0: 36.2, y1: 42.4, head: "round" });
  }
  // doors from the gallery into the stairs (see stairs.ts): gaps in the wall
  const doors = ctx.doors.map((a) => ({ s0: a * rRef - 0.6, s1: a * rRef + 0.6, y0: y0, y1: y0 + 2.05, head: "flat" as const }));
  const wrap = (o: Opening) => (o.s0 < 0 ? { ...o, s0: o.s0 + Ls, s1: o.s1 + Ls } : o);
  const all = [...wins, ...niches, ...doors].map(wrap);
  st.withPaint({ joint: JOINT.ashlar, cav: 0.95 }, () => stripPanel(st, surf, 0, Ls, y0 - 0.02, y1, all, 0.9));
  const glass = ctx.g("glass");
  for (const o of wins.map(wrap)) {
    const outl = openingOutline(o, 10);
    st.withPaint({ joint: JOINT.blocks, cav: 0.8 }, () => revealOnSurface(st, surf, outl, 1.1));
    glass.withPaint({ cav: 1 }, () => fillOnSurface(glass, surf, outl, 1.1, -1));
    st.withPaint({ joint: JOINT.none }, () => sweepOnSurface(st, surf, new P(0, 0).to(0, 0.08).to(0.22, 0.08).to(0.22, 0).build(), outl.slice(1).concat([outl[0]]), false, { outwardFrom: [(o.s0 + o.s1) / 2, o.y0] }));
  }
  let v = 0;
  for (const o of niches.map(wrap)) {
    const outl = openingOutline(o, 10);
    st.withPaint({ joint: JOINT.none, cav: 0.6 }, () => {
      revealOnSurface(st, surf, outl, 0.7);
      fillOnSurface(st, surf, outl, 0.7);
    });
    const c = (o.s0 + o.s1) / 2;
    const p = surf.point(c, o.y0, 0.45);
    const a = c / rRef;
    ctx.inst.add(`statue${v++ % 4}`, [p[0], o.y0, p[2]], Math.atan2(-Math.cos(a), -Math.sin(a)), 2.6 / 1.92);
  }
  for (const o of doors.map(wrap)) {
    const outl = openingOutline(o, 2);
    st.withPaint({ joint: JOINT.blocks, cav: 0.7 }, () => revealOnSurface(st, surf, outl, 1.3));
  }
  // pilaster strips between the bays
  st.withPaint({ joint: JOINT.ashlar, cav: 1 }, () => {
    for (let k = 0; k < 32; k++) {
      const a = (5.625 + 11.25 * k) * DEG;
      if (ctx.doors.some((d) => Math.abs(((a - d + Math.PI * 3) % TAU) - Math.PI) < 0.07)) continue;
      const w = 0.55 / rRef;
      st.lathe([[r0 - 0.16, y0 + 1.2], [r1 - 0.16, y1 - 0.7]], 2, { a0: -(a + w), a1: -(a - w), inside: true });
    }
  });
  // cornice at the top of the drum and plinth at the gallery
  st.withPaint({ joint: JOINT.blocks, cav: 0.9 }, () => {
    const c = circle(r1 - 0.01, 160);
    st.sweep(cornice(0.9, 0.55, y1 - 0.9), c, true, { flip: true });
    st.sweep(new P(0.25, y0 + 1.0).up(0.2).to(0, y0 + 1.4).build(), circle(r0 - 0.4, 160), true, { flip: true });
  });
  // ledge from the drum cornice to the springing of the dome
  st.withPaint({ joint: JOINT.none }, () => st.cap(circle(r1 + 0.3, 160), y1, false, [circle(DOME.innerR - 0.02, 160)]));
  st.withPaint({ joint: JOINT.none }, () => st.lathe([[DOME.innerR, y1], [DOME.innerR, DOME.innerSpring]], 160, { inside: true }));

  // painted inner dome
  const prof: V2[] = [];
  const thTop = Math.acos(DOME.oculusR / DOME.innerR);
  const Hh = (DOME.innerCrown - DOME.innerSpring) / Math.sin(thTop);
  for (let i = 0; i <= 40; i++) {
    const t = (i / 40) * thTop;
    prof.push([DOME.innerR * Math.cos(t), DOME.innerSpring + Hh * Math.sin(t)]);
  }
  ctx.g("domePaint").lathe(prof, 192, { inside: true, smooth: true });
  // oculus: moulded, gilded ring
  const yo = DOME.innerCrown;
  ctx.g("gold").withPaint({ cav: 1 }, () => ctx.g("gold").lathe([[DOME.oculusR + 0.35, yo - 0.12], [DOME.oculusR, yo], [DOME.oculusR, yo + 0.5]], 96, { inside: true }));
  // the brick cone seen through the oculus (whitewashed), up to the lantern
  const cone = (y: number) => coneR(y) - 0.45;
  const cp: V2[] = [];
  for (let y = yo - 0.5; y <= DOME.goldenGallery; y += 2) cp.push([cone(y), y]);
  cp.push([cone(DOME.goldenGallery), DOME.goldenGallery]);
  ctx.g("coneWash").withPaint({ joint: 0, cav: 1 }, () => ctx.g("coneWash").lathe(cp, 64, { inside: true }));
  // top of the dome's shell around the oculus (seen from the cone)
  ctx.g("coneWash").withPaint({ cav: 0.8 }, () => ctx.g("coneWash").cap(circle(cone(yo) + 0.05, 64), yo + 0.5, true, [circle(DOME.oculusR, 64)]));
}
