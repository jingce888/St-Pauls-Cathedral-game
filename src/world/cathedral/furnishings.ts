import * as THREE from "three";
import { JOINT, type GeoBuilder } from "../../geo/Builder";
import { tube, twistedShaft } from "../../geo/tube";
import type { V2, V3 } from "../../core/math";
import { FLOOR } from "../dims";
import type { Ctx } from "./kit";
import { CHOIR_X, INT, NAVE_X } from "./interior";

/**
 * The fittings of the church: the Grand Organ over the first arches of the quire (Bernard
 * Smith's organ in the case carved by Grinling Gibbons, 1695-97), the State Trumpets over the
 * west door, the quire stalls with their carved canopies and the bishop's throne, the high
 * altar under the baldacchino with its twisted gilded columns, the pulpit, the brass eagle
 * lectern, the font, and the great hanging lamps of the nave and quire.
 */

const F = FLOOR;
const DEG = Math.PI / 180;

export function buildFurnishings(ctx: Ctx) {
  for (const side of [-1, 1]) {
    organ(ctx, side);
    stalls(ctx, side);
  }
  throne(ctx);
  trumpets(ctx);
  sanctuary(ctx);
  pulpit(ctx, 19.8, -5.0);
  lectern(ctx, 17.2, 4.6);
  font(ctx, -3.6, -30.2);
  lamps(ctx);
}

// ---------------------------------------------------------------------------------- helpers

/** Box given by two corners, painted with a cavity value. */
function bx(b: GeoBuilder, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, cav = 1, skip = "") {
  b.withPaint({ cav, joint: JOINT.none }, () => b.box(Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1), Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1), skip));
}

/** Raised panels on a vertical face at z = zf facing dir (±1 in z), between x0..x1, y0..y1. */
function panelsZ(b: GeoBuilder, x0: number, x1: number, y0: number, y1: number, zf: number, dir: number, cols: number, rows: number, gap = 0.1, proud = 0.035) {
  const w = (x1 - x0 - gap * (cols + 1)) / cols, h = (y1 - y0 - gap * (rows + 1)) / rows;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const a = x0 + gap + i * (w + gap), c = y0 + gap + j * (h + gap);
      // frame (bolection moulding) and the raised field
      bx(b, a, c, zf, a + w, c + h, zf + dir * proud * 0.5, 0.75, dir > 0 ? "nz" : "pz");
      bx(b, a + 0.05, c + 0.05, zf, a + w - 0.05, c + h - 0.05, zf + dir * proud, 0.95, dir > 0 ? "nz" : "pz");
    }
  }
}

/** Organ pipe standing at (x, z): foot from y0, mouth, body to y1; radius r. */
function pipe(ctx: Ctx, x: number, z: number, y0: number, y1: number, r: number, face: V2) {
  const g = ctx.g("goldInt");
  const foot = Math.min(0.75, (y1 - y0) * 0.25);
  g.withPaint({ cav: 1 }, () =>
    g.at(x, 0, z, 0, () => g.lathe([[0.012, y0], [r * 0.35, y0 + 0.05], [r, y0 + foot], [r, y1], [r * 0.92, y1]], 12, { smooth: [false, true, false, false, false] })),
  );
  // the mouth: a dark slot with the upper lip, on the front
  const m = ctx.g("iron");
  const yaw = Math.atan2(face[0], face[1]);
  m.withPaint({ cav: 0.3 }, () => m.at(x + face[0] * (r + 0.001), 0, z + face[1] * (r + 0.001), yaw, () => m.box(-r * 0.45, y0 + foot + 0.02, -0.004, r * 0.45, y0 + foot + 0.02 + r * 0.9, 0.004)));
}

// ---------------------------------------------------------------------------------- organ

/**
 * One half of the Grand Organ, in the first arch of the quire on the north (side -1) or the
 * south (+1): a panelled screen, the impost with its cornice, and the upper case with three
 * round towers and two flats of gilded pipes on each face (towards the quire and the aisle).
 */
