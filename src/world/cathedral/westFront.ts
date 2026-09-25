import * as THREE from "three";
import { JOINT, type GeoBuilder } from "../../geo/Builder";
import { arcSurface, fillOnSurface, openingOutline, planeSurface, revealOnSurface, stripPanel, sweepOnSurface, type Opening, type Surface } from "../../geo/surface";
import { P, cornice, entablature, pedestalCap } from "../../geo/profiles";
import type { V2 } from "../../core/math";
import { rng } from "../../core/rng";
import { FLOOR, PLAN, TOWER, WEST } from "../dims";
import { balustrade, column, faceYaw, pilaster, slab, statue, type Ctx } from "./kit";
import { H, pediment } from "./walls";

const DEG = Math.PI / 180;

/** Stone steps: n treads descending from (x0, yTop) westwards; width |z| <= hw. */
function flight(b: GeoBuilder, col: GeoBuilder, x0: number, yTop: number, n: number, rise: number, run: number, hw0: number, hw1 = hw0) {
  for (let i = 0; i < n; i++) {
    const y = yTop - rise * i;
    const xa = x0 - run * i, xb = xa - run;
    const hw = hw0 + ((hw1 - hw0) * i) / Math.max(1, n - 1);
    b.withPaint({ joint: JOINT.blocks, cav: 1 }, () => {
      // the lowest step runs on below the paving so the ground never shows a gap under it
      b.box(xb, y - rise - (i === n - 1 ? 0.6 : 0), -hw, xa, y, hw, "px");
      // nosing shadow line
      b.box(xb - 0.025, y - 0.04, -hw, xb, y, hw, "px py");
    });
    col.box(xb, -3, -hw, xa, y, hw);
  }
}

