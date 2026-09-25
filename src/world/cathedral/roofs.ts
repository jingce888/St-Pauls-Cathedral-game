import { JOINT } from "../../geo/Builder";
import { openingOutline, planeSurface, revealOnSurface, fillOnSurface, stripPanel, type Opening } from "../../geo/surface";
import type { V2 } from "../../core/math";
import { ELEV, PLAN } from "../dims";
import type { Ctx } from "./kit";
import type { Face } from "./plan";
import { APSE } from "./plan";
import { H } from "./walls";

/**
 * The roofscape behind the balustrade, seen from the Stone and Golden Galleries. Wren's upper
 * storey over the aisles is a screen wall: behind it lie lead flats over the aisles, the
 * clerestory of the nave and choir with its flying buttresses, and low-pitched lead roofs.
 */
export function buildRoofs(ctx: Ctx, faces: Face[]) {
  const stone = ctx.g("stone");
  const lead = ctx.g("lead");
  const yA = ELEV.aisleRoof;
  const yTop = H.upperEnt;

  // --- lead flats over the aisles: one polygon inside the whole outline (hidden where higher parts stand)
  const loop = faces.map((f) => f.a);
  lead.withPaint({ cav: 0.9 }, () => lead.cap(loop, yA, true));

  // --- screen walls: inner faces and the wall top under the balustrade
  const T = 1.15; // thickness
  for (const f of faces) {
    if (f.kind === "W") continue;
    const inw: V2 = [-f.out[0], -f.out[1]];
    const a: V2 = [f.a[0] + inw[0] * T, f.a[1] + inw[1] * T];
    const b: V2 = [f.b[0] + inw[0] * T, f.b[1] + inw[1] * T];
    const mid: V2 = [(f.a[0] + f.b[0]) / 2, (f.a[1] + f.b[1]) / 2];
    // skip the west block (full-height walls there are covered by its own roof)
    if (mid[0] < -53.4) continue;
    stone.withPaint({ joint: JOINT.ashlar, cav: 0.85 }, () => {
      stone.polyN([[a[0], yA, a[1]], [b[0], yA, b[1]], [b[0], yTop, b[1]], [a[0], yTop, a[1]]], [inw[0], 0, inw[1]]);
      stone.polyN([[f.a[0], yTop, f.a[1]], [f.b[0], yTop, f.b[1]], [b[0], yTop, b[1]], [a[0], yTop, a[1]]], [0, 1, 0]);
    });
  }

  // --- clerestory walls of the central vessels (nave/choir along x, transepts along z)
  const zc = PLAN.clerestory;
  const clerY0 = yA, clerY1 = ELEV.mainRoofEaves;
  const bays = (x0: number, x1: number) => {
    const out: number[] = [];
    const n = Math.max(1, Math.round((x1 - x0) / 10.6));
    for (let i = 0; i < n; i++) out.push(x0 + ((x1 - x0) * (i + 0.5)) / n);
    return out;
  };
  const clerestoryRun = (a: V2, b: V2, out: V2, winCenters: number[]) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const dir: V2 = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
    const surf = planeSurface(a, dir, out);
    const wins: Opening[] = winCenters.map((c) => {
      const s = (c - (dir[0] !== 0 ? a[0] : a[1])) * (dir[0] !== 0 ? dir[0] : dir[1]);
      return { s0: s - 1.6, s1: s + 1.6, y0: clerY0 + 3.0, y1: clerY0 + 5.2, head: "segment", rise: 1.5 } as Opening;
    }).filter((o) => o.s0 > 0.5 && o.s1 < L - 0.5);
    stone.withPaint({ joint: JOINT.ashlar }, () => stripPanel(stone, surf, 0, L, clerY0, clerY1, wins, 1.5));
    for (const o of wins) {
      const outl = openingOutline(o, 10);
      stone.withPaint({ joint: JOINT.blocks, cav: 0.6 }, () => revealOnSurface(stone, surf, outl, 0.8));
      ctx.g("glass").withPaint({ cav: 1 }, () => fillOnSurface(ctx.g("glass"), surf, outl, 0.8));
    }
    // cornice at the eaves
    stone.withPaint({ joint: JOINT.blocks }, () => stone.sweep({ pts: [[0, clerY1 - 0.6], [0.25, clerY1 - 0.45], [0.45, clerY1 - 0.1], [0.45, clerY1], [0, clerY1]] }, [a, b], false, { flip: false }));
  };
  const naveX0 = -69.0, naveX1 = -18.8, choirX0 = 18.8, choirX1 = APSE.cx;
  for (const s of [-1, 1]) {
    // nave and choir (outward = s * z); the loop direction must keep (dz, -dx) outward
    const na: V2 = s < 0 ? [naveX0, -zc] : [naveX1, zc];
    const nb: V2 = s < 0 ? [naveX1, -zc] : [naveX0, zc];
    clerestoryRun(na, nb, [0, s], bays(naveX0, naveX1));
    const ca: V2 = s < 0 ? [choirX0, -zc] : [choirX1, zc];
    const cb: V2 = s < 0 ? [choirX1, -zc] : [choirX0, zc];
    clerestoryRun(ca, cb, [0, s], bays(choirX0, choirX1));
    // transepts (outward = s * x)
    for (const t of [-1, 1]) {
      const z0 = t * 18.8, z1 = t * 36.2;
      const ta: V2 = [s * zc, s > 0 ? Math.min(z0, z1) : Math.max(z0, z1)];
      const tb: V2 = [s * zc, s > 0 ? Math.max(z0, z1) : Math.min(z0, z1)];
      // for the east wall (s=+1) the wall runs +z for outward +x: (dz,-dx) = (+,0) ✓
      clerestoryRun(ta, tb, [s, 0], []);
    }
  }

  // --- flying buttresses over the aisles at every bay division
  const divisions = [...PLAN.naveGroups, ...PLAN.choirGroups].filter((x) => Math.abs(x) > 20 && x < 58);
  for (const x of divisions) {
    for (const s of [-1, 1]) buttress(ctx, x, s);
  }

  // --- main roofs (low-pitched, lead) over nave, choir and transepts
  const ridge = ELEV.mainRoofRidge, eaves = ELEV.mainRoofEaves;
  const gable = (x0: number, x1: number, alongX: boolean) => {
    lead.withPaint({ cav: 1 }, () => {
      if (alongX) {
        lead.polyN([[x0, eaves, -zc - 0.4], [x1, eaves, -zc - 0.4], [x1, ridge, 0], [x0, ridge, 0]], [0, 1, -0.4]);
        lead.polyN([[x0, ridge, 0], [x1, ridge, 0], [x1, eaves, zc + 0.4], [x0, eaves, zc + 0.4]], [0, 1, 0.4]);
      } else {
        lead.polyN([[-zc - 0.4, eaves, x0], [-zc - 0.4, eaves, x1], [0, ridge, x1], [0, ridge, x0]], [-0.4, 1, 0]);
        lead.polyN([[0, ridge, x0], [0, ridge, x1], [zc + 0.4, eaves, x1], [zc + 0.4, eaves, x0]], [0.4, 1, 0]);
      }
    });
  };
  gable(naveX0, -17.5, true);
  gable(17.5, choirX1, true);
  gable(-37.6, -17.5, false);
  gable(17.5, 37.6, false);
  // apse: a half cone
  lead.withPaint({ cav: 1 }, () => {
    const n = 16;
    for (let i = 0; i < n; i++) {
      const a0 = -Math.PI / 2 + (i / n) * Math.PI, a1 = -Math.PI / 2 + ((i + 1) / n) * Math.PI;
      const r = zc + 0.4;
      lead.polyN([[choirX1 + Math.cos(a0) * r, eaves, Math.sin(a0) * r], [choirX1 + Math.cos(a1) * r, eaves, Math.sin(a1) * r], [choirX1, ridge, 0]], [Math.cos((a0 + a1) / 2), 1.2, Math.sin((a0 + a1) / 2)]);
    }
  });
  // crossing roof around the drum
  const sq: V2[] = [[-24.8, -24.8], [24.8, -24.8], [24.8, 24.8], [-24.8, 24.8]];
  lead.withPaint({ cav: 0.95 }, () => lead.cap(sq, 31.05, true));
  // west block: flat lead between the towers and over the chapels
  lead.withPaint({ cav: 0.95 }, () => lead.cap([[-84.2, -27.2], [-53.7, -27.2], [-53.7, 27.2], [-84.2, 27.2]], yTop - 0.05, true));
}

