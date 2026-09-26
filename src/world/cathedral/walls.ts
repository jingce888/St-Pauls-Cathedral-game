import * as THREE from "three";
import { JOINT } from "../../geo/Builder";
import { arcSurface, fillOnSurface, openingOutline, planeSurface, revealOnSurface, stripPanel, sweepOnSurface, type Opening, type Surface } from "../../geo/surface";
import { P, cornice, entablature, pedestalBase, pedestalCap, plinth } from "../../geo/profiles";
import type { V2 } from "../../core/math";
import { ELEV, FLOOR, PLAN } from "../dims";
import { balustrade, faceYaw, pilasterGroup, slab, statue, type Ctx } from "./kit";
import { placeRelief } from "./reliefs";
import { cartouche, phoenix, royalArms } from "./sculpture";
import type { Face } from "./plan";

/** Heights of the wall system (world y). */
export const H = {
  base: -3,
  plinthTop: 0.45,
  capBot: 2.45,
  lowerBase: ELEV.lowerColBase,
  lowerTop: ELEV.lowerColTop,
  lowerEnt: ELEV.lowerEntTop,
  pedBase: ELEV.lowerEntTop + 0.3,
  pedCap: ELEV.upperPedTop - 0.3,
  upperBase: ELEV.upperPedTop,
  upperTop: ELEV.upperColTop,
  upperEnt: ELEV.upperEntTop,
  top: ELEV.balustradeTop,
  crypt: [0.85, 1.8] as V2,
  winSill: FLOOR + 2.8,
  winSpring: FLOOR + 8.7,
  nicheLow: FLOOR + 17.9,
  nicheSpring: FLOOR + 22.2,
} as const;

export const LOWER_W = 1.22, UPPER_W = 1.02;

/** A run of faces treated as one surface (straight faces, or consecutive apse arcs). */
export interface Run {
  kind: Face["kind"];
  surf: Surface;
  len: number;
  faces: Face[];
  out: V2;
}

export function groupRuns(faces: Face[]): Run[] {
  const runs: Run[] = [];
  for (let i = 0; i < faces.length; i++) {
    const f = faces[i];
    if (f.arc) {
      // merge consecutive arc faces of the same kind and radius
      const group = [f];
      while (i + 1 < faces.length && faces[i + 1].arc && faces[i + 1].kind === f.kind && Math.abs(faces[i + 1].arc!.r - f.arc.r) < 1e-6) group.push(faces[++i]);
      const th0 = (group[0].arc!.th0 * Math.PI) / 180, th1 = (group[group.length - 1].arc!.th1 * Math.PI) / 180;
      const r = f.arc.r;
      const surf = arcSurface(f.arc.c, r, th0, th1 >= th0 ? 1 : -1);
      runs.push({ kind: f.kind, surf, len: Math.abs(th1 - th0) * r, faces: group, out: [Math.cos((th0 + th1) / 2), Math.sin((th0 + th1) / 2)] });
    } else {
      const dir: V2 = [(f.b[0] - f.a[0]) / f.len, (f.b[1] - f.a[1]) / f.len];
      runs.push({ kind: f.kind, surf: planeSurface(f.a, dir, f.out), len: f.len, faces: [f], out: f.out });
    }
  }
  return runs;
}

