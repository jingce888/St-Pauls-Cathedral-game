import * as THREE from "three";
import { GeoBuilder, JOINT } from "../../geo/Builder";
import { planeSurface, sweepOnSurface } from "../../geo/surface";
import { P } from "../../geo/profiles";
import { Relief, panelFrame } from "../../geo/relief";
import { patchMaterial } from "../../gfx/materials";
import type { V2, V3 } from "../../core/math";
import { FLOOR } from "../dims";
import type { Ctx } from "./kit";
import { INT } from "./interior";

/**
 * Carved reliefs made from photographs (tools/photo-relief): the height of the carving,
 * estimated from each photo by a depth network, displaces a mesh; the photo itself — with its
 * large-scale lighting divided out — is the stone's colour, and a normal map made from the
 * height lets the church's own light play over it. Each is set in a classical stone frame:
 * altarpieces in the chapels at the west ends of the aisles and in the quire aisles, and the
 * angels round the Cross over the north transept door.
 */

export interface PhotoRelief {
  id: string;
  /** Panel size in metres, and the relief depth the height grid is scaled to. */
  width: number;
  height: number;
  depth: number;
  cols: number;
  rows: number;
  /** Height grid (metres), row 0 at the bottom. */
  h: Float32Array;
}

export async function loadPhotoReliefs(base: string): Promise<PhotoRelief[]> {
  const res = await fetch(`${base}manifest.json`);
  if (!res.ok) return [];
  const man = (await res.json()) as Omit<PhotoRelief, "h">[];
  return Promise.all(
    man.map(async (m) => {
      const buf = await (await fetch(`${base}${m.id}_h.bin`)).arrayBuffer();
      const u = new Uint16Array(buf);
      const h = new Float32Array(u.length);
      for (let i = 0; i < u.length; i++) h[i] = (u[i] / 65535) * m.depth;
      return { ...m, h };
    }),
  );
}

const F = FLOOR;

export interface PhotoPlace {
  id: string;
  /** Bottom centre of the carving on the wall, and the wall's normal into the church (plan). */
  x: number;
  y: number;
  z: number;
  n: V2;
  /** Width of the carving in metres (overrides the manifest's). */
  width?: number;
  altar: boolean;
  /** The chapel it makes (for the place name shown on screen). */
  chapel?: string;
  /** Incised on the tablet below. */
  inscription: string;
  title: string;
  cn: string;
  meta: string;
  en: string;
  zh: string;
}