function organ(ctx: Ctx, side: number) {
  const wood = ctx.g("wood");
  const xc = 28.7, hw = 3.2;
  const zi = side * 6.0, zo = side * 9.65;
  const z0 = Math.min(zi, zo), z1 = Math.max(zi, zo);
  // screen and impost (a solid, panelled base)
  bx(wood, xc - hw, F - 0.05, z0, xc + hw, F + 7.3, z1, 0.95);
  for (const [zf, dir] of [[zi, -side], [zo, side]] as [number, number][]) {
    panelsZ(wood, xc - hw + 0.1, xc + hw - 0.1, F + 0.15, F + 4.5, zf, dir, 6, 2);
    panelsZ(wood, xc - hw + 0.1, xc + hw - 0.1, F + 4.95, F + 7.1, zf, dir, 5, 1);
    // band and cornice
    bx(wood, xc - hw - 0.05, F + 4.55, zf, xc + hw + 0.05, F + 4.85, zf + dir * 0.12, 0.9);
    bx(wood, xc - hw - 0.1, F + 7.3, zf - dir * 0.2, xc + hw + 0.1, F + 7.45, zf + dir * 0.15, 0.85);
    bx(wood, xc - hw - 0.18, F + 7.45, zf - dir * 0.2, xc + hw + 0.18, F + 7.62, zf + dir * 0.25, 0.9);
  }
  // body of the upper case, stiles and top cornice over the flats
  bx(wood, xc - hw + 0.2, F + 7.62, z0 + 0.45, xc + hw - 0.2, F + 11.35, z1 - 0.45, 0.8);
  for (const sx of [-1, 1]) bx(wood, xc + sx * (hw - 0.25) - 0.13, F + 7.62, z0 + 0.05, xc + sx * (hw - 0.25) + 0.13, F + 11.6, z1 - 0.05, 0.9);
  bx(wood, xc - hw + 0.1, F + 11.35, z0 + 0.1, xc + hw - 0.1, F + 11.6, z1 - 0.1, 0.9);
  bx(wood, xc - hw, F + 11.6, z0 + 0.02, xc + hw, F + 11.75, z1 - 0.02, 0.9);

  const gold = ctx.g("goldInt");
  for (const [zf, out] of [[zi, -side], [zo, side]] as [number, number][]) {
    const face: V2 = [0, out];
    const towers = [
      { x: xc, r: 0.78, top: F + 12.95, n: 9, pr: 0.085 },
      { x: xc - 2.2, r: 0.56, top: F + 11.95, n: 7, pr: 0.07 },
      { x: xc + 2.2, r: 0.56, top: F + 11.95, n: 7, pr: 0.07 },
    ];
    for (const t of towers) {
      // half-round tower: corbel, base moulding, pipes, frieze of carving, cornice and cap
      const a0 = out > 0 ? -Math.PI : 0, a1 = out > 0 ? 0 : Math.PI; // lathe angles (from +x towards -z)
      const half = (prof: V2[], y: number, m: GeoBuilder, cav = 0.9) =>
        m.withPaint({ cav }, () => m.at(t.x, y, zf, 0, () => m.lathe(prof, 16, { a0, a1, smooth: true })));
      half([[0.12, -1.0], [0.3, -0.75], [t.r * 0.8, -0.35], [t.r + 0.1, -0.12], [t.r + 0.14, 0]], F + 7.62, wood);
      half([[t.r + 0.14, 0], [t.r + 0.14, 0.18], [0.001, 0.18]], F + 7.62, wood);
      const ym = F + 7.8;
      for (let k = 0; k < t.n; k++) {
        const th = (-78 + (156 * k) / (t.n - 1)) * DEG;
        const rho = t.r - 0.1;
        const px = t.x + rho * Math.sin(th), pz = zf + out * rho * Math.cos(th);
        const top = t.top - 0.95 - 0.35 * Math.abs(Math.sin(th));
        pipe(ctx, px, pz, ym, top, t.pr, [Math.sin(th), out * Math.cos(th)]);
      }
      // carved frieze (gilded foliage) and the tower's entablature and cap
      half([[t.r + 0.04, 0], [t.r + 0.06, 0.12], [t.r + 0.03, 0.3], [t.r + 0.06, 0.48], [t.r + 0.04, 0.6]], t.top - 0.95, gold, 0.7);
      half([[t.r + 0.06, 0], [t.r + 0.1, 0.1], [t.r + 0.1, 0.2], [t.r + 0.24, 0.3], [t.r + 0.26, 0.38], [t.r + 0.28, 0.4]], t.top - 0.4, wood);
      half([[t.r + 0.28, 0], [t.r + 0.1, 0.12], [0.001, 0.2]], t.top, wood, 0.95);
      // posts where the tower meets the case
      for (const sx of [-1, 1]) bx(wood, t.x + sx * (t.r + 0.02) - 0.07, F + 7.62, zf - out * 0.1, t.x + sx * (t.r + 0.02) + 0.07, t.top - 0.4, zf + out * 0.06, 0.85);
      // finials: a crown on the middle tower, urns on the others
      const yaw = out > 0 ? 0 : Math.PI;
      if (t.n === 9) crown(ctx, t.x, t.top + 0.2, zf + out * 0.25, 0.45);
      else ctx.inst.add("urnGold", [t.x, t.top + 0.2, zf + out * 0.25], yaw, 0.55);
      // a cherub head on the corbel
      ctx.inst.add("cherubGold", [t.x, F + 7.05, zf + out * (t.r * 0.55 + 0.12)], yaw, t.n === 9 ? 0.75 : 0.55);
    }
    // the flats between the towers: pipes in a row, their tops rising towards the middle
    for (const sx of [-1, 1]) {
      const xa = xc + sx * 0.9, xb = xc + sx * 1.6;
      const n = 5;
      for (let k = 0; k < n; k++) {
        const x = xa + ((xb - xa) * k) / (n - 1);
        const top = F + 10.7 - 0.12 * k;
        pipe(ctx, x, zf + out * 0.08, F + 7.7, top, 0.06, face);
      }
      // pierced carving (pipe shade) over the flat
      ctx.inst.add("shade", [(xa + xb) / 2, F + 10.75, zf + out * 0.12], out > 0 ? 0 : Math.PI, [0.95, 0.9, 1]);
      bx(wood, Math.min(xa, xb) - 0.1, F + 7.62, zf, Math.max(xa, xb) + 0.1, F + 7.74, zf + out * 0.18, 0.85);
    }
  }
  // collision: the whole case
  ctx.col.box(xc - hw, F - 0.5, z0, xc + hw, F + 4.5, z1);
}

