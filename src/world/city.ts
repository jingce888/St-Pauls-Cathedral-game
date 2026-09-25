import * as THREE from "three";
import { patchMaterial, type MaterialSet } from "../gfx/materials";
import { hash2 } from "../core/rng";
import { GeoBuilder, JOINT } from "../geo/Builder";
import { pointInPoly, type V2 } from "../core/math";
import type { Terrain } from "./terrain";
import { FACADE, ROOF, type BuildingPart, type CityData } from "./cityData";

/**
 * The City around the cathedral from OpenStreetMap: ~50,000 building parts extruded from their
 * footprints with flat, gabled, hipped and domed roofs, rooftop plant rooms, and one facade
 * shader that draws floors, window bays, shopfronts, curtain walls and lit offices at night.
 * Near the cathedral every wall gets its own whole number of window bays so windows never
 * straddle a corner; further out walls share corners to halve the vertex count.
 * Also the Thames with its embankment walls and the bridges.
 */

export const CLS = { stone: 0, brick: 1, glass: 2, concrete: 3, metal: 4, plaster: 5, church: 6, plant: 7 } as const;
const RC = { flat: 0, slate: 1, lead: 2, copper: 3, tile: 4 } as const;

const TILE = 500;

const PALETTE: Record<number, [number, number, number][]> = {
  [CLS.stone]: [[214, 204, 184], [200, 192, 174], [186, 181, 169], [222, 214, 196], [178, 168, 150]],
  [CLS.brick]: [[152, 116, 84], [138, 84, 62], [118, 70, 54], [166, 134, 98], [100, 72, 60], [128, 104, 86]],
  [CLS.glass]: [[70, 76, 82], [140, 146, 150], [42, 46, 50], [102, 106, 102], [168, 170, 166]],
  [CLS.concrete]: [[152, 150, 144], [128, 126, 120], [172, 168, 160], [140, 136, 126]],
  [CLS.metal]: [[112, 116, 120], [72, 74, 78], [152, 154, 152], [96, 90, 84]],
  [CLS.plaster]: [[230, 224, 210], [216, 210, 192], [234, 232, 226], [208, 196, 172]],
  [CLS.church]: [[206, 197, 178], [170, 160, 140], [190, 182, 166]],
  [CLS.plant]: [[92, 94, 96], [120, 122, 122], [70, 72, 74]],
};

function bayWidth(cls: number, s: number): number {
  switch (cls) {
    case CLS.glass: return 1.5;
    case CLS.metal: return 1.5;
    case CLS.stone: return 2.1 + 0.9 * s;
    case CLS.brick: return 1.8 + 0.7 * s;
    case CLS.concrete: return 1.9 + 1.1 * s;
    case CLS.plaster: return 2.0 + 0.6 * s;
    case CLS.church: return 4.2;
    default: return 1.2;
  }
}

function facadeClass(b: BuildingPart, s: number): number {
  if (b.flags & 2) return CLS.church;
  switch (b.mat) {
    case FACADE.stone: return CLS.stone;
    case FACADE.brick: return CLS.brick;
    case FACADE.glass: return CLS.glass;
    case FACADE.concrete: return CLS.concrete;
    case FACADE.metal: return CLS.metal;
    case FACADE.plaster: return CLS.plaster;
  }
  const h = b.h;
  if (h > 70) return s < 0.72 ? CLS.glass : s < 0.86 ? CLS.metal : CLS.concrete;
  if (h > 32) return s < 0.45 ? CLS.glass : s < 0.72 ? CLS.stone : s < 0.86 ? CLS.concrete : CLS.metal;
  if (h > 15) return s < 0.38 ? CLS.stone : s < 0.62 ? CLS.brick : s < 0.78 ? CLS.glass : s < 0.9 ? CLS.concrete : CLS.plaster;
  return s < 0.46 ? CLS.brick : s < 0.74 ? CLS.stone : s < 0.88 ? CLS.plaster : CLS.concrete;
}