/** A flying buttress spanning the aisle roof from the screen wall to the clerestory. */
function buttress(ctx: Ctx, x: number, s: number) {
  const stone = ctx.g("stone");
  const z0 = s * (PLAN.aisleWall - 1.15), z1 = s * PLAN.clerestory;
  const yLow = ELEV.aisleRoof;
  const n = 10;
  const w = 0.55;
  // an inclined arch: top edge straight, underside a quarter ellipse
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    const za = z0 + (z1 - z0) * t0, zb = z0 + (z1 - z0) * t1;
    const topA = 26.5 + 3.2 * t0, topB = 26.5 + 3.2 * t1;
    const botA = yLow + 4.3 * Math.sqrt(Math.max(0, 1 - (1 - t0) ** 2)), botB = yLow + 4.3 * Math.sqrt(Math.max(0, 1 - (1 - t1) ** 2));
    stone.withPaint({ joint: JOINT.blocks, cav: 0.9 }, () => {
      const zlo = Math.min(za, zb), zhi = Math.max(za, zb);
      stone.box(x - w / 2, Math.min(botA, botB), zlo, x + w / 2, Math.max(topA, topB), zhi);
    });
  }
  // pier on the screen wall side
  stone.withPaint({ joint: JOINT.ashlar }, () => stone.box(x - 0.9, yLow, Math.min(z0, z0 + s * 1.3), x + 0.9, 27.0, Math.max(z0, z0 + s * 1.3)));
}