/** Gilded crown finial (royal crown: band, arches, orb and cross). */
function crown(ctx: Ctx, x: number, y: number, z: number, s: number) {
  const g = ctx.g("goldInt");
  g.withPaint({ cav: 0.9 }, () => {
    g.at(x, y, z, 0, () => {
      g.lathe([[0.001, 0], [0.5 * s, 0], [0.55 * s, 0.1 * s], [0.5 * s, 0.35 * s], [0.001, 0.35 * s]], 16, { smooth: false });
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2;
        const pts: V3[] = [];
        for (let i = 0; i <= 8; i++) {
          const t = i / 8;
          const r = 0.5 * s * (1 - t);
          pts.push([Math.cos(a) * r, 0.35 * s + Math.sin(t * Math.PI * 0.5) * 0.55 * s, Math.sin(a) * r]);
        }
        tube(g, pts, 0.05 * s, 6);
      }
      g.lathe([[0.001, 0.85 * s], [0.14 * s, 0.9 * s], [0.14 * s, 1.05 * s], [0.001, 1.12 * s]], 10, { smooth: true });
      g.box(-0.025 * s, 1.1 * s, -0.025 * s, 0.025 * s, 1.4 * s, 0.025 * s);
      g.box(-0.1 * s, 1.26 * s, -0.025 * s, 0.1 * s, 1.31 * s, 0.025 * s);
    });
  });
}

// ---------------------------------------------------------------------------------- trumpets

/** The State Trumpets: a rank of horizontal gilded trumpets over the great west door. */
function trumpets(ctx: Ctx) {
  const wood = ctx.g("wood"), g = ctx.g("goldInt");
  const x0 = INT.xW + 0.02, y = F + 12.6;
  bx(wood, x0, y - 0.7, -2.5, x0 + 0.75, y + 0.9, 2.5, 0.85);
  bx(wood, x0, y + 0.9, -2.65, x0 + 0.95, y + 1.1, 2.65, 0.9);
  bx(wood, x0, y - 0.85, -2.6, x0 + 0.9, y - 0.7, 2.6, 0.9);
  const rows = [y + 0.45, y + 0.1, y - 0.25];
  rows.forEach((ry, j) => {
    for (let i = 0; i < 9; i++) {
      const z = -2.0 + i * 0.5 + (j % 2) * 0.12;
      const L = 2.2 + 0.25 * (j === 1 ? 1 : 0);
      const spread = (z / 2.2) * 0.12;
      const pts: V3[] = [];
      for (let k = 0; k <= 10; k++) {
        const t = k / 10;
        pts.push([x0 + 0.75 + L * t, ry + 0.02 * t, z + spread * L * t]);
      }
      g.withPaint({ cav: 1 }, () => tube(g, pts, (t) => (t < 0.8 ? 0.028 : 0.028 + 0.1 * Math.pow((t - 0.8) / 0.2, 2)), 10));
    }
  });
}

// ---------------------------------------------------------------------------------- stalls

