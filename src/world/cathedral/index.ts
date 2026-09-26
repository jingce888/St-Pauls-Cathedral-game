import * as THREE from "three";
import type { App } from "../../app/App";
import { Ctx } from "./kit";
import { planLoop } from "./plan";
import { buildWalls } from "./walls";
import { buildWestFront } from "./westFront";
import { buildPorticoes } from "./porticoes";
import { buildDome } from "./dome";
import { buildRoofs } from "./roofs";
import { buildInterior } from "./interior";
import { buildStairs, type StairInfo } from "./stairs";
import { FLOOR } from "../dims";
import { WEST_SIDE_DOOR } from "./interior";
import type { V2 } from "../../core/math";

export interface CathedralResult {
  group: THREE.Group;
  collision: THREE.BufferGeometry;
  report: Record<string, number>;
  stairs: StairInfo;
}

/** Builds the whole cathedral (exterior shell, west front, porticoes, dome, roofs). */
export function buildCathedral(app: App, parts: ((ctx: Ctx) => void)[] = []): CathedralResult {
  const ctx = new Ctx(app.mats);
  const faces = planLoop();
  buildWalls(ctx, faces);
  buildWestFront(ctx);
  buildPorticoes(ctx);
  buildRoofs(ctx, faces);
  buildDome(ctx);
  const stairs = buildStairs(ctx);
  buildInterior(ctx);
  // collision: the outer walls, except the west porch which leads to the great west door
  const col = ctx.col;
  const wallCol = (a: V2, b: V2, out: V2) => col.polyN([[a[0], -3, a[1]], [b[0], -3, b[1]], [b[0], FLOOR + 5, b[1]], [a[0], FLOOR + 5, a[1]]], [out[0], 0, out[1]]);
  for (const f of faces) {
    if (f.kind === "W") continue; // built below, with the porch and the side doors
    if (f.kind === "T") {
      // the transept doors (|x| < 1.55)
      const sx = Math.sign(f.b[0] - f.a[0]);
      wallCol(f.a, [-sx * 1.55, f.a[1]], f.out);
      wallCol([sx * 1.55, f.a[1]], f.b, f.out);
      continue;
    }
    wallCol(f.a, f.b, f.out);
  }
  for (const s of [-1, 1]) {
    // west face beside the porch with its side door, porch side walls, the back wall with the great door
    const d0 = WEST_SIDE_DOOR - 1.2, d1 = WEST_SIDE_DOOR + 1.2;
    wallCol([-83.05, s * 6.3], [-83.05, s * d0], [-1, 0]);
    wallCol([-83.05, s * d1], [-83.05, s * 13.45], [-1, 0]);
    col.polyN([[-83.1, -3, s * 6.3], [-79.0, -3, s * 6.3], [-79.0, FLOOR + 5, s * 6.3], [-83.1, FLOOR + 5, s * 6.3]], [0, 0, -s]);
    col.polyN([[-79.0, -3, s * 2.15], [-79.0, -3, s * 6.3], [-79.0, FLOOR + 5, s * 6.3], [-79.0, FLOOR + 5, s * 2.15]], [-1, 0, 0]);
    col.polyN([[-79.05, -3, s * 2.15], [-77.35, -3, s * 2.15], [-77.35, FLOOR + 5, s * 2.15], [-79.05, FLOOR + 5, s * 2.15]], [0, 0, -s]);
  }
  for (const p of parts) p(ctx);
  const group = new THREE.Group();
  group.name = "cathedral";
  const report = ctx.finish(group);
  const collision = ctx.col.build();
  return { group, collision, report, stairs };
}