/** Where the carvings are set (also used for the information cards and to keep monuments away). */
export const PHOTO_PLACES: PhotoPlace[] = [
  {
    id: "george", x: INT.xW, y: F + 1.5, z: 14.3, n: [1, 0], width: 2.3, altar: true, chapel: "Chapel of St Michael and St George", inscription: "S · GEORGIVS",
    title: "St George and the Dragon", cn: "圣乔治屠龙", meta: "Chapel of St Michael and St George",
    en: "The soldier saint, in armour and a billowing cloak, drives his lance into the dragon's jaws. St George is England's patron, and this chapel at the west end of the south aisle belongs to the Order of St Michael and St George.",
    zh: "身披铠甲、斗篷飞扬的武士圣徒将长矛刺入恶龙口中。圣乔治是英格兰的主保圣人；南侧廊西端的这座小堂属于圣米迦勒和圣乔治勋位。",
  },
  {
    id: "angel", x: INT.xW, y: F + 1.5, z: -14.3, n: [1, 0], width: 1.62, altar: true, chapel: "St Dunstan's Chapel", inscription: "ORATE · PRO · NOBIS",
    title: "A Praying Angel", cn: "祈祷的天使", meta: "St Dunstan's Chapel",
    en: "An angel with folded wings and joined hands stands in a Gothic niche beneath a canopy of crockets — a place kept for quiet prayer at the west end of the north aisle.",
    zh: "收拢双翼、双手合十的天使立于饰有卷叶的哥特式壁龛中——北侧廊西端，一处供人静默祈祷的地方。",
  },
  {
    id: "madonna", x: 56.8, y: F + 1.5, z: -INT.zA, n: [0, 1], width: 1.95, altar: true, chapel: "The Lady Altar", inscription: "AVE · MARIA",
    title: "Madonna and Child", cn: "圣母子", meta: "Lady altar · north quire aisle",
    en: "The crowned Virgin, her veil falling over her shoulders, holds the Christ Child on her knee; he raises his hand in blessing. Both are haloed, under a cusped arch on slender shafts.",
    zh: "头戴冠冕的圣母，披纱垂肩，将圣婴抱在膝上；圣婴举手赐福。二人头顶光环，上方是由细柱托起的尖叶饰拱券。",
  },
  {
    id: "supper", x: 56.8, y: F + 1.5, z: INT.zA, n: [0, -1], width: 3.2, altar: true, chapel: "The Altar of the Last Supper", inscription: "HOC · FACITE · IN · MEAM · COMMEMORATIONEM",
    title: "The Last Supper", cn: "最后的晚餐", meta: "Altarpiece · south quire aisle",
    en: "Christ, at the centre of the table with the cup before him, blesses the bread among the twelve apostles, under an arcade of pointed arches. The inscription: 'Do this in remembrance of me.'",
    zh: "基督坐在长桌正中，面前是圣杯，在十二门徒中间祝谢擘饼，上方是一排尖拱连廊。铭文：“你们应当如此行，为的是记念我。”",
  },
  {
    id: "cross", x: 0, y: F + 8.1, z: -INT.zT, n: [0, 1], width: 3.6, altar: false, inscription: "GLORIA · IN · EXCELSIS · DEO",
    title: "Angels Adoring the Cross", cn: "天使朝拜十字架", meta: "Over the north transept door",
    en: "Four angels surround a flowering cross: one plays the harp, one holds pipes, two kneel reading. The cross grows like a tree among lilies and vines, under Gothic tracery.",
    zh: "四位天使环绕着开花的十字架：一位弹竖琴，一位手持排箫，两位跪着读经。十字架如树般生长在百合与藤蔓之间，上方是哥特式窗花。",
  },
];

/** The photo-relief material: the photo as the stone's colour, the height's normal map for the light. */
function material(id: string, base: string) {
  const loader = new THREE.TextureLoader();
  const map = loader.load(`${base}${id}.jpg`);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const normalMap = loader.load(`${base}${id}_n.jpg`);
  normalMap.anisotropy = 8;
  const m = new THREE.MeshStandardMaterial({ map, normalMap, normalScale: new THREE.Vector2(0.9, 0.9), vertexColors: true, roughness: 0.85 });
  return patchMaterial(m, {
    key: "photoRelief",
    albedo: `
      diffuseColor.rgb *= vec3(0.95, 0.9, 0.8);
      surfRough = 0.84;
      surfAO = mix(0.45, 1.0, vColor.b);
    `,
    ambient: "uInteriorAmbient",
  });
}