/** Quire stalls on one side: raised upper stalls with a carved canopy, desks in front. */
function stalls(ctx: Ctx, side: number) {
  const wood = ctx.g("wood");
  const x0 = 25.7, x1 = 54.9;
  const z = (d: number) => side * d;
  const inward = -side;
  // platform, back panelling and its raised panels
  bx(wood, x0, F - 0.02, z(4.62), x1, F + 0.32, z(5.9), 0.9);
  bx(wood, x0, F + 0.32, z(5.72), x1, F + 3.3, z(5.92), 0.9);
  const pitch = 0.73;
  const n = Math.floor((x1 - x0) / pitch);
  const off = (x1 - x0 - n * pitch) / 2;
  for (let k = 0; k <= n; k++) {
    const xk = x0 + off + k * pitch;
    // pilaster strip between stalls, arm divider with a scrolled arm rest
    bx(wood, xk - 0.05, F + 0.32, z(5.64), xk + 0.05, F + 3.3, z(5.72), 0.8);
    bx(wood, xk - 0.03, F + 0.32, z(5.08), xk + 0.03, F + 1.18, z(5.72), 0.8);
    bx(wood, xk - 0.05, F + 1.18, z(4.98), xk + 0.05, F + 1.28, z(5.72), 0.9);
    if (k < n) {
      const a = xk + 0.06, c = xk + pitch - 0.06;
      bx(wood, a, F + 0.72, z(5.22), c, F + 0.8, z(5.72), 0.8);
      bx(wood, a, F + 0.32, z(5.2), c, F + 0.72, z(5.26), 0.7);
      // raised panel on the back of each stall
      bx(wood, a + 0.04, F + 1.4, z(5.69), c - 0.04, F + 3.05, z(5.72), 0.95, side > 0 ? "pz" : "nz");
    }
  }
  // canopy: coved hood, cornice, carved cresting with urns
  wood.withPaint({ cav: 0.7, joint: JOINT.none }, () => {
    const yA = F + 3.3, yB = F + 3.62;
    const za = z(5.72), zb = z(4.95);
    wood.polyN([[x0, yA, za], [x1, yA, za], [x1, yB, zb], [x0, yB, zb]], [0, -0.9, inward * 0.4]);
  });
  bx(wood, x0 - 0.05, F + 3.62, z(4.88), x1 + 0.05, F + 3.85, z(5.95), 0.9);
  bx(wood, x0 - 0.1, F + 3.85, z(4.8), x1 + 0.1, F + 3.95, z(5.95), 0.9);
  for (let x = x0 + 0.95; x < x1 - 0.8; x += 1.9) ctx.inst.add("crest", [x, F + 3.95, z(5.3)], side > 0 ? Math.PI : 0, [1, 1, 1]);
  for (let x = x0; x <= x1 + 0.01; x += (x1 - x0) / 8) ctx.inst.add("urnGold", [x, F + 3.95, z(5.35)], 0, 0.42);
  // desks for the lower row: panelled fronts and sloping book rests
  bx(wood, x0 + 0.4, F, z(4.08), x1 - 0.4, F + 0.98, z(4.55), 0.9);
  panelsZ(wood, x0 + 0.45, x1 - 0.45, F + 0.05, F + 0.92, z(4.08), inward, 24, 1, 0.08, 0.03);
  wood.withPaint({ cav: 0.95 }, () => wood.polyN([[x0 + 0.35, F + 1.08, z(4.02)], [x1 - 0.35, F + 1.08, z(4.02)], [x1 - 0.35, F + 0.98, z(4.6)], [x0 + 0.35, F + 0.98, z(4.6)]], [0, 1, 0]));
  ctx.col.box(x0, F - 0.5, Math.min(z(4.02), z(5.95)), x1, F + 1.3, Math.max(z(4.02), z(5.95)));
}

/** The bishop's throne at the east end of the south stalls: a tall canopied seat. */
function throne(ctx: Ctx) {
  const wood = ctx.g("wood");
  const x0 = 53.5, x1 = 54.95, z0 = 4.55, z1 = 6.0;
  bx(wood, x0, F + 0.32, 5.72, x1, F + 6.4, 5.95, 0.85);
  for (const x of [x0 + 0.08, x1 - 0.08]) bx(wood, x - 0.08, F + 0.32, z0 + 0.05, x + 0.08, F + 6.4, z0 + 0.2, 0.9);
  bx(wood, x0 - 0.12, F + 6.4, z0 - 0.1, x1 + 0.12, F + 6.8, z1, 0.9);
  bx(wood, x0 - 0.2, F + 6.8, z0 - 0.18, x1 + 0.2, F + 6.95, z1 + 0.02, 0.9);
  // mitre-shaped cupola and finial
  const g = ctx.g("goldInt");
  wood.withPaint({ cav: 0.9 }, () => wood.at((x0 + x1) / 2, F + 6.95, (z0 + z1) / 2, 0, () => wood.lathe([[0.85, 0], [0.8, 0.25], [0.55, 0.7], [0.25, 1.2], [0.08, 1.5], [0.001, 1.55]], 8, { smooth: true })));
  g.withPaint({ cav: 1 }, () => g.at((x0 + x1) / 2, F + 8.5, (z0 + z1) / 2, 0, () => g.lathe([[0.001, 0], [0.1, 0.05], [0.14, 0.2], [0.08, 0.35], [0.12, 0.45], [0.001, 0.6]], 10, { smooth: true })));
  ctx.inst.add("cherubGold", [(x0 + x1) / 2, F + 6.62, z0 - 0.12], Math.PI, 0.5);
}