/** Openings of a run by storey. */
export function runOpenings(run: Run) {
  const L = run.len, c = L / 2;
  const lower: Opening[] = [];
  const upper: Opening[] = [];
  const crypt: Opening[] = [];
  const holes: Opening[] = [];
  const niches: Opening[] = [];
  let door: Opening | null = null;
  switch (run.kind) {
    case "B":
    case "C": {
      const w = Math.min(2.75, L - 2.3);
      if (w < 1.2) break;
      lower.push({ s0: c - w / 2, s1: c + w / 2, y0: H.winSill, y1: H.winSpring, head: "round" });
      if (run.kind === "C") upper.push({ s0: c - 1.0, s1: c + 1.0, y0: H.nicheLow - 0.2, y1: H.nicheSpring + 0.3, head: "round" });
      else niches.push({ s0: c - 0.8, s1: c + 0.8, y0: H.nicheLow, y1: H.nicheSpring, head: "round" });
      if (run.kind === "B") holes.push({ s0: c - 0.31, s1: c + 0.31, y0: H.pedBase + 0.22, y1: H.pedCap - 0.12, head: "flat" });
      crypt.push({ s0: c - 0.62, s1: c + 0.62, y0: H.crypt[0], y1: H.crypt[1], head: "segment", rise: 0.22 });
      break;
    }
    case "b":
    case "N": {
      if (L < 1.7) break;
      const w = Math.min(1.4, L - 1.0);
      niches.push({ s0: c - w / 2, s1: c + w / 2, y0: FLOOR + 3.4, y1: FLOOR + 7.9, head: "round" });
      const w2 = Math.min(1.2, L - 1.0);
      niches.push({ s0: c - w2 / 2, s1: c + w2 / 2, y0: H.nicheLow + 0.3, y1: H.nicheSpring - 0.2, head: "round" });
      break;
    }
    case "T": {
      door = { s0: c - 1.55, s1: c + 1.55, y0: FLOOR, y1: FLOOR + 6.3, head: "flat" };
      upper.push({ s0: c - 1.5, s1: c + 1.5, y0: H.nicheLow - 0.4, y1: H.nicheSpring + 0.6, head: "round" });
      for (const k of [-1, 1]) niches.push({ s0: c + k * 4.3 - 0.6, s1: c + k * 4.3 + 0.6, y0: H.nicheLow + 0.2, y1: H.nicheSpring - 0.5, head: "round" });
      break;
    }
  }
  return { lower, upper, crypt, holes, niches, door };
}

