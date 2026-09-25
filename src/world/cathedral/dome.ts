import * as THREE from "three";
import { JOINT, type GeoBuilder } from "../../geo/Builder";
import { arcSurface, fillOnSurface, openingOutline, revealOnSurface, stripPanel, sweepOnSurface, type Opening } from "../../geo/surface";
import { P, cornice, entablature, pedestalBase, pedestalCap } from "../../geo/profiles";
import type { V2 } from "../../core/math";
import { DOME } from "../dims";
import { balustrade, column, faceYaw, pilaster, slab, type Ctx } from "./kit";
import { ROUTE } from "./stairs";

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

/** Outer lead dome profile: raised semi-ellipse from the springing to the lantern ring. */
export function outerDomeProfile(n = 40): V2[] {
  const r0 = DOME.outerR, y0 = DOME.outerBase + 0.6;
  const thTop = Math.acos(DOME.outerTopR / r0);
  const Hh = (DOME.outerTop - y0) / Math.sin(thTop);
  const pts: V2[] = [];
  for (let i = 0; i <= n; i++) {
    const th = (i / n) * thTop;
    pts.push([r0 * Math.cos(th), y0 + Hh * Math.sin(th)]);
  }
  return pts;
}

/** Column angles of the peristyle: 32 positions, filled bays centred on the diagonals. */
export function peristyleAngles() {
  const cols: number[] = [];
  for (let k = 0; k < 32; k++) cols.push((5.625 + 11.25 * k) * DEG);
  const filled: number[] = [];
  for (let m = 0; m < 8; m++) filled.push((22.5 + 45 * m) * DEG);
  return { cols, filled };
}

/** A full ring as a surface: s from 0 to 2πr, starting at +x going towards +z. */
function ring(r: number, inside = false) {
  return arcSurface([0, 0], r, 0, 1, inside);
}

