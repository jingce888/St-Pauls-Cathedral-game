import * as THREE from "three";
import { patchMaterial } from "../gfx/materials";
import type { Terrain } from "./terrain";
import type { CityData, Churchyard } from "./cityData";

/**
 * The ground: nested rings of height-field mesh centred on the dome (2 m cells over the
 * churchyard, 384 m at the horizon) textured by two "surface maps" rasterised from
 * OpenStreetMap at load time — grass, soil, asphalt, road paint and a contact-shadow term
 * next to buildings. The shader turns them into York stone flags, kerbs, tarmac and lawns.
 */

/** Rings: half-size and cell size. Each half-size is a multiple of the next ring's cell. */
const RINGS: [number, number][] = [
  [192, 2],
  [576, 6],
  [2304, 24],
  [9216, 96],
  [23040, 384],
];

export const NEAR_MAP = { half: 320, size: 2048 };
export const FAR_MAP = { half: 3072, size: 2048 };

export function buildGroundMeshes(terrain: Terrain, mat: THREE.Material): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  for (let k = 0; k < RINGS.length; k++) {
    const [R, s] = RINGS[k];
    const Rin = k > 0 ? RINGS[k - 1][0] : 0;
    const sNext = k + 1 < RINGS.length ? RINGS[k + 1][1] : 0;
    const geo = ringGeometry(terrain, R, Rin, s, sNext);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = `ground:${k}`;
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.frustumCulled = false;
    meshes.push(mesh);
  }
  return meshes;
}

