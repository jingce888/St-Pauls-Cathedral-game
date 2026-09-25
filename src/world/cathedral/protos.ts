import * as THREE from "three";
import { GeoBuilder, JOINT } from "../../geo/Builder";
import type { V2 } from "../../core/math";
import { rng } from "../../core/rng";

/**
 * Carved elements repeated hundreds of times, built once in unit-ish local space and instanced.
 * Local frame: y up, +z faces outward (towards the viewer), origin at the base centre.
 */

const TAU = Math.PI * 2;

/** Lathe helper with sampled circle. */
function lathe(b: GeoBuilder, prof: V2[], segs: number, smooth: boolean | boolean[] = true) {
  b.lathe(prof, segs, { smooth });
}

/**
 * Corinthian (or Composite, with larger volutes) capital for a column whose upper shaft radius is
 * `r` (the lower diameter D ~ 2.4 r). Height ~1.17 D.
 */
export function capitalGeo(opts: { composite?: boolean; flat?: boolean; detail?: number } = {}): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.paint = { joint: JOINT.none, expo: 1, cav: 1 };
  const D = 1; // lower diameter = 1
  const r0 = 0.42 * D; // necking radius
  const H = 1.17 * D;
  const abH = 0.16 * D;
  const bellTop = H - abH;
  const segs = opts.detail === 0 ? 12 : 20;
  // astragal at the necking
  lathe(b, [[r0, 0], [r0 + 0.035, 0.02], [r0 + 0.035, 0.06], [r0, 0.08]], segs, true);
  // bell (kalathos), slightly flared
  const bell: V2[] = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    bell.push([r0 + 0.1 * t * t, 0.08 + (bellTop - 0.08) * t]);
  }
  b.withPaint({ cav: 0.55 }, () => lathe(b, bell, segs, true));

  const leafRows = opts.flat ? [0] : [0, 1];
  const nLeaves = 8;
  for (const row of leafRows.concat(opts.flat ? [1] : [])) {
    const h = row === 0 ? 0.42 : 0.72;
    const rot = row === 0 ? 0 : Math.PI / nLeaves;
    for (let k = 0; k < nLeaves; k++) {
      const a = rot + (k / nLeaves) * TAU;
      leaf(b, a, r0 + 0.01, 0.1, h, 0.34 * (row === 0 ? 1 : 0.9), 0.16 + row * 0.02);
    }
  }
  // caulicoli + volutes (helices) at the four corners, under the abacus horns
  const vol = opts.composite ? 0.19 : 0.12;
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    volute(b, a, r0 + 0.08, bellTop - 0.02, vol);
    // small inner helices towards the centre of each face
    if (!opts.composite) volute(b, a + 0.33, r0 + 0.06, bellTop - 0.05, 0.06, true);
    if (!opts.composite) volute(b, a - 0.33, r0 + 0.06, bellTop - 0.05, 0.06, true);
  }
  if (opts.composite) {
    // Ionic echinus with egg-and-dart band
    lathe(b, [[r0 + 0.1, bellTop - 0.2], [r0 + 0.16, bellTop - 0.15], [r0 + 0.16, bellTop - 0.09], [r0 + 0.1, bellTop - 0.06]], segs, true);
  }
  // abacus: concave sides, chamfered horns
  const s = 0.72 * D; // half diagonal-ish size of the abacus square
  const outline: V2[] = [];
  const nSide = 6;
  for (let side = 0; side < 4; side++) {
    const ang = (side * Math.PI) / 2;
    const cs = Math.cos(ang), sn = Math.sin(ang);
    for (let i = 0; i <= nSide; i++) {
      const t = i / nSide; // along the side from one horn to the next
      const u = (t - 0.5) * 2 * s * 0.92;
      const inset = 0.11 * (1 - (2 * t - 1) ** 2);
      const x = s - inset, y = u;
      outline.push([x * cs - y * sn, x * sn + y * cs]);
    }
  }
  b.prism(outline, bellTop, bellTop + abH * 0.55, { top: false, bottom: true });
  // abacus moulding (ovolo on top)
  const out2 = outline.map(([x, z]) => [x * 0.97, z * 0.97] as V2);
  b.prism(out2, bellTop + abH * 0.55, H, { top: true });
  // fleurons in the middle of each face
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    const c = Math.cos(a), sn = Math.sin(a);
    const rr = s - 0.11 + 0.035;
    b.at(rr * c, bellTop + abH * 0.3, -rr * sn, 0, () => {
      const p: V2[] = [];
      for (let i = 0; i <= 5; i++) {
        const t = -Math.PI / 2 + (i / 5) * Math.PI;
        p.push([Math.max(0.002, 0.05 * Math.cos(t)), 0.05 * Math.sin(t)]);
      }
      b.lathe(p, 8, { smooth: true });
    });
  }
  const g = b.build();
  if (opts.flat) {
    // pilaster capital: squash the depth and cut the back half into the wall
    const pos = g.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.max(-0.02, pos.getZ(i)) * 0.42);
    pos.needsUpdate = true;
    g.computeBoundingSphere();
  }
  return g;
}