export function buildDome(ctx: Ctx) {
  const stone = ctx.g("stone");
  const lead = ctx.g("lead");
  const gold = ctx.g("gold");

  // ---------------------------------------------------------------- stylobate (drum base)
  const rS = DOME.stylobateR;
  stone.withPaint({ joint: JOINT.ashlar }, () => stripPanel(stone, ring(rS), 0, TAU * rS, DOME.stylobateBase, DOME.stylobateTop, [], 1.0));
  const circle = (r: number, n = 128): V2[] => {
    const pts: V2[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      pts.push([r * Math.cos(a), r * Math.sin(a)]);
    }
    return pts;
  };
  // circle() runs from +x towards +z: clockwise on screen (x right, z down), outward = (dz, -dx)
  const cw = (pts: V2[]) => pts;
  stone.withPaint({ joint: JOINT.blocks }, () => {
    stone.sweep(cornice(0.9, 0.55, DOME.stylobateTop - 0.9), cw(circle(rS)), true);
    stone.sweep(new P(0.35, 33.2).up(0.5).cymaReversa(-0.2, 0.25).to(0, 33.95).build(), cw(circle(rS)), true);
  });

  // ---------------------------------------------------------------- peristyle
  const { cols, filled } = peristyleAngles();
  const rC = DOME.peristyleColR, D = DOME.peristyleColD;
  const ped0 = DOME.stylobateTop, ped1 = DOME.peristylePedTop;
  // continuous podium under the columns (annulus)
  const podOut = rC + 0.95, podIn = DOME.drumWallR;
  stone.withPaint({ joint: JOINT.ashlar }, () => {
    stripPanel(stone, ring(podOut), 0, TAU * podOut, ped0, ped1, [], 1.0);
    stone.cap(cw(circle(podOut)), ped1, true, [circle(podIn)]);
  });
  stone.withPaint({ joint: JOINT.blocks }, () => {
    stone.sweep(pedestalBase(0.3, 0.12, ped0), cw(circle(podOut)), true);
    stone.sweep(pedestalCap(0.28, 0.14, ped1 - 0.28), cw(circle(podOut)), true);
  });
  for (const a of cols) {
    column(ctx, rC * Math.cos(a), rC * Math.sin(a), ped1, DOME.peristyleColTop, D, { cap: "capC", yaw: -a + Math.PI / 2, plinth: true });
  }
  // filled intercolumniations: buttress walls with a niche, flush with the column faces
  for (const a of filled) {
    const half = (11.25 / 2) * DEG;
    const r1 = rC + 0.35;
    const surf = arcSurface([0, 0], r1, a - half + 0.028, 1);
    const len = r1 * (2 * half - 0.056);
    const nicheO: Opening = { s0: len / 2 - 0.62, s1: len / 2 + 0.62, y0: ped1 + 1.3, y1: ped1 + 5.6, head: "round" };
    stone.withPaint({ joint: JOINT.ashlar }, () => stripPanel(stone, surf, 0, len, ped1, DOME.peristyleColTop, [nicheO], 0.5));
    const out = openingOutline(nicheO, 10);
    stone.withPaint({ joint: JOINT.none, cav: 0.55 }, () => {
      revealOnSurface(stone, surf, out, 0.55);
      fillOnSurface(stone, surf, out, 0.55);
    });
    stone.withPaint({ joint: JOINT.none }, () => sweepOnSurface(stone, surf, new P(0, 0).to(0, 0.1).to(0.18, 0.1).to(0.18, 0).build(), out.slice(1).concat([out[0]]), false, { outwardFrom: [len / 2, nicheO.y0 + 2] }));
    // sides of the buttress, from the drum wall to the column line
    for (const k of [-1, 1]) {
      const aa = a + k * (half - 0.028);
      const c = Math.cos(aa), s = Math.sin(aa);
      const p0: [number, number, number] = [podIn * c, ped1, podIn * s], p1: [number, number, number] = [r1 * c, ped1, r1 * s];
      const q0: [number, number, number] = [podIn * c, DOME.peristyleColTop, podIn * s], q1: [number, number, number] = [r1 * c, DOME.peristyleColTop, r1 * s];
      const n: [number, number, number] = [-s * k, 0, c * k];
      stone.withPaint({ joint: JOINT.ashlar }, () => stone.polyN([p0, p1, q1, q0], n));
    }
  }
  // drum wall behind the colonnade, with windows in threes between the buttresses
  const rW = DOME.drumWallR;
  const wins: Opening[] = [];
  const wallSurf = ring(rW);
  for (let m = 0; m < 8; m++) {
    for (let j = -1; j <= 1; j++) {
      const a = (45 * m + 11.25 * j) * DEG;
      const s = a * rW;
      wins.push({ s0: s - 0.72, s1: s + 0.72, y0: 44.4, y1: 50.2, head: "flat" });
    }
  }
  stone.withPaint({ joint: JOINT.ashlar, cav: 0.8 }, () => stripPanel(stone, wallSurf, 0, TAU * rW, ped1, DOME.peristyleEntTop, wins, 0.6));
  for (const o of wins) {
    const outl = openingOutline(o, 4);
    stone.withPaint({ joint: JOINT.blocks, cav: 0.6 }, () => revealOnSurface(stone, wallSurf, outl, 1.1));
    ctx.g("glass").withPaint({ joint: 0, cav: 0.8 }, () => fillOnSurface(ctx.g("glass"), wallSurf, outl, 1.1));
    stone.withPaint({ joint: JOINT.none, cav: 0.85 }, () => sweepOnSurface(stone, wallSurf, new P(0, 0).to(0, 0.1).to(0.3, 0.1).to(0.3, 0).build(), outl, true, { outwardFrom: [(o.s0 + o.s1) / 2, 47] }));
  }
  // ring entablature over the columns; its soffit spans to the drum wall (coffered ceiling)
  const rE = rC + 0.5;
  const entH = DOME.peristyleEntTop - DOME.peristyleColTop;
  stone.withPaint({ joint: JOINT.blocks }, () => {
    stone.sweep(entablature(entH, DOME.peristyleColTop, 0.95), cw(circle(rE, 160)), true);
    stone.cap(circle(rE, 160), DOME.peristyleColTop, false, [cw(circle(rW + 0.02, 160))]);
  });
  // coffers under the peristyle ceiling (dark recesses between the column lines)
  for (const a of cols) {
    const aa = a + 5.625 * DEG;
    stone.withPaint({ joint: JOINT.none, cav: 0.55 }, () => {
      const c = Math.cos(aa), s = Math.sin(aa);
      const rm = (rW + rC) / 2;
      stone.at(rm * c, DOME.peristyleColTop - 0.02, rm * s, -aa + Math.PI / 2, () => stone.box(-0.45, -0.001, -0.5, 0.45, 0.0, 0.5, "py nx px pz nz"));
    });
  }

  // ---------------------------------------------------------------- Stone Gallery
  const yG = DOME.stoneGallery;
  const rBal = DOME.stoneBalR;
  // gallery paving: from the attic wall to past the balustrade (top of the cornice)
  ctx.g("paving").withPaint({ joint: 0, cav: 1 }, () => ctx.g("paving").cap(cw(circle(rE + 0.95, 160)), yG, true, [circle(DOME.atticR, 160)]));
  stone.withPaint({ joint: JOINT.blocks }, () => stripPanel(stone, ring(rE + 0.95), 0, TAU * (rE + 0.95), DOME.peristyleEntTop, yG, [], 1.0));
  // balustrade with 8 pedestals (over the buttresses) carrying urns
  const balSurf = ring(rBal);
  const pedS = filled.map((a) => a * rBal);
  balustrade(ctx, balSurf, 0, TAU * rBal, yG, { height: DOME.stoneBalH, pedestals: pedS.concat([TAU * rBal + pedS[0]]), pw: 1.1, inset: -0.2, depth: 0.4 });
  for (const a of filled) ctx.inst.add("urn", [Math.cos(a) * (rBal - 0.0), yG + DOME.stoneBalH, Math.sin(a) * (rBal - 0.0)], -a, 1.0);
  ctx.col.withPaint({}, () => {
    // collision: gallery floor ring and the balustrade as a wall
    ctx.col.cap(cw(circle(rBal + 0.3, 64)), yG, true, [circle(DOME.atticR, 64)]);
    ctx.col.lathe([[rBal - 0.35, yG - 0.2], [rBal - 0.35, yG + 1.35]], 64, { inside: true });
    // the attic wall on the inner side of the gallery, open at the two doors
    const gaps = [ROUTE.attic1, ROUTE.attic2].map((a) => ((a % TAU) + TAU) % TAU).sort((p, q) => p - q);
    const gw = 0.62 / DOME.atticR;
    for (let i = 0; i < gaps.length; i++) {
      const a = gaps[i] + gw, b = (i + 1 < gaps.length ? gaps[i + 1] : gaps[0] + TAU) - gw;
      ctx.col.lathe([[DOME.atticR, yG - 0.2], [DOME.atticR, yG + 3.2]], Math.max(2, Math.ceil(((b - a) / TAU) * 64)), { a0: -b, a1: -a });
    }
  });

  // ---------------------------------------------------------------- attic (tholobate)
  const rA = DOME.atticR;
  const nP = 32;
  const atticSurf = ring(rA);
  const atticWins: Opening[] = [];
  for (let k = 0; k < nP; k++) {
    const a = (k + 0.5) * (TAU / nP);
    const s = a * rA;
    atticWins.push({ s0: s - 0.62, s1: s + 0.62, y0: 61.2, y1: 63.7, head: "flat" });
  }
  // doors from the Stone Gallery into the attic (the stairs, see stairs.ts)
  const atticDoors: Opening[] = [ROUTE.attic1, ROUTE.attic2].map((a) => {
    const s = (((a % TAU) + TAU) % TAU) * rA;
    return { s0: s - 0.56, s1: s + 0.56, y0: yG - 0.21, y1: yG + 2.05, head: "flat" };
  });
  stone.withPaint({ joint: JOINT.ashlar }, () => stripPanel(stone, atticSurf, 0, TAU * rA, yG - 0.2, DOME.atticTop, [...atticWins, ...atticDoors], 0.8));
  for (const o of atticDoors) {
    const outl = openingOutline(o, 2);
    stone.withPaint({ joint: JOINT.blocks, cav: 0.7 }, () => revealOnSurface(stone, atticSurf, outl.slice(1).concat([outl[0]]), 0.32, false));
    stone.withPaint({ joint: JOINT.none }, () => sweepOnSurface(stone, atticSurf, new P(0, 0).to(0, 0.1).to(0.2, 0.1).to(0.2, 0).build(), [[o.s0, yG], [o.s0, o.y1], [o.s1, o.y1], [o.s1, yG]], false, { outwardFrom: [(o.s0 + o.s1) / 2, yG] }));
  }
  for (const o of atticWins) {
    const outl = openingOutline(o, 4);
    stone.withPaint({ joint: JOINT.blocks, cav: 0.6 }, () => revealOnSurface(stone, atticSurf, outl, 0.8));
    ctx.g("glass").withPaint({ joint: 0, cav: 0.7 }, () => fillOnSurface(ctx.g("glass"), atticSurf, outl, 0.8));
    stone.withPaint({ joint: JOINT.none }, () => sweepOnSurface(stone, atticSurf, new P(0, 0).to(0, 0.08).to(0.22, 0.08).to(0.22, 0).build(), outl, true, { outwardFrom: [(o.s0 + o.s1) / 2, 62.4] }));
  }
  for (let k = 0; k < nP; k++) {
    const s = k * (TAU / nP) * rA;
    pilaster(ctx, atticSurf, s, yG + 0.5, 64.2, 0.72, 0.1, "capXflat");
  }
  stone.withPaint({ joint: JOINT.blocks }, () => {
    stone.sweep(pedestalBase(0.35, 0.14, yG - 0.2), cw(circle(rA, 160)), true);
    stone.sweep(entablature(DOME.atticTop - 64.2, 64.2, 0.6, { frieze: 0.24 }), cw(circle(rA, 160)), true);
    // blocking course on which the dome stands
    stripPanel(stone, ring(DOME.outerR + 0.15), 0, TAU * (DOME.outerR + 0.15), DOME.atticTop - 0.05, DOME.outerBase + 0.6, [], 1.2);
    stone.cap(cw(circle(DOME.outerR + 0.15, 160)), DOME.outerBase + 0.6, true, [circle(DOME.outerR - 0.3, 160)]);
  });

  // ---------------------------------------------------------------- outer lead dome with 32 ribs
  const prof = outerDomeProfile(44);
  lead.withPaint({ joint: 0, expo: 1, cav: 1 }, () => lead.lathe(prof, 192, { smooth: true }));
  for (let k = 0; k < 32; k++) rib(lead, (k / 32) * TAU, prof, 0.16, 0.13);
  // light wells just below the lantern (barely visible): dark slots
  for (let k = 0; k < 8; k++) {
    const a = ((k + 0.5) / 8) * TAU;
    const i = prof.findIndex(([r]) => r < 6.6);
    const [r, y] = prof[i];
    ctx.g("iron").at(Math.cos(a) * (r + 0.05), y, Math.sin(a) * (r + 0.05), -a + Math.PI / 2, () => ctx.g("iron").box(-0.35, 0, -0.02, 0.35, 0.9, 0.08, "nz"));
  }

  // ---------------------------------------------------------------- Golden Gallery and lantern
  const yGG = DOME.goldenGallery;
  const rGG = DOME.goldenR;
  stone.withPaint({ joint: JOINT.blocks }, () => {
    stone.lathe([[DOME.outerTopR - 0.2, DOME.outerTop - 0.3], [rGG + 0.1, DOME.outerTop + 0.05], [rGG + 0.25, yGG - 0.35], [rGG + 0.35, yGG - 0.15], [rGG + 0.35, yGG]], 64, { smooth: [false, false, true, false, false] });
  });
  ctx.g("paving").cap(cw(circle(rGG + 0.35, 64)), yGG, true, [circle(3.05, 32)]);
  // gilded railing
  goldenRailing(gold, rGG + 0.18, yGG, 1.12);
  ctx.col.cap(cw(circle(rGG + 0.4, 48)), yGG, true, [circle(2.9, 32)]);
  ctx.col.lathe([[rGG + 0.05, yGG - 0.2], [rGG + 0.05, yGG + 1.3]], 48, { inside: true });
  // the lantern's base (with the door on the south face, see stairs.ts)
  {
    const h = DOME.lanternHalf + 0.12, c = 1.1;
    const oct: V2[] = [[h, -h + c], [h, h - c], [h - c, h], [-h + c, h], [-h, h - c], [-h, -h + c], [-h + c, -h], [h - c, -h]];
    for (let i = 0; i < 8; i++) {
      const a = oct[i], b = oct[(i + 1) % 8];
      const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
      const segs: [number, number][] = i === 2 ? [[0, L / 2 - 0.6], [L / 2 + 0.6, L]] : [[0, L]];
      for (const [s0, s1] of segs) {
        const p0: V2 = [a[0] + (dx / L) * s0, a[1] + (dz / L) * s0], p1: V2 = [a[0] + (dx / L) * s1, a[1] + (dz / L) * s1];
        ctx.col.polyN([[p0[0], yGG - 0.2, p0[1]], [p1[0], yGG - 0.2, p1[1]], [p1[0], yGG + 3, p1[1]], [p0[0], yGG + 3, p0[1]]], [dz / L, 0, -dx / L]);
      }
    }
  }

  lantern(ctx);
}