/** Builds all exterior walls of the loop (except the west portico wall). */
export function buildWalls(ctx: Ctx, faces: Face[]) {
  const runs = groupRuns(faces);
  const stone = ctx.g("stone");
  const glass = ctx.g("glass");
  const iron = ctx.g("iron");

  for (const run of runs) {
    if (run.kind === "W") continue;
    const surf = run.surf;
    const L = run.len;
    const op = runOpenings(run);
    const openings = [...op.lower, ...op.upper, ...op.crypt, ...op.holes, ...op.niches, ...(op.door ? [op.door] : [])];
    const curved = run.faces[0].arc !== undefined;
    stone.withPaint({ joint: JOINT.ashlar, cav: 1 }, () => stripPanel(stone, surf, 0, L, H.base, H.upperEnt, openings, curved ? 0.5 : 2.5));

    // windows: reveal, glass, surround, keystone, sill, apron with festoon
    for (const o of [...op.lower, ...op.upper]) {
      const outline = openingOutline(o, 14);
      stone.withPaint({ joint: JOINT.blocks, cav: 0.72 }, () => revealOnSurface(stone, surf, outline, 0.85));
      glass.withPaint({ joint: 0, expo: 0, cav: 1 }, () => fillOnSurface(glass, surf, outline, 0.85));
      // glazing frame: thin iron bars around the edge
      iron.withPaint({ cav: 1 }, () => revealOnSurface(iron, surf, shrink(outline, 0.05), 0.12));
      windowDressing(ctx, surf, o, o === op.lower[0] && run.kind !== "C" ? "lower" : "upper");
    }
    for (const o of op.crypt) {
      const outline = openingOutline(o, 8);
      stone.withPaint({ joint: JOINT.blocks, cav: 0.6 }, () => revealOnSurface(stone, surf, outline, 0.6));
      glass.withPaint({ joint: 0, expo: 0, cav: 0.5 }, () => fillOnSurface(glass, surf, outline, 0.6));
      stone.withPaint({ joint: JOINT.none }, () => sweepOnSurface(stone, surf, surround(0.18, 0.08), outline, true, { outwardFrom: [(o.s0 + o.s1) / 2, (o.y0 + o.y1) / 2] }));
    }
    for (const o of op.holes) {
      const outline = openingOutline(o, 4);
      stone.withPaint({ joint: JOINT.none, cav: 0.25 }, () => revealOnSurface(stone, surf, outline, 0.4));
      ctx.g("iron").withPaint({ cav: 0.3 }, () => fillOnSurface(ctx.g("iron"), surf, outline, 0.4));
    }
    for (const o of op.niches) niche(ctx, surf, o);
    if (op.door) {
      // cartouche over the transept door, under the portico
      const dc = (op.door.s0 + op.door.s1) / 2, side = Math.sign(surf.normal(dc)[2]);
      placeRelief(ctx, cartouche(4.4, 4.6, 0.028, side > 0 ? 2 : 1), surf.point(dc, op.door.y1 + 1.0, -0.005), [0, side]);
      const outline = openingOutline(op.door, 4);
      stone.withPaint({ joint: JOINT.blocks, cav: 0.6 }, () => revealOnSurface(stone, surf, outline, 1.2));
      // the oak leaves stand open, turned back against the inside of the wall
      const d = op.door, hw = (d.s1 - d.s0) / 2, cs = (d.s0 + d.s1) / 2;
      for (const k of [-1, 1]) {
        const sl = cs + k * (hw - 0.06);
        const pa = surf.point(sl - 0.06, d.y0, 1.2), pb = surf.point(sl + 0.06, d.y0, 1.2 + hw * 0.55);
        ctx.g("wood").withPaint({ cav: 0.8 }, () => ctx.g("wood").box(Math.min(pa[0], pb[0]), d.y0 + 0.02, Math.min(pa[2], pb[2]), Math.max(pa[0], pb[0]), d.y1 - 0.05, Math.max(pa[2], pb[2])));
      }
      stone.withPaint({ joint: JOINT.none }, () => sweepOnSurface(stone, surf, surround(0.45, 0.2), outline.slice(1).concat([outline[0]]), false, { outwardFrom: [(op.door!.s0 + op.door!.s1) / 2, op.door!.y0] }));
    }

    // pilasters on piers, with carved drops of fruit and flowers hanging between a pair
    if (run.kind === "P" || run.kind === "Q") {
      pilasterGroup(ctx, surf, L, H.lowerBase, H.lowerTop, LOWER_W, 0.3, "capCflat");
      pilasterGroup(ctx, surf, L, H.upperBase, H.upperTop, UPPER_W, 0.25, "capXflat");
      const yaw = faceYaw(surf.normal(L / 2));
      if (L >= 2 * LOWER_W + 0.5) ctx.inst.add("dropL", surf.point(L / 2, H.lowerTop - LOWER_W * 1.17 - 0.12, -0.005), yaw);
      if (L >= 2 * UPPER_W + 0.5) ctx.inst.add("dropU", surf.point(L / 2, H.upperTop - UPPER_W * 1.17 - 0.12, -0.005), yaw);
    }
    // frieze festoons between the capitals over window bays
    if ((run.kind === "B" || run.kind === "C") && L > 4) {
      const q = surf.point(L / 2, H.lowerTop - 0.25, -0.04);
      ctx.inst.add("festoon", q, faceYaw(surf.normal(L / 2)), [Math.min(3.6, L - 2.2), 1.2, 1.4]);
    }
  }

  // ------------------------------------------------------------- continuous mouldings
  const lower = lowerPath(faces);
  const upper = upperPath(faces);
  const loop = faces.map((f) => f.a);
  stone.withPaint({ joint: JOINT.blocks }, () => {
    stone.sweep(plinth(0.5, 0.28, -0.05), loop, true);
    stone.sweep(cornice(0.45, 0.32, H.capBot), loop, true);
    stone.sweep(entablature(H.lowerEnt - H.lowerTop, H.lowerTop, 1.12), lower, true);
    stone.sweep(pedestalBase(0.3, 0.12, H.lowerEnt), upper, true);
    stone.sweep(pedestalCap(0.3, 0.16, H.pedCap), upper, true);
    stone.sweep(entablature(H.upperEnt - H.upperTop, H.upperTop, 0.98), upper, true);
  });
  modillions(ctx, lower, H.lowerTop, H.lowerEnt - H.lowerTop, 1.12);
  modillions(ctx, upper, H.upperTop, H.upperEnt - H.upperTop, 0.98);

  // ------------------------------------------------------------- crowning balustrade
  balustradeLoop(ctx, faces);
}