/** One acanthus leaf rising from the bell and curling outwards at its tip. */
function leaf(b: GeoBuilder, ang: number, rBase: number, y0: number, h: number, w: number, curl: number) {
  const nu = 4, nv = 6;
  const c = Math.cos(ang), s = -Math.sin(ang);
  // local frame: radial (c, s), tangent (-s, c)
  const idx: number[][] = [];
  for (let j = 0; j <= nv; j++) {
    idx.push([]);
    const t = j / nv;
    const width = w * (1 - 0.55 * t * t) * (j === nv ? 0.35 : 1);
    const out = rBase + 0.02 + curl * Math.pow(t, 2.6) + 0.1 * t * 0.3;
    const y = y0 + h * t - curl * 0.5 * Math.pow(t, 4);
    for (let i = 0; i <= nu; i++) {
      const u = i / nu - 0.5;
      // convex leaf with a midrib; lobed edge
      const bulge = 0.035 * (1 - 4 * u * u) + 0.012 * Math.cos(u * 18 + t * 9);
      const rr = out + bulge;
      const tx = u * width;
      const px = c * rr - s * tx, pz = s * rr + c * tx;
      // normal: roughly radial, tilted upward at the curl
      const tilt = 0.25 + 1.2 * Math.pow(t, 3);
      const nx = c, nz = s;
      const l = Math.hypot(1, tilt);
      idx[j].push(b.v(px, y, pz, (nx + u * 0.6 * -s) / l, tilt / l, (nz + u * 0.6 * c) / l, u * width, y));
    }
  }
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      b.orientQuad(idx[j][i], idx[j][i + 1], idx[j + 1][i + 1], idx[j + 1][i]);
      // back face so the curl reads from above as well
    }
  }
}

/** A volute: a tapering scroll curling under the abacus horn. */
function volute(b: GeoBuilder, ang: number, r: number, y: number, size: number, small = false) {
  const c = Math.cos(ang), s = -Math.sin(ang);
  const steps = small ? 8 : 12;
  const turns = small ? 1.1 : 1.6;
  const ring = 6;
  let prev: number[] | null = null;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const th = t * turns * TAU;
    const rad = size * (1 - 0.8 * t);
    // spiral in the vertical plane containing the radial direction
    const rr = r + size * 0.9 + Math.cos(th) * rad * 0.6 + (small ? 0 : size * 0.4 * (1 - t));
    const yy = y - size * 0.3 + Math.sin(th) * rad * 0.6 - size * 0.6 * t;
    const thick = size * 0.28 * (1 - 0.6 * t);
    const cur: number[] = [];
    for (let k = 0; k < ring; k++) {
      const a = (k / ring) * TAU;
      const ox = Math.cos(a) * thick, oy = Math.sin(a) * thick;
      // ring in the plane perpendicular to the spiral tangent (approx: radial/vertical plane), extruded tangentially
      const px = c * (rr + ox * 0.3) + -s * oy * 1.6;
      const pz = s * (rr + ox * 0.3) + c * oy * 1.6;
      const nx = c * Math.cos(a) * 0.3 - s * Math.sin(a), nz = s * Math.cos(a) * 0.3 + c * Math.sin(a);
      cur.push(b.v(px, yy + oy * 0.2, pz, nx, 0.3, nz, a, yy));
    }
    if (prev) {
      for (let k = 0; k < ring; k++) b.orientQuad(prev[k], prev[(k + 1) % ring], cur[(k + 1) % ring], cur[k]);
    }
    prev = cur;
  }
}