export function buildWestFront(ctx: Ctx) {
  const stone = ctx.g("stone");
  const col = ctx.col;

  // ---------------------------------------------------------------------------- steps
  const floorEdge = PLAN.porticoFront - 0.6;
  const rise = (FLOOR - WEST.stepsBase) / 22;
  flight(stone, col, floorEdge, FLOOR, 11, rise, 0.34, 17.6);
  const land = FLOOR - rise * 11;
  const landX0 = floorEdge - 11 * 0.34, landX1 = landX0 - 2.4;
  stone.withPaint({ joint: JOINT.blocks }, () => stone.box(landX1, land - 0.6, -19.8, landX0, land, 19.8, "ny"));
  ctx.g("darkStone").withPaint({ joint: 0 }, () => ctx.g("darkStone").box(landX1 + 0.4, land, -17.0, landX0 - 0.4, land + 0.004, 17.0, "ny"));
  col.box(landX1, -3, -19.8, landX0, land, 19.8);
  flight(stone, col, landX1, land, 11, rise, 0.34, 19.8, 22.4);
  // cheek walls
  for (const s of [-1, 1]) {
    stone.withPaint({ joint: JOINT.ashlar }, () => stone.box(landX1 - 11 * 0.34 - 0.2, WEST.stepsBase - 0.5, s * 22.4, floorEdge + 0.2, FLOOR + 0.55, s * 23.3));
    col.box(landX1 - 11 * 0.34 - 0.2, -3, s * 22.4, floorEdge + 0.2, FLOOR + 1.1, s * 23.3);
  }

  // ---------------------------------------------------------------------------- portico floor
  const recessX = -79.0, wallX = -83.05;
  stone.withPaint({ joint: JOINT.blocks }, () => stone.box(floorEdge, FLOOR - 1.2, -17.1, wallX, FLOOR, 17.1, "ny"));
  ctx.g("marble").box(wallX, FLOOR - 0.3, -6.3, recessX, FLOOR, 6.3, "ny");
  col.box(floorEdge, -3, -17.1, wallX, FLOOR, 17.1);
  col.box(wallX - 0.01, -3, -6.3, recessX, FLOOR, 6.3);

  // ---------------------------------------------------------------------------- lower portico columns
  const colX = PLAN.porticoFront + WEST.colD / 2 + 0.05;
  for (const z of WEST.lowerCols) column(ctx, colX, z, FLOOR, H.lowerTop, WEST.colD, { fluted: true, cap: "capC", yaw: -Math.PI / 2 });

  // ---------------------------------------------------------------------------- walls behind the portico
  const wallN: V2 = [-1, 0];
  // side parts with the two side doors
  for (const s of [-1, 1]) {
    const z0 = s * 6.3, z1 = s * 13.45;
    const surf = planeSurface([wallX, Math.min(z0, z1)], [0, 1], wallN);
    const L = Math.abs(z1 - z0);
    const door: Opening = { s0: L / 2 - 1.2, s1: L / 2 + 1.2, y0: FLOOR, y1: FLOOR + 5.6, head: "flat" };
    const win: Opening = { s0: L / 2 - 0.9, s1: L / 2 + 0.9, y0: FLOOR + 7.4, y1: FLOOR + 10.1, head: "round" };
    stone.withPaint({ joint: JOINT.ashlar }, () => stripPanel(stone, surf, 0, L, FLOOR, H.lowerEnt, [door, win], 1.5));
    doorway(ctx, surf, door, 1.2);
    windowIn(ctx, surf, win);
    // responds (pilasters) behind the column pairs
    for (const zc of [s * 9.375, s * 15.35]) {
      const sc = zc - Math.min(z0, z1);
      if (sc > 0.4 && sc < L - 0.4) pilaster(ctx, surf, sc, H.lowerBase - 0.4, H.lowerTop, WEST.colD, 0.1, "capCflat");
    }
  }
  // recess side walls
  for (const s of [-1, 1]) {
    const surf = planeSurface([s > 0 ? recessX : wallX, s * 6.3], [s > 0 ? -1 : 1, 0], [0, -s]);
    stone.withPaint({ joint: JOINT.ashlar, cav: 0.85 }, () => stripPanel(stone, surf, 0, wallX - recessX < 0 ? recessX - wallX : wallX - recessX, FLOOR, H.lowerEnt, [], 1.5));
  }
  // the great west door in the back of the recess
  {
    const surf = planeSurface([recessX, 6.3], [0, -1], wallN);
    const L = 12.6;
    const door: Opening = { s0: L / 2 - 2.15, s1: L / 2 + 2.15, y0: FLOOR, y1: FLOOR + 8.9, head: "flat" };
    const lun: Opening = { s0: L / 2 - 1.6, s1: L / 2 + 1.6, y0: FLOOR + 9.8, y1: FLOOR + 10.4, head: "round" };
    stone.withPaint({ joint: JOINT.ashlar, cav: 0.85 }, () => stripPanel(stone, surf, 0, L, FLOOR, H.lowerEnt, [door, lun], 1.2));
    doorway(ctx, surf, door, 1.6, true);
    windowIn(ctx, surf, lun);
    // floor of the doorway (between the porch and the nave)
    ctx.g("marble").box(recessX - 0.05, FLOOR - 0.3, -2.2, recessX + 1.65, FLOOR, 2.2, "ny");
    col.box(recessX - 0.05, -3, -2.2, recessX + 1.65, FLOOR, 2.2);
    // relief panel over the door (the Conversion of St Paul in reality is in the pediment; here a carved tablet)
    slab(stone, surf, L / 2 - 2.6, L / 2 + 2.6, FLOOR + 9.0, FLOOR + 9.55, 0, -0.35, 0.05);
  }
  // portico ceiling (coffered) between the entablature and the walls
  ctx.g("stone").withPaint({ joint: JOINT.none, cav: 0.7 }, () => {
    stone.box(PLAN.porticoFront + 1.1, H.lowerTop - 0.02, -16.9, wallX, H.lowerTop + 0.1, 16.9, "py");
    stone.box(wallX, H.lowerTop + 0.4, -6.3, recessX, H.lowerTop + 0.6, 6.3, "py");
    for (let z = -15.6; z <= 15.61; z += 1.3) {
      for (let x = PLAN.porticoFront + 1.6; x < wallX - 0.4; x += 1.3) stone.box(x - 0.45, H.lowerTop - 0.02, z - 0.45, x + 0.45, H.lowerTop - 0.001, z + 0.45, "py nx px pz nz");
    }
  });

  // ---------------------------------------------------------------------------- upper portico
  const yU = H.lowerEnt;
  const backX = -77.3;
  ctx.g("paving").box(PLAN.porticoFront + 0.2, yU - 0.1, -10.95, backX, yU, 10.95, "ny");
  for (const z of WEST.upperCols) column(ctx, colX, z, yU, H.upperTop, WEST.upperColD, { fluted: true, cap: "capX", yaw: -Math.PI / 2 });
  // back wall of the upper portico: the west window of the nave
  {
    const surf = planeSurface([backX, 10.95], [0, -1], wallN);
    const L = 21.9;
    const win: Opening = { s0: L / 2 - 1.7, s1: L / 2 + 1.7, y0: yU + 1.6, y1: yU + 7.6, head: "round" };
    const n1: Opening = { s0: L / 2 - 6.6, s1: L / 2 - 5.2, y0: yU + 2.0, y1: yU + 6.2, head: "round" };
    const n2: Opening = { s0: L / 2 + 5.2, s1: L / 2 + 6.6, y0: yU + 2.0, y1: yU + 6.2, head: "round" };
    stone.withPaint({ joint: JOINT.ashlar, cav: 0.9 }, () => stripPanel(stone, surf, 0, L, yU, H.upperEnt + 5.5, [win, n1, n2], 1.5));
    windowIn(ctx, surf, win);
    for (const n of [n1, n2]) {
      const o = openingOutline(n, 10);
      stone.withPaint({ joint: JOINT.none, cav: 0.55 }, () => { revealOnSurface(stone, surf, o, 0.5); fillOnSurface(stone, surf, o, 0.5); });
    }
    for (const zc of [-9.375, -3.175, 3.175, 9.375]) pilaster(ctx, surf, 10.95 - zc, yU + 0.3, H.upperTop, WEST.upperColD, 0.1, "capXflat");
  }
  // loggia side walls and ceiling
  for (const s of [-1, 1]) {
    stone.withPaint({ joint: JOINT.ashlar, cav: 0.85 }, () => stone.box(-84.4, yU, s * 10.95, backX, H.upperEnt, s * 11.4, s > 0 ? "nz" : "pz"));
  }
  stone.withPaint({ joint: JOINT.none, cav: 0.7 }, () => stone.box(PLAN.porticoFront + 1.0, H.upperTop - 0.02, -10.95, backX, H.upperTop + 0.1, 10.95, "py"));
  // side sections beside the upper portico (narrow walls with arch-topped windows)
  for (const s of [-1, 1]) {
    const surf = planeSurface([-84.4, s * 13.45], [0, -s], wallN);
    const L = 2.5;
    const win: Opening = { s0: 0.55, s1: 1.95, y0: yU + 2.2, y1: yU + 6.4, head: "round" };
    stone.withPaint({ joint: JOINT.ashlar }, () => stripPanel(stone, surf, 0, L, yU, H.upperEnt, [win], 0.8));
    windowIn(ctx, surf, win);
  }
  // upper walls of the side sections above the lower storey (between the lower portico and the towers)
  for (const s of [-1, 1]) {
    stone.withPaint({ joint: JOINT.ashlar }, () => stone.box(-84.4, yU, s * 10.95, -83.05, H.upperEnt, s * 13.45, "ny"));
  }

  // ---------------------------------------------------------------------------- pediment and statues
  const pedSurf = planeSurface([PLAN.porticoFront + 0.1, WEST.pedimentW / 2], [0, -1], wallN);
  pediment(ctx, pedSurf, WEST.pedimentW / 2, H.upperEnt, WEST.pedimentW, WEST.pedimentApex - H.upperEnt, 1.0);
  // the pediment roof (lead) behind the raking cornices
  ctx.g("lead").withPaint({ cav: 1 }, () => {
    const x0 = PLAN.porticoFront + 0.4, x1 = -69.0;
    const hw = WEST.pedimentW / 2 - 0.2;
    const top = WEST.pedimentApex - 0.1;
    ctx.g("lead").poly([[x0, H.upperEnt + 0.2, -hw], [x0, top, 0], [x1, top, 0], [x1, H.upperEnt + 0.2, -hw]]);
    ctx.g("lead").poly([[x1, H.upperEnt + 0.2, hw], [x1, top, 0], [x0, top, 0], [x0, H.upperEnt + 0.2, hw]]);
  });
  tympanumRelief(ctx, PLAN.porticoFront + 0.1, H.upperEnt + 0.15, WEST.pedimentW - 3, WEST.pedimentApex - H.upperEnt - 0.7);
  // St Paul on the apex, St Peter and St James at the ends
  stone.box(-86.4, WEST.pedimentApex - 0.1, -1.0, -84.4, WEST.pedimentApex + 0.6, 1.0);
  statue(ctx, [-85.4, WEST.pedimentApex + 0.6, 0], -Math.PI / 2, WEST.statueTop - WEST.pedimentApex - 0.6, 0);
  for (const s of [-1, 1]) {
    stone.box(-86.4, H.upperEnt, s * 10.2 - 0.9, -84.6, H.upperEnt + 0.7, s * 10.2 + 0.9);
    statue(ctx, [-85.5, H.upperEnt + 0.7, s * 10.2], -Math.PI / 2, 3.4, s > 0 ? 1 : 2);
  }

  // ---------------------------------------------------------------------------- towers
  for (const s of [-1, 1]) tower(ctx, s);
  void THREE;
  void cornice;
  void pedestalCap;
  void faceYaw;
  void rng;
  void DEG;
}

