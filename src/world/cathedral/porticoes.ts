import { JOINT, type GeoBuilder } from "../../geo/Builder";
import { arcSurface, stripPanel } from "../../geo/surface";
import type { V2 } from "../../core/math";
import { FLOOR, PLAN } from "../dims";
import { column, type Ctx } from "./kit";
import { H } from "./walls";

const DEG = Math.PI / 180;

/**
 * The semicircular porticoes of the transepts (after Pietro da Cortona's S. Maria della Pace):
 * six Corinthian columns on a half circle carrying the continuous lower entablature, a
 * half-dome roofed in lead, and the steps — twelve round the whole semicircle on the north,
 * twenty-five on the south where the ground falls towards the Thames, reached from the ends
 * behind a low curved wall.
 */
export function buildPorticoes(ctx: Ctx) {
  for (const side of [-1, 1]) portico(ctx, side);
}

function portico(ctx: Ctx, side: number) {
  const stone = ctx.g("stone");
  const col = ctx.col;
  const cz = side * PLAN.porticoCz;
  const out = side < 0 ? -90 * DEG : 90 * DEG; // outward axis angle (x->z)
  const R = PLAN.porticoColR;
  const D = 1.22;
  const rOuter = R + 0.8;

  // floor of the portico (half disc reaching the wall)
  const half: V2[] = [];
  for (let i = 0; i <= 24; i++) {
    const a = out - Math.PI / 2 + (i / 24) * Math.PI;
    half.push([Math.cos(a) * rOuter, cz + Math.sin(a) * rOuter]);
  }
  const wallZ = side * 37.05;
  const floorPoly: V2[] = [[-8.9, wallZ], ...half.map(([x, z]) => [x, side < 0 ? Math.min(z, wallZ) : Math.max(z, wallZ)] as V2), [8.9, wallZ]];
  stone.withPaint({ joint: JOINT.blocks }, () => {
    stone.cap(floorPoly, FLOOR, true);
  });
  ctx.g("marble").cap(half.map(([x, z]) => [x * 0.9, cz + (z - cz) * 0.9] as V2), FLOOR + 0.004, true);
  col.cap(floorPoly, FLOOR, true);

  // columns
  for (const d of [-68.7, -40.9, -13.5, 13.5, 40.9, 68.7]) {
    const a = out + d * DEG;
    column(ctx, Math.cos(a) * R, cz + Math.sin(a) * R, FLOOR, H.lowerTop, D, { cap: "capC", yaw: Math.atan2(Math.cos(a), Math.sin(a)) });
  }

  // entablature: its outer face is part of the main lower-order sweep (walls.lowerPath).
  // Inner face, soffit and the half dome.
  const rIn = R - 0.5;
  const th0 = out - Math.PI / 2 - 0.12, th1 = out + Math.PI / 2 + 0.12;
  const inner = arcSurface([0, cz], rIn, th0, 1, true);
  stone.withPaint({ joint: JOINT.blocks, cav: 0.85 }, () => stripPanel(stone, inner, 0, (th1 - th0) * rIn, H.lowerTop, H.lowerEnt, [], 0.6));
  // soffit ring
  ringCap(stone, cz, rIn, R + 0.52, H.lowerTop, th0, th1, false);
  // half dome: lead outside, coffered stone inside
  const domeH = 4.1;
  const outerProf: V2[] = [], innerProf: V2[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = (i / 12) * (Math.PI / 2);
    outerProf.push([(R + 0.55) * Math.cos(t), H.lowerEnt + domeH * Math.sin(t)]);
    innerProf.push([rIn * Math.cos(t), H.lowerEnt - 0.05 + (domeH - 0.8) * Math.sin(t)]);
  }
  const lead = ctx.g("lead");
  const a0 = out - Math.PI / 2, a1 = out + Math.PI / 2;
  // Builder.lathe measures angles from +x towards -z; convert
  lead.withPaint({ cav: 1 }, () => lead.at(0, 0, cz, 0, () => lead.lathe(outerProf, 32, { a0: -a1, a1: -a0, smooth: true })));
  stone.withPaint({ joint: JOINT.none, cav: 0.75 }, () => stone.at(0, 0, cz, 0, () => stone.lathe(innerProf, 32, { a0: -a1, a1: -a0, smooth: true, inside: true })));
  // coffers inside the half dome
  for (let row = 0; row < 3; row++) {
    for (let k = 0; k < 7; k++) {
      const t = ((row + 0.6) / 3.4) * (Math.PI / 2);
      const a = a0 + ((k + 0.5) / 7) * Math.PI;
      const r = rIn * Math.cos(t) - 0.02, y = H.lowerEnt - 0.05 + (domeH - 0.8) * Math.sin(t);
      stone.withPaint({ joint: JOINT.none, cav: 0.45 }, () =>
        stone.at(Math.cos(a) * r, y, cz + Math.sin(a) * r, Math.atan2(-Math.cos(a), -Math.sin(a)), () => stone.box(-0.45 * Math.cos(t) - 0.1, -0.35, -0.02, 0.45 * Math.cos(t) + 0.1, 0.35, 0.0, "nz")),
      );
    }
  }
  // back wall above the door (between the soffit and the half dome), closing the portico
  stone.withPaint({ joint: JOINT.ashlar, cav: 0.9 }, () => stone.box(-7.0, H.lowerTop, wallZ - side * 0.05, 7.0, H.lowerEnt + domeH, wallZ + side * 0.02, side < 0 ? "pz" : "nz"));

  // steps
  if (side < 0) {
    // north: twelve steps round the whole semicircle down to the churchyard (y ~ +0.3)
    const n = 12, rise = (FLOOR - 0.3) / n, run = 0.36;
    for (let i = 0; i < n; i++) {
      const y = FLOOR - rise * (i + 1);
      const r0 = rOuter + run * i, r1 = r0 + run;
      ringStep(stone, col, cz, r0, r1, y, y + rise, out, wallZ, side);
    }
  } else {
    // south: seven round steps to a terrace, the terrace wall, and two side flights of eighteen
    const terraceY = FLOOR - 7 * 0.17;
    for (let i = 0; i < 7; i++) {
      const y = FLOOR - 0.17 * (i + 1);
      ringStep(stone, col, cz, rOuter + 0.36 * i, rOuter + 0.36 * (i + 1), y, y + 0.17, out, wallZ, side);
    }
    const rT = rOuter + 0.36 * 7;
    const rWall = 12.3;
    // terrace paving between the round steps and the wall
    const ringPts = (r: number, n = 32): V2[] => {
      const pts: V2[] = [];
      for (let i = 0; i <= n; i++) {
        const a = out - Math.PI / 2 + (i / n) * Math.PI;
        pts.push([Math.cos(a) * r, cz + Math.sin(a) * r]);
      }
      return pts;
    };
    // terrace: the half ring between the round steps and the parapet, and a strip along the
    // transept wall that leads out to the two side flights
    const clampZ = (pts: V2[]) => pts.map(([x, z]) => [x, Math.max(z, wallZ + 0.02)] as V2);
    const ring: V2[] = [...clampZ(ringPts(rWall)), ...clampZ(ringPts(rT)).reverse()];
    const gapW = 1.25;
    const strip: V2[] = [[-rWall - 3.1, wallZ + 0.02], [rWall + 3.1, wallZ + 0.02], [rWall + 3.1, wallZ + gapW], [-rWall - 3.1, wallZ + gapW]];
    for (const poly of [ring, strip]) {
      ctx.g("paving").cap(poly, terraceY, true);
      col.cap(poly, terraceY, true);
    }
    // low curved parapet wall, rising from the lower churchyard; it stops short of the transept
    // wall so that the terrace opens onto the side flights
    const dA = Math.asin(Math.min(0.9, (wallZ - cz + gapW) / (rWall + 0.25)));
    const aP0 = out - Math.PI / 2 + dA, aP1 = out + Math.PI / 2 - dA;
    const wall = arcSurface([0, cz], rWall + 0.5, aP0, 1);
    const L = (aP1 - aP0) * (rWall + 0.5);
    stone.withPaint({ joint: JOINT.ashlar }, () => stripPanel(stone, wall, 0, L, -2.5, terraceY + 1.05, [], 0.6));
    const wallIn = arcSurface([0, cz], rWall, aP0, 1, true);
    stone.withPaint({ joint: JOINT.ashlar }, () => stripPanel(stone, wallIn, 0, (aP1 - aP0) * rWall, terraceY, terraceY + 1.05, [], 0.6));
    ringCap(stone, cz, rWall - 0.05, rWall + 0.6, terraceY + 1.05, aP0, aP1, true);
    // square ends of the parapet
    for (const a of [aP0, aP1]) {
      const c = Math.cos(a), sn = Math.sin(a);
      stone.withPaint({ joint: JOINT.ashlar }, () => stone.at(c * (rWall + 0.27), 0, cz + sn * (rWall + 0.27), Math.atan2(c, sn), () => stone.box(-0.35, -2.5, -0.3, 0.35, terraceY + 1.12, 0.3)));
    }
    col.at(0, 0, cz, 0, () => col.lathe([[rWall + 0.2, -3], [rWall + 0.2, terraceY + 1.1]], 40, { a0: -aP1, a1: -aP0 }));
    // side flights descending southwards from the ends of the terrace
    for (const sx of [-1, 1]) {
      const n = 18, rise = (terraceY - -1.55) / n, run = 0.34;
      const x0 = sx * (rWall + 0.6), x1 = sx * (rWall + 3.1);
      const z0 = wallZ + gapW;
      for (let i = 0; i < n; i++) {
        const y = terraceY - rise * (i + 1);
        const za = z0 + run * i, zb = za + run;
        stone.withPaint({ joint: JOINT.blocks }, () => stone.box(Math.min(x0, x1), y - 0.4, za, Math.max(x0, x1), y + rise, zb, "ny"));
        col.box(Math.min(x0, x1), -3, za, Math.max(x0, x1), y + rise, zb);
        // inner cheek (a low wall stepping down with the flight)
        const xi = sx * (rWall + 0.6);
        stone.withPaint({ joint: JOINT.ashlar }, () => stone.box(Math.min(xi, xi - sx * 0.3), y - 0.6, za, Math.max(xi, xi - sx * 0.3), y + rise + 0.9, zb));
        col.box(Math.min(xi, xi - sx * 0.3), y - 0.6, za, Math.max(xi, xi - sx * 0.3), y + rise + 1.0, zb);
      }
      // the terrace strip's paving continues over the flight's head
      stone.withPaint({ joint: JOINT.blocks }, () => stone.box(Math.min(x0, x1), terraceY - 0.6, wallZ + 0.02, Math.max(x0, x1), terraceY, z0, "ny"));
      col.box(Math.min(x0, x1), -3, wallZ, Math.max(x0, x1), terraceY, z0);
      // outer cheek wall
      const xo = sx * (rWall + 3.1);
      stone.withPaint({ joint: JOINT.ashlar }, () => stone.box(Math.min(xo, xo + sx * 0.5), -2.5, wallZ, Math.max(xo, xo + sx * 0.5), terraceY + 1.05, z0 + run * n));
      col.box(Math.min(xo, xo + sx * 0.5), -3, wallZ, Math.max(xo, xo + sx * 0.5), terraceY + 1.1, z0 + run * n);
    }
    // urns flanking the steps
    for (const sx of [-1, 1]) ctx.inst.add("urn", [sx * Math.cos(dA) * (rWall + 0.27), terraceY + 1.12, cz + Math.sin(dA) * (rWall + 0.27)], 0, 0.85);
  }
}

