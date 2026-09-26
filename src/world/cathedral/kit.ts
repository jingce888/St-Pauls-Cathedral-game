import * as THREE from "three";
import { GeoBuilder, JOINT } from "../../geo/Builder";
import type { MaterialSet, MatKey } from "../../gfx/materials";
import type { V2, V3 } from "../../core/math";
import { atticBaseLathe, atticBaseSweep } from "../../geo/profiles";
import type { Surface } from "../../geo/surface";
import { balusterGeo, capitalGeo, festoonGeo, modillionGeo, pineappleGeo, statueGeo, urnGeo } from "./protos";
import { bandGeo, cherubGeo, dropGeo, fameGeo } from "./reliefs";

/** Instanced prototypes: one InstancedMesh per prototype and material. */
export class Instances {
  private defs = new Map<string, { geo: () => THREE.BufferGeometry; mat: MatKey; shadow: boolean }>();
  private items = new Map<string, THREE.Matrix4[]>();
  define(name: string, geo: () => THREE.BufferGeometry, mat: MatKey, shadow = true) {
    this.defs.set(name, { geo, mat, shadow });
  }
  add(name: string, pos: V3, rotY = 0, scale: number | V3 = 1, rotX = 0) {
    const s = typeof scale === "number" ? new THREE.Vector3(scale, scale, scale) : new THREE.Vector3(...scale);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rotX, rotY, 0, "YXZ"));
    this.addMatrix(name, new THREE.Matrix4().compose(new THREE.Vector3(...pos), q, s));
  }
  addMatrix(name: string, m: THREE.Matrix4) {
    if (!this.defs.has(name)) throw new Error(`unknown prototype ${name}`);
    let list = this.items.get(name);
    if (!list) this.items.set(name, (list = []));
    list.push(m);
  }
  count(name: string) {
    return this.items.get(name)?.length ?? 0;
  }
  /** Triangles drawn per prototype (all instances), filled by build(). */
  readonly drawn: Record<string, number> = {};
  build(mats: MaterialSet, parent: THREE.Object3D) {
    let tris = 0;
    for (const [name, list] of this.items) {
      const def = this.defs.get(name)!;
      const geo = def.geo();
      const mesh = new THREE.InstancedMesh(geo, mats[def.mat], list.length);
      list.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.castShadow = def.shadow;
      mesh.receiveShadow = true;
      mesh.name = `inst:${name}`;
      parent.add(mesh);
      const t = (geo.index ? geo.index.count / 3 : geo.getAttribute("position").count / 3) * list.length;
      this.drawn[name] = t;
      tris += t;
    }
    return tris;
  }
}

/** Everything a part of the building needs while it is being generated. */
export class Ctx {
  private builders = new Map<MatKey, GeoBuilder>();
  readonly inst = new Instances();
  /** Simplified collision geometry (only where people can walk). */
  readonly col = new GeoBuilder();
  /** Angles (radians, from +x towards +z) of the doors from the Whispering Gallery into the stairs. */
  readonly doors: number[] = [];
  /** Ready-made objects (textured paintings and mosaics) added to the building as they are. */
  readonly extras: THREE.Object3D[] = [];
  /** Baked light per material (second paint channel), applied when the meshes are built. */
  readonly bake = new Map<MatKey, (x: number, y: number, z: number) => number>();