/** Door opening: deep reveal, panelled oak leaves (shut, or swung open into the church), moulded surround. */
function doorway(ctx: Ctx, surf: Surface, o: Opening, depth: number, open = false) {
  const stone = ctx.g("stone");
  const outline = openingOutline(o, 4);
  stone.withPaint({ joint: JOINT.blocks, cav: 0.6 }, () => revealOnSurface(stone, surf, outline, depth));
  const wood = ctx.g("wood");
  const cs = (o.s0 + o.s1) / 2;
  if (open) {
    // each leaf turned through 90 degrees against the inner face of the wall
    const hw = (o.s1 - o.s0) / 2;
    for (const k of [-1, 1]) {
      const s = cs + k * (hw - 0.06);
      wood.withPaint({ cav: 0.8 }, () => {
        const a = surf.point(s - 0.06, o.y0, depth), b = surf.point(s + 0.06, o.y0, depth + hw - 0.1);
        wood.box(Math.min(a[0], b[0]), o.y0 + 0.02, Math.min(a[2], b[2]), Math.max(a[0], b[0]), o.y1 - 0.05, Math.max(a[2], b[2]));
      });
    }
  } else {
    wood.withPaint({ cav: 0.8 }, () => fillOnSurface(wood, surf, outline, depth));
    // panels on the leaves
    for (const k of [-1, 1]) {
      for (let r = 0; r < 3; r++) {
        const y0 = o.y0 + 0.5 + r * ((o.y1 - o.y0 - 0.8) / 3), y1 = y0 + (o.y1 - o.y0 - 0.8) / 3 - 0.3;
        slab(wood, surf, cs + k * 0.15, cs + k * (o.s1 - cs - 0.2), y0, y1, depth, depth - 0.05);
      }
    }
  }
  const path = outline.slice(1).concat([outline[0]]);
  stone.withPaint({ joint: JOINT.none }, () => sweepOnSurface(stone, surf, new P(0, 0).to(0, 0.12).to(0.3, 0.12).to(0.3, 0.2).to(0.55, 0.2).to(0.55, 0).build(), path, false, { outwardFrom: [cs, o.y0] }));
  // cornice over the door
  stone.withPaint({ joint: JOINT.blocks }, () => slab(stone, surf, o.s0 - 0.8, o.s1 + 0.8, o.y1 + 0.55, o.y1 + 0.95, 0, -0.45, 0.08));
}