/** Round-headed window surround, keystone, sill, apron panel and festoon. */
function windowDressing(ctx: Ctx, surf: Surface, o: Opening, storey: "lower" | "upper") {
  const stone = ctx.g("stone");
  const outline = openingOutline(o, 14);
  const cs = (o.s0 + o.s1) / 2;
  const w = o.s1 - o.s0;
  // architrave surround (open at the sill)
  const path = outline.slice(1).concat([outline[0]]);
  stone.withPaint({ joint: JOINT.none, cav: 1 }, () => sweepOnSurface(stone, surf, surround(storey === "lower" ? 0.42 : 0.3, 0.16), path, false, { outwardFrom: [cs, (o.y0 + o.y1) / 2] }));
  const crown = o.y1 + w / 2;
  // keystone carved with a winged cherub head
  const lower = storey === "lower";
  stone.withPaint({ joint: JOINT.none }, () => {
    const kw = lower ? 0.5 : 0.38;
    slab(stone, surf, cs - kw / 2, cs + kw / 2, crown - 0.15, crown + (lower ? 0.62 : 0.45), 0.0, -0.13);
  });
  ctx.inst.add("cherub", surf.point(cs, crown + (lower ? 0.2 : 0.14), -0.17), faceYaw(surf.normal(cs)), lower ? 1.3 : 0.95);
  // sill ledge on consoles
  stone.withPaint({ joint: JOINT.blocks }, () => slab(stone, surf, o.s0 - 0.55, o.s1 + 0.55, o.y0 - 0.26, o.y0, 0, -0.26, 0.04));
  if (storey === "lower") {
    // apron panel with a Grinling Gibbons festoon
    stone.withPaint({ joint: JOINT.none, cav: 0.95 }, () => slab(stone, surf, o.s0 - 0.1, o.s1 + 0.1, H.capBot + 0.9, o.y0 - 0.26, 0, -0.07));
    const q = surf.point(cs, o.y0 - 0.55, -0.08);
    ctx.inst.add("festoon", q, faceYaw(surf.normal(cs)), [w * 0.9, 1.4, 1.4]);
  }
}

/** A round-headed niche with a shell head, and (upper storey) a pedimented aedicule. */
function niche(ctx: Ctx, surf: Surface, o: Opening) {
  const stone = ctx.g("stone");
  const outline = openingOutline(o, 12);
  const cs = (o.s0 + o.s1) / 2;
  const w = o.s1 - o.s0;
  const depth = Math.min(0.6, w * 0.45);
  stone.withPaint({ joint: JOINT.none, cav: 0.6 }, () => {
    revealOnSurface(stone, surf, outline, depth);
    fillOnSurface(stone, surf, outline, depth);
  });
  stone.withPaint({ joint: JOINT.none }, () => sweepOnSurface(stone, surf, surround(0.22, 0.1), outline.slice(1).concat([outline[0]]), false, { outwardFrom: [cs, (o.y0 + o.y1) / 2] }));
  // sill
  stone.withPaint({ joint: JOINT.blocks }, () => slab(stone, surf, o.s0 - 0.25, o.s1 + 0.25, o.y0 - 0.2, o.y0, 0, -0.2, 0.03));
  if (o.y0 > H.lowerEnt) {
    // aedicule: pilasters, entablature, pediment
    const pw = 0.32, gap = w / 2 + 0.3;
    for (const k of [-1, 1]) slab(stone, surf, cs + k * gap - pw / 2, cs + k * gap + pw / 2, o.y0 - 0.2, o.y1 + w / 2 + 0.35, 0, -0.1);
    const eT = o.y1 + w / 2 + 0.35;
    slab(stone, surf, cs - gap - 0.35, cs + gap + 0.35, eT, eT + 0.42, 0, -0.18, 0.05);
    pediment(ctx, surf, cs, eT + 0.42, 2 * gap + 1.0, 0.75, 0.2);
  }
}