/** Baluster (vase form), height 0.86 with square plinth and cap blocks. LOD 0 detailed, 1 coarse. */
export function balusterGeo(lod: 0 | 1): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.paint = { joint: JOINT.none, expo: 1, cav: 1 };
  const segs = lod === 0 ? 12 : 6;
  const prof: V2[] = lod === 0
    ? [[0.085, 0.07], [0.1, 0.09], [0.1, 0.12], [0.075, 0.15], [0.105, 0.24], [0.125, 0.33], [0.118, 0.42], [0.085, 0.52], [0.058, 0.62], [0.05, 0.68], [0.068, 0.71], [0.078, 0.74], [0.07, 0.78]]
    : [[0.09, 0.07], [0.12, 0.3], [0.1, 0.46], [0.052, 0.66], [0.075, 0.78]];
  b.lathe(prof, segs, { smooth: true });
  // square plinth and cap blocks
  b.box(-0.11, 0, -0.11, 0.11, 0.07, 0.11, "ny");
  b.box(-0.1, 0.78, -0.1, 0.1, 0.86, 0.1, "py");
  return b.build();
}

/** A stone urn / vase with gadrooned belly and lid, height ~1.6 (scaled when placed). */
export function urnGeo(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.paint = { joint: JOINT.none, expo: 1, cav: 1 };
  b.box(-0.28, 0, -0.28, 0.28, 0.14, 0.28, "ny");
  const prof: V2[] = [
    [0.2, 0.14], [0.2, 0.2], [0.1, 0.28], [0.09, 0.34], [0.16, 0.38], [0.3, 0.52], [0.36, 0.7], [0.33, 0.9], [0.24, 1.02],
    [0.28, 1.06], [0.28, 1.12], [0.2, 1.16], [0.12, 1.26], [0.1, 1.34], [0.14, 1.4], [0.08, 1.5], [0.02, 1.58], [0.001, 1.6],
  ];
  b.lathe(prof, 20, { smooth: [false, false, true, true, true, true, true, true, false, false, false, true, true, true, true, true, true, true] });
  // gadroons: vertical lobes on the belly
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * TAU;
    b.at(Math.cos(a) * 0.3, 0.52, -Math.sin(a) * 0.3, a + Math.PI / 2, () => {
      b.lathe([[0.001, 0], [0.05, 0.05], [0.065, 0.2], [0.045, 0.36], [0.001, 0.4]], 6, { smooth: true });
    }, 1);
  }
  return b.build();
}

/**
 * A standing draped figure (saint, apostle, evangelist) ~ 1 unit tall at the shoulders' scale;
 * variants change the pose of the arms and the fall of the robe.
 */
export function statueGeo(variant: number): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.paint = { joint: JOINT.none, expo: 1, cav: 1 };
  const r = rng(1000 + variant * 17);
  // plinth
  b.box(-0.32, 0, -0.26, 0.32, 0.12, 0.26, "ny");
  // robe: a lathe with folds (displaced afterwards)
  const robe: V2[] = [[0.3, 0.12], [0.29, 0.3], [0.25, 0.7], [0.22, 1.05], [0.23, 1.3], [0.24, 1.45], [0.2, 1.55], [0.1, 1.6], [0.001, 1.61]];
  b.lathe(robe, 18, { smooth: true });
  // head + neck
  b.at(0, 1.6, 0.01, 0, () => b.lathe([[0.06, 0], [0.065, 0.06], [0.1, 0.1], [0.11, 0.19], [0.09, 0.27], [0.05, 0.31], [0.001, 0.32]], 12, { smooth: true }));
  // arms: tapered cylinders
  const arm = (side: number, lift: number, fwd: number) => {
    const sh = new THREE.Vector3(side * 0.22, 1.47, 0);
    const el = new THREE.Vector3(side * 0.28, 1.47 - 0.3 + lift * 0.25, 0.08 + fwd * 0.1);
    const ha = new THREE.Vector3(side * (0.2 + lift * 0.12), 1.47 - 0.45 + lift * 0.62, 0.22 + fwd * 0.18);
    limb(b, sh, el, 0.075, 0.065);
    limb(b, el, ha, 0.065, 0.05);
    // hand / attribute (book, sword, staff) as a small block
    b.obox(ha.x, ha.y, ha.z, 0.05, 0.06, 0.04, 0);
  };
  arm(-1, r() * 0.6, r());
  arm(1, 0.3 + r() * 0.9, r());
  // mantle drape across the body
  b.at(0, 0.9, 0.05, 0.3 * (r() - 0.5), () => {
    b.lathe([[0.001, 0], [0.18, 0.1], [0.26, 0.35], [0.24, 0.55], [0.001, 0.6]], 10, { smooth: true });
  }, 1);
  const g = b.build();
  // folds: vertical ridges on the robe
  const pos = g.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (y > 0.12 && y < 1.5) {
      const a = Math.atan2(z, x);
      const k = 0.018 * Math.sin(a * 9 + variant) * (1.5 - y);
      const l = Math.hypot(x, z) || 1;
      pos.setX(i, x + (x / l) * k);
      pos.setZ(i, z + (z / l) * k);
    }
  }
  g.computeVertexNormals();
  return g;
}