  constructor(readonly mats: MaterialSet) {
    const I = this.inst;
    I.define("capC", () => capitalGeo({}), "stone");
    I.define("capCflat", () => capitalGeo({ flat: true }), "stone");
    I.define("capX", () => capitalGeo({ composite: true }), "stone");
    I.define("capXflat", () => capitalGeo({ composite: true, flat: true }), "stone");
    I.define("baluster", () => balusterGeo(0), "stone");
    I.define("balusterLo", () => balusterGeo(1), "stone");
    I.define("urn", () => urnGeo(), "stone");
    I.define("modillion", () => modillionGeo(), "stone", false);
    I.define("festoon", () => festoonGeo(), "stone", false);
    I.define("pineapple", () => pineappleGeo(), "gold");
    for (let v = 0; v < 4; v++) I.define(`statue${v}`, () => statueGeo(v), "stone");
    I.define("cherub", cherubGeo, "stone", false);
    I.define("cherubInt", cherubGeo, "stoneInt", false);
    I.define("dropL", () => dropGeo(0.52, 3.0, 3), "stone", false);
    I.define("dropU", () => dropGeo(0.44, 2.6, 5), "stone", false);
    I.define("dropInt", () => dropGeo(0.5, 2.4, 7), "stoneInt", false);
    I.define("cherubGold", cherubGeo, "goldInt", false);
    I.define("urnGold", () => urnGeo(), "goldInt", false);
    I.define("capXgold", () => capitalGeo({ composite: true }), "goldInt");
    I.define("statueGold", () => statueGeo(0), "goldInt");
    I.define("shade", () => bandGeo(0.8, 0.55, 11), "goldInt", false);
    I.define("crest", () => bandGeo(1.8, 0.5, 13), "wood", false);
    I.define("festoonInt", () => festoonGeo(), "stoneInt", false);
    I.define("fameR", () => fameGeo(false), "stoneInt", false);
    I.define("fameL", () => fameGeo(true), "stoneInt", false);
  }

  g(m: MatKey = "stone"): GeoBuilder {
    let b = this.builders.get(m);
    if (!b) this.builders.set(m, (b = new GeoBuilder()));
    return b;
  }

  /** Creates the meshes. Returns triangle counts per material. */
  finish(parent: THREE.Object3D, opts: { noShadow?: MatKey[] } = {}) {
    const report: Record<string, number> = {};
    for (const [m, b] of this.builders) {
      if (b.count === 0) continue;
      const bake = this.bake.get(m);
      if (bake) b.mapPaintG(bake);
      const mesh = new THREE.Mesh(b.build(), this.mats[m]);
      mesh.castShadow = !(opts.noShadow ?? []).includes(m) && m !== "glass";
      mesh.receiveShadow = true;
      mesh.name = `geo:${m}`;
      parent.add(mesh);
      report[m] = b.triangles;
    }
    report.instances = this.inst.build(this.mats, parent);
    for (const o of this.extras) parent.add(o);
    return report;
  }
}

// ------------------------------------------------------------------------------------ elements

/** Rotation about Y that turns local +z to the plan direction (x, z). */
export const faceYaw = (out: V2 | V3) => Math.atan2(out[0], out.length === 3 ? (out as V3)[2] : (out as V2)[1]);

/**
 * A pilaster on a surface at arc position s: shaft of width W projecting t from the surface,
 * Attic base, instanced capital. y0 = bottom of the base, y1 = top of the capital.
 */
export function pilaster(ctx: Ctx, surf: Surface, s: number, y0: number, y1: number, W: number, t: number, cap: "capCflat" | "capXflat") {
  const b = ctx.g("stone");
  const baseH = W * 0.5;
  const capH = W * 1.17;
  const n = surf.normal(s), tg = surf.tangent(s);
  const o = surf.point(s, 0);
  const yaw = faceYaw(n);
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(o[0], 0, o[2]),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw),
    new THREE.Vector3(1, 1, 1),
  );
  void tg;
  b.with(m, () => {
    // shaft (local: x along the wall, z outward)
    b.withPaint({ joint: JOINT.ashlar }, () => b.box(-W / 2, y0 + baseH, 0, W / 2, y1 - capH, t, "nz"));
    // base: swept around the three exposed sides
    b.withPaint({ joint: JOINT.blocks }, () =>
      b.sweep(atticBaseSweep(W, y0), [[-W / 2, 0], [-W / 2, t], [W / 2, t], [W / 2, 0]], false, { flip: true }),
    );
  });
  ctx.inst.add(cap, [o[0] + n[0] * (t - 0.01), y1 - capH, o[2] + n[2] * (t - 0.01)], yaw, [W * 0.92, W, W * 0.9]);
}

/** Places pilasters on a pier face of length L (1 or 2, centred). */
export function pilasterGroup(ctx: Ctx, surf: Surface, L: number, y0: number, y1: number, W: number, t: number, cap: "capCflat" | "capXflat") {
  if (L < W + 0.15) return;
  if (L < 2 * W + 0.5) {
    pilaster(ctx, surf, L / 2, y0, y1, W, t, cap);
    return;
  }
  const half = Math.min((L - W) / 2 - 0.12, W * 0.8);
  pilaster(ctx, surf, L / 2 - half, y0, y1, W, t, cap);
  pilaster(ctx, surf, L / 2 + half, y0, y1, W, t, cap);
}