/** Displaced grid (the carving) with skirts down to the wall at its edges. */
function reliefMesh(pr: PhotoRelief, o: V3, ex: V3, ey: V3, ez: V3, width: number): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.paint = { joint: JOINT.none, expo: 0.4, cav: 1 };
  const { cols, rows } = pr;
  const k = width / pr.width;
  const W = width, H = pr.height * k;
  const h = pr.h.map((v) => v * k);
  const du = W / (cols - 1), dv = H / (rows - 1);
  // local average height: hollows darken
  const avg = new Float32Array(h.length);
  const R = Math.max(2, Math.round(0.12 / du));
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      let s = 0, n = 0;
      for (let dj = -R; dj <= R; dj += 2) {
        const jj = Math.min(rows - 1, Math.max(0, j + dj));
        for (let di = -R; di <= R; di += 2) {
          const ii = Math.min(cols - 1, Math.max(0, i + di));
          s += h[jj * cols + ii];
          n++;
        }
      }
      avg[j * cols + i] = s / n;
    }
  }
  const P3 = (u: number, v: number, z: number): V3 => [o[0] + ex[0] * u + ey[0] * v + ez[0] * z, o[1] + ex[1] * u + ey[1] * v + ez[1] * z, o[2] + ex[2] * u + ey[2] * v + ez[2] * z];
  const idx = new Int32Array(cols * rows);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const c = j * cols + i;
      const hl = h[j * cols + Math.max(0, i - 1)], hr = h[j * cols + Math.min(cols - 1, i + 1)];
      const hd = h[Math.max(0, j - 1) * cols + i], hu = h[Math.min(rows - 1, j + 1) * cols + i];
      const gx = (hr - hl) / (du * (i > 0 && i < cols - 1 ? 2 : 1)), gy = (hu - hd) / (dv * (j > 0 && j < rows - 1 ? 2 : 1));
      let nx = -gx, ny = -gy, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      const p = P3(i * du, j * dv, h[c]);
      b.paint.cav = Math.max(0.35, Math.min(1, 1 - 3.5 * Math.max(0, avg[c] - h[c])));
      idx[c] = b.v(p[0], p[1], p[2], ex[0] * nx + ey[0] * ny + ez[0] * nz, ex[1] * nx + ey[1] * ny + ez[1] * nz, ex[2] * nx + ey[2] * ny + ez[2] * nz, i / (cols - 1), j / (rows - 1));
    }
  }
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < cols - 1; i++) {
      const a = idx[j * cols + i], c = idx[j * cols + i + 1], d = idx[(j + 1) * cols + i + 1], e = idx[(j + 1) * cols + i];
      b.orientQuad(a, c, d, e);
    }
  }
  // skirts: the edges of the slab down to the wall
  b.paint.cav = 0.6;
  const edge = (pts: [number, number][], out: V3) => {
    for (let q = 0; q < pts.length - 1; q++) {
      const [i0, j0] = pts[q], [i1, j1] = pts[q + 1];
      const a = P3(i0 * du, j0 * dv, h[j0 * cols + i0]), c = P3(i1 * du, j1 * dv, h[j1 * cols + i1]);
      const a0 = P3(i0 * du, j0 * dv, -0.02), c0 = P3(i1 * du, j1 * dv, -0.02);
      b.polyN([a0, c0, c, a], out);
    }
  };
  const neg = (v: V3): V3 => [-v[0], -v[1], -v[2]];
  edge(Array.from({ length: cols }, (_, i) => [i, 0] as [number, number]), neg(ey));
  edge(Array.from({ length: cols }, (_, i) => [i, rows - 1] as [number, number]), ey);
  edge(Array.from({ length: rows }, (_, j) => [0, j] as [number, number]), neg(ex));
  edge(Array.from({ length: rows }, (_, j) => [cols - 1, j] as [number, number]), ex);
  return b.build();
}

