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
  for (const f of faces) {
    if (f.kind === "W" && Math.abs(f.a[1] + f.b[1]) / 2 < 6.3) continue;
    col.polyN([[f.a[0], -3, f.a[1]], [f.b[0], -3, f.b[1]], [f.b[0], FLOOR + 5, f.b[1]], [f.a[0], FLOOR + 5, f.a[1]]], [f.out[0], 0, f.out[1]]);
  }
  for (const s of [-1, 1]) {
    // west face beside the porch, porch side walls, and the back wall with the door
    col.polyN([[-83.05, -3, s * 6.3], [-83.05, -3, s * 13.45], [-83.05, FLOOR + 5, s * 13.45], [-83.05, FLOOR + 5, s * 6.3]], [-1, 0, 0]);
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