// ---------------------------------------------------------------------------------- sanctuary

/**
 * The sanctuary: steps up from the quire, the high altar, and the baldacchino over it — four
 * twisted columns wreathed with gilded vines carrying a canopy of scrolls crowned by the risen
 * Christ.
 */
function sanctuary(ctx: Ctx) {
  const marble = ctx.g("marble"), white = ctx.g("whiteMarble");
  const col = ctx.col;
  // three steps and the raised floor of the sanctuary and apse
  const steps = [55.3, 55.62, 55.94];
  steps.forEach((x, i) => {
    const y = F + 0.17 * (i + 1);
    marble.withPaint({ cav: 1 }, () => marble.box(x, F - 0.02, -6.2, x + 0.33, y, 6.2, "ny nx"));
    white.withPaint({ cav: 0.9 }, () => white.box(x - 0.01, F - 0.02, -6.2, x, y, 6.2, "ny px py pz nz"));
    col.box(x, F - 0.5, -6.2, x + 0.33, y, 6.2);
  });
  const yS = F + 0.51;
  const plat: V2[] = [[56.27, -6.2], [INT.xE, -6.2]];
  for (let i = 1; i < 16; i++) {
    const a = -90 + (180 * i) / 16;
    plat.push([INT.xE + 6.9 * Math.cos(a * DEG), 6.9 * Math.sin(a * DEG) * (6.2 / 6.9)]);
  }
  plat.push([INT.xE, 6.2], [56.27, 6.2]);
  marble.withPaint({ cav: 1 }, () => marble.cap(plat, yS, true));
  white.withPaint({ cav: 0.85 }, () => white.prism(plat, F - 0.02, yS, { top: false }));
  col.prism(plat, F - 0.5, yS, { top: true });

  // the high altar: marble table, frontal, cross and candlesticks
  const ax = 59.0;
  white.withPaint({ cav: 0.9 }, () => {
    white.box(ax - 0.75, yS, -1.9, ax + 0.75, yS + 0.95, 1.9);
    white.box(ax - 0.85, yS + 0.95, -2.0, ax + 0.85, yS + 1.07, 2.0);
    white.box(ax + 0.2, yS + 1.07, -1.2, ax + 0.75, yS + 1.3, 1.2);
  });
  ctx.g("redMarble").withPaint({ cav: 0.9 }, () => ctx.g("redMarble").box(ax - 0.78, yS + 0.12, -1.6, ax - 0.75, yS + 0.8, 1.6, "px"));
  const g = ctx.g("goldInt");
  g.withPaint({ cav: 1 }, () => {
    g.box(ax + 0.42, yS + 1.3, -0.04, ax + 0.52, yS + 2.35, 0.04);
    g.box(ax + 0.42, yS + 1.95, -0.32, ax + 0.52, yS + 2.05, 0.32);
    for (const z of [-1.05, -0.7, -0.35, 0.35, 0.7, 1.05]) {
      g.at(ax + 0.47, yS + 1.3, z, 0, () => g.lathe([[0.001, 0], [0.12, 0], [0.1, 0.06], [0.03, 0.12], [0.035, 0.45], [0.06, 0.55], [0.025, 0.6], [0.025, 0.72], [0.001, 0.72]], 10, { smooth: true }));
    }
  });
  col.box(ax - 0.85, yS, -2.0, ax + 0.85, yS + 1.1, 2.0);

  // baldacchino
  const cols: V2[] = [[56.9, -2.9], [56.9, 2.9], [61.1, -2.9], [61.1, 2.9]];
  const yP = yS + 1.5, yB = yP + 0.35, yC = yB + 7.0;
  for (const [x, z] of cols) {
    white.withPaint({ cav: 0.9 }, () => {
      white.box(x - 0.55, yS, z - 0.55, x + 0.55, yS + 0.15, z + 0.55);
      white.box(x - 0.48, yS + 0.15, z - 0.48, x + 0.48, yP - 0.15, z + 0.48);
      white.box(x - 0.55, yP - 0.15, z - 0.55, x + 0.55, yP, z + 0.55);
    });
    ctx.g("redMarble").withPaint({ cav: 0.9 }, () => ctx.g("redMarble").box(x - 0.49, yS + 0.3, z - 0.49, x + 0.49, yP - 0.3, z + 0.49));
    g.withPaint({ cav: 1 }, () => g.at(x, 0, z, 0, () => g.lathe([[0.46, yP], [0.46, yP + 0.08], [0.4, yP + 0.14], [0.42, yP + 0.24], [0.36, yB]], 24, { smooth: true })));
    ctx.g("wood").withPaint({ cav: 0.9, joint: JOINT.none }, () => twistedShaft(ctx.g("wood"), x, z, yB, yC, 0.33, 3, 2, 0.17));
    // gilded vine wound in the hollows of the twist
    const vine: V3[] = [];
    for (let i = 0; i <= 120; i++) {
      const t = i / 120;
      const y = yB + (yC - yB) * t;
      const a = (t * 3 * Math.PI * 2) / 2 + Math.PI / 2;
      vine.push([x + Math.cos(a) * 0.3, y, z + Math.sin(a) * 0.3]);
    }
    g.withPaint({ cav: 0.9 }, () => tube(g, vine, 0.035, 6));
    for (let i = 6; i < 120; i += 9) {
      const p = vine[i];
      g.withPaint({ cav: 0.85 }, () => g.at(p[0], p[1], p[2], i * 0.7, () => g.lathe([[0.001, -0.08], [0.07, -0.03], [0.05, 0.05], [0.001, 0.09]], 6, { smooth: true })));
    }
    g.withPaint({ cav: 1 }, () => g.at(x, 0, z, 0, () => g.lathe([[0.34, yC - 0.1], [0.38, yC - 0.05], [0.38, yC]], 20, { smooth: true })));
    ctx.inst.add("capXgold", [x, yC, z], 0, 0.76);
    col.at(x, 0, z, 0, () => col.cylinder(0.6, yS - 0.2, yS + 3, 10, true));
  }
  // entablature carried round the four columns
  const e0 = yC + 0.89, e1 = e0 + 1.0;
  const wood = ctx.g("wood");
  const X0 = 56.3, X1 = 61.7, Z = 3.5;
  for (const [a, b, c, d] of [[X0, -Z, X1, -Z + 0.9], [X0, Z - 0.9, X1, Z], [X0, -Z + 0.9, X0 + 0.9, Z - 0.9], [X1 - 0.9, -Z + 0.9, X1, Z - 0.9]]) {
    bx(wood, a, e0, b, c, e1 - 0.35, d, 0.9);
    bx(g, a - 0.03, e1 - 0.35, b - 0.03, c + 0.03, e1 - 0.15, d + 0.03, 0.8);
    bx(wood, a - 0.12, e1 - 0.15, b - 0.12, c + 0.12, e1, d + 0.12, 0.9);
  }
  // scrolled ribs rising to the crown, with the figure of the risen Christ
  const top: V3 = [59.0, e1 + 3.0, 0];
  for (const [x, z] of cols) {
    const pts: V3[] = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const k = Math.sin((t * Math.PI) / 2);
      pts.push([x + (top[0] - x) * t, e1 + (top[1] - e1) * k, z + (top[2] - z) * t]);
    }
    g.withPaint({ cav: 0.9 }, () => tube(g, pts, (t) => 0.2 - 0.1 * t, 10));
    g.withPaint({ cav: 0.9 }, () => g.at(x, e1 + 0.3, z, 0, () => g.lathe([[0.001, -0.3], [0.28, -0.2], [0.3, 0.05], [0.18, 0.25], [0.001, 0.3]], 12, { smooth: true })));
    ctx.inst.add("urnGold", [x, e1, z], 0, 0.7);
  }
  g.withPaint({ cav: 1 }, () => g.at(top[0], top[1] - 0.3, top[2], 0, () => g.lathe([[0.001, 0], [0.4, 0.15], [0.45, 0.4], [0.3, 0.6], [0.001, 0.65]], 16, { smooth: true })));
  ctx.inst.add("statueGold", [top[0], top[1] + 0.3, top[2]], -Math.PI / 2, 2.4 / 1.92);
}