/** A raised lead-covered rib following the dome profile at angle a. */
function rib(b: GeoBuilder, a: number, prof: V2[], w: number, h: number) {
  const c = Math.cos(a), s = Math.sin(a);
  const tx = -s, tz = c; // tangent around the dome
  const idx: number[][] = [];
  for (let i = 0; i < prof.length; i++) {
    const [r, y] = prof[i];
    // surface normal in (r, y)
    const j = Math.min(prof.length - 1, i + 1), k = Math.max(0, i - 1);
    const dr = prof[j][0] - prof[k][0], dy = prof[j][1] - prof[k][1];
    const l = Math.hypot(dr, dy) || 1;
    const nr = dy / l, ny = -dr / l;
    const taper = 1 - 0.45 * (i / (prof.length - 1));
    const ww = w * taper;
    const row: number[] = [];
    const pts: [number, number, number][] = [
      [-ww, 0, 0], [-ww * 0.55, h * 0.85, 0.5], [0, h, 1], [ww * 0.55, h * 0.85, 0.5], [ww, 0, 0],
    ];
    for (const [off, up] of pts) {
      const rr = r + nr * up, yy = y + ny * up;
      const px = c * rr + tx * off, pz = s * rr + tz * off;
      const side = off === 0 ? 0 : off > 0 ? 1 : -1;
      const nx = c * nr + tx * side * 0.7, nz = s * nr + tz * side * 0.7;
      row.push(b.v(px, yy, pz, nx, ny, nz, off, y));
    }
    idx.push(row);
  }
  for (let i = 0; i < prof.length - 1; i++) for (let k = 0; k < 4; k++) b.orientQuad(idx[i][k], idx[i][k + 1], idx[i + 1][k + 1], idx[i + 1][k]);
}