function roofClass(b: BuildingPart, s: number): number {
  if (b.roof === ROOF.flat || b.roof === ROOF.skillion || b.roof === ROOF.round) return RC.flat;
  if (b.rcol) {
    const [r, g, bl] = b.rcol;
    if (g > r + 15 && g >= bl) return RC.copper;
    if (r > g + 30 && r > bl + 30) return RC.tile;
    return r + g + bl > 330 ? RC.lead : RC.slate;
  }
  if (b.roof === ROOF.dome) return b.flags & 2 || s < 0.5 ? RC.copper : RC.lead;
  return s < 0.7 ? RC.slate : s < 0.85 ? RC.tile : RC.lead;
}

/** Growable vertex/index buffers of one city tile. */
class TileBuf {
  pos = new Float32Array(3 * 4096);
  fac = new Float32Array(2 * 4096);
  info = new Uint8Array(4 * 4096);
  col = new Uint8Array(4 * 4096);
  idx = new Uint32Array(3 * 8192);
  nv = 0;
  ni = 0;
  private grow() {
    const g = <T extends Float32Array | Uint8Array | Uint32Array>(a: T, n: number): T => {
      const b = new (a.constructor as new (n: number) => T)(n);
      b.set(a);
      return b;
    };
    const cap = (this.pos.length / 3) * 2;
    this.pos = g(this.pos, cap * 3);
    this.fac = g(this.fac, cap * 2);
    this.info = g(this.info, cap * 4);
    this.col = g(this.col, cap * 4);
  }
  v(x: number, y: number, z: number, u: number, w: number, info: Uint8Array, col: Uint8Array): number {
    if (this.nv * 3 + 3 > this.pos.length) this.grow();
    const i = this.nv++;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.fac[i * 2] = u;
    this.fac[i * 2 + 1] = w;
    this.info.set(info, i * 4);
    this.col.set(col, i * 4);
    return i;
  }
  t(a: number, b: number, c: number) {
    if (this.ni + 3 > this.idx.length) {
      const n = new Uint32Array(this.idx.length * 2);
      n.set(this.idx);
      this.idx = n;
    }
    this.idx[this.ni++] = a;
    this.idx[this.ni++] = b;
    this.idx[this.ni++] = c;
  }
  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.pos.slice(0, this.nv * 3), 3));
    g.setAttribute("aFac", new THREE.BufferAttribute(this.fac.slice(0, this.nv * 2), 2));
    g.setAttribute("aInfo", new THREE.BufferAttribute(this.info.slice(0, this.nv * 4), 4, true));
    g.setAttribute("aCol", new THREE.BufferAttribute(this.col.slice(0, this.nv * 4), 4, true));
    const idx = this.nv < 65536 ? new Uint16Array(this.idx.subarray(0, this.ni)) : this.idx.slice(0, this.ni);
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

const ringArea = (r: V2[]) => {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1];
  return a / 2;
};

/** Flat array -> points, dropping duplicates and (optionally) nearly collinear points. */
function toRing(a: Float32Array, simplify: number): V2[] {
  const pts: V2[] = [];
  for (let i = 0; i < a.length; i += 2) {
    const p: V2 = [a[i], a[i + 1]];
    const q = pts[pts.length - 1];
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.05) pts.push(p);
  }
  while (pts.length > 2 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 0.05) pts.pop();
  if (simplify > 0 && pts.length > 4) {
    for (let i = 0; i < pts.length && pts.length > 4; ) {
      const a0 = pts[(i + pts.length - 1) % pts.length], b0 = pts[i], c0 = pts[(i + 1) % pts.length];
      const ex = c0[0] - a0[0], ez = c0[1] - a0[1];
      const L = Math.hypot(ex, ez) || 1e-9;
      const d = Math.abs(ex * (a0[1] - b0[1]) - (a0[0] - b0[0]) * ez) / L;
      if (d < simplify) pts.splice(i, 1);
      else i++;
    }
  }
  return pts;
}

export interface CityOptions {
  radius: number;
  /** Within this distance walls get whole window bays and roofs get plant rooms. */
  nearRadius: number;
  /** Within this distance walls are added to the collision mesh. */
  collideRadius: number;
}

export interface CityResult {
  group: THREE.Group;
  collision: THREE.BufferGeometry;
  stats: { parts: number; tiles: number; vertices: number; triangles: number };
}

