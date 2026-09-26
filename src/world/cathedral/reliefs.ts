import type * as THREE from "three";
import type { V2, V3 } from "../../core/math";
import { GeoBuilder, JOINT } from "../../geo/Builder";
import { panelFrame, type Frame, type Relief } from "../../geo/relief";
import type { MatKey } from "../../gfx/materials";
import type { Ctx } from "./kit";
import { acanthusBand, fameSpandrel, keystoneCherub, pierDrop } from "./sculpture";

/** Builds a relief panel into the building: bottom-centre c on a wall facing n (plan normal). */
export function placeRelief(ctx: Ctx, rel: Relief, c: V3, n: V2, mat: MatKey = "stone", opts: { cavK?: number; cavR?: number } = {}) {
  const b = ctx.g(mat);
  let tris = 0;
  b.withPaint({ joint: JOINT.none, cav: 1 }, () => {
    tris = rel.build(b, panelFrame(c, n, rel.w), opts);
  });
  return tris;
}

/** Instanced relief prototype: local +z out of the wall, origin at (ox, oy) of the panel. */
function reliefGeo(rel: Relief, ox: number, oy: number): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.paint = { joint: JOINT.none, expo: 1, cav: 1 };
  const frame: Frame = { o: [-ox, -oy, 0], ex: [1, 0, 0], ey: [0, 1, 0], ez: [0, 0, 1] };
  rel.build(b, frame, { cavR: 0.05, cavK: 6 });
  return b.build();
}

/** Cherub head keystone, head centred on the origin (about 1.3 m across the wings at scale 1). */
export const cherubGeo = () => reliefGeo(keystoneCherub(), 0.65, 0.4);

/** Drop of fruit and flowers hanging from the origin (w x len metres). */
export const dropGeo = (w: number, len: number, seed: number) => reliefGeo(pierDrop(w, len, 0.028, seed), w / 2, len);

/** Band of carved acanthus standing on the origin (w x h metres): pipe shades, cresting. */
export const bandGeo = (w: number, h: number, seed: number, res = 0.024) => reliefGeo(acanthusBand(w, h, res, seed), w / 2, 0);

/** Spandrel Fame for an arcade arch of radius 3.75: origin at the arch centre, figure towards local +x (or -x). */
export const fameGeo = (mirror: boolean) => reliefGeo(fameSpandrel(4.72, 5.25, 3.97, mirror), mirror ? 4.72 : 0, 0);