/**
 * Free-standing column: Attic base on a square plinth, shaft with entasis (and optional flutes),
 * astragal, instanced capital. D = lower diameter.
 */
export function column(ctx: Ctx, x: number, z: number, y0: number, y1: number, D: number, opts: { fluted?: boolean; cap?: "capC" | "capX"; yaw?: number; plinth?: boolean; mat?: MatKey } = {}) {
  const b = ctx.g(opts.mat ?? "stone");
  const capH = 1.17 * D;
  const baseH = 0.5 * D;
  const plinthH = opts.plinth === false ? 0 : 0.17 * D;
  const shaft0 = y0 + plinthH + baseH, shaft1 = y1 - capH;
  b.at(x, 0, z, opts.yaw ?? 0, () => {
    if (plinthH > 0) b.withPaint({ joint: JOINT.none }, () => b.box(-0.7 * D, y0, -0.7 * D, 0.7 * D, y0 + plinthH, 0.7 * D, "ny"));
    b.withPaint({ joint: JOINT.none }, () => b.lathe(atticBaseLathe(D, y0 + plinthH).pts, 24, { smooth: atticBaseLathe(D, 0).smooth }));
    shaft(b, D / 2, (D / 2) * 0.84, shaft0, shaft1, opts.fluted ? 24 : 0);
    // astragal
    b.withPaint({ joint: JOINT.none }, () =>
      b.lathe([[D * 0.42, shaft1 - 0.09 * D], [D * 0.455, shaft1 - 0.07 * D], [D * 0.455, shaft1 - 0.02 * D], [D * 0.42, shaft1]], 20, { smooth: true }),
    );
  });
  ctx.inst.add(opts.cap ?? "capC", [x, shaft1, z], opts.yaw ?? 0, D);
  // collision: a simple 12-gon around the lower shaft
  ctx.col.at(x, 0, z, 0, () => ctx.col.cylinder(D * 0.62, y0 - 0.5, y0 + 3.5, 10, true));
}

/** Column shaft with entasis (straight lower third) and optional flutes. */
export function shaft(b: GeoBuilder, r0: number, r1: number, y0: number, y1: number, flutes: number) {
  const rings = 9;
  const segs = flutes > 0 ? flutes * 4 : 28;
  const prof = (t: number) => (t < 1 / 3 ? r0 : r0 - (r0 - r1) * Math.pow((t - 1 / 3) / (2 / 3), 1.4));
  b.withPaint({ joint: JOINT.drums }, () => {
    const idx: number[][] = [];
    for (let j = 0; j <= rings; j++) {
      const t = j / rings;
      const y = y0 + (y1 - y0) * t;
      const r = prof(t);
      idx.push([]);
      for (let k = 0; k <= segs; k++) {
        const a = (k / segs) * Math.PI * 2;
        let rr = r, nx = Math.cos(a), nz = -Math.sin(a);
        if (flutes > 0) {
          // flute: concave channel over 3/4 of the pitch, fillet between
          const ph = ((k % 4) + 4) % 4;
          const depth = r * 0.065;
          if (ph === 1 || ph === 3) rr = r - depth * 0.7;
          else if (ph === 2) rr = r - depth;
          const tw = ph === 1 ? 0.6 : ph === 3 ? -0.6 : 0;
          const c = Math.cos(a), s = -Math.sin(a);
          nx = c - s * tw;
          nz = s + c * tw;
          const l = Math.hypot(nx, nz);
          nx /= l; nz /= l;
        }
        idx[j].push(b.v(rr * Math.cos(a), y, -rr * Math.sin(a), nx, 0, nz, a * r, y));
      }
    }
    for (let j = 0; j < rings; j++) for (let k = 0; k < segs; k++) b.orientQuad(idx[j][k], idx[j][k + 1], idx[j + 1][k + 1], idx[j + 1][k]);
  });
}