/** Gilded wrought-iron railing of the Golden Gallery. */
function goldenRailing(b: GeoBuilder, r: number, y0: number, h: number) {
  const n = 96;
  b.withPaint({ joint: 0, cav: 1 }, () => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      b.at(Math.cos(a) * r, 0, Math.sin(a) * r, -a, () => b.box(-0.015, y0, -0.015, 0.015, y0 + h, 0.015, "ny"));
      if (i % 4 === 0) b.at(Math.cos(a) * r, 0, Math.sin(a) * r, -a, () => b.box(-0.03, y0, -0.03, 0.03, y0 + h + 0.04, 0.03, "ny"));
    }
    // rails
    for (const yy of [y0 + 0.12, y0 + h - 0.25, y0 + h]) {
      b.lathe([[r - 0.035, yy - 0.03], [r + 0.035, yy - 0.03], [r + 0.035, yy + 0.03], [r - 0.035, yy + 0.03], [r - 0.035, yy - 0.03]], 96, { smooth: false });
    }
    // scrollwork band
    for (let i = 0; i < n; i++) {
      const a = ((i + 0.5) / n) * TAU;
      b.at(Math.cos(a) * r, 0, Math.sin(a) * r, -a, () => {
        b.lathe([[0.001, y0 + h - 0.24], [0.055, y0 + h - 0.18], [0.07, y0 + h - 0.12], [0.05, y0 + h - 0.05], [0.001, y0 + h - 0.02]], 6, { smooth: true });
      });
    }
  });
}