function windowIn(ctx: Ctx, surf: Surface, o: Opening) {
  const stone = ctx.g("stone");
  const outline = openingOutline(o, 12);
  stone.withPaint({ joint: JOINT.blocks, cav: 0.7 }, () => revealOnSurface(stone, surf, outline, 0.7));
  ctx.g("glass").withPaint({ cav: 1 }, () => fillOnSurface(ctx.g("glass"), surf, outline, 0.7));
  stone.withPaint({ joint: JOINT.none }, () => sweepOnSurface(stone, surf, new P(0, 0).to(0, 0.1).to(0.28, 0.1).to(0.28, 0).build(), outline.slice(1).concat([outline[0]]), false, { outwardFrom: [(o.s0 + o.s1) / 2, (o.y0 + o.y1) / 2] }));
}

/**
 * Low-relief figures in the west pediment (Francis Bird's Conversion of St Paul): a horse and
 * riders, the fallen Saul, rays from above — suggested with rounded masses.
 */
function tympanumRelief(ctx: Ctx, x: number, y0: number, w: number, h: number) {
  const b = ctx.g("stone");
  const r = rng(77);
  b.withPaint({ joint: JOINT.none, cav: 0.85 }, () => {
    for (let i = 0; i < 26; i++) {
      const u = (r() - 0.5) * 0.92;
      const maxH = h * (1 - Math.abs(u) * 2) * 0.85;
      if (maxH < 0.4) continue;
      const hh = Math.min(maxH, 0.6 + r() * 1.6);
      const z = u * w;
      const yy = y0 + r() * Math.max(0, maxH - hh);
      const sw = 0.25 + r() * 0.35;
      b.at(x, yy, z, -Math.PI / 2, () => b.lathe([[0.001, 0], [sw, hh * 0.15], [sw * 0.9, hh * 0.6], [sw * 0.55, hh * 0.85], [0.001, hh]], 7, { smooth: true }), 1);
    }
    // rays of light from the apex
    for (let k = -3; k <= 3; k++) {
      const a = (k / 3) * 0.9;
      b.at(x - 0.05, y0 + h * 0.8, 0, 0, () => b.box(-0.05, -Math.cos(a) * 1.5, Math.sin(a) * 1.5 - 0.04, 0.0, 0, Math.sin(a) * 1.5 + 0.04));
    }
  });
}