function ringGeometry(t: Terrain, R: number, Rin: number, s: number, sNext: number): THREE.BufferGeometry {
  const rects: [number, number, number, number][] = Rin > 0
    ? [[-R, -R, R, -Rin], [-R, Rin, R, R], [-R, -Rin, -Rin, Rin], [Rin, -Rin, R, Rin]]
    : [[-R, -R, R, R]];
  let nv = 0, ni = 0;
  for (const [x0, z0, x1, z1] of rects) {
    const nx = Math.round((x1 - x0) / s), nz = Math.round((z1 - z0) / s);
    nv += (nx + 1) * (nz + 1);
    ni += nx * nz * 6;
  }
  const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
  const idx = new Uint32Array(ni);
  const n3: [number, number, number] = [0, 1, 0];
  // the outer edge of a ring follows the coarser ring's straight segments (no cracks)
  const hAt = (x: number, z: number) => {
    if (sNext > 0 && (Math.abs(Math.abs(x) - R) < 1e-6 || Math.abs(Math.abs(z) - R) < 1e-6)) {
      const alongX = Math.abs(Math.abs(z) - R) < 1e-6;
      const u = alongX ? x : z;
      const u0 = Math.floor(u / sNext) * sNext;
      const f = (u - u0) / sNext;
      if (f > 1e-6) {
        const a = alongX ? t.height(u0, z) : t.height(x, u0);
        const b = alongX ? t.height(u0 + sNext, z) : t.height(x, u0 + sNext);
        return a + (b - a) * f;
      }
    }
    return t.height(x, z);
  };
  let v = 0, ii = 0;
  for (const [x0, z0, x1, z1] of rects) {
    const nx = Math.round((x1 - x0) / s), nz = Math.round((z1 - z0) / s);
    const base = v;
    for (let j = 0; j <= nz; j++) {
      for (let i = 0; i <= nx; i++) {
        const x = x0 + i * s, z = z0 + j * s;
        pos[v * 3] = x;
        pos[v * 3 + 1] = hAt(x, z);
        pos[v * 3 + 2] = z;
        t.normal(x, z, n3, Math.max(1, s * 0.75));
        nrm[v * 3] = n3[0];
        nrm[v * 3 + 1] = n3[1];
        nrm[v * 3 + 2] = n3[2];
        uv[v * 2] = x;
        uv[v * 2 + 1] = z;
        v++;
      }
    }
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const a = base + j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
        idx[ii++] = a; idx[ii++] = c; idx[ii++] = b;
        idx[ii++] = b; idx[ii++] = c; idx[ii++] = d;
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}

// ------------------------------------------------------------------------------ surface maps

type Pts = ArrayLike<number> | [number, number][];

class MapCanvas {
  readonly cv: HTMLCanvasElement;
  readonly g: CanvasRenderingContext2D;
  readonly k: number;
  constructor(readonly size: number, readonly half: number) {
    this.cv = document.createElement("canvas");
    this.cv.width = this.cv.height = size;
    this.g = this.cv.getContext("2d", { willReadFrequently: true })!;
    this.k = size / (2 * half);
  }
  /** Adds a polyline/polygon to the current path. */
  path(p: Pts, close: boolean) {
    const g = this.g, k = this.k, h = this.half;
    if (Array.isArray(p) && Array.isArray(p[0])) {
      const q = p as [number, number][];
      if (q.length < 2) return;
      g.moveTo((q[0][0] + h) * k, (q[0][1] + h) * k);
      for (let i = 1; i < q.length; i++) g.lineTo((q[i][0] + h) * k, (q[i][1] + h) * k);
    } else {
      const q = p as ArrayLike<number>;
      if (q.length < 4) return;
      g.moveTo((q[0] + h) * k, (q[1] + h) * k);
      for (let i = 2; i < q.length; i += 2) g.lineTo((q[i] + h) * k, (q[i + 1] + h) * k);
    }
    if (close) g.closePath();
  }
  /** True when a flat x,z array touches the canvas. */
  touches(p: Pts, margin = 0): boolean {
    const lim = this.half + margin;
    if (Array.isArray(p) && Array.isArray(p[0])) return (p as [number, number][]).some(([x, z]) => Math.abs(x) < lim && Math.abs(z) < lim);
    const q = p as ArrayLike<number>;
    for (let i = 0; i < q.length; i += 2) if (Math.abs(q[i]) < lim && Math.abs(q[i + 1]) < lim) return true;
    return false;
  }
  fillAreas(list: { outer: Pts; holes?: Pts[] }[], style: string) {
    const g = this.g;
    g.fillStyle = style;
    for (const a of list) {
      if (!this.touches(a.outer, 50)) continue;
      g.beginPath();
      this.path(a.outer, true);
      for (const h of a.holes ?? []) this.path(h, true);
      g.fill("evenodd");
    }
  }
  strokeLines(list: { pts: Pts; w: number }[], style: string, minPx = 0.6) {
    const g = this.g;
    g.strokeStyle = style;
    g.lineCap = "round";
    g.lineJoin = "round";
    // batch by width (canvas strokes one width per path)
    const byW = new Map<number, Pts[]>();
    for (const l of list) {
      if (!this.touches(l.pts, 30)) continue;
      const w = Math.max(minPx, Math.round(l.w * this.k * 4) / 4);
      let arr = byW.get(w);
      if (!arr) byW.set(w, (arr = []));
      arr.push(l.pts);
    }
    for (const [w, arr] of byW) {
      g.lineWidth = w;
      g.beginPath();
      for (const p of arr) this.path(p, false);
      g.stroke();
    }
  }
}

/**
 * Surface map RGBA: R = vegetation, G = asphalt (R and G both = bare soil), B = road paint,
 * A = open sky next to buildings (contact shadow).
 */
function drawSurface(mc: MapCanvas, city: CityData, cy: Churchyard | null, footprints: [number, number][][], detail: boolean): Uint8Array {
  const g = mc.g;
  g.fillStyle = "#000";
  g.fillRect(0, 0, mc.size, mc.size);
  // lawns and parks
  mc.fillAreas(city.green, "#f00");
  if (cy) {
    mc.fillAreas(cy.areas.filter((a) => a.kind === "grass" || a.kind === "scrub").map((a) => ({ outer: a.poly })), "#f00");
    mc.fillAreas(cy.areas.filter((a) => a.kind === "flowerbed").map((a) => ({ outer: a.poly })), "#ff0");
    mc.fillAreas(cy.areas.filter((a) => a.kind === "paved").map((a) => ({ outer: a.poly })), "#000");
  }
  // paths cut through the lawns
  const foot = city.roads.filter((r) => r.cls === 2 && !r.bridge);
  mc.strokeLines(foot, "#000", detail ? 1 : 0.5);
  if (cy) mc.strokeLines(cy.footways.map((f) => ({ pts: f.line, w: f.width })), "#000", 1);
  // carriageways
  const roads = city.roads.filter((r) => r.cls < 2 && !r.bridge);
  mc.strokeLines(roads, "#0f0", 0.8);
  if (cy) mc.fillAreas(cy.areas.filter((a) => a.kind === "road").map((a) => ({ outer: a.poly })), "#0f0");

  // road paint (additive into blue)
  if (detail) {
    g.globalCompositeOperation = "lighter";
    g.strokeStyle = "#00f";
    g.lineCap = "butt";
    const k = mc.k;
    // dashed centre lines on two-way roads
    g.lineWidth = Math.max(0.5, 0.13 * k);
    g.setLineDash([4 * k, 5 * k]);
    g.beginPath();
    for (const r of roads) if (r.w >= 7.5 && mc.touches(r.pts, 10)) mc.path(r.pts, false);
    g.stroke();
    g.setLineDash([]);
    // zebra crossings: 0.6 m bars every 1.2 m across the carriageway
    if (cy) {
      g.fillStyle = "#00f";
      const local = roads.filter((r) => mc.touches(r.pts, 10));
      for (const [cx, cz] of cy.crossings) {
        let best = Infinity, dx = 1, dz = 0, w = 7;
        for (const r of local) {
          const p = r.pts;
          for (let i = 0; i + 3 < p.length; i += 2) {
            const ax = p[i], az = p[i + 1], bx = p[i + 2], bz = p[i + 3];
            const ex = bx - ax, ez = bz - az;
            const l2 = ex * ex + ez * ez;
            if (l2 < 1e-6) continue;
            const tt = Math.max(0, Math.min(1, ((cx - ax) * ex + (cz - az) * ez) / l2));
            const d = Math.hypot(cx - ax - ex * tt, cz - az - ez * tt);
            if (d < best) { best = d; const l = Math.sqrt(l2); dx = ex / l; dz = ez / l; w = r.w; }
          }
        }
        if (best > 1.5) continue;
        const nx = -dz, nz = dx;
        const L = 2.6;
        for (let s = -w / 2 + 0.6; s <= w / 2 - 0.3; s += 1.2) {
          const px = cx + nx * s, pz = cz + nz * s;
          g.beginPath();
          mc.path([
            [px - dx * L / 2 - nx * 0.3, pz - dz * L / 2 - nz * 0.3],
            [px + dx * L / 2 - nx * 0.3, pz + dz * L / 2 - nz * 0.3],
            [px + dx * L / 2 + nx * 0.3, pz + dz * L / 2 + nz * 0.3],
            [px - dx * L / 2 + nx * 0.3, pz - dz * L / 2 + nz * 0.3],
          ], true);
          g.fill();
        }
      }
    }
    g.globalCompositeOperation = "source-over";
  }
  const rgb = g.getImageData(0, 0, mc.size, mc.size).data;

  // contact shadow next to buildings: blurred footprints
  g.fillStyle = "#fff";
  g.fillRect(0, 0, mc.size, mc.size);
  g.fillStyle = "#000";
  // many small paths: Skia fills one huge multi-polygon path very slowly
  let batch = 0;
  g.beginPath();
  for (const b of city.buildings) {
    if (b.minH > 1.5 || !mc.touches(b.outer, 20)) continue;
    mc.path(b.outer, true);
    if (++batch % 64 === 0) {
      g.fill();
      g.beginPath();
    }
  }
  for (const f of footprints) mc.path(f, true);
  g.fill();
  const blurPx = Math.max(1, 2.2 * mc.k);
  const tmp = document.createElement("canvas");
  tmp.width = tmp.height = mc.size;
  const tg = tmp.getContext("2d", { willReadFrequently: true })!;
  tg.filter = `blur(${blurPx.toFixed(1)}px)`;
  tg.drawImage(mc.cv, 0, 0);
  const ao = tg.getImageData(0, 0, mc.size, mc.size).data;

  const out = new Uint8Array(mc.size * mc.size * 4);
  for (let i = 0; i < out.length; i += 4) {
    out[i] = rgb[i];
    out[i + 1] = rgb[i + 1];
    out[i + 2] = rgb[i + 2];
    out[i + 3] = ao[i];
  }
  return out;
}

export interface GroundMaps {
  near: THREE.DataTexture;
  far: THREE.DataTexture;
}

export function buildGroundMaps(city: CityData, cy: Churchyard, footprints: [number, number][][], anisotropy: number, scale = 1): GroundMaps {
  const mk = (data: Uint8Array, size: number) => {
    const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.anisotropy = anisotropy;
    t.needsUpdate = true;
    return t;
  };
  const nSize = Math.round(NEAR_MAP.size * scale), fSize = Math.round(FAR_MAP.size * scale);
  const t0 = performance.now();
  const near = new MapCanvas(nSize, NEAR_MAP.half);
  const nd = drawSurface(near, city, cy, footprints, true);
  const t1 = performance.now();
  const far = new MapCanvas(fSize, FAR_MAP.half);
  const fd = drawSurface(far, city, null, footprints, false);
  if (import.meta.env.DEV) console.debug(`[ground] near map ${(t1 - t0).toFixed(0)} ms, far map ${(performance.now() - t1).toFixed(0)} ms`);
  return { near: mk(nd, nSize), far: mk(fd, fSize) };
}

// ------------------------------------------------------------------------------ material

const GROUND_PARS = /* glsl */ `
uniform sampler2D tSurfN;
uniform sampler2D tSurfF;
uniform vec3 uRectN;
uniform vec3 uRectF;
`;

const GROUND_ALBEDO = /* glsl */ `
  vec2 p = vWorldPos.xz;
  vec2 uN = (p - uRectN.xy) * uRectN.z;
  vec2 uF = (p - uRectF.xy) * uRectF.z;
  vec4 mF = texture2D(tSurfF, uF);
  vec4 mN = texture2D(tSurfN, uN);
  vec2 eN = min(uN, 1.0 - uN);
  float wN = smoothstep(0.0, 0.03, min(eN.x, eN.y));
  vec4 m = mix(mF, mN, wN);
  vec2 eF = min(uF, 1.0 - uF);
  float inF = smoothstep(0.0, 0.05, min(eF.x, eF.y));
  m = mix(vec4(0.35, 0.0, 0.0, 1.0), m, inF);
  float soil = min(m.r, m.g);
  float grass = m.r - soil;
  float asph = m.g - soil;
  float pav = clamp(1.0 - grass - asph - soil, 0.0, 1.0);
  float paint = m.b;
  float ao = m.a;
  vec2 fw = max(fwidth(p), vec2(1e-5));
  float fade = 1.0 - smoothstep(0.02, 0.07, max(fw.x, fw.y));
  float dist = length(vWorldPos - cameraPosition);

  // York stone and concrete flags, 0.9 x 0.6 m, staggered
  float row = floor(p.y / 0.6);
  float off = hash12(vec2(row, 1.7)) * 0.9;
  vec2 cell = vec2(floor((p.x + off) / 0.9), row);
  vec2 f = vec2(fract((p.x + off) / 0.9) * 0.9, fract(p.y / 0.6) * 0.6);
  float jx = 1.0 - smoothstep(0.004, 0.004 + fw.x * 1.5, min(f.x, 0.9 - f.x));
  float jy = 1.0 - smoothstep(0.004, 0.004 + fw.y * 1.5, min(f.y, 0.6 - f.y));
  float j = max(jx, jy) * fade;
  float fh = hash12(cell);
  float n1 = texture2D(uNoise, p * 0.05).r;
  float g1 = texture2D(uNoise, p * 0.9).b;
  float big = texture2D(uNoise, p * 0.0023).g;
  vec3 pc = mix(vec3(0.15, 0.142, 0.128), vec3(0.23, 0.216, 0.192), fh * fade + 0.5 * (1.0 - fade));
  pc = mix(pc, pc * vec3(0.9, 0.94, 0.99), big);
  pc *= 0.9 + 0.14 * n1;
  pc *= 0.94 + 0.1 * g1;
  pc *= 1.0 - 0.16 * smoothstep(0.62, 0.9, texture2D(uNoise, p * 0.11 + 0.5).a);
  // chewing gum
  pc *= 1.0 - 0.35 * step(0.985, hash12(floor(p * 7.0))) * fade;
  pc *= 1.0 - j * 0.32;

  // tarmac with kerbs and gutters along its edges
  float an = texture2D(uNoise, p * 0.07).r, ag = texture2D(uNoise, p * 1.3).b;
  vec3 ac = vec3(0.052, 0.052, 0.055) * (0.85 + 0.3 * an) * (0.9 + 0.2 * ag);
  ac = mix(ac, vec3(0.5, 0.5, 0.48), clamp(paint, 0.0, 1.0) * (0.75 + 0.25 * ag));
  float kerb = smoothstep(0.04, 0.2, m.g) * (1.0 - smoothstep(0.3, 0.48, m.g)) * (1.0 - m.r);
  float gutter = smoothstep(0.5, 0.6, m.g) * (1.0 - smoothstep(0.62, 0.8, m.g));
  ac *= 1.0 - 0.3 * gutter;

  // grass and soil
  float gn = texture2D(uNoise, p * 0.04).r, gm = texture2D(uNoise, p * 0.3).g, gg = texture2D(uNoise, p * 3.1).b;
  vec3 gc = mix(vec3(0.045, 0.1, 0.022), vec3(0.1, 0.155, 0.04), gn);
  gc = mix(gc, vec3(0.12, 0.12, 0.055), smoothstep(0.65, 0.95, gm) * 0.5);
  gc *= 0.8 + 0.4 * gg;
  vec3 sc = vec3(0.085, 0.062, 0.045) * (0.8 + 0.4 * gg);

  vec3 col = pc * pav + ac * asph + gc * grass + sc * soil;
  col = mix(col, vec3(0.25, 0.245, 0.235) * (0.9 + 0.2 * g1), kerb * fade);
  col *= mix(0.7, 1.0, ao);
  diffuseColor.rgb = col;
  surfRough = pav * (0.8 + 0.1 * g1) + asph * mix(0.88, 0.6, paint) + grass * 0.95 + soil * 0.9;
  float nearK = 1.0 - smoothstep(15.0, 45.0, dist);
  surfBumpH = (pav * (-j * 0.003 + g1 * 0.0004) + asph * ag * 0.0006 + grass * gg * 0.004) * nearK;
  surfAO = ao;
`;

export function makeGroundMaterial(maps: GroundMaps): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 });
  const rect = (half: number) => new THREE.Vector3(-half, -half, 1 / (2 * half));
  return patchMaterial(m, {
    key: "ground",
    pars: GROUND_PARS,
    albedo: GROUND_ALBEDO,
    uniforms: {
      tSurfN: { value: maps.near },
      tSurfF: { value: maps.far },
      uRectN: { value: rect(NEAR_MAP.half) },
      uRectF: { value: rect(FAR_MAP.half) },
    },
  });
}