// ---------------------------------------------------------------------------------- pulpit, lectern, font

/** Pulpit: octagonal tub on a stem, a stair, the backboard and the sounding board above. */
function pulpit(ctx: Ctx, x: number, z: number) {
  const wood = ctx.g("wood"), g = ctx.g("goldInt");
  const r = 0.85, y0 = F + 1.75, y1 = y0 + 1.15;
  wood.withPaint({ cav: 0.9 }, () => wood.at(x, 0, z, 0, () => wood.lathe([[0.55, F], [0.55, F + 0.2], [0.3, F + 0.35], [0.26, F + 1.1], [0.45, F + 1.5], [r, y0]], 16, { smooth: [false, false, true, false, true, false] })));
  const oct = (rr: number): V2[] => Array.from({ length: 8 }, (_, k) => [x + rr * Math.cos((22.5 + 45 * k) * DEG), z + rr * Math.sin((22.5 + 45 * k) * DEG)] as V2);
  wood.withPaint({ cav: 0.9 }, () => {
    wood.prism(oct(r), y0, y1, { top: false, bottom: true });
    wood.prism(oct(r + 0.08), y1, y1 + 0.1, { top: true, bottom: true });
    wood.prism(oct(r - 0.08), y0, y1, { top: false, inside: true });
    wood.cap(oct(r - 0.08), y0 + 0.4, true);
  });
  // a carved cherub on each face
  for (let k = 0; k < 8; k++) {
    const a = (45 * k) * DEG;
    if (Math.sin(a) * Math.sign(z) > 0.6) continue; // the side against the backboard
    ctx.inst.add("cherubGold", [x + Math.cos(a) * (r * 0.93), y0 + 0.6, z + Math.sin(a) * (r * 0.93)], Math.atan2(Math.cos(a), Math.sin(a)), 0.32);
  }
  // stair from the east, rising along the pier side
  const sgn = Math.sign(z) || -1;
  for (let i = 0; i < 9; i++) {
    const sx = x + 0.9 + i * 0.26, sy = F + (y0 + 0.4 - F) * ((9 - i) / 9);
    bx(wood, sx, F, z + sgn * 0.2, sx + 0.26, sy, z + sgn * 0.95, 0.85);
  }
  bx(wood, x + 0.85, F, z + sgn * 0.95, x + 3.3, F + 0.1, z + sgn * 1.0, 0.8);
  // backboard and the sounding board (tester) with a crown
  const bz = z + sgn * (r - 0.02);
  bx(wood, x - 0.35, y1, bz - 0.05, x + 0.35, F + 5.4, bz + 0.05, 0.85);
  wood.withPaint({ cav: 0.85 }, () => {
    wood.prism(oct(1.15), F + 5.4, F + 5.7, { top: false, bottom: true });
    wood.at(x, F + 5.7, z, 0, () => wood.lathe([[1.15, 0], [1.0, 0.2], [0.7, 0.6], [0.35, 1.0], [0.12, 1.3], [0.001, 1.35]], 8, { smooth: true }));
  });
  g.withPaint({ cav: 0.9 }, () => g.prism(oct(1.17), F + 5.4, F + 5.52, { top: false, bottom: false }));
  crown(ctx, x, F + 7.0, z, 0.55);
  ctx.col.at(x, 0, z, 0, () => ctx.col.cylinder(0.9, F - 0.5, F + 2.5, 8, true));
  ctx.col.box(x + 0.85, F - 0.5, Math.min(z + sgn * 0.2, z + sgn * 1.0), x + 3.3, F + 1.5, Math.max(z + sgn * 0.2, z + sgn * 1.0));
}