/** The lantern: square with chamfered angles, columned stage, attic, cupola, ball and cross. */
function lantern(ctx: Ctx) {
  const stone = ctx.g("stone");
  const lead = ctx.g("lead");
  const gold = ctx.g("gold");
  const yGG = DOME.goldenGallery;
  const half = DOME.lanternHalf;
  const cham = (h: number, c: number): V2[] => [
    [h, -h + c], [h, h - c], [h - c, h], [-h + c, h], [-h, h - c], [-h, -h + c], [-h + c, -h], [h - c, -h],
  ];
  const toSurf = (poly: V2[], y0: number, y1: number, openings: (face: number, len: number) => Opening[] = () => [], doorFace = -1) => {
    // walls of an octagon (chamfered square) as panels with openings on the four main faces
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const L = Math.hypot(dx, dz);
      // outward = (dz, -dx) for this listing? the polygon above is counter-clockwise in math
      // orientation (x right, z up) => clockwise on screen: outward = (dz, -dx)/L
      const out: V2 = [dz / L, -dx / L];
      const surf = { point: (s: number, y: number, d = 0): [number, number, number] => [a[0] + (dx / L) * s - out[0] * d, y, a[1] + (dz / L) * s - out[1] * d], normal: (): [number, number, number] => [out[0], 0, out[1]], tangent: (): [number, number, number] => [dx / L, 0, dz / L] };
      const ops = i % 2 === 0 ? openings(i / 2, L) : [];
      stone.withPaint({ joint: JOINT.ashlar }, () => stripPanel(stone, surf, 0, L, y0, y1, ops, 1.0));
      for (const o of ops) {
        const outl = openingOutline(o, 10);
        if (i / 2 === doorFace) {
          // the doorway: jambs and arch only (the passage itself is built with the lantern room)
          if (o.head !== "flat") stone.withPaint({ joint: JOINT.none, cav: 0.55 }, () => revealOnSurface(stone, surf, outl.slice(1).concat([outl[0]]), 0.5, false));
          continue;
        }
        stone.withPaint({ joint: JOINT.none, cav: 0.55 }, () => revealOnSurface(stone, surf, outl, 0.5));
        ctx.g("glass").withPaint({ cav: 0.8 }, () => fillOnSurface(ctx.g("glass"), surf, outl, 0.5));
        stone.withPaint({ joint: JOINT.none }, () => sweepOnSurface(stone, surf, new P(0, 0).to(0, 0.07).to(0.16, 0.07).to(0.16, 0).build(), outl, true, { outwardFrom: [(o.s0 + o.s1) / 2, (o.y0 + o.y1) / 2] }));
      }
    }
  };
  // podium (low, with a doorway on the south face onto the Golden Gallery)
  const y1 = yGG + 0.45;
  toSurf(cham(half + 0.1, 1.1), yGG - 0.1, y1, (f, L) => (f === 1 ? [{ s0: L / 2 - 0.55, s1: L / 2 + 0.55, y0: yGG, y1: y1 + 0.02, head: "flat" }] : []), 1);
  {
    // cornice round the podium, open at the door; the podium's top between it and the core
    const h = half + 0.1, c = 1.1;
    const path: V2[] = [[-0.62, h], [-h + c, h], [-h, h - c], [-h, -h + c], [-h + c, -h], [h - c, -h], [h, -h + c], [h, h - c], [h - c, h], [0.62, h]];
    stone.sweep(cornice(0.3, 0.16, y1 - 0.3), path, false, { capEnds: true });
    const hi = half - 0.55, ci = 1.2;
    const outer = cham(h, c), inner = cham(hi, ci);
    stone.withPaint({ joint: JOINT.blocks }, () => {
      for (let i = 0; i < 8; i++) {
        const a = outer[i], b = outer[(i + 1) % 8], ai = inner[i], bi = inner[(i + 1) % 8];
        if (i === 2) {
          // split round the door
          stone.polyN([[a[0], y1, a[1]], [0.56, y1, h], [0.56, y1, hi], [ai[0], y1, ai[1]]], [0, 1, 0]);
          stone.polyN([[-0.56, y1, h], [b[0], y1, b[1]], [bi[0], y1, bi[1]], [-0.56, y1, hi]], [0, 1, 0]);
        } else stone.polyN([[a[0], y1, a[1]], [b[0], y1, b[1]], [bi[0], y1, bi[1]], [ai[0], y1, ai[1]]], [0, 1, 0]);
      }
    });
  }
  // main stage: core with tall arched windows (the south one is the door), columns at the angles
  const y2 = DOME.lanternMainTop - 0.7;
  toSurf(cham(half - 0.55, 1.2), y1, DOME.lanternMainTop, (f, L) => [{ s0: L / 2 - 0.55, s1: L / 2 + 0.55, y0: f === 1 ? y1 - 0.01 : y1 + 0.6, y1: y2 - 1.3, head: "round" }], 1);
  for (let q = 0; q < 4; q++) {
    const a = (45 + 90 * q) * DEG;
    const c = Math.cos(a), s = Math.sin(a);
    const rr = (half - 0.1) * Math.SQRT2 - 0.35;
    for (const k of [-1, 1]) {
      const px = c * rr + -s * k * 0.62, pz = s * rr + c * k * 0.62;
      column(ctx, px, pz, y1, y2, 0.44, { cap: "capC", plinth: true, yaw: -a + Math.PI / 2 });
    }
    // entablature block breaking forward over the pair, and a flaming urn on top
    stone.at(c * rr, 0, s * rr, -a + Math.PI / 2, () => stone.withPaint({ joint: JOINT.blocks }, () => stone.box(-1.05, y2, -0.45, 1.05, DOME.lanternMainTop, 0.55)));
    ctx.inst.add("urn", [c * (rr + 0.1), DOME.lanternMainTop, s * (rr + 0.1)], -a, 0.62);
  }
  stone.sweep(entablature(0.7, y2, 0.38), cham(half - 0.55, 1.2), true);
  // attic with oculi
  const y3 = DOME.lanternAtticTop;
  toSurf(cham(half - 0.85, 1.0), DOME.lanternMainTop, y3, (_f, L) => [{ s0: L / 2 - 0.42, s1: L / 2 + 0.42, y0: DOME.lanternMainTop + 0.55, y1: DOME.lanternMainTop + 1.39, head: "circle" }]);
  stone.sweep(cornice(0.42, 0.25, y3 - 0.42), cham(half - 0.85, 1.0), true);
  // cupola: ribbed lead with small lucarnes
  const cup: V2[] = [];
  for (let i = 0; i <= 16; i++) {
    const t = (i / 16) * (Math.PI / 2) * 0.93;
    cup.push([1.95 * Math.cos(t), y3 + 0.1 + 3.4 * Math.sin(t)]);
  }
  stone.lathe([[2.05, y3], [2.05, y3 + 0.1], [1.95, y3 + 0.12]], 32, { smooth: false });
  lead.lathe(cup, 48, { smooth: true });
  for (let k = 0; k < 16; k++) rib(lead, (k / 16) * TAU, cup, 0.06, 0.05);
  // finial: neck with scrolled brackets, gilded ring, ball and cross
  const yN = DOME.lanternDomeTop;
  lead.lathe([[0.5, yN - 0.3], [0.62, yN], [0.45, yN + 0.4], [0.36, yN + 0.9], [0.5, yN + 1.35], [0.62, yN + 1.6], [0.45, yN + 2.0], [0.3, yN + 2.3]], 24, { smooth: true });
  gold.lathe([[0.64, yN + 1.5], [0.7, yN + 1.6], [0.64, yN + 1.7]], 24, { smooth: true });
  const ball: V2[] = [];
  for (let i = 0; i <= 18; i++) {
    const t = -Math.PI / 2 + (i / 18) * Math.PI;
    ball.push([Math.max(0.001, DOME.ballR * Math.cos(t)), DOME.ballY + DOME.ballR * Math.sin(t)]);
  }
  gold.lathe(ball, 36, { smooth: true });
  // cross with flared, trefoil ends
  const cy0 = DOME.ballY + DOME.ballR - 0.05, cy1 = DOME.crossTop;
  const armY = cy1 - 2.35;
  gold.withPaint({ joint: 0 }, () => {
    gold.box(-0.14, cy0, -0.14, 0.14, cy1 - 0.35, 0.14, "ny");
    gold.box(-1.3, armY - 0.14, -0.14, 1.3, armY + 0.14, 0.14);
    for (const [x, y] of [[0, cy1 - 0.2], [-1.35, armY], [1.35, armY]] as V2[]) {
      gold.at(x, y, 0, 0, () => {
        const pts: V2[] = [];
        for (let i = 0; i <= 8; i++) {
          const t = -Math.PI / 2 + (i / 8) * Math.PI;
          pts.push([Math.max(0.001, 0.22 * Math.cos(t)), 0.22 * Math.sin(t)]);
        }
        gold.lathe(pts, 12, { smooth: true });
      });
    }
    gold.at(0, armY, 0, 0, () => gold.lathe([[0.001, -0.3], [0.2, -0.2], [0.24, 0], [0.2, 0.2], [0.001, 0.3]], 12, { smooth: true }));
  });
  void faceYaw;
  void slab;
  void THREE;
}