/**
 * A balustrade on a surface from s0 to s1 whose foot is at y0: plinth, balusters, coping.
 * `pedestals` lists arc positions of solid pedestals (width pw).
 */
export function balustrade(ctx: Ctx, surf: Surface, s0: number, s1: number, y0: number, opts: { height?: number; pedestals?: number[]; pw?: number; inset?: number; depth?: number; lo?: boolean } = {}) {
  const b = ctx.g("stone");
  const H = opts.height ?? 1.5;
  const depth = opts.depth ?? 0.42;
  const inset = opts.inset ?? 0.1;
  const plinthH = H * 0.16, copingH = H * 0.2;
  const L = s1 - s0;
  if (L < 0.3) return;
  const pw = opts.pw ?? 0.7;
  const n = Math.max(1, Math.ceil(L / 1.0));
  // plinth and coping as boxes along the surface (short straight pieces follow curves)
  for (let i = 0; i < n; i++) {
    const a = s0 + (L * i) / n, c = s0 + (L * (i + 1)) / n;
    slab(b, surf, a, c, y0, y0 + plinthH, -inset, -inset - depth, 0.04);
    slab(b, surf, a, c, y0 + H - copingH, y0 + H, -inset + 0.05, -inset - depth - 0.05, 0.05);
  }
  const peds = (opts.pedestals ?? []).filter((p) => p >= s0 - pw && p <= s1 + pw);
  for (const p of peds) slab(b, surf, Math.max(s0, p - pw / 2), Math.min(s1, p + pw / 2), y0 + plinthH, y0 + H - copingH, -inset + 0.02, -inset - depth - 0.02, 0);
  // balusters
  const spacing = 0.3;
  const hB = H - plinthH - copingH;
  const scale = hB / 0.86;
  const count = Math.floor((L - 0.2) / spacing);
  const off = (L - count * spacing) / 2;
  for (let k = 0; k <= count; k++) {
    const s = s0 + off + k * spacing;
    if (peds.some((p) => Math.abs(p - s) < pw / 2 + 0.12)) continue;
    const q = surf.point(s, y0 + plinthH, -inset - depth / 2);
    const nrm = surf.normal(s);
    ctx.inst.add(opts.lo ? "balusterLo" : "baluster", q, faceYaw(nrm), [scale * 1.1, scale, scale * 1.1]);
  }
}

/**
 * A slab between s0..s1 and y0..y1 whose faces sit at surface depths d0 (front, negative =
 * outward) and d1 (back), with an extra outward overhang on the front.
 */
export function slab(b: GeoBuilder, surf: Surface, s0: number, s1: number, y0: number, y1: number, d0: number, d1: number, over = 0) {
  const front = Math.min(d0, d1) - over, back = Math.max(d0, d1);
  const P = (s: number, y: number, d: number) => surf.point(s, y, d);
  const nm = surf.normal((s0 + s1) / 2), tg = surf.tangent((s0 + s1) / 2);
  const neg = (v: V3): V3 => [-v[0], -v[1], -v[2]];
  const quads: [V3[], V3][] = [
    [[P(s0, y0, front), P(s1, y0, front), P(s1, y1, front), P(s0, y1, front)], nm],
    [[P(s1, y0, back), P(s0, y0, back), P(s0, y1, back), P(s1, y1, back)], neg(nm)],
    [[P(s0, y1, front), P(s1, y1, front), P(s1, y1, back), P(s0, y1, back)], [0, 1, 0]],
    [[P(s0, y0, back), P(s1, y0, back), P(s1, y0, front), P(s0, y0, front)], [0, -1, 0]],
    [[P(s0, y0, back), P(s0, y0, front), P(s0, y1, front), P(s0, y1, back)], neg(tg)],
    [[P(s1, y0, front), P(s1, y0, back), P(s1, y1, back), P(s1, y1, front)], tg],
  ];
  for (const [q, n] of quads) b.polyN(q, n);
}

/** A statue on a plinth (variant chosen by index), facing `yaw`. */
export function statue(ctx: Ctx, pos: V3, yaw: number, height: number, variant: number) {
  ctx.inst.add(`statue${variant % 4}`, pos, yaw, height / 1.92);
}

export { pineappleGeo };