/** The brass eagle lectern: the eagle, wings spread, carries the Bible on its back. */
function lectern(ctx: Ctx, x: number, z: number) {
  const g = ctx.g("goldInt");
  g.withPaint({ cav: 0.95 }, () => {
    g.at(x, 0, z, 0, () => {
      g.lathe([[0.001, F], [0.38, F], [0.38, F + 0.08], [0.2, F + 0.18], [0.07, F + 0.3], [0.05, F + 0.9], [0.1, F + 0.95], [0.05, F + 1.0], [0.05, F + 1.05], [0.001, F + 1.05]], 16, { smooth: true });
      g.lathe([[0.001, F + 1.02], [0.14, F + 1.1], [0.16, F + 1.18], [0.12, F + 1.28], [0.001, F + 1.3]], 14, { smooth: true });
    });
    // body facing west (towards the congregation), wings raised to carry the book
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, F + 1.42, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2 - 0.35)), new THREE.Vector3(1, 1, 1));
    g.with(m, () => g.lathe([[0.001, -0.35], [0.1, -0.25], [0.14, 0.0], [0.12, 0.2], [0.07, 0.32], [0.06, 0.4], [0.08, 0.46], [0.001, 0.52]], 12, { smooth: true }));
    for (const s of [-1, 1]) {
      const pts: V3[] = [[x - 0.05, F + 1.5, z + s * 0.08], [x + 0.05, F + 1.66, z + s * 0.3], [x + 0.22, F + 1.62, z + s * 0.42]];
      tube(g, pts, (t) => 0.07 - 0.04 * t, 8);
      g.polyN([[x - 0.1, F + 1.47, z + s * 0.08], [x + 0.24, F + 1.6, z + s * 0.42], [x + 0.28, F + 1.35, z + s * 0.36], [x - 0.02, F + 1.3, z + s * 0.1]], [0, 0.3, s]);
    }
  });
  ctx.g("wood").withPaint({ cav: 0.9 }, () => ctx.g("wood").at(x + 0.08, F + 1.66, z, 0, () => ctx.g("wood").box(-0.2, 0, -0.3, 0.2, 0.08, 0.3)));
  ctx.col.at(x, 0, z, 0, () => ctx.col.cylinder(0.4, F - 0.5, F + 1.5, 8, true));
}