/** A horizontal ring (sector) cap between radii r0 and r1 at height y, facing up or down. */
function ringCap(b: GeoBuilder, cz: number, r0: number, r1: number, y: number, a0: number, a1: number, up: boolean) {
  const n = 28;
  const outer: V2[] = [], inner: V2[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    outer.push([Math.cos(a) * r1, cz + Math.sin(a) * r1]);
    inner.push([Math.cos(a) * r0, cz + Math.sin(a) * r0]);
  }
  b.withPaint({ joint: JOINT.none, cav: up ? 1 : 0.8 }, () => b.cap(outer.concat(inner.reverse()), y, up));
}

/** One step of a semicircular flight: tread (top) and riser (outer face). */
function ringStep(b: GeoBuilder, col: GeoBuilder, cz: number, r0: number, r1: number, y0: number, y1: number, out: number, wallZ: number, side: number) {
  const n = 40;
  const a0 = out - Math.PI / 2, a1 = out + Math.PI / 2;
  const outer: V2[] = [], inner: V2[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    const clampZ = (z: number) => (side < 0 ? Math.min(z, wallZ) : Math.max(z, wallZ));
    outer.push([Math.cos(a) * r1, clampZ(cz + Math.sin(a) * r1)]);
    inner.push([Math.cos(a) * r0, clampZ(cz + Math.sin(a) * r0)]);
  }
  const poly = outer.concat(inner.slice().reverse());
  b.withPaint({ joint: JOINT.blocks }, () => {
    b.cap(poly, y1, true);
    // riser on the outer edge
    b.at(0, 0, cz, 0, () => b.lathe([[r1, y0 - 0.4], [r1, y1]], n, { a0: -a1, a1: -a0 }));
  });
  col.cap(poly, y1, true);
  col.at(0, 0, cz, 0, () => col.lathe([[r1, -3], [r1, y1]], 24, { a0: -a1, a1: -a0 }));
}
