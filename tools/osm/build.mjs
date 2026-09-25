#!/usr/bin/env node
/**
 * Converts the raw Overpass JSON in tools/osm/raw/ into the game's data files:
 *   public/data/churchyard.json  — paths, lawns, trees, benches, lamps, statues... within 350 m
 *   public/data/city.bin         — buildings, water, parks, roads, rail and bridges (quantised)
 *
 * Coordinates are converted into the cathedral frame used by the game (see src/world/dims.ts):
 * x along the nave axis (6.2° north of east), z to the south, metres, origin on the dome axis.
 * Data © OpenStreetMap contributors, ODbL 1.0.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const RAW = path.join(ROOT, "tools/osm/raw");
const OUT = path.join(ROOT, "public/data");

// --- frame (identical to tools/plan/make_plan.py)
const LAT0 = 51.51385, LON0 = -0.09835, R = 6378137.0;
const CX = 2.681952714039366, CZ = 7.085980902737184, AXIS = -6.201362100796389;
const ca = Math.cos((-AXIS * Math.PI) / 180), sa = Math.sin((-AXIS * Math.PI) / 180);
const cosLat0 = Math.cos((LAT0 * Math.PI) / 180);
function local(lat, lon) {
  const x = ((lon - LON0) * Math.PI) / 180 * R * cosLat0 - CX;
  const z = -((lat - LAT0) * Math.PI) / 180 * R - CZ;
  return [x * ca - z * sa, x * sa + z * ca];
}

function load(name) {
  const f = path.join(RAW, `${name}.json`);
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")).elements;
  // merged tiles if the layer was fetched in tiles but not merged
  const dir = path.join(RAW, `${name}.tiles`);
  if (!fs.existsSync(dir)) return [];
  const seen = new Map();
  for (const t of fs.readdirSync(dir)) for (const e of JSON.parse(fs.readFileSync(path.join(dir, t), "utf8")).elements) seen.set(`${e.type}/${e.id}`, e);
  console.warn(`${name}: using ${fs.readdirSync(dir).length} cached tiles`);
  return [...seen.values()];
}

const round = (v, q = 10) => Math.round(v * q) / q;
const ring = (geom) => geom.filter(Boolean).map((p) => local(p.lat, p.lon)).map(([x, z]) => [round(x), round(z)]);
const closed = (g) => g.length > 3 && g[0] && g[g.length - 1] && g[0].lat === g[g.length - 1].lat && g[0].lon === g[g.length - 1].lon;
const dist = (p) => Math.hypot(p[0], p[1]);

/** Parses "12", "12 m", "12.5m", "40 ft" into metres. */
function metres(v) {
  if (v == null) return null;
  const m = String(v).trim().match(/^(-?[0-9]+(?:[.,][0-9]+)?)\s*(m|ft|')?/i);
  if (!m) return null;
  let x = parseFloat(m[1].replace(",", "."));
  if (m[2] && /ft|'/i.test(m[2])) x *= 0.3048;
  return Number.isFinite(x) ? x : null;
}

/** Multipolygon relation -> list of outer rings with holes. */
function relationRings(e) {
  const outers = [], inners = [];
  for (const m of e.members ?? []) {
    if (m.type !== "way" || !m.geometry) continue;
    if (m.geometry.length < 2 || m.geometry.some((p) => !p)) continue; // clipped member: handled by the river raster
    (m.role === "inner" ? inners : outers).push(m.geometry.map((p) => [p.lat, p.lon]));
  }
  const join = (parts) => {
    // stitch open ways into closed rings
    const rings = [];
    const pool = parts.map((p) => p.slice());
    while (pool.length) {
      let cur = pool.shift();
      let guard = 0;
      while (!(cur[0][0] === cur[cur.length - 1][0] && cur[0][1] === cur[cur.length - 1][1]) && guard++ < 1000) {
        const end = cur[cur.length - 1];
        const i = pool.findIndex((p) => (p[0][0] === end[0] && p[0][1] === end[1]) || (p[p.length - 1][0] === end[0] && p[p.length - 1][1] === end[1]));
        if (i < 0) break;
        let nxt = pool.splice(i, 1)[0];
        if (!(nxt[0][0] === end[0] && nxt[0][1] === end[1])) nxt = nxt.reverse();
        cur = cur.concat(nxt.slice(1));
      }
      if (cur.length >= 4 && cur[0][0] === cur[cur.length - 1][0] && cur[0][1] === cur[cur.length - 1][1]) rings.push(cur);
    }
    return rings.map((r) => r.map(([lat, lon]) => local(lat, lon)).map(([x, z]) => [round(x), round(z)]));
  };
  const out = join(outers), inn = join(inners);
  // assign holes to the outer that contains their first point
  return out.map((o) => ({ outer: o, holes: inn.filter((h) => pointInPoly(h[0], o)) }));
}

function pointInPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if (zi > p[1] !== zj > p[1] && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

// ------------------------------------------------------------------------------ churchyard
function buildChurchyard() {
  const els = load("detail");
  const out = { trees: [], benches: [], lamps: [], bollards: [], statues: [], footways: [], areas: [], barriers: [], steps: [], roads: [], crossings: [] };
  const R_MAX = 360;
  for (const e of els) {
    const t = e.tags ?? {};
    if (e.type === "node") {
      const p = local(e.lat, e.lon).map((v) => round(v));
      if (dist(p) > R_MAX) continue;
      if (t.natural === "tree") out.trees.push([...p, round(metres(t.height) ?? 0), t.genus === "Platanus" || /plane/i.test(t.species ?? t["species:en"] ?? "") ? 1 : 0]);
      else if (t.amenity === "bench") out.benches.push(p);
      else if (t.highway === "street_lamp") out.lamps.push(p);
      else if (t.barrier === "bollard") out.bollards.push(p);
      else if (t.historic === "memorial" || t.tourism === "artwork" || t.historic === "monument") out.statues.push({ p, name: t.name ?? "", kind: t.memorial ?? t.artwork_type ?? t.historic ?? "" });
      else if (t.highway === "crossing") out.crossings.push(p);
      continue;
    }
    if (e.type !== "way" || !e.geometry) continue;
    const g = ring(e.geometry);
    if (!g.length || g.every((p) => dist(p) > R_MAX + 80)) continue;
    const isClosed = closed(e.geometry);
    if (t.highway === "steps") out.steps.push({ line: g, width: metres(t.width) ?? 2.0, incline: t.incline ?? "" });
    else if (t.highway && ["footway", "pedestrian", "path", "cycleway"].includes(t.highway)) {
      if (isClosed && (t.area === "yes" || t.highway === "pedestrian")) out.areas.push({ kind: "paved", poly: g });
      else out.footways.push({ line: g, width: metres(t.width) ?? (t.highway === "pedestrian" ? 6 : 2.2), kind: t.highway });
    } else if (t.highway) {
      const w = metres(t.width) ?? ({ primary: 12, secondary: 10, tertiary: 9, unclassified: 7, residential: 7, service: 5, living_street: 6 }[t.highway] ?? 6);
      out.roads.push({ line: g, width: w, kind: t.highway, oneway: t.oneway === "yes" ? 1 : 0, lanes: +(t.lanes ?? 0) || 0 });
    }
    if (t["area:highway"] && isClosed) out.areas.push({ kind: t["area:highway"] === "footway" ? "paved" : "road", poly: g });
    if (isClosed && (t.landuse === "grass" || t.leisure === "garden" || t.leisure === "park" || t.natural === "scrub" || t.landuse === "flowerbed" || t.natural === "grassland")) {
      out.areas.push({ kind: t.landuse === "flowerbed" ? "flowerbed" : t.natural === "scrub" ? "scrub" : "grass", poly: g });
    }
    if (t.barrier && ["wall", "fence", "retaining_wall", "kerb", "hedge", "railing", "guard_rail"].includes(t.barrier)) {
      out.barriers.push({ line: g, kind: t.barrier, height: metres(t.height) ?? null });
    }
  }
  return out;
}

// ------------------------------------------------------------------------------ city
const ROOF = { flat: 0, gabled: 1, hipped: 2, pyramidal: 3, dome: 4, skillion: 5, round: 6, onion: 4, mansard: 2, gambrel: 1, "half-hipped": 2, cone: 3 };
const PALETTE = { stone: 0, brick: 1, glass: 2, concrete: 3, metal: 4, plaster: 5 };

function colourIndex(t) {
  const m = (t["building:material"] ?? t["building:facade:material"] ?? "").toLowerCase();
  if (m.includes("glass")) return PALETTE.glass;
  if (m.includes("brick")) return PALETTE.brick;
  if (m.includes("stone") || m.includes("sandstone") || m.includes("limestone")) return PALETTE.stone;
  if (m.includes("concrete")) return PALETTE.concrete;
  if (m.includes("metal") || m.includes("steel")) return PALETTE.metal;
  if (m.includes("plaster") || m.includes("render")) return PALETTE.plaster;
  return 255; // unknown
}
function parseColour(c) {
  if (!c) return null;
  const named = { white: "#e8e6e0", black: "#303030", grey: "#8a8a8a", gray: "#8a8a8a", brown: "#6b4a36", red: "#8a3a2c", beige: "#cfc3a3", yellow: "#c8b060", blue: "#4a6a8a", green: "#4a6a4a", silver: "#b8bcc0", cream: "#e6dcc0", tan: "#b89a70", orange: "#b86a3a" };
  const s = (named[c.toLowerCase()] ?? c).trim();
  const m = s.match(/^#?([0-9a-f]{6})$/i) ?? s.match(/^#?([0-9a-f]{3})$/i);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((x) => x + x).join("");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function buildCity() {
  const bld = [...load("buildings"), ...load("skyline")];
  const parts = [];
  const seen = new Set();
  const outlinesWithParts = new Set();
  // building:part presence: skip the plain building outline when parts describe it (Simple 3D Buildings)
  const partBoxes = [];
  for (const e of bld) {
    if (e.tags?.["building:part"] && e.tags["building:part"] !== "no" && e.geometry) {
      const g = ring(e.geometry);
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const [x, z] of g) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      partBoxes.push({ x0, x1, z0, z1, g });
    }
  }
  for (const e of bld) {
    const key = `${e.type}/${e.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const t = e.tags ?? {};
    const isPart = t["building:part"] && t["building:part"] !== "no";
    const isBld = t.building && t.building !== "no";
    const isTower = /^(tower|mast|chimney)$/.test(t.man_made ?? "");
    if (!isPart && !isBld && !isTower) continue;
    if (t.name === "St Paul's Cathedral" || e.id === 369161987) continue; // modelled in detail
    let rings = [];
    if (e.type === "way" && e.geometry && closed(e.geometry)) rings = [{ outer: ring(e.geometry), holes: [] }];
    else if (e.type === "relation") rings = relationRings(e);
    else if (e.type === "node" && isTower) {
      const [x, z] = local(e.lat, e.lon);
      const r = 3;
      rings = [{ outer: Array.from({ length: 8 }, (_, i) => [round(x + r * Math.cos((i / 8) * Math.PI * 2)), round(z + r * Math.sin((i / 8) * Math.PI * 2))]), holes: [] }];
    }
    for (const rg of rings) {
      if (rg.outer.length < 4) continue;
      // skip parts of St Paul's itself (inside its footprint, modelled in detail)
      const c = rg.outer.reduce((a, p) => [a[0] + p[0], a[1] + p[1]], [0, 0]).map((v) => v / rg.outer.length);
      if (c[0] > -88 && c[0] < 72 && Math.abs(c[1]) < 45 && (isPart || t.building === "cathedral")) continue;
      if (c[0] > -88 && c[0] < 72 && Math.abs(c[1]) < 32) continue;
      // outlines whose area is mostly covered by building:parts are represented by those parts
      // (Simple 3D Buildings); a neighbour's part inside the bounding box must not remove it
      if (isBld && !isPart) {
        let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
        for (const [x, z] of rg.outer) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
        let covered = 0;
        for (const b of partBoxes) {
          if (b.x1 < x0 || b.x0 > x1 || b.z1 < z0 || b.z0 > z1) continue;
          const pc = b.g.reduce((a, p) => [a[0] + p[0], a[1] + p[1]], [0, 0]).map((v) => v / b.g.length);
          if (pointInPoly(pc, rg.outer)) covered += Math.abs(polyArea(b.g));
        }
        if (covered > 0.5 * Math.abs(polyArea(rg.outer))) {
          outlinesWithParts.add(key);
          continue;
        }
      }
      const levels = +(t["building:levels"] ?? NaN);
      const minLevel = +(t["building:min_level"] ?? NaN);
      let h = metres(t.height) ?? (Number.isFinite(levels) ? levels * 3.3 + (t["roof:shape"] && t["roof:shape"] !== "flat" ? 2 : 1) : null);
      let minH = metres(t.min_height) ?? (Number.isFinite(minLevel) ? minLevel * 3.3 : 0);
      const est = h == null;
      if (h == null) {
        // estimate from the type and the footprint area in the City (dense, 5-8 storeys)
        const kind = t.building ?? t["building:part"];
        const area = Math.abs(polyArea(rg.outer));
        h = kind === "church" ? 16 : kind === "house" || kind === "terrace" ? 10 : kind === "shed" || kind === "kiosk" || kind === "garage" ? 3.5 : area < 60 ? 8 : 14 + Math.min(12, area / 400);
      }
      if (isTower && !metres(t.height)) h = 30;
      minH = Math.max(0, minH);
      h = Math.min(650, h);
      if (h <= minH + 0.5) continue;
      const roofShape = ROOF[t["roof:shape"]] ?? 0;
      const roofH = metres(t["roof:height"]) ?? (roofShape ? Math.min(6, (h - minH) * 0.3) : 0);
      const col = parseColour(t["building:colour"] ?? t["building:facade:colour"]);
      const rcol = parseColour(t["roof:colour"]);
      parts.push({
        outer: rg.outer, holes: rg.holes, h, minH, roofShape, roofH,
        mat: colourIndex(t), col, rcol, est, name: t.name ?? null,
        church: /church|cathedral|chapel/.test(t.building ?? "") || t.amenity === "place_of_worship",
      });
    }
  }
  console.log(`city: ${parts.length} building parts (${outlinesWithParts.size} outlines replaced by parts)`);

  // water, green, roads, rail, bridges
  const areas = (els, pred) => {
    const out = [];
    for (const e of els) {
      const t = e.tags ?? {};
      if (!pred(t)) continue;
      if (e.type === "way" && e.geometry && closed(e.geometry)) out.push({ outer: ring(e.geometry), holes: [] });
      else if (e.type === "relation") out.push(...relationRings(e));
    }
    return out;
  };
  const water = areas(load("water"), (t) => t.natural === "water" || t.waterway === "riverbank");
  const green = areas(load("green"), (t) => !!(t.leisure || t.landuse || t.natural)).filter((a) => a.outer.length > 3);
  const roadsRaw = load("roads");
  const roads = [];
  const rails = [];
  for (const e of roadsRaw) {
    const t = e.tags ?? {};
    if (e.type !== "way" || !e.geometry) continue;
    if (t.tunnel === "yes" || t.layer && +t.layer < 0) continue;
    const g = ring(e.geometry);
    if (t.railway) { rails.push({ line: g, bridge: t.bridge ? 1 : 0 }); continue; }
    if (!t.highway || t.area === "yes") continue;
    const w = metres(t.width) ?? ({ motorway: 14, trunk: 13, primary: 12, secondary: 10, tertiary: 9, unclassified: 7, residential: 7, service: 4.5, living_street: 6, pedestrian: 6, footway: 2.2, cycleway: 2.5, path: 2, steps: 2 }[t.highway] ?? 5);
    const cls = ["motorway", "trunk", "primary", "secondary", "tertiary"].includes(t.highway) ? 0 : ["unclassified", "residential", "service", "living_street"].includes(t.highway) ? 1 : 2;
    roads.push({ line: g, w, cls, bridge: t.bridge ? 1 : 0 });
  }
  const bridges = [];
  for (const e of load("bridges")) {
    const t = e.tags ?? {};
    if (t.man_made === "bridge") {
      if (e.type === "way" && e.geometry && closed(e.geometry)) bridges.push({ outer: ring(e.geometry), holes: [], name: t.name ?? "" });
      else if (e.type === "relation") for (const r of relationRings(e)) bridges.push({ ...r, name: t.name ?? "" });
    }
  }
  console.log(`water ${water.length}, green ${green.length}, roads ${roads.length}, rail ${rails.length}, bridges ${bridges.length}`);
  return { parts, water, green, roads, rails, bridges };
}

function polyArea(p) {
  let a = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += (p[j][0] + p[i][0]) * (p[j][1] - p[i][1]);
  return a / 2;
}

// ------------------------------------------------------------------------------ binary writer
class W {
  constructor() { this.buf = Buffer.alloc(1 << 20); this.n = 0; }
  ensure(k) { if (this.n + k > this.buf.length) { const b = Buffer.alloc(Math.max(this.buf.length * 2, this.n + k)); this.buf.copy(b, 0, 0, this.n); this.buf = b; } }
  u8(v) { this.ensure(1); this.buf.writeUInt8(v, this.n); this.n += 1; }
  u16(v) { this.ensure(2); this.buf.writeUInt16LE(v, this.n); this.n += 2; }
  i16(v) { this.ensure(2); this.buf.writeInt16LE(Math.max(-32768, Math.min(32767, v)), this.n); this.n += 2; }
  u32(v) { this.ensure(4); this.buf.writeUInt32LE(v, this.n); this.n += 4; }
  str(s) { const b = Buffer.from(s ?? "", "utf8"); this.u8(Math.min(255, b.length)); this.ensure(b.length); b.copy(this.buf, this.n, 0, Math.min(255, b.length)); this.n += Math.min(255, b.length); }
  /** A ring of points, delta-encoded in decimetres (int16 deltas with escape for large steps). */
  ring(pts, q) {
    const clean = pts.slice();
    if (clean.length > 1 && clean[0][0] === clean[clean.length - 1][0] && clean[0][1] === clean[clean.length - 1][1]) clean.pop();
    this.u16(clean.length);
    for (const [x, z] of clean) { this.i16(Math.round(x * q)); this.i16(Math.round(z * q)); }
  }
  done() { return this.buf.subarray(0, this.n); }
}

function writeCity(city) {
  const w = new W();
  w.u32(0x53505443); // "CTPS"
  w.u16(2); // version
  // buildings: near (dm, |coord| < 3276 m) and far (m)
  const near = city.parts.filter((p) => p.outer.every(([x, z]) => Math.abs(x) < 3270 && Math.abs(z) < 3270));
  const far = city.parts.filter((p) => !near.includes(p));
  for (const [list, q] of [[near, 10], [far, 1]]) {
    w.u32(list.length);
    for (const p of list) {
      w.u16(Math.round(p.h * 10));
      w.u16(Math.round(p.minH * 10));
      w.u8(p.roofShape);
      w.u8(Math.min(255, Math.round(p.roofH * 10)));
      w.u8(p.mat);
      w.u8((p.est ? 1 : 0) | (p.church ? 2 : 0) | (p.col ? 4 : 0) | (p.rcol ? 8 : 0));
      if (p.col) { w.u8(p.col[0]); w.u8(p.col[1]); w.u8(p.col[2]); }
      if (p.rcol) { w.u8(p.rcol[0]); w.u8(p.rcol[1]); w.u8(p.rcol[2]); }
      w.u8(p.holes.length);
      w.ring(p.outer, q);
      for (const h of p.holes) w.ring(h, q);
    }
  }
  // areas: water, green, bridges (metre resolution)
  for (const list of [city.water, city.green, city.bridges]) {
    const kept = list.filter((a) => a.outer.some(([x, z]) => Math.abs(x) < 9000 && Math.abs(z) < 9000));
    w.u32(kept.length);
    for (const a of kept) {
      w.u8(a.holes.length);
      w.ring(a.outer.map(([x, z]) => [x, z]), 1);
      for (const h of a.holes) w.ring(h, 1);
    }
  }
  // roads and rail (dm within 3 km)
  const roads = city.roads.filter((r) => r.line.some(([x, z]) => Math.abs(x) < 3200 && Math.abs(z) < 3200));
  w.u32(roads.length);
  for (const r of roads) {
    w.u8(Math.round(r.w * 10));
    w.u8(r.cls | (r.bridge ? 4 : 0));
    w.ring(r.line.map(([x, z]) => [Math.max(-3270, Math.min(3270, x)), Math.max(-3270, Math.min(3270, z))]), 10);
  }
  const rails = city.rails.filter((r) => r.line.some(([x, z]) => Math.abs(x) < 3200 && Math.abs(z) < 3200));
  w.u32(rails.length);
  for (const r of rails) {
    w.u8(r.bridge);
    w.ring(r.line.map(([x, z]) => [Math.max(-3270, Math.min(3270, x)), Math.max(-3270, Math.min(3270, z))]), 10);
  }
  // river outline rings (marching squares, metres)
  w.u32(city.river?.length ?? 0);
  for (const r of city.river ?? []) w.ring(r, 1);
  return w.done();
}

// ------------------------------------------------------------------------------ river & terrain
/**
 * The Thames arrives clipped at the edge of the download box, so its multipolygon cannot be
 * closed reliably. Instead all water boundaries are rasterised as walls, the river is flood
 * filled from a point between its banks, and the result is vectorised with marching squares.
 * The same raster gives distance fields for the terrain: Ludgate Hill falls ~14 m to the river,
 * Southwark is low and flat, and the Fleet valley cuts in west of the cathedral.
 */
function buildRiverAndTerrain() {
  const RES = 4, HALF = 4400;
  const N = Math.round((2 * HALF) / RES);
  const wall = new Uint8Array(N * N);
  const toCell = (x, z) => [Math.floor((x + HALF) / RES), Math.floor((z + HALF) / RES)];
  const segs = [];
  for (const e of load("water")) {
    const t = e.tags ?? {};
    if (!(t.natural === "water" || t.waterway === "riverbank")) continue;
    const lines = [];
    const addGeom = (geom) => {
      let cur = [];
      for (const p of geom ?? []) {
        if (!p) { if (cur.length > 1) lines.push(cur); cur = []; continue; }
        cur.push(local(p.lat, p.lon));
      }
      if (cur.length > 1) lines.push(cur);
    };
    if (e.type === "way") addGeom(e.geometry);
    else for (const m of e.members ?? []) if (m.type === "way") addGeom(m.geometry);
    for (const l of lines) segs.push(l);
  }
  // draw walls (thick enough to be watertight for 4-connected fills)
  const plot = (i, j) => { if (i >= 0 && j >= 0 && i < N && j < N) wall[j * N + i] = 1; };
  for (const line of segs) {
    for (let k = 0; k < line.length - 1; k++) {
      const [x0, z0] = line[k], [x1, z1] = line[k + 1];
      const L = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.max(1, Math.ceil(L / (RES * 0.4)));
      for (let s = 0; s <= n; s++) {
        const [i, j] = toCell(x0 + ((x1 - x0) * s) / n, z0 + ((z1 - z0) * s) / n);
        plot(i, j); plot(i + 1, j); plot(i, j + 1);
      }
    }
  }
  // seed: between the first two bank crossings south of the cathedral along x = -40
  const crossings = [];
  for (const line of segs) for (let k = 0; k < line.length - 1; k++) {
    const [x0, z0] = line[k], [x1, z1] = line[k + 1];
    if ((x0 - -40) * (x1 - -40) <= 0 && x0 !== x1) {
      const z = z0 + ((z1 - z0) * (-40 - x0)) / (x1 - x0);
      if (z > 50 && z < 900) crossings.push(z);
    }
  }
  crossings.sort((a, b) => a - b);
  const seedZ = (crossings[0] + crossings[1]) / 2;
  console.log(`river seed at z=${seedZ.toFixed(1)} (banks ${crossings.slice(0, 2).map((v) => v.toFixed(1)).join(", ")})`);
  const fill = (x, z, mark) => {
    const lab = new Uint8Array(N * N);
    const [si, sj] = toCell(x, z);
    const q = new Int32Array(N * N);
    let h = 0, t = 0;
    q[t++] = sj * N + si;
    lab[sj * N + si] = mark;
    while (h < t) {
      const c = q[h++];
      const i = c % N, j = (c - i) / N;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
        const cc = jj * N + ii;
        if (lab[cc] || wall[cc]) continue;
        lab[cc] = mark;
        q[t++] = cc;
      }
    }
    return lab;
  };
  const river = fill(-40, seedZ, 1);
  // walls that border river cells belong to the river (so the banks sit on the wall line)
  for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
    const c = j * N + i;
    if (wall[c] && (river[c - 1] || river[c + 1] || river[c - N] || river[c + N])) river[c] = 2;
  }
  for (let c = 0; c < N * N; c++) if (river[c] === 2) river[c] = 1;
  let wet = 0;
  for (let c = 0; c < N * N; c++) wet += river[c];
  console.log(`river: ${(wet * RES * RES / 1e6).toFixed(2)} km² inside ±${HALF} m`);
  // north land: flood from the cathedral through non-river cells
  const northLand = new Uint8Array(N * N);
  {
    const [si, sj] = toCell(0, 0);
    const q = new Int32Array(N * N);
    let h = 0, t = 0;
    q[t++] = sj * N + si;
    northLand[sj * N + si] = 1;
    while (h < t) {
      const c = q[h++];
      const i = c % N, j = (c - i) / N;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
        const cc = jj * N + ii;
        if (northLand[cc] || river[cc]) continue;
        northLand[cc] = 1;
        q[t++] = cc;
      }
    }
  }
  const dRiver = edt(river, N).map((d) => d * RES);
  // marching squares on the river mask -> polygons
  const contours = marchingSquares(river, N).map((ring) => simplify(ring.map(([i, j]) => [round(i * RES - HALF, 10), round(j * RES - HALF, 10)]), 1.6)).filter((r) => r.length >= 4);
  console.log(`river contours: ${contours.length} (${contours.reduce((a, r) => a + r.length, 0)} pts)`);

  // heightmap: 8 m grid over ±4000 m, heights in cm
  const TR = 8, TH = 4000;
  const TN = Math.round((2 * TH) / TR) + 1;
  const heights = new Int16Array(TN * TN);
  const WATER = -16.0, BANK = -13.2;
  for (let j = 0; j < TN; j++) for (let i = 0; i < TN; i++) {
    const x = -TH + i * TR, z = -TH + j * TR;
    const [ci, cj] = toCell(x, z);
    const inside = ci >= 0 && cj >= 0 && ci < N && cj < N;
    const c = inside ? cj * N + ci : -1;
    let h;
    if (inside && river[c]) h = WATER - 3;
    else {
      const d = inside ? dRiver[c] : 2000;
      const north = inside ? northLand[c] === 1 : z < 0;
      if (north) {
        // Ludgate Hill: ~2.5% down from the north churchyard towards the river (Peter's Hill)
        h = BANK + 13.8 * smooth(10, 400, d);
        // the Fleet valley west of Ludgate Hill (Farringdon Street / New Bridge Street)
        const fx = (x + 430) / 115;
        h -= 10.5 * Math.exp(-fx * fx) * smooth(-2600, -200, -z + 0);
        // gentle rise north of the cathedral towards Smithfield and Moorgate
        h += 2.2 * smooth(0, 900, -z) * smooth(-900, -300, x) * 0.5 + 1.2 * smooth(200, 1500, -z);
        // Walbrook valley (Bank / Cannon Street)
        const wx = (x - 560) / 90;
        h -= 3.0 * Math.exp(-wx * wx) * smooth(-200, 200, -z + 150);
      } else {
        h = BANK + 0.3 + 3.0 * smooth(0, 1800, d);
      }
    }
    heights[j * TN + i] = Math.round(h * 100);
  }
  return { contours, heights, TN, TR, TH, WATER, BANK };
}

function smooth(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Exact Euclidean distance transform (Felzenszwalb & Huttenlocher) to the nearest set cell, in cells. */
function edt(mask, N) {
  const INF = 1e12;
  const f = new Float64Array(N * N);
  for (let c = 0; c < N * N; c++) f[c] = mask[c] ? 0 : INF;
  const d1 = (arr, off, stride) => {
    const n = N;
    const v = new Int32Array(n), z = new Float64Array(n + 1), g = new Float64Array(n);
    for (let q = 0; q < n; q++) g[q] = arr[off + q * stride];
    let k = 0;
    v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < n; q++) {
      let s = ((g[q] + q * q) - (g[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) { k--; s = ((g[q] + q * q) - (g[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
      k++; v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < n; q++) {
      while (z[k + 1] < q) k++;
      arr[off + q * stride] = (q - v[k]) * (q - v[k]) + g[v[k]];
    }
  };
  for (let i = 0; i < N; i++) d1(f, i, N);
  for (let j = 0; j < N; j++) d1(f, j * N, 1);
  const out = new Float32Array(N * N);
  for (let c = 0; c < N * N; c++) out[c] = Math.sqrt(f[c]);
  return out;
}

/** Marching squares on a binary grid; returns closed rings in cell coordinates (corner lattice). */
function marchingSquares(mask, N) {
  const at = (i, j) => (i >= 0 && j >= 0 && i < N && j < N ? mask[j * N + i] : 0);
  // edges between cell corners where inside/outside changes, keyed by start point
  const next = new Map();
  const key = (i, j) => i * 100003 + j;
  const addEdge = (a, b) => next.set(key(a[0], a[1]), b);
  for (let j = -1; j < N; j++) for (let i = -1; i < N; i++) {
    const tl = at(i, j), tr = at(i + 1, j), bl = at(i, j + 1), br = at(i + 1, j + 1);
    void tl; void tr; void bl; void br;
  }
  // simpler: trace cell boundary edges (pixel edges) with the inside on the left
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    if (!at(i, j)) continue;
    if (!at(i, j - 1)) addEdge([i + 1, j], [i, j]);
    if (!at(i, j + 1)) addEdge([i, j + 1], [i + 1, j + 1]);
    if (!at(i - 1, j)) addEdge([i, j], [i, j + 1]);
    if (!at(i + 1, j)) addEdge([i + 1, j + 1], [i + 1, j]);
  }
  const rings = [];
  const used = new Set();
  for (const [k0] of next) {
    if (used.has(k0)) continue;
    const ring = [];
    let k = k0;
    let guard = 0;
    while (!used.has(k) && guard++ < 4e6) {
      used.add(k);
      const i = Math.floor(k / 100003), j = k - i * 100003;
      ring.push([i, j]);
      const b = next.get(k);
      if (!b) break;
      k = key(b[0], b[1]);
    }
    if (ring.length > 8) rings.push(ring);
  }
  return rings;
}

/** Douglas-Peucker simplification of a closed ring. */
function simplify(pts, eps) {
  if (pts.length < 5) return pts;
  const dp = (a, b) => {
    let idx = -1, dmax = 0;
    const [x0, z0] = pts[a], [x1, z1] = pts[b];
    const L = Math.hypot(x1 - x0, z1 - z0) || 1e-9;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((x1 - x0) * (z0 - pts[i][1]) - (x0 - pts[i][0]) * (z1 - z0)) / L;
      if (d > dmax) { dmax = d; idx = i; }
    }
    if (dmax > eps) return [...dp(a, idx).slice(0, -1), ...dp(idx, b)];
    return [pts[a], pts[b]];
  };
  const mid = Math.floor(pts.length / 2);
  const r = [...dp(0, mid).slice(0, -1), ...dp(mid, pts.length - 1)];
  return r;
}

fs.mkdirSync(OUT, { recursive: true });
const cy = buildChurchyard();
fs.writeFileSync(path.join(OUT, "churchyard.json"), JSON.stringify(cy));
console.log(`churchyard: ${cy.trees.length} trees, ${cy.benches.length} benches, ${cy.lamps.length} lamps, ${cy.footways.length} footways, ${cy.areas.length} areas, ${cy.barriers.length} barriers, ${cy.steps.length} steps, ${cy.roads.length} roads, ${cy.statues.length} statues`);
const city = buildCity();
const rt = buildRiverAndTerrain();
city.river = rt.contours;
{
  const hdr = Buffer.alloc(16);
  hdr.writeUInt32LE(0x4e525254, 0); // "TRRN"
  hdr.writeUInt16LE(rt.TN, 4);
  hdr.writeUInt16LE(rt.TR, 6);
  hdr.writeUInt16LE(rt.TH, 8);
  hdr.writeInt16LE(Math.round(rt.WATER * 100), 10);
  hdr.writeInt16LE(Math.round(rt.BANK * 100), 12);
  fs.writeFileSync(path.join(OUT, "terrain.bin"), Buffer.concat([hdr, Buffer.from(rt.heights.buffer)]));
  console.log(`terrain.bin ${rt.TN}x${rt.TN}`);
}
const bin = writeCity(city);
fs.writeFileSync(path.join(OUT, "city.bin"), bin);
console.log(`city.bin ${(bin.length / 1e6).toFixed(2)} MB`);