/** Triangular pediment on a surface: tympanum, horizontal cornice and swept raking cornices. */
export function pediment(ctx: Ctx, surf: Surface, cs: number, y0: number, width: number, height: number, proj: number) {
  const b = ctx.g("stone");
  const half = width / 2;
  const ch = Math.max(0.35, height * 0.14);
  b.withPaint({ joint: JOINT.none, cav: 0.9 }, () => {
    // tympanum, slightly recessed
    fillOnSurface(b, surf, [[cs - half + ch, y0 + 0.05], [cs + half - ch, y0 + 0.05], [cs, y0 + height - ch * 0.9]], -0.01);
    // horizontal cornice across the base
    slab(b, surf, cs - half - 0.15, cs + half + 0.15, y0 - 0.12, y0 + 0.08, 0, -proj - 0.05);
    // raking cornices
    const prof = new P(0, 0).to(0, proj * 0.25).to(ch * 0.3, proj * 0.45).to(ch * 0.35, proj * 0.85).to(ch * 0.7, proj).to(ch, proj * 0.6).to(ch, 0).build();
    sweepOnSurface(b, surf, prof, [[cs - half - 0.1, y0 + 0.02], [cs, y0 + height], [cs + half + 0.1, y0 + 0.02]], false, { outwardFrom: [cs, y0 - 5] });
    // back of the pediment (fills the gable behind the cornices)
    fillOnSurface(b, surf, [[cs - half, y0], [cs + half, y0], [cs, y0 + height + ch * 0.6]], 1.2);
  });
}

/** Architrave surround profile for sweepOnSurface: (lateral offset, projection). */
function surround(w: number, t: number) {
  const p = new P(0, 0);
  p.to(0, t * 0.6).to(w * 0.35, t * 0.6).to(w * 0.35, t * 0.8).to(w * 0.7, t * 0.8).to(w * 0.8, t).to(w, t).to(w, 0);
  return p.build();
}

/** Offsets an outline towards its centroid (for window frames). */
function shrink(outline: V2[], d: number): V2[] {
  let cs = 0, cy = 0;
  for (const p of outline) { cs += p[0]; cy += p[1]; }
  cs /= outline.length; cy /= outline.length;
  return outline.map(([s, y]) => {
    const dx = cs - s, dy = cy - y;
    const l = Math.hypot(dx, dy) || 1;
    return [s + (dx / l) * d, y + (dy / l) * d] as V2;
  });
}

// ---------------------------------------------------------------------------------- paths

/**
 * Loop path for the lower order: across the west portico's column line and round the
 * semicircular transept porticoes.
 */
export function lowerPath(faces: Face[]): V2[] {
  const portF = PLAN.porticoFront + 0.1; // architrave face over the columns
  const zP = 16.95;
  const loop = faces.map((f) => f.a).filter(([x, z]) => !(x > -84 && Math.abs(z) < zP));
  const pts: V2[] = [[-83.65, zP], [portF, zP], [portF, -zP], [-83.65, -zP]];
  const R = PLAN.porticoColR + 0.52;
  for (const [x, z] of loop) {
    const isT = Math.abs(Math.abs(x) - 7.15) < 0.01 && Math.abs(Math.abs(z) - 37.05) < 0.01;
    if (!isT) {
      pts.push([x, z]);
      continue;
    }
    // first T point of a portico (in loop order): insert the arc; the second is dropped
    const side = Math.sign(z);
    const prev = pts[pts.length - 1];
    if (Math.abs(prev[0] - x) > 0.01) continue; // second T point
    const zc = side * PLAN.porticoCz;
    const zEdge = side * 37.6;
    const dz = Math.abs(zEdge - zc);
    const xs = Math.sqrt(R * R - dz * dz);
    const x0 = Math.sign(x) * xs, x1 = -x0;
    const a0 = Math.atan2(zEdge - zc, x0), a1 = Math.atan2(zEdge - zc, x1);
    // sweep through the far side of the circle (angle -90deg for north, +90deg for south)
    const far = side < 0 ? -Math.PI / 2 : Math.PI / 2;
    const norm = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
    const d0 = norm(far - a0), d1 = norm(a1 - far);
    pts.push([x0, zEdge]);
    const n = 20;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const a = t < 0.5 ? a0 + d0 * (t * 2) : far + d1 * ((t - 0.5) * 2);
      pts.push([R * Math.cos(a), zc + R * Math.sin(a)]);
    }
    pts.push([x1, zEdge]);
  }
  return dedupe(pts);
}

/** Loop path for the upper order: the upper west portico and the narrow walls beside it. */
export function upperPath(faces: Face[]): V2[] {
  const portF = PLAN.porticoFront + 0.1;
  const loop = faces.map((f) => f.a).filter(([x, z]) => !(x > -83.3 && Math.abs(z) < 14));
  return dedupe([[portF, 10.95], [portF, -10.95], [-84.4, -10.95], [-84.4, -13.45], ...loop, [-84.4, 13.45], [-84.4, 10.95]]);
}