/** One west tower above the main cornice. s = -1 north (void oculi), +1 south (clock). */
function tower(ctx: Ctx, s: number) {
  const stone = ctx.g("stone");
  const cx = PLAN.towerCx, cz = s * PLAN.towerCz;
  const hw = PLAN.towerHalf;
  const y0 = H.upperEnt; // top of the main cornice
  const y3 = TOWER.s3Top;
  // --- stage 3: square block with oculi
  const faces: { a: V2; dir: V2; out: V2 }[] = [
    { a: [cx - hw, cz + hw], dir: [0, -1], out: [-1, 0] }, // west
    { a: [cx - hw, cz - hw], dir: [1, 0], out: [0, -1] }, // north
    { a: [cx + hw, cz - hw], dir: [0, 1], out: [1, 0] }, // east
    { a: [cx + hw, cz + hw], dir: [-1, 0], out: [0, 1] }, // south
  ];
  const oc = { y: 36.2, r: TOWER.clockR + 0.25 };
  for (const f of faces) {
    const surf = planeSurface(f.a, f.dir, f.out);
    const L = 2 * hw;
    // the tower faces overlooking the nave roof start lower
    const o: Opening = { s0: L / 2 - oc.r, s1: L / 2 + oc.r, y0: oc.y - oc.r, y1: oc.y + oc.r, head: "circle" };
    const inward = (f.out[1] === -s) && false;
    void inward;
    stone.withPaint({ joint: JOINT.ashlar }, () => stripPanel(stone, surf, 0, L, y0, y3, [o], 0.8));
    const outl = openingOutline(o, 20);
    const isClock = s > 0 && (f.out[0] < 0 || f.out[1] > 0);
    stone.withPaint({ joint: JOINT.none, cav: 0.6 }, () => revealOnSurface(stone, surf, outl, isClock ? 0.35 : 1.2));
    stone.withPaint({ joint: JOINT.none }, () => sweepOnSurface(stone, surf, new P(0, 0).to(0, 0.18).to(0.45, 0.18).to(0.6, 0.1).to(0.6, 0).build(), outl, true, { outwardFrom: [L / 2, oc.y] }));
    if (isClock) clockFace(ctx, surf, L / 2, oc.y, TOWER.clockR);
    else ctx.g("iron").withPaint({ cav: 0.1 }, () => fillOnSurface(ctx.g("iron"), surf, outl, 1.2));
    // corner strips (rusticated quoins)
    for (const sc of [0.6, L - 0.6]) slab(stone, surf, sc - 0.6, sc + 0.6, y0 + 0.3, y3 - 0.8, 0, -0.12);
    // festoons and scrolls flanking the oculus
    ctx.inst.add("festoon", surf.point(L / 2, oc.y + oc.r + 0.8, -0.1), faceYaw(f.out), [5.2, 1.6, 2]);
  }
  const sq: V2[] = [[cx - hw, cz - hw], [cx + hw, cz - hw], [cx + hw, cz + hw], [cx - hw, cz + hw]];
  stone.withPaint({ joint: JOINT.blocks }, () => {
    stone.sweep(cornice(0.8, 0.55, y3 - 0.8), sq, true);
    stone.sweep(new P(0.3, y0).up(0.5).cymaReversa(-0.2, 0.2).to(0, y0 + 0.8).build(), sq, true);
  });
  // Evangelist statues on the outer corners
  for (const [sx, sz] of [[-1, s], [1, s]] as V2[]) {
    stone.box(cx + sx * hw - 0.9 + sx * 0.3, y0, cz + sz * hw - 0.9 + sz * 0.3, cx + sx * hw + 0.9 + sx * 0.3, y0 + 0.9, cz + sz * hw + 0.9 + sz * 0.3);
    statue(ctx, [cx + sx * (hw + 0.3), y0 + 0.9, cz + sz * (hw + 0.3)], faceYaw([sx < 0 ? -0.7 : 0.7, sz * 0.7]), 3.0, (sx > 0 ? 3 : 1) + (s > 0 ? 0 : 2));
  }

  // --- stage 4: central drum with paired columns at the four angles
  const y4 = TOWER.s4Top;
  const rD = 3.5;
  const drum = arcSurface([cx, cz], rD, 0, 1);
  const arches: Opening[] = [];
  for (let q = 0; q < 4; q++) {
    const a = q * 90 * DEG;
    const sArc = a * rD;
    arches.push({ s0: sArc - 0.95, s1: sArc + 0.95, y0: y3 + 1.6, y1: y4 - 3.6, head: "round" });
  }
  stone.withPaint({ joint: JOINT.ashlar }, () => stripPanel(stone, drum, 0, Math.PI * 2 * rD, y3, y4, arches, 0.5));
  for (const o of arches) {
    const outl = openingOutline(o, 10);
    stone.withPaint({ joint: JOINT.none, cav: 0.5 }, () => revealOnSurface(stone, drum, outl, 0.9));
    ctx.g("iron").withPaint({ cav: 0.1 }, () => fillOnSurface(ctx.g("iron"), drum, outl, 0.9));
  }
  const pedTop = y3 + 1.0;
  const colTop = y4 - 1.4;
  stone.withPaint({ joint: JOINT.blocks }, () => stone.box(cx - TOWER.s4Half, y3, cz - TOWER.s4Half, cx + TOWER.s4Half, pedTop, cz + TOWER.s4Half));
  for (let q = 0; q < 4; q++) {
    const a = (45 + 90 * q) * DEG;
    const c = Math.cos(a), sn = Math.sin(a);
    const rr = TOWER.s4Half * Math.SQRT2 - 1.2;
    const px = cx + c * rr, pz = cz + sn * rr;
    // two pairs at right angles around the angle
    for (const [ox, oz] of [[c * 0.6 - sn * 0.9, sn * 0.6 + c * 0.9], [c * 0.6 + sn * 0.9, sn * 0.6 - c * 0.9], [-sn * 1.7, c * 1.7], [sn * 1.7, -c * 1.7]] as V2[]) {
      column(ctx, px + ox * 0.55, pz + oz * 0.55, pedTop, colTop, 0.7, { cap: "capC", plinth: true, yaw: -a + Math.PI / 2 });
    }
    // entablature block breaking forward, scroll buttress and urn above
    stone.at(px, 0, pz, -a + Math.PI / 2, () => {
      stone.withPaint({ joint: JOINT.blocks }, () => {
        stone.box(-2.1, colTop, -1.2, 2.1, colTop + 0.95, 1.2);
        stone.box(-1.3, colTop + 0.95, -0.8, 1.3, y4, 0.8);
      });
    });
    ctx.inst.add("urn", [px, y4, pz], -a, 1.05);
  }
  stone.withPaint({ joint: JOINT.blocks }, () => stone.sweep(entablature(0.95, colTop, 0.5), circlePath(cx, cz, rD, 48), true));

  // --- stage 5: octagon with two orders of open arches
  const y5 = TOWER.s5Top;
  const oct: V2[] = [];
  const R5 = TOWER.s5Half / Math.cos(Math.PI / 8);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    oct.push([cx + R5 * Math.cos(a), cz + R5 * Math.sin(a)]);
  }
  for (let i = 0; i < 8; i++) {
    const a = oct[i], b = oct[(i + 1) % 8];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const L = Math.hypot(dx, dz);
    const out: V2 = [dz / L, -dx / L];
    const surf = planeSurface(a, [dx / L, dz / L], out);
    const o1: Opening = { s0: L / 2 - 0.62, s1: L / 2 + 0.62, y0: y4 + 0.5, y1: y4 + 2.2, head: "round" };
    const o2: Opening = { s0: L / 2 - 0.5, s1: L / 2 + 0.5, y0: y4 + 3.4, y1: y4 + 4.6, head: "round" };
    stone.withPaint({ joint: JOINT.ashlar }, () => stripPanel(stone, surf, 0, L, y4, y5, [o1, o2], 0.6));
    for (const o of [o1, o2]) {
      const outl = openingOutline(o, 8);
      stone.withPaint({ joint: JOINT.none, cav: 0.45 }, () => revealOnSurface(stone, surf, outl, 0.6));
      ctx.g("iron").withPaint({ cav: 0.05 }, () => fillOnSurface(ctx.g("iron"), surf, outl, 0.6));
    }
  }
  stone.withPaint({ joint: JOINT.blocks }, () => stone.sweep(cornice(0.55, 0.4, y5 - 0.55), oct, true));

  // --- ogee cap (lead) and gilded pineapple
  const lead = ctx.g("lead");
  const cap: V2[] = [];
  const r0 = TOWER.s5Half + 0.1;
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    // ogee: convex below, concave above
    const r = r0 * (1 - t) + 0.35 * t - 1.3 * Math.sin(Math.PI * t) * (0.5 - t) * 0.9;
    cap.push([Math.max(0.3, r), y5 + t * (TOWER.capTop - y5)]);
  }
  lead.withPaint({ cav: 1 }, () => lead.at(cx, 0, cz, Math.PI / 8, () => lead.lathe(cap, 8, { smooth: true })));
  ctx.inst.add("pineapple", [cx, TOWER.capTop - 0.05, cz], 0, (TOWER.top - TOWER.capTop) / 2.6);
  void balustrade;
}

