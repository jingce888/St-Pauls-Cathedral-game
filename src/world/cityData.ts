/**
 * Reader for public/data/city.bin (written by tools/osm/build.mjs, format 2): the City of London
 * and its surroundings from OpenStreetMap, already transformed into the cathedral frame
 * (x along the nave, z south, metres).
 */

export const ROOF = { flat: 0, gabled: 1, hipped: 2, pyramidal: 3, dome: 4, skillion: 5, round: 6 } as const;
/** Facade material index (255 = unknown). */
export const FACADE = { stone: 0, brick: 1, glass: 2, concrete: 3, metal: 4, plaster: 5, unknown: 255 } as const;

export interface BuildingPart {
  /** Outer ring as x,z pairs (not closed). */
  outer: Float32Array;
  holes: Float32Array[];
  h: number;
  minH: number;
  roof: number;
  roofH: number;
  mat: number;
  /** 1 = height estimated, 2 = church, 4 = has colour, 8 = has roof colour. */
  flags: number;
  col: [number, number, number] | null;
  rcol: [number, number, number] | null;
}

export interface Area {
  outer: Float32Array;
  holes: Float32Array[];
}

export interface Line {
  pts: Float32Array;
  /** Width in metres (roads). */
  w: number;
  /** 0 major, 1 minor, 2 footway. */
  cls: number;
  bridge: boolean;
}

export interface CityData {
  buildings: BuildingPart[];
  water: Area[];
  green: Area[];
  bridges: Area[];
  roads: Line[];
  rails: Line[];
  river: Float32Array[];
}

export async function loadCity(url: string): Promise<CityData> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return parseCity(await r.arrayBuffer());
}

export function parseCity(buf: ArrayBuffer): CityData {
  const dv = new DataView(buf);
  let o = 0;
  const u8 = () => dv.getUint8(o++);
  const u16 = () => { const v = dv.getUint16(o, true); o += 2; return v; };
  const u32 = () => { const v = dv.getUint32(o, true); o += 4; return v; };
  const ring = (q: number) => {
    const n = u16();
    const a = new Float32Array(n * 2);
    for (let i = 0; i < n * 2; i++) {
      a[i] = dv.getInt16(o, true) / q;
      o += 2;
    }
    return a;
  };
  if (u32() !== 0x53505443) throw new Error("city.bin: bad header");
  const version = u16();
  if (version !== 2) throw new Error(`city.bin: unsupported version ${version}`);

  const buildings: BuildingPart[] = [];
  for (const q of [10, 1]) {
    const n = u32();
    for (let i = 0; i < n; i++) {
      const h = u16() / 10, minH = u16() / 10, roof = u8(), roofH = u8() / 10, mat = u8(), flags = u8();
      const col = flags & 4 ? ([u8(), u8(), u8()] as [number, number, number]) : null;
      const rcol = flags & 8 ? ([u8(), u8(), u8()] as [number, number, number]) : null;
      const nh = u8();
      const outer = ring(q);
      const holes: Float32Array[] = [];
      for (let k = 0; k < nh; k++) holes.push(ring(q));
      buildings.push({ outer, holes, h, minH, roof, roofH, mat, flags, col, rcol });
    }
  }
  const areas = () => {
    const n = u32();
    const out: Area[] = [];
    for (let i = 0; i < n; i++) {
      const nh = u8();
      const outer = ring(1);
      const holes: Float32Array[] = [];
      for (let k = 0; k < nh; k++) holes.push(ring(1));
      out.push({ outer, holes });
    }
    return out;
  };
  const water = areas(), green = areas(), bridges = areas();
  const roads: Line[] = [];
  for (let i = 0, n = u32(); i < n; i++) {
    const w = u8() / 10, c = u8();
    roads.push({ w, cls: c & 3, bridge: (c & 4) !== 0, pts: ring(10) });
  }
  const rails: Line[] = [];
  for (let i = 0, n = u32(); i < n; i++) {
    const b = u8();
    rails.push({ w: 3, cls: 0, bridge: b !== 0, pts: ring(10) });
  }
  const river: Float32Array[] = [];
  for (let i = 0, n = u32(); i < n; i++) river.push(ring(1));
  return { buildings, water, green, bridges, roads, rails, river };
}

export interface Churchyard {
  trees: [number, number, number, number][];
  benches: [number, number][];
  lamps: [number, number][];
  bollards: [number, number][];
  statues: { p: [number, number]; name: string; kind: string }[];
  footways: { line: [number, number][]; width: number; kind: string }[];
  areas: { kind: "paved" | "road" | "grass" | "flowerbed" | "scrub"; poly: [number, number][] }[];
  barriers: { line: [number, number][]; kind: string; height: number | null }[];
  steps: { line: [number, number][]; width: number; incline: string }[];
  roads: { line: [number, number][]; width: number; kind: string; oneway: number; lanes: number }[];
  crossings: [number, number][];
}

export async function loadChurchyard(url: string): Promise<Churchyard> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return (await r.json()) as Churchyard;
}