function dedupe(pts: V2[]): V2[] {
  const out: V2[] = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (!q || Math.hypot(q[0] - p[0], q[1] - p[1]) > 1e-3) out.push(p);
  }
  const f = out[0], l = out[out.length - 1];
  if (Math.hypot(f[0] - l[0], f[1] - l[1]) < 1e-3) out.pop();
  return out;
}

/** Cornice brackets along a closed path. */
function modillions(ctx: Ctx, path: V2[], y0: number, h: number, proj: number) {
  const c = 0.42 * h;
  const soffit = y0 + 0.58 * h + 0.53 * c;
  const len = proj - 0.28 * h;
  for (let i = 0; i < path.length; i++) {
    const a = path[i], b = path[(i + 1) % path.length];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const L = Math.hypot(dx, dz);
    if (L < 1.4) continue;
    const out: V2 = [dz / L, -dx / L];
    const n = Math.floor((L - 0.4) / 0.72);
    const start = (L - n * 0.72) / 2;
    for (let k = 0; k <= n; k++) {
      const t = (start + k * 0.72) / L;
      const x = a[0] + dx * t + out[0] * 0.28 * h, z = a[1] + dz * t + out[1] * 0.28 * h;
      ctx.inst.add("modillion", [x, soffit, z], faceYaw(out), [0.9, 0.62, len]);
    }
  }
}

/** Balustrade along the top of the walls, with pedestals over the piers and statues. */
function balustradeLoop(ctx: Ctx, faces: Face[]) {
  const runs = groupRuns(faces);
  for (const run of runs) {
    if (run.kind === "W") continue;
    const L = run.len;
    const mid = run.surf.point(L / 2, 0);
    // the west portico zone is dressed by the west front
    if (mid[0] > -84 && Math.abs(mid[2]) < 14) continue;
    // skip under the transept pediments (|x| < 9.3 at the transept ends)
    if (Math.abs(mid[2]) > 36 && Math.abs(mid[0]) < 9.3) continue;
    if (run.kind === "S") {
      balustrade(ctx, run.surf, 0, L, H.upperEnt, { pedestals: [L / 2], pw: L + 0.02 });
      continue;
    }
    if (run.kind === "P" || run.kind === "Q") {
      balustrade(ctx, run.surf, 0, L, H.upperEnt, { pedestals: [L / 2], pw: L + 0.02 });
      continue;
    }
    balustrade(ctx, run.surf, 0, L, H.upperEnt, { pedestals: L > 5 ? [0.3, L - 0.3] : [], pw: 0.6 });
  }
  // transept fronts: pediment over the central part, five apostles along the skyline
  let v = 0;
  for (const side of [-1, 1]) {
    const zF = side * 37.75;
    const surf = planeSurface([side < 0 ? -9.35 : 9.35, zF], [side < 0 ? 1 : -1, 0], [0, side]);
    pediment(ctx, surf, 9.35, H.upperEnt, 18.7, 4.3, 0.95);
    // tympanum sculpture: the royal arms (north), the phoenix and RESURGAM (south)
    const tymp = side < 0 ? royalArms(8.748, 3.708) : phoenix(8.748, 3.708);
    placeRelief(ctx, tymp, [0, H.upperEnt + 0.05, zF + side * 0.01], [0, side]);
    for (const x of [-15.7, 15.7]) statue(ctx, [x, H.top, side * 37.55], side < 0 ? Math.PI : 0, 3.2, v++);
    const stone = ctx.g("stone");
    stone.box(-0.9, H.upperEnt + 4.2, zF - 0.9, 0.9, H.upperEnt + 4.9, zF + 0.9);
    statue(ctx, [0, H.upperEnt + 4.9, zF], side < 0 ? Math.PI : 0, 3.3, v++);
    for (const x of [-8.9, 8.9]) {
      stone.box(x - 0.8, H.upperEnt, zF - 0.8, x + 0.8, H.upperEnt + 0.7, zF + 0.8);
      statue(ctx, [x, H.upperEnt + 0.7, zF], side < 0 ? Math.PI : 0, 3.1, v++);
    }
  }
  void THREE;
}