function limb(b: GeoBuilder, a: THREE.Vector3, c: THREE.Vector3, r0: number, r1: number) {
  const dir = c.clone().sub(a);
  const len = dir.length();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  const m = new THREE.Matrix4().compose(a, q, new THREE.Vector3(1, 1, 1));
  b.with(m, () => b.lathe([[0.001, -r0 * 0.5], [r0, 0], [r1, len], [0.001, len + r1 * 0.5]], 8, { smooth: true }));
}

/** Cornice bracket (modillion): an S-scrolled block, 1 unit long (projection). */
export function modillionGeo(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.paint = { joint: JOINT.none, expo: 0.1, cav: 0.8 };
  // side profile in (z = projection, y = height), extruded across x
  const prof: V2[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const z = t;
    const y = -0.18 - 0.22 * (1 - t) - 0.08 * Math.sin(t * Math.PI * 1.5) * (1 - t);
    prof.push([z, y]);
  }
  const w = 0.16;
  // bottom scroll surface
  const idxL: number[] = [], idxR: number[] = [];
  for (let i = 0; i < prof.length; i++) {
    const [z, y] = prof[i];
    const nz = i < prof.length - 1 ? prof[i + 1][1] - y : 0;
    idxL.push(b.v(-w, y, z, 0, -1, nz * 3, z, 0));
    idxR.push(b.v(w, y, z, 0, -1, nz * 3, z, 1));
  }
  for (let i = 0; i < prof.length - 1; i++) b.orientQuad(idxL[i], idxR[i], idxR[i + 1], idxL[i + 1]);
  // sides
  for (const sx of [-w, w]) {
    const pts: [number, number, number][] = prof.map(([z, y]) => [sx, y, z]);
    pts.push([sx, 0, 1], [sx, 0, 0]);
    b.polyOriented(pts.reverse(), [Math.sign(sx), 0, 0]);
  }
  // front face
  b.poly([[-w, prof[prof.length - 1][1], 1], [w, prof[prof.length - 1][1], 1], [w, 0, 1], [-w, 0, 1]]);
  return b.build();
}

/** A carved festoon (swag) of fruit and flowers hanging between two points 1 unit apart. */
export function festoonGeo(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.paint = { joint: JOINT.none, expo: 0.4, cav: 0.85 };
  const n = 18, ring = 7;
  let prev: number[] | null = null;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = t - 0.5;
    const y = -0.28 * Math.sin(t * Math.PI);
    const thick = 0.035 + 0.075 * Math.sin(t * Math.PI);
    const cur: number[] = [];
    for (let k = 0; k < ring; k++) {
      const a = (k / ring) * TAU;
      const lump = 1 + 0.25 * Math.sin(i * 2.7 + k * 1.9);
      const oy = Math.cos(a) * thick * lump, oz = Math.abs(Math.sin(a)) * thick * lump * 0.9;
      cur.push(b.v(x, y + oy, oz, 0, Math.cos(a), Math.abs(Math.sin(a)) + 0.2, t, y));
    }
    if (prev) for (let k = 0; k < ring; k++) b.orientQuad(prev[k], prev[(k + 1) % ring], cur[(k + 1) % ring], cur[k]);
    prev = cur;
  }
  // hanging drops at both ends
  for (const sx of [-0.5, 0.5]) {
    b.at(sx, -0.02, 0.02, 0, () => b.lathe([[0.001, -0.36], [0.03, -0.3], [0.045, -0.18], [0.04, -0.05], [0.03, 0], [0.001, 0.02]], 7, { smooth: true }));
  }
  return b.build();
}

/** Gilded pine-cone finial of the west towers, ~2.6 m tall. */
export function pineappleGeo(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.paint = { joint: JOINT.none, expo: 1, cav: 1 };
  const prof: V2[] = [[0.25, 0], [0.3, 0.1], [0.12, 0.3], [0.15, 0.45], [0.42, 0.75], [0.46, 1.1], [0.38, 1.5], [0.24, 1.85], [0.1, 2.15], [0.02, 2.45], [0.001, 2.6]];
  b.lathe(prof, 24, { smooth: true });
  const g = b.build();
  const pos = g.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (y > 0.5 && y < 2.3) {
      const a = Math.atan2(z, x);
      const k = 1 + 0.07 * Math.abs(Math.sin(a * 6 + y * 9)) * Math.sin(y * 14);
      pos.setX(i, x * k);
      pos.setZ(i, z * k);
    }
  }
  g.computeVertexNormals();
  return g;
}