export function buildCity(data: CityData, terrain: Terrain, mats: MaterialSet, opts: CityOptions): CityResult {
  const tiles = new Map<string, TileBuf>();
  const colPos: number[] = [];
  const info = new Uint8Array(4), col = new Uint8Array(4);
  let parts = 0;

  const tileOf = (x: number, z: number) => {
    const k = `${Math.floor(x / TILE)},${Math.floor(z / TILE)}`;
    let t = tiles.get(k);
    if (!t) tiles.set(k, (t = new TileBuf()));
    return t;
  };

  for (const b of data.buildings) {
    const near0 = b.outer.length >= 2 ? Math.hypot(b.outer[0], b.outer[1]) : 1e9;
    // beyond the city radius only the skyline (towers) is kept
    const tall = b.h >= 45;
    if (near0 > opts.radius + 400 && !tall) continue;
    const far = near0 > opts.nearRadius + 200;
    let outer = toRing(b.outer, far ? 0.6 : 0.02);
    if (outer.length < 3) continue;
    let cx = 0, cz = 0;
    for (const p of outer) { cx += p[0]; cz += p[1]; }
    cx /= outer.length;
    cz /= outer.length;
    const d = Math.hypot(cx, cz);
    if (d > opts.radius && !tall) continue;
    let area = ringArea(outer);
    if (Math.abs(area) < (d > 2200 ? 60 : 4)) continue;
    if (area < 0) { outer = outer.reverse(); area = -area; }
    const holes = b.holes.map((h) => toRing(h, far ? 0.6 : 0.02)).filter((h) => h.length >= 3).map((h) => (ringArea(h) > 0 ? h.reverse() : h));

    const s = hash2(Math.round(cx * 10), Math.round(cz * 10));
    const cls = facadeClass(b, s);
    const rcls = roofClass(b, hash2(Math.round(cz * 7), Math.round(cx * 3)));
    let g = Infinity;
    for (const p of outer) g = Math.min(g, terrain.height(p[0], p[1]));
    const roofH = b.roof && b.roof !== ROOF.skillion && b.roof !== ROOF.round ? (b.roofH > 0 ? b.roofH : Math.min(6, (b.h - b.minH) * 0.3)) : 0;
    const wallTopV = b.h - roofH;
    const y0 = b.minH > 0.01 ? g + b.minH : g - 2.5;
    const v0 = b.minH > 0.01 ? b.minH : -2.5;
    const yT = g + wallTopV;
    if (yT - y0 < 0.8) continue;

    // attributes
    const pal = PALETTE[cls];
    const pc = pal[Math.floor(hash2(Math.round(cx), 71) * pal.length) % pal.length];
    if (b.col && cls !== CLS.glass) {
      col[0] = Math.round(b.col[0] * 0.7 + pc[0] * 0.3);
      col[1] = Math.round(b.col[1] * 0.7 + pc[1] * 0.3);
      col[2] = Math.round(b.col[2] * 0.7 + pc[2] * 0.3);
    } else {
      col[0] = pc[0]; col[1] = pc[1]; col[2] = pc[2];
    }
    col[3] = 255;
    info[0] = cls;
    info[1] = Math.floor(s * 255);
    info[2] = Math.min(255, Math.round(wallTopV / 2));
    info[3] = rcls;
    const bay = bayWidth(cls, hash2(Math.round(cx), Math.round(cz)));
    const tb = tileOf(cx, cz);
    parts++;

    // walls
    const tops: number[][] = [];
    for (const ring of [outer, ...holes]) {
      const n = ring.length;
      const top: number[] = [];
      if (!far) {
        for (let i = 0; i < n; i++) {
          const a = ring[i], c = ring[(i + 1) % n];
          const L = Math.hypot(c[0] - a[0], c[1] - a[1]);
          const nb = L < bay * 0.6 ? 0 : Math.max(1, Math.round(L / bay));
          const A0 = tb.v(a[0], y0, a[1], 0, v0, info, col);
          const B0 = tb.v(c[0], y0, c[1], nb, v0, info, col);
          const B1 = tb.v(c[0], yT, c[1], nb, wallTopV, info, col);
          const A1 = tb.v(a[0], yT, a[1], 0, wallTopV, info, col);
          tb.t(A0, B1, B0);
          tb.t(A0, A1, B1);
          top.push(A1);
        }
      } else {
        let u = 0;
        let pb = -1, pt = -1;
        for (let i = 0; i <= n; i++) {
          const a = ring[i % n];
          if (i > 0) {
            const q = ring[i - 1];
            u += Math.hypot(a[0] - q[0], a[1] - q[1]) / bay;
          }
          const vb = tb.v(a[0], y0, a[1], u, v0, info, col);
          const vt = tb.v(a[0], yT, a[1], u, wallTopV, info, col);
          if (i < n) top.push(vt);
          if (i > 0) {
            tb.t(pb, vt, vb);
            tb.t(pb, pt, vt);
          }
          pb = vb;
          pt = vt;
        }
      }
      tops.push(top);
    }

    // roof
    const topY = yT;
    const apexY = g + b.h;
    const upTri = (a: number, bb: number, c: number) => {
      const P = tb.pos;
      const ax = P[a * 3], az = P[a * 3 + 2];
      const cr = (P[bb * 3 + 2] - az) * (P[c * 3] - ax) - (P[bb * 3] - ax) * (P[c * 3 + 2] - az);
      if (cr >= 0) tb.t(a, bb, c);
      else tb.t(a, c, bb);
    };
    const flatCap = () => {
      const contour = outer.map((p) => new THREE.Vector2(p[0], p[1]));
      const hs = holes.map((h) => h.map((p) => new THREE.Vector2(p[0], p[1])));
      const flat = tops.flat();
      for (const [a, bb, c] of THREE.ShapeUtils.triangulateShape(contour, hs)) upTri(flat[a], flat[bb], flat[c]);
    };
    if (roofH > 0.3 && holes.length === 0) {
      if (b.roof === ROOF.gabled && outer.length === 4) {
        // ridge along the longer axis, gable ends as blank walls
        const t = tops[0];
        const L01 = Math.hypot(outer[1][0] - outer[0][0], outer[1][1] - outer[0][1]);
        const L12 = Math.hypot(outer[2][0] - outer[1][0], outer[2][1] - outer[1][1]);
        const k = L01 >= L12 ? 0 : 1;
        const p = (i: number) => outer[(i + k) % 4];
        const ti = (i: number) => t[(i + k) % 4];
        const m12: V2 = [(p(1)[0] + p(2)[0]) / 2, (p(1)[1] + p(2)[1]) / 2];
        const m30: V2 = [(p(3)[0] + p(0)[0]) / 2, (p(3)[1] + p(0)[1]) / 2];
        const r1 = tb.v(m12[0], apexY, m12[1], 0.5, b.h, info, col);
        const r2 = tb.v(m30[0], apexY, m30[1], 0.5, b.h, info, col);
        upTri(ti(0), ti(1), r1); upTri(ti(0), r1, r2);
        upTri(ti(2), ti(3), r2); upTri(ti(2), r2, r1);
        // gables (vertical): orient outward like the walls
        tb.t(ti(1), r1, ti(2));
        tb.t(ti(3), r2, ti(0));
      } else if (b.roof === ROOF.dome) {
        // three rings approaching the apex
        let prev = tops[0];
        const n = outer.length;
        for (const [f, h] of [[0.86, 0.45], [0.58, 0.8], [0.28, 0.96]] as const) {
          const ring = outer.map((p) => tb.v(cx + (p[0] - cx) * f, topY + roofH * h, cz + (p[1] - cz) * f, 0, b.h, info, col));
          for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            tb.t(prev[i], ring[j], prev[j]);
            tb.t(prev[i], ring[i], ring[j]);
          }
          prev = ring;
        }
        const apex = tb.v(cx, apexY, cz, 0, b.h, info, col);
        for (let i = 0; i < n; i++) upTri(prev[i], prev[(i + 1) % n], apex);
      } else {
        // hipped / pyramidal / other pitched shapes: a pyramid to the centroid
        const apex = tb.v(cx, apexY, cz, 0, b.h, info, col);
        const t = tops[0];
        for (let i = 0; i < t.length; i++) upTri(t[i], t[(i + 1) % t.length], apex);
      }
    } else {
      flatCap();
    }

    // rooftop plant rooms on big flat roofs near the cathedral
    if (!far && roofH === 0 && area > 260 && b.h > 11) {
      const r = hash2(Math.round(cx * 3), Math.round(cz * 3));
      const nBox = area > 1400 ? 2 : 1;
      for (let k = 0; k < nBox; k++) {
        const w = Math.sqrt(area) * (0.18 + 0.14 * hash2(k, Math.round(cx)));
        const dd = Math.sqrt(area) * (0.12 + 0.12 * hash2(Math.round(cz), k));
        const ox = cx + (k === 0 ? 0 : (r - 0.5) * Math.sqrt(area) * 0.4);
        const oz = cz + (k === 0 ? 0 : (hash2(k, 9) - 0.5) * Math.sqrt(area) * 0.4);
        const hB = 2.2 + 2.2 * hash2(Math.round(ox), Math.round(oz));
        const rot = Math.atan2(outer[1][1] - outer[0][1], outer[1][0] - outer[0][0]);
        const c = Math.cos(rot), sn = Math.sin(rot);
        const corners: V2[] = [[-w, -dd], [w, -dd], [w, dd], [-w, dd]].map(([x, z]) => [ox + x * c - z * sn, oz + x * sn + z * c] as V2);
        if (!corners.every((p) => pointInPoly(p[0], p[1], outer))) continue;
        const pi = new Uint8Array([CLS.plant, info[1], Math.min(255, Math.round((wallTopV + hB) / 2)), RC.flat]);
        const pcol = new Uint8Array([...PALETTE[CLS.plant][Math.floor(r * 3) % 3], 255]);
        const bt: number[] = [];
        for (let i = 0; i < 4; i++) {
          const a = corners[i], cc = corners[(i + 1) % 4];
          const L = Math.hypot(cc[0] - a[0], cc[1] - a[1]);
          const A0 = tb.v(a[0], yT - 0.2, a[1], 0, wallTopV, pi, pcol);
          const B0 = tb.v(cc[0], yT - 0.2, cc[1], L, wallTopV, pi, pcol);
          const B1 = tb.v(cc[0], yT + hB, cc[1], L, wallTopV + hB, pi, pcol);
          const A1 = tb.v(a[0], yT + hB, a[1], 0, wallTopV + hB, pi, pcol);
          if (ringArea(corners) > 0) { tb.t(A0, B1, B0); tb.t(A0, A1, B1); } else { tb.t(A0, B0, B1); tb.t(A0, B1, A1); }
          bt.push(A1);
        }
        upTri(bt[0], bt[1], bt[2]);
        upTri(bt[0], bt[2], bt[3]);
      }
    }

    // collision: walls up to head height and a bit
    if (d < opts.collideRadius && b.minH < 2.6) {
      for (const ring of [outer, ...holes]) {
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i], c = ring[(i + 1) % ring.length];
          const ya = g - 1, yb = Math.min(yT, g + 8);
          colPos.push(a[0], ya, a[1], c[0], ya, c[1], c[0], yb, c[1], a[0], ya, a[1], c[0], yb, c[1], a[0], yb, a[1]);
        }
      }
    }
  }

  const group = new THREE.Group();
  group.name = "city";
  const mat = makeBuildingMaterial();
  let vertices = 0, triangles = 0;
  for (const [key, tb] of tiles) {
    if (tb.ni === 0) continue;
    const mesh = new THREE.Mesh(tb.geometry(), mat);
    mesh.name = `city:${key}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    vertices += tb.nv;
    triangles += tb.ni / 3;
  }

  const collision = new THREE.BufferGeometry();
  collision.setAttribute("position", new THREE.BufferAttribute(new Float32Array(colPos), 3));

  // the river, its embankments and bridges
  buildRiver(group, data, terrain, mats);

  return { group, collision, stats: { parts, tiles: tiles.size, vertices, triangles } };
}

// ------------------------------------------------------------------------------ river

function buildRiver(group: THREE.Group, data: CityData, terrain: Terrain, mats: MaterialSet) {
  const rings = data.river.map((r) => toRing(r, 0)).filter((r) => r.length >= 3);
  if (!rings.length) return;
  // the largest ring is the river; rings inside it are islands and piers
  rings.sort((a, b) => Math.abs(ringArea(b)) - Math.abs(ringArea(a)));
  const polys: { outer: V2[]; holes: V2[][] }[] = [];
  for (const r of rings) {
    const host = polys.find((p) => pointInPoly(r[0][0], r[0][1], p.outer));
    if (host) host.holes.push(r);
    else polys.push({ outer: r, holes: [] });
  }
  const W = terrain.water, B = terrain.bank;
  const water = new GeoBuilder();
  for (const p of polys) water.cap(p.outer, W, true, p.holes);
  const wm = new THREE.Mesh(water.build(), makeWaterMaterial());
  wm.name = "thames";
  wm.receiveShadow = true;
  group.add(wm);

  // embankment walls along the banks (not along the edge of the data)
  const wall = new GeoBuilder();
  const edge = 4390;
  wall.withPaint({ joint: JOINT.ashlar, cav: 0.95 }, () => {
    for (const p of polys) {
      for (const ring of [p.outer, ...p.holes]) {
        const inside = ringArea(ring) > 0 === ringArea(p.outer) > 0;
        const n = ring.length;
        for (let i = 0; i < n; i++) {
          const a = ring[i], c = ring[(i + 1) % n];
          if ((Math.abs(a[0]) > edge || Math.abs(a[1]) > edge) && (Math.abs(c[0]) > edge || Math.abs(c[1]) > edge)) continue;
          const dx = c[0] - a[0], dz = c[1] - a[1];
          const L = Math.hypot(dx, dz);
          if (L < 0.01) continue;
          // normal towards the water
          let nx = -dz / L, nz = dx / L;
          if (!inside) { nx = -nx; nz = -nz; }
          if (ringArea(p.outer) < 0) { nx = -nx; nz = -nz; }
          const t = 0.6;
          const top = B + 1.05;
          wall.polyN([[a[0], W - 2, a[1]], [c[0], W - 2, c[1]], [c[0], top, c[1]], [a[0], top, a[1]]], [nx, 0, nz]);
          wall.polyN([[a[0] - nx * t, top, a[1] - nz * t], [c[0] - nx * t, top, c[1] - nz * t], [c[0], top, c[1]], [a[0], top, a[1]]], [0, 1, 0]);
          wall.polyN([[a[0] - nx * t, B - 0.5, a[1] - nz * t], [c[0] - nx * t, B - 0.5, c[1] - nz * t], [c[0] - nx * t, top, c[1] - nz * t], [a[0] - nx * t, top, a[1] - nz * t]], [-nx, 0, -nz]);
        }
      }
    }
  });
  const em = new THREE.Mesh(wall.build(), mats.darkStone);
  em.name = "embankment";
  em.castShadow = true;
  em.receiveShadow = true;
  group.add(em);

  // bridges over the river: decks at road level with a parapet line
  const deck = new GeoBuilder(), side = new GeoBuilder();
  const deckY = B + 2.6;
  for (const br of data.bridges) {
    let o = toRing(br.outer, 0.2);
    if (o.length < 3) continue;
    let cx = 0, cz = 0;
    for (const p of o) { cx += p[0]; cz += p[1]; }
    cx /= o.length;
    cz /= o.length;
    if (!polys.some((p) => pointInPoly(cx, cz, p.outer) && !p.holes.some((h) => pointInPoly(cx, cz, h)))) continue;
    if (ringArea(o) < 0) o = o.reverse();
    deck.withPaint({ cav: 1 }, () => deck.cap(o, deckY, true));
    side.withPaint({ joint: JOINT.blocks, cav: 0.9 }, () => {
      side.prism(o, deckY - 1.6, deckY + 0.9, { top: false, bottom: true });
    });
  }
  const dm = new THREE.Mesh(deck.build(), mats.asphalt);
  dm.name = "bridge-decks";
  dm.receiveShadow = true;
  const sm = new THREE.Mesh(side.build(), mats.darkStone);
  sm.name = "bridge-sides";
  sm.castShadow = sm.receiveShadow = true;
  group.add(dm, sm);
}

// ------------------------------------------------------------------------------ materials

const BLD_VERT_PARS = /* glsl */ `
attribute vec2 aFac;
attribute vec4 aInfo;
attribute vec4 aCol;
varying vec2 vFac;
varying vec4 vInfo;
varying vec4 vCol;
`;
const BLD_VERT_MAIN = /* glsl */ `
vFac = aFac;
vInfo = aInfo;
vCol = aCol;
`;
const BLD_PARS = /* glsl */ `
varying vec2 vFac;
varying vec4 vInfo;
varying vec4 vCol;
float bh(float s, float k) { return fract(sin(s * 91.345 + k * 47.853) * 43758.5453); }
`;

const BLD_ALBEDO = /* glsl */ `
  vec3 wp = vWorldPos;
  vec3 fN = normalize(cross(dFdx(wp), dFdy(wp)));
  float cls = floor(vInfo.x * 255.0 + 0.5);
  float seed = vInfo.y * 255.0 + 0.37;
  float wallTop = vInfo.z * 510.0;
  float rcls = floor(vInfo.w * 255.0 + 0.5);
  vec3 base = pow(vCol.rgb, vec3(2.2));
  if (abs(fN.y) > 0.3) {
    vec2 p = wp.xz;
    float n = texture2D(uNoise, p * 0.043).r;
    float g = texture2D(uNoise, p * 0.61).b;
    vec3 rc;
    float rr = 0.8;
    if (rcls < 0.5) {
      float t = bh(seed, 3.0);
      rc = t < 0.42 ? vec3(0.05, 0.05, 0.053) : t < 0.72 ? vec3(0.12, 0.118, 0.11) : t < 0.9 ? vec3(0.2, 0.195, 0.18) : vec3(0.06, 0.085, 0.045);
      rc *= 0.82 + 0.3 * n;
      rc *= 1.0 - 0.3 * step(0.78, texture2D(uNoise, p * 0.13 + seed * 0.01).g);
      rr = 0.85;
    } else if (rcls < 1.5) { rc = vec3(0.042, 0.047, 0.055) * (0.85 + 0.3 * n); rr = 0.5; }
    else if (rcls < 2.5) { rc = vec3(0.14, 0.145, 0.145) * (0.85 + 0.3 * n); rr = 0.5; }
    else if (rcls < 3.5) { rc = vec3(0.1, 0.23, 0.17) * (0.85 + 0.3 * n); rr = 0.6; }
    else { rc = vec3(0.24, 0.09, 0.05) * (0.85 + 0.3 * n); rr = 0.8; }
    diffuseColor.rgb = rc * (0.9 + 0.2 * g);
    surfRough = rr;
  } else {
    float u = vFac.x, v = vFac.y;
    bool isGlass = cls > 1.5 && cls < 2.5;
    bool isMetal = cls > 3.5 && cls < 4.5;
    bool isChurch = cls > 5.5 && cls < 6.5;
    bool isPlant = cls > 6.5;
    float fh = isGlass ? 3.9 + 0.35 * bh(seed, 1.0) : isChurch ? 7.5 : 3.25 + 0.6 * bh(seed, 1.0);
    float gh = isChurch ? 7.5 : fh * (1.25 + 0.25 * bh(seed, 2.0));
    float vv = v < gh ? v / gh : 1.0 + (v - gh) / fh;
    float fy = fract(vv);
    float fl = floor(vv);
    float fx = fract(u);
    vec2 dd = max(fwidth(vec2(u, vv)), vec2(1e-4));
    float ww, wh, wy;
    if (isGlass) { ww = 0.94; wh = 0.72; wy = 0.21; }
    else if (isMetal) { ww = 0.97; wh = 0.42; wy = 0.34; }
    else if (isChurch) { ww = 0.32; wh = 0.62; wy = 0.18; }
    else { ww = 0.38 + 0.25 * bh(seed, 4.0); wh = 0.5 + 0.2 * bh(seed, 5.0); wy = 0.22; }
    if (fl < 1.0 && !isGlass && !isChurch) { ww = 0.84; wh = 0.74; wy = 0.1; }
    float mx = 1.0 - smoothstep(ww * 0.5 - dd.x, ww * 0.5 + dd.x, abs(fx - 0.5));
    float my = 1.0 - smoothstep(wh * 0.5 - dd.y, wh * 0.5 + dd.y, abs(fy - wy - wh * 0.5));
    float top = smoothstep(wallTop - 0.95, wallTop - 0.75, v);
    float win = mx * my * (1.0 - top) * step(0.0, v);
    if (isPlant) win = 0.0;
    float px = max(dd.x, dd.y);
    float avg = ww * wh * (1.0 - top);
    if (isPlant) avg = 0.0;
    float far = smoothstep(0.25, 0.6, px);
    win = mix(win, avg, far);
    float wid = bh(fl * 13.1 + floor(u) * 7.7, seed);
    vec3 glassC = isGlass ? mix(vec3(0.016, 0.028, 0.032), vec3(0.03, 0.028, 0.02), bh(seed, 6.0)) : vec3(0.012, 0.013, 0.015);
    float blind = step(0.7, wid) * (isGlass ? 0.3 : 1.0) * (1.0 - far);
    glassC += blind * vec3(0.1, 0.095, 0.085) * (0.5 + fract(wid * 9.1));
    vec3 wall = base * (0.86 + 0.26 * bh(seed, 9.0));
    float streak = texture2D(uNoise, vec2(u * 0.23 + seed * 0.01, v * 0.045)).a;
    wall *= 0.9 + 0.14 * streak;
    wall *= mix(0.7, 1.0, smoothstep(-0.5, 2.8, v));
    if (!isGlass && !isMetal) wall *= 1.0 - 0.1 * (1.0 - smoothstep(0.0, 0.05 + dd.y, fy)) * (1.0 - far);
    if (isPlant) wall *= 0.8 + 0.2 * step(0.5, fract(v * 5.0));
    wall *= 1.0 + 0.12 * top * (1.0 - far);
    diffuseColor.rgb = mix(wall, glassC, win);
    surfRough = mix(isMetal ? 0.5 : 0.86, 0.06 + 0.06 * wid, win);
    surfMetal = isMetal ? 0.35 * (1.0 - win) : 0.0;
    float lit = step(0.6, bh(wid * 3.3, 11.0)) * win * (1.0 - top);
    surfEmissive = vec3(1.0, 0.8, 0.55) * lit * uNight * 2.2;
  }
`;

export function makeBuildingMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, flatShading: true });
  return patchMaterial(m, {
    key: "building",
    vertPars: BLD_VERT_PARS,
    vertMain: BLD_VERT_MAIN,
    pars: BLD_PARS,
    albedo: BLD_ALBEDO,
  });
}

const WATER_ALBEDO = /* glsl */ `
  vec2 p = vWorldPos.xz;
  float t = uTime;
  float w1 = texture2D(uNoise, p * 0.019 + vec2(t * 0.0045, t * 0.0017)).g;
  float w2 = texture2D(uNoise, p * 0.053 - vec2(t * 0.0031, t * 0.0052)).r;
  float w3 = texture2D(uNoise, p * 0.23 + vec2(t * 0.013, -t * 0.009)).b;
  float dist = length(vWorldPos - cameraPosition);
  float fade = 1.0 - smoothstep(300.0, 2500.0, dist);
  diffuseColor.rgb = vec3(0.021, 0.026, 0.019) * (0.9 + 0.2 * w1);
  surfRough = 0.045 + 0.05 * w2 + 0.05 * (1.0 - fade);
  surfBumpH = (w1 * 0.35 + w2 * 0.14 + w3 * 0.035 * fade) * (0.35 + 0.65 * fade);
`;

export function makeWaterMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.06, metalness: 0 });
  return patchMaterial(m, { key: "water", albedo: WATER_ALBEDO });
}