/** The marble font in the north transept (Francis Bird, 1727). */
function font(ctx: Ctx, x: number, z: number) {
  const w = ctx.g("whiteMarble");
  w.withPaint({ cav: 0.9 }, () => {
    w.at(x, 0, z, 0, () => {
      w.lathe([[0.001, F], [1.1, F], [1.1, F + 0.2], [0.95, F + 0.28], [0.95, F + 0.36], [0.001, F + 0.36]], 32);
      w.lathe([[0.001, F + 0.36], [0.4, F + 0.36], [0.28, F + 0.55], [0.22, F + 0.8], [0.3, F + 0.9], [0.55, F + 1.0], [0.85, F + 1.18], [0.92, F + 1.28], [0.9, F + 1.34], [0.8, F + 1.34], [0.75, F + 1.2], [0.001, F + 1.2]], 40, { smooth: [false, false, true, true, true, true, true, false, false, false, false, false] });
    });
  });
  ctx.col.at(x, 0, z, 0, () => ctx.col.cylinder(1.15, F - 0.5, F + 1.4, 12, true));
}

// ---------------------------------------------------------------------------------- lamps

/** Great hanging lamps down the middle of the nave and quire: a gilded corona of lights. */
function lamps(ctx: Ctx) {
  const g = ctx.g("goldInt"), lamp = ctx.g("lamp"), iron = ctx.g("iron");
  const mids = (a: readonly number[]) => a.slice(0, -1).map((x, i) => (x + a[i + 1]) / 2);
  const xs = [...mids(NAVE_X), ...mids(CHOIR_X).slice(0, 3)];
  const yTop = INT.vaultSpring + INT.vaultRise - 0.05, yL = F + 8.6;
  for (const x of xs) {
    iron.withPaint({ cav: 1 }, () => iron.box(x - 0.02, yL + 1.1, -0.02, x + 0.02, yTop, 0.02));
    g.withPaint({ cav: 1 }, () => {
      g.at(x, yL, 0, 0, () => {
        g.lathe([[0.001, 1.1], [0.08, 1.0], [0.06, 0.6], [0.12, 0.3], [0.2, 0.1], [0.18, -0.1], [0.08, -0.35], [0.001, -0.5]], 14, { smooth: true });
        g.lathe([[1.15, -0.05], [1.2, 0.0], [1.2, 0.08], [1.15, 0.12], [1.1, 0.06]], 40, { smooth: true });
        g.lathe([[0.7, 0.3], [0.74, 0.34], [0.7, 0.38], [0.66, 0.34]], 32, { smooth: true });
      });
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2 + Math.PI / 4;
        tube(g, [[x + Math.cos(a) * 0.12, yL + 0.95, Math.sin(a) * 0.12], [x + Math.cos(a) * 0.7, yL + 0.5, Math.sin(a) * 0.7], [x + Math.cos(a) * 1.15, yL + 0.1, Math.sin(a) * 1.15]], 0.02, 5);
      }
    });
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const px = x + Math.cos(a) * 1.16, pz = Math.sin(a) * 1.16;
      g.withPaint({ cav: 1 }, () => g.at(px, yL + 0.12, pz, 0, () => g.lathe([[0.001, 0], [0.05, 0.02], [0.03, 0.08], [0.015, 0.1]], 6)));
      lamp.withPaint({ cav: 1 }, () => lamp.at(px, yL + 0.22, pz, 0, () => lamp.lathe([[0.001, -0.02], [0.035, 0.02], [0.03, 0.09], [0.001, 0.14]], 8, { smooth: true })));
    }
  }
}