/** Builds each carving with its frame, tablet, and (in the chapels) the altar before it. */
export function buildPhotoReliefs(ctx: Ctx, data: PhotoRelief[], base: string) {
  for (const place of PHOTO_PLACES) {
    const pr = data.find((d) => d.id === place.id);
    if (!pr) continue;
    const W = place.width ?? pr.width, H = pr.height * (W / pr.width), D = pr.depth * (W / pr.width);
    const n = place.n;
    const right: V2 = [n[1], -n[0]];
    const ex: V3 = [right[0], 0, right[1]], ey: V3 = [0, 1, 0], ez: V3 = [n[0], 0, n[1]];
    // the carving stands on a back slab 6 cm proud of the wall
    const back = 0.06;
    const o: V3 = [place.x - right[0] * (W / 2) + n[0] * back, place.y, place.z - right[1] * (W / 2) + n[1] * back];
    const mesh = new THREE.Mesh(reliefMesh(pr, o, ex, ey, ez, W), material(place.id, base));
    mesh.name = `photoRelief:${place.id}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    ctx.extras.push(mesh);
    frame(ctx, place, W, H, D, back);
  }
}

/** A classical frame: moulded surround, pilasters, entablature with urns, tablet, altar. */
function frame(ctx: Ctx, pl: PhotoPlace, W: number, H: number, D: number, back: number) {
  const st = ctx.g("stoneInt");
  const n = pl.n, right: V2 = [n[1], -n[0]];
  const a: V2 = [pl.x - right[0] * (W / 2), pl.z - right[1] * (W / 2)];
  const surf = planeSurface(a, right, n);
  const y0 = pl.y, y1 = pl.y + H;
  const box = (m: GeoBuilder, s0: number, s1: number, ya: number, yb: number, d0: number, d1: number) => {
    const p = surf.point(s0, ya, -d0), q = surf.point(s1, yb, -d1);
    m.box(Math.min(p[0], q[0]), ya, Math.min(p[2], q[2]), Math.max(p[0], q[0]), yb, Math.max(p[2], q[2]));
  };
  // back slab, and the moulded surround standing proud of the carving's edges
  st.withPaint({ joint: JOINT.none, cav: 0.85 }, () => box(st, -0.05, W + 0.05, y0 - 0.05, y1 + 0.05, 0, back));
  const proj = back + D + 0.06;
  const prof = new P(0, 0).to(0, proj).to(0.05, proj + 0.03).to(0.1, proj + 0.03).to(0.13, proj - 0.02).to(0.2, proj - 0.04).to(0.22, 0.05).to(0.26, 0.05).to(0.26, 0).build();
  st.withPaint({ joint: JOINT.none, cav: 0.9 }, () => sweepOnSurface(st, surf, prof, [[0, y0], [W, y0], [W, y1], [0, y1]], true, { outwardFrom: [W / 2, (y0 + y1) / 2] }));
  // pilasters either side, entablature, cornice
  const pw = 0.34, gap = 0.3;
  const sL = -gap - pw, sR = W + gap;
  const yb = y0 - 0.45, yt = y1 + 0.3;
  st.withPaint({ joint: JOINT.blocks, cav: 0.9 }, () => {
    for (const s of [sL, sR]) {
      box(st, s - 0.04, s + pw + 0.04, yb, yb + 0.22, 0, 0.36);
      box(st, s, s + pw, yb + 0.22, yt - 0.2, 0, 0.28);
      box(st, s - 0.05, s + pw + 0.05, yt - 0.2, yt, 0, 0.36);
    }
    box(st, sL - 0.08, sR + pw + 0.08, yt, yt + 0.32, 0, 0.38);
    box(st, sL - 0.16, sR + pw + 0.16, yt + 0.32, yt + 0.44, 0, 0.5);
    box(st, sL - 0.2, sR + pw + 0.2, yt + 0.44, yt + 0.52, 0, 0.56);
    // predella under the carving
    box(st, sL, sR + pw, yb, y0 - 0.05, 0, 0.32);
  });
  // gilded urns on the cornice, a cross in the middle
  const top = yt + 0.52;
  for (const s of [sL + pw / 2, sR + pw / 2]) {
    const p = surf.point(s, top, -0.28);
    ctx.inst.add("urnGold", [p[0], top, p[2]], Math.atan2(n[0], n[1]), 0.5);
  }
  const g = ctx.g("goldInt");
  const c = surf.point(W / 2, top, -0.28);
  g.withPaint({ cav: 1 }, () => g.at(c[0], top, c[2], Math.atan2(n[0], n[1]), () => {
    g.box(-0.035, 0, -0.035, 0.035, 0.75, 0.035);
    g.box(-0.2, 0.48, -0.035, 0.2, 0.55, 0.035);
    g.lathe([[0.001, -0.02], [0.12, 0.0], [0.08, 0.06], [0.001, 0.08]], 12, { smooth: true });
  }));
  // tablet with the inscription on the predella
  const size = Math.min(0.11, (W + 0.1) / Relief.textWidth(pl.inscription, 1, 0.3));
  const tw = Relief.textWidth(pl.inscription, size, 0.3) + 0.3;
  const tab = new Relief(tw, 0.26, 0.012);
  tab.plate([[0, 0], [tw, 0], [tw, 0.26], [0, 0.26]], 0.03, 0.01);
  tab.text(pl.inscription, 0.15, 0.13 - size / 2, size, 0.02, "sub", 0.3);
  tab.soften = 0;
  const tc = surf.point(W / 2, yb + 0.06, -0.32);
  const wm = ctx.g("whiteMarble");
  wm.withPaint({ joint: JOINT.none, cav: 1 }, () => tab.build(wm, panelFrame(tc, n, tw), { cavR: 0.02, cavK: 20 }));
  if (!pl.altar) {
    // consoles under the frame instead
    st.withPaint({ joint: JOINT.none, cav: 0.85 }, () => {
      for (const s of [sL + pw / 2, sR + pw / 2]) {
        const p = surf.point(s, yb, 0);
        st.at(p[0], 0, p[2], Math.atan2(n[0], n[1]), () => st.lathe([[0.001, yb - 0.7], [0.1, yb - 0.6], [0.16, yb - 0.3], [0.2, yb], [0.001, yb]], 10, { smooth: true }));
      }
    });
    return;
  }
  // footpace, altar with a marble frontal, candlesticks
  const aw = Math.max(1.6, W * 0.8);
  const fp = ctx.g("marble");
  fp.withPaint({ cav: 1 }, () => box(fp, W / 2 - aw / 2 - 0.6, W / 2 + aw / 2 + 0.6, F - 0.02, F + 0.15, 0, 2.1));
  ctx.col.withPaint({}, () => box(ctx.col, W / 2 - aw / 2 - 0.6, W / 2 + aw / 2 + 0.6, F - 0.5, F + 0.15, 0, 2.1));
  wm.withPaint({ joint: JOINT.none, cav: 0.9 }, () => {
    box(wm, W / 2 - aw / 2, W / 2 + aw / 2, F + 0.15, F + 1.08, 0.35, 1.05);
    box(wm, W / 2 - aw / 2 - 0.08, W / 2 + aw / 2 + 0.08, F + 1.08, F + 1.18, 0.3, 1.12);
  });
  const rm = ctx.g("redMarble");
  rm.withPaint({ joint: JOINT.none, cav: 0.9 }, () => box(rm, W / 2 - aw / 2 + 0.12, W / 2 + aw / 2 - 0.12, F + 0.3, F + 0.95, 1.05, 1.07));
  ctx.col.withPaint({}, () => box(ctx.col, W / 2 - aw / 2 - 0.08, W / 2 + aw / 2 + 0.08, F - 0.5, F + 1.2, 0.3, 1.12));
  for (const s of [W / 2 - aw / 2 + 0.2, W / 2 + aw / 2 - 0.2]) {
    const p = surf.point(s, F + 1.18, -0.6);
    g.withPaint({ cav: 1 }, () => g.at(p[0], F + 1.18, p[2], 0, () => g.lathe([[0.001, 0], [0.1, 0], [0.08, 0.05], [0.025, 0.1], [0.03, 0.42], [0.05, 0.5], [0.02, 0.54], [0.02, 0.66], [0.001, 0.66]], 10, { smooth: true })));
    const lamp = ctx.g("lamp");
    lamp.withPaint({ cav: 1 }, () => lamp.at(p[0], F + 1.84, p[2], 0, () => lamp.lathe([[0.001, 0], [0.018, 0.03], [0.012, 0.07], [0.001, 0.1]], 8, { smooth: true })));
  }
}