function circlePath(cx: number, cz: number, r: number, n: number): V2[] {
  const pts: V2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]);
  }
  return pts;
}

/** Clock dial: black face with gilded chapter ring, numerals and hands. */
function clockFace(ctx: Ctx, surf: Surface, sc: number, yc: number, r: number) {
  const iron = ctx.g("iron");
  const gold = ctx.g("gold");
  const disc: V2[] = [];
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    disc.push([sc + Math.cos(a) * r, yc + Math.sin(a) * r]);
  }
  iron.withPaint({ cav: 1 }, () => fillOnSurface(iron, surf, disc, 0.3));
  gold.withPaint({ cav: 1 }, () => {
    // chapter ring and hour marks
    for (let h = 0; h < 12; h++) {
      const a = (h / 12) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      const r1 = r * 0.8, r2 = r * 0.95;
      const w = h % 3 === 0 ? 0.12 : 0.07;
      const pts: V2[] = [
        [sc + c * r1 - s * w, yc + s * r1 + c * w], [sc + c * r2 - s * w, yc + s * r2 + c * w],
        [sc + c * r2 + s * w, yc + s * r2 - c * w], [sc + c * r1 + s * w, yc + s * r1 - c * w],
      ];
      fillOnSurface(gold, surf, pts, 0.28);
    }
    // hands at 5:15 pm-ish
    const hand = (ang: number, len: number, w: number) => {
      const c = Math.cos(ang), s = Math.sin(ang);
      const pts: V2[] = [[sc - s * w, yc + c * w], [sc + c * len, yc + s * len], [sc + s * w, yc - c * w], [sc - c * 0.25, yc - s * 0.25]];
      fillOnSurface(gold, surf, pts, 0.26);
    };
    hand(Math.PI / 2 - (5.25 / 12) * Math.PI * 2, r * 0.55, 0.11);
    hand(Math.PI / 2 - (15 / 60) * Math.PI * 2, r * 0.8, 0.08);
  });
}
