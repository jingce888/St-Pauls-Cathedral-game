import * as THREE from "three";
import { GeoBuilder, JOINT } from "../../geo/Builder";
import type { Surface } from "../../geo/surface";
import type { V2, V3 } from "../../core/math";
import { rng } from "../../core/rng";
import { FLOOR } from "../dims";
import {
  border, evangelistSymbol, figure, goldGround, letters, makeCanvas, mosaicMaterial, paintingMaterial, toTexture, vineScroll,
} from "../../gfx/art";
import type { Ctx } from "./kit";
import { AISLE_SPOTS, CHOIR_X, INT, SPANDRELS, saucer } from "./interior";
import { placeRelief } from "./reliefs";
import { monumentRelief } from "./sculpture";

/**
 * Wall paintings and mosaics: the Evangelists and Prophets in gold mosaic above the eight arches
 * of the crossing, Christ in Majesty in the apse, the Creation mosaics of the quire saucer domes
 * (after W. B. Richmond), Holman Hunt's "The Light of the World" and an Annunciation hung in the
 * aisles, and marble monuments along the aisle walls.
 */

const F = FLOOR;
type G = CanvasRenderingContext2D;

export function buildPaintings(ctx: Ctx) {
  spandrelMosaics(ctx);
  apseMosaic(ctx);
  quireMosaics(ctx);
  aisles(ctx);
}

// ------------------------------------------------------------------------------ geometry

function mesh(ctx: Ctx, b: GeoBuilder, mat: THREE.Material, name: string) {
  const m = new THREE.Mesh(b.build(), mat);
  m.name = name;
  m.receiveShadow = true;
  m.castShadow = false;
  ctx.extras.push(m);
}

/** A picture on a plane surface between s0..s1, y0..y1, image upright and unmirrored for a viewer in front. */
function planePicture(surf: Surface, s0: number, s1: number, y0: number, y1: number, depth: number): GeoBuilder {
  const b = new GeoBuilder();
  b.paint = { joint: JOINT.none, expo: 0.5, cav: 1 };
  const n = surf.normal((s0 + s1) / 2), t = surf.tangent((s0 + s1) / 2);
  const right: V3 = [n[2], 0, -n[0]]; // viewer's right = up x n
  const sRight = t[0] * right[0] + t[2] * right[2] > 0;
  const u = (s: number) => (sRight ? (s - s0) / (s1 - s0) : (s1 - s) / (s1 - s0));
  const vtx = (s: number, y: number) => {
    const p = surf.point(s, y, depth);
    return b.v(p[0], p[1], p[2], n[0], n[1], n[2], u(s), (y - y0) / (y1 - y0));
  };
  const a = vtx(s0, y0), c = vtx(s1, y0), d = vtx(s1, y1), e = vtx(s0, y1);
  b.orientQuad(a, c, d, e);
  return b;
}

// ------------------------------------------------------------------------------ crossing

const EVANGELISTS = [
  { name: "S. MATTHEW", robe: "#e7e0cf", mantle: "#2c4b8c", beard: true },
  { name: "S. MARK", robe: "#9a2b22", mantle: "#3f6b3a", beard: true },
  { name: "S. LUKE", robe: "#314f93", mantle: "#a3362a", beard: true },
  { name: "S. JOHN", robe: "#ece6d6", mantle: "#b0322a", beard: false },
];
const PROPHETS = ["ISAIAH", "JEREMIAH", "EZEKIEL", "DANIEL"];

function spandrelMosaics(ctx: Ctx) {
  let e = 0, p = 0;
  for (const sp of SPANDRELS) {
    const w = sp.s1 - sp.s0, h = sp.y1 - sp.y0;
    const W = 1536, H = Math.round((W * h) / w);
    const { c, g } = makeCanvas(W, H);
    if (sp.axis) prophetPanel(g, W, H, p++);
    else evangelistPanel(g, W, H, e++);
    const mat = mosaicMaterial(toTexture(c), [Math.round(w / 0.022), Math.round(h / 0.022)]);
    mesh(ctx, planePicture(sp.surf, sp.s0, sp.s1, sp.y0, sp.y1, -0.012), mat, "mosaic:spandrel");
  }
}

function evangelistPanel(g: G, W: number, H: number, k: number) {
  const ev = EVANGELISTS[k % 4];
  goldGround(g, 0, 0, W, H, 10 + k);
  const t = Math.round(H * 0.045);
  // blue arched niche behind the seated evangelist, sown with stars
  const nx = W / 2, nw = H * 0.62, top = H * 0.08, bot = H - t * 1.6;
  g.fillStyle = "#1a2c66";
  g.beginPath();
  g.moveTo(nx - nw / 2, bot);
  g.lineTo(nx - nw / 2, top + nw / 2);
  g.arc(nx, top + nw / 2, nw / 2, Math.PI, 0);
  g.lineTo(nx + nw / 2, bot);
  g.closePath();
  g.fill();
  g.lineWidth = t * 0.5;
  g.strokeStyle = "#e7c35b";
  g.stroke();
  const r = rng(40 + k);
  g.fillStyle = "#f3dd8c";
  for (let i = 0; i < 40; i++) {
    const sx = nx + (r() - 0.5) * nw * 0.9, sy = top + r() * (bot - top);
    if (Math.hypot(sx - nx, Math.max(0, top + nw / 2 - sy)) > nw / 2 - 4) continue;
    g.beginPath();
    g.arc(sx, sy, H * 0.006, 0, Math.PI * 2);
    g.fill();
  }
  // throne and the evangelist writing his gospel
  g.fillStyle = "#6e3b1c";
  g.fillRect(nx - H * 0.2, H * 0.5, H * 0.4, H * 0.08);
  g.fillStyle = "#9c2a22";
  g.fillRect(nx - H * 0.19, H * 0.47, H * 0.38, H * 0.05);
  figure(g, { x: nx, y: bot - H * 0.02, h: H * 0.92, pose: "seat", robe: ev.robe, mantle: ev.mantle, halo: "#f0cf6a", beard: ev.beard, arm: "write", hair: ev.beard ? "#5b4632" : "#6b4424" });
  // the symbol in a roundel, attendant angels
  const rx = W * 0.26, ry = H * 0.42, rr = H * 0.22;
  g.fillStyle = "#23397a";
  g.beginPath();
  g.arc(rx, ry, rr, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = t * 0.4;
  g.strokeStyle = "#e7c35b";
  g.stroke();
  evangelistSymbol(g, k % 4, rx, ry, rr * 0.9);
  for (const [ax, dir] of [[W * 0.1, 1], [W * 0.9, -1]] as [number, number][]) {
    figure(g, { x: ax, y: bot, h: H * 0.78, robe: "#e9e4d8", mantle: "#c9a9a0", halo: "#f0cf6a", wings: "#d9dde6", arm: "raise", skin: "#e2b391", turn: dir * 0.5 });
  }
  // an open book on a lectern at the right
  g.fillStyle = "#23397a";
  g.beginPath();
  g.arc(W * 0.74, ry, rr, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "#e7c35b";
  g.stroke();
  g.fillStyle = "#f1e8cf";
  g.fillRect(W * 0.74 - rr * 0.6, ry - rr * 0.4, rr * 1.2, rr * 0.8);
  g.strokeStyle = "#6a5638";
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(W * 0.74, ry - rr * 0.4);
  g.lineTo(W * 0.74, ry + rr * 0.4);
  g.stroke();
  for (let i = 0; i < 6; i++) {
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(W * 0.74 + s * rr * 0.08, ry - rr * 0.28 + i * rr * 0.12);
      g.lineTo(W * 0.74 + s * rr * 0.52, ry - rr * 0.28 + i * rr * 0.12);
      g.stroke();
    }
  }
  // name on a band along the foot
  g.fillStyle = "#efe4c4";
  g.fillRect(t, H - t * 2.6, W - 2 * t, t * 1.3);
  letters(g, ev.name, W / 2, H - t * 1.95, t * 1.05, "#5a1a12");
  border(g, 0, 0, W, H, t);
}

function prophetPanel(g: G, W: number, H: number, k: number) {
  goldGround(g, 0, 0, W, H, 20 + k);
  const t = Math.round(H * 0.08);
  vineScroll(g, t * 1.2, H * 0.2, W * 0.36, H * 0.6, 30 + k);
  vineScroll(g, W * 0.64 - t * 0.2, H * 0.2, W * 0.36 - t, H * 0.6, 31 + k);
  // the prophet, half length, in a roundel
  const cx = W / 2, cy = H / 2, R = H * 0.4;
  g.save();
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.fillStyle = "#1e3272";
  g.fill();
  g.clip();
  figure(g, { x: cx, y: cy + R * 2.1, h: R * 3.0, robe: ["#7a2a22", "#3a5a8a", "#6b6a2e", "#8a3a58"][k % 4], mantle: ["#d9d2c0", "#b0322a", "#2f4e8a", "#d9c07a"][k % 4], halo: "#f0cf6a", beard: true, arm: "scroll", hair: "#8f8778" });
  g.restore();
  g.lineWidth = t * 0.4;
  g.strokeStyle = "#e7c35b";
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.stroke();
  // his name on scrolls either side
  for (const sx of [cx - R - W * 0.08, cx + R + W * 0.08]) {
    g.fillStyle = "#efe4c4";
    g.fillRect(sx - W * 0.07, cy - H * 0.1, W * 0.14, H * 0.2);
    letters(g, PROPHETS[k % 4], sx, cy, H * 0.1, "#5a1a12", 0.05);
  }
  border(g, 0, 0, W, H, t);
}

// ------------------------------------------------------------------------------ apse

/** The apse semi-dome: Christ in Majesty among angels, on gold. */
function apseMosaic(ctx: Ctx) {
  const R = INT.apseR, ys = INT.vaultSpring - 3.0;
  const W = 2048, H = 1024;
  const { c, g } = makeCanvas(W, H);
  goldGround(g, 0, 0, W, H, 7);
  // rays from the top (the pole of the dome)
  g.save();
  for (let i = 0; i < 48; i++) {
    g.fillStyle = i % 2 ? "rgba(255,236,170,0.25)" : "rgba(150,100,30,0.12)";
    g.beginPath();
    g.moveTo(W * (i / 48), 0);
    g.lineTo(W * ((i + 1) / 48), 0);
    g.lineTo(W / 2, H * 0.55);
    g.fill();
  }
  g.restore();
  // a band of deep blue heaven with stars along the top
  g.fillStyle = "#1a2c66";
  g.fillRect(0, 0, W, H * 0.12);
  const r = rng(5);
  g.fillStyle = "#f3dd8c";
  for (let i = 0; i < 160; i++) {
    g.beginPath();
    g.arc(r() * W, r() * H * 0.11, 2 + r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  // mandorla
  const cx = W / 2, cy = H * 0.5;
  for (const [rr, col] of [[1.0, "#e9c45d"], [0.95, "#20397d"], [0.82, "#2d4f9c"], [0.68, "#4a70b8"]] as [number, string][]) {
    g.fillStyle = col;
    g.beginPath();
    g.ellipse(cx, cy, H * 0.25 * rr, H * 0.42 * rr, 0, 0, Math.PI * 2);
    g.fill();
  }
  // throne and Christ enthroned, blessing, the book in his left hand
  g.fillStyle = "#b8862f";
  g.fillRect(cx - H * 0.17, cy + H * 0.02, H * 0.34, H * 0.06);
  figure(g, { x: cx, y: cy + H * 0.38, h: H * 0.78, pose: "seat", robe: "#efe8d8", mantle: "#c49a3a", halo: "#f6dc84", beard: true, arm: "bless", hair: "#5b3a22" });
  // cross in the halo
  g.fillStyle = "#a3261c";
  const hy = cy + H * 0.38 - 0.74 * H * 0.78;
  g.fillRect(cx - H * 0.006, hy - H * 0.1, H * 0.012, H * 0.03);
  g.fillRect(cx - H * 0.1, hy - H * 0.006, H * 0.03, H * 0.012);
  g.fillRect(cx + H * 0.07, hy - H * 0.006, H * 0.03, H * 0.012);
  // angels adoring on both sides, palms at the edges
  const angels: [number, number, number][] = [[0.3, 0.84, 1], [0.38, 0.86, 1], [0.62, 0.86, -1], [0.7, 0.84, -1], [0.18, 0.88, 1], [0.82, 0.88, -1]];
  angels.forEach(([ax, ay, dir], i) => {
    figure(g, { x: W * ax, y: H * ay, h: H * (0.6 - (i > 3 ? 0.05 : 0)), robe: ["#ece6da", "#d7c2c8", "#ece6da", "#cfd8e4", "#e8dcc6", "#e8dcc6"][i], mantle: ["#a3362a", "#2d4f9c", "#2d4f9c", "#a3362a", "#4e7a3a", "#4e7a3a"][i], halo: "#f0cf6a", wings: "#dfe3ea", arm: "raise", skin: "#e2b391", turn: dir * 0.6 });
  });
  for (const px of [0.06, 0.94]) {
    g.strokeStyle = "#5a3b1e";
    g.lineWidth = 14;
    g.beginPath();
    g.moveTo(W * px, H * 0.92);
    g.quadraticCurveTo(W * px + 20, H * 0.6, W * px, H * 0.35);
    g.stroke();
    g.fillStyle = "#3f6b2a";
    for (let i = 0; i < 9; i++) {
      const a = (i / 8) * Math.PI;
      g.beginPath();
      g.ellipse(W * px + Math.cos(a) * 60, H * 0.35 - Math.sin(a) * 30, 70, 12, -a + Math.PI / 2 * 0.2, 0, Math.PI * 2);
      g.fill();
    }
  }
  // inscription along the foot: EGO SUM LUX MUNDI
  g.fillStyle = "#1a2c66";
  g.fillRect(0, H * 0.93, W, H * 0.07);
  letters(g, "EGO SVM LVX MVNDI", W / 2, H * 0.965, H * 0.045, "#f0d27a", 0.3);

  // geometry: quarter-sphere seen from inside; u runs from the north side (viewer's left) to the south
  const b = new GeoBuilder();
  b.paint = { joint: JOINT.none, expo: 0.3, cav: 1 };
  const nt = 16, na = 32;
  const idx: number[][] = [];
  for (let i = 0; i <= nt; i++) {
    const t = (i / nt) * (Math.PI / 2);
    idx.push([]);
    for (let j = 0; j <= na; j++) {
      const a = Math.PI / 2 - (j / na) * Math.PI; // +90 deg = north (-z)
      const x = INT.xE + R * Math.cos(t) * Math.cos(a), z = -R * Math.cos(t) * Math.sin(a), y = ys + R * 0.95 * Math.sin(t);
      const nx = -Math.cos(t) * Math.cos(a), nz = Math.cos(t) * Math.sin(a), ny = -Math.sin(t);
      idx[i].push(b.v(x, y, z, nx, ny, nz, j / na, i / nt));
    }
  }
  for (let i = 0; i < nt; i++) for (let j = 0; j < na; j++) b.orientQuad(idx[i][j], idx[i][j + 1], idx[i + 1][j + 1], idx[i + 1][j]);
  mesh(ctx, b, mosaicMaterial(toTexture(c), [900, 480]), "mosaic:apse");
}

// ------------------------------------------------------------------------------ quire

/** The four saucer domes of the quire: the Creation — birds, beasts, fishes — and the Lamb, each ringed by angels. */
function quireMosaics(ctx: Ctx) {
  for (let i = 0; i < CHOIR_X.length - 1; i++) {
    const x0 = CHOIR_X[i], x1 = CHOIR_X[i + 1], z0 = -INT.zV, z1 = INT.zV;
    const W = 1024, H = Math.round((W * (z1 - z0)) / (x1 - x0));
    const { c, g } = makeCanvas(W, H);
    saucerPicture(g, W, H, i);
    const b = new GeoBuilder();
    b.paint = { joint: JOINT.none, expo: 0.3, cav: 0.95 };
    saucer(b, x0, x1, z0, z1, INT.vaultSpring, INT.vaultRise, 18, true);
    mesh(ctx, b, mosaicMaterial(toTexture(c), [Math.round((x1 - x0) / 0.025), Math.round((z1 - z0) / 0.025)]), "mosaic:quire");
  }
}

function saucerPicture(g: G, W: number, H: number, k: number) {
  // blue ground with gold stars at the edges, a gold field in the middle
  g.fillStyle = "#172a60";
  g.fillRect(0, 0, W, H);
  const r = rng(90 + k);
  g.fillStyle = "#e9c45d";
  for (let i = 0; i < 260; i++) {
    const sx = r() * W, sy = r() * H;
    g.beginPath();
    g.arc(sx, sy, 2 + r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  const cx = W / 2, cy = H / 2;
  g.save();
  g.beginPath();
  g.ellipse(cx, cy, W * 0.46, H * 0.46, 0, 0, Math.PI * 2);
  g.clip();
  goldGround(g, 0, 0, W, H, 60 + k);
  g.restore();
  g.lineWidth = 16;
  g.strokeStyle = "#8c2319";
  g.beginPath();
  g.ellipse(cx, cy, W * 0.46, H * 0.46, 0, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 6;
  g.strokeStyle = "#efe6cf";
  g.stroke();
  // eight angels round the centre, heads outwards
  const m = Math.min(W, H);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    g.save();
    g.translate(cx + Math.cos(a) * W * 0.3, cy + Math.sin(a) * H * 0.3);
    g.rotate(a + Math.PI / 2);
    figure(g, { x: 0, y: m * 0.12, h: m * 0.25, robe: i % 2 ? "#ece6da" : "#d9e0ea", mantle: i % 2 ? "#a3362a" : "#2d4f9c", halo: "#f6dc84", wings: "#e6e2d8", arm: "raise", skin: "#e2b391" });
    g.restore();
  }
  // the central roundel: the day of creation
  const R = m * 0.14;
  g.fillStyle = "#23408a";
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 8;
  g.strokeStyle = "#e7c35b";
  g.stroke();
  g.save();
  g.translate(cx, cy);
  const white = "#f2eee4";
  if (k === 0) {
    // birds of the air
    for (let i = 0; i < 7; i++) {
      const a = i * 0.9, rr = R * (0.2 + 0.1 * i);
      bird(g, Math.cos(a) * rr * 0.9, Math.sin(a) * rr * 0.7, R * 0.22, i % 2 ? white : "#d9a943");
    }
  } else if (k === 1) {
    // fishes of the sea
    g.fillStyle = "#2f6f9a";
    g.fillRect(-R, R * 0.1, R * 2, R);
    for (let i = 0; i < 6; i++) fish(g, (i % 3 - 1) * R * 0.55, -R * 0.35 + Math.floor(i / 3) * R * 0.6, R * 0.35, i % 2 ? "#e9c45d" : white);
  } else if (k === 2) {
    // the beasts: a lion and a hart beneath a tree
    g.fillStyle = "#3f6b2a";
    g.beginPath();
    g.arc(0, -R * 0.4, R * 0.38, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#5a3b1e";
    g.fillRect(-R * 0.05, -R * 0.1, R * 0.1, R * 0.6);
    beast(g, -R * 0.45, R * 0.35, R * 0.45, "#c08a3a");
    beast(g, R * 0.45, R * 0.35, R * 0.4, "#8a5a33");
  } else {
    // the Lamb with the banner
    g.fillStyle = white;
    g.beginPath();
    g.ellipse(0, R * 0.15, R * 0.42, R * 0.24, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.ellipse(R * 0.4, -R * 0.1, R * 0.14, R * 0.12, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#f0cf6a";
    g.beginPath();
    g.arc(R * 0.4, -R * 0.12, R * 0.2, 0, Math.PI * 2);
    g.globalAlpha = 0.6;
    g.fill();
    g.globalAlpha = 1;
    g.fillStyle = white;
    for (const lx of [-0.25, -0.1, 0.12, 0.28]) g.fillRect(R * lx, R * 0.3, R * 0.06, R * 0.35);
    g.strokeStyle = "#5a3b1e";
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(-R * 0.1, R * 0.1);
    g.lineTo(-R * 0.1, -R * 0.75);
    g.stroke();
    g.fillStyle = "#f2eee4";
    g.fillRect(-R * 0.1, -R * 0.75, R * 0.45, R * 0.25);
    g.fillStyle = "#a3261c";
    g.fillRect(R * 0.07, -R * 0.75, R * 0.07, R * 0.25);
    g.fillRect(-R * 0.1, -R * 0.66, R * 0.45, R * 0.07);
  }
  g.restore();
}

function bird(g: G, x: number, y: number, s: number, c: string) {
  g.fillStyle = c;
  g.beginPath();
  g.ellipse(x, y, s * 0.35, s * 0.14, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(x - s * 0.1, y);
  g.quadraticCurveTo(x - s * 0.3, y - s * 0.6, x - s * 0.6, y - s * 0.5);
  g.quadraticCurveTo(x - s * 0.2, y - s * 0.1, x, y);
  g.moveTo(x + s * 0.1, y);
  g.quadraticCurveTo(x + s * 0.3, y - s * 0.6, x + s * 0.6, y - s * 0.5);
  g.quadraticCurveTo(x + s * 0.2, y - s * 0.1, x, y);
  g.fill();
}

function fish(g: G, x: number, y: number, s: number, c: string) {
  g.fillStyle = c;
  g.beginPath();
  g.ellipse(x, y, s * 0.5, s * 0.2, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(x - s * 0.45, y);
  g.lineTo(x - s * 0.75, y - s * 0.22);
  g.lineTo(x - s * 0.75, y + s * 0.22);
  g.fill();
}

function beast(g: G, x: number, y: number, s: number, c: string) {
  g.fillStyle = c;
  g.beginPath();
  g.ellipse(x, y, s * 0.5, s * 0.24, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.ellipse(x + s * 0.45, y - s * 0.22, s * 0.18, s * 0.16, 0, 0, Math.PI * 2);
  g.fill();
  for (const lx of [-0.35, -0.15, 0.15, 0.35]) g.fillRect(x + lx * s, y + s * 0.1, s * 0.08, s * 0.4);
}

// ------------------------------------------------------------------------------ aisles

/** Holman Hunt's "The Light of the World": Christ at night knocking at an overgrown door. */
function lightOfTheWorld(): HTMLCanvasElement {
  const W = 768, H = 1344;
  const { c, g } = makeCanvas(W, H);
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#0d1a1c");
  bg.addColorStop(0.6, "#16271f");
  bg.addColorStop(1, "#0b140f");
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  const r = rng(11);
  // orchard: trunks and dark foliage, and the moon behind the head
  for (let i = 0; i < 7; i++) {
    g.fillStyle = "#0a110c";
    g.fillRect(W * (0.45 + 0.08 * i) + r() * 20, H * 0.05, 14 + r() * 10, H * 0.6);
  }
  for (let i = 0; i < 60; i++) {
    g.fillStyle = `rgba(${20 + r() * 20},${45 + r() * 25},${30 + r() * 15},0.8)`;
    g.beginPath();
    g.arc(W * (0.4 + r() * 0.6), H * r() * 0.35, 20 + r() * 40, 0, Math.PI * 2);
    g.fill();
  }
  const moon = g.createRadialGradient(W * 0.55, H * 0.15, 5, W * 0.55, H * 0.15, W * 0.24);
  moon.addColorStop(0, "rgba(250,240,200,0.95)");
  moon.addColorStop(0.55, "rgba(230,215,160,0.8)");
  moon.addColorStop(1, "rgba(200,190,140,0)");
  g.fillStyle = moon;
  g.fillRect(0, 0, W, H * 0.4);
  // the door, overgrown with ivy
  g.fillStyle = "#3b2616";
  g.fillRect(0, H * 0.2, W * 0.3, H * 0.75);
  g.strokeStyle = "#24160c";
  g.lineWidth = 4;
  for (let i = 1; i < 5; i++) {
    g.beginPath();
    g.moveTo(W * 0.06 * i, H * 0.2);
    g.lineTo(W * 0.06 * i, H * 0.95);
    g.stroke();
  }
  g.fillStyle = "#1c1208";
  for (let i = 0; i < 12; i++) g.fillRect(W * (0.03 + 0.06 * (i % 5)), H * (0.3 + 0.15 * Math.floor(i / 5)), 8, 8);
  for (let i = 0; i < 90; i++) {
    g.fillStyle = `rgba(${40 + r() * 30},${70 + r() * 50},${30 + r() * 20},0.9)`;
    g.beginPath();
    g.ellipse(W * r() * 0.33, H * (0.2 + r() * 0.3), 10 + r() * 12, 6 + r() * 7, r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  // weeds at the threshold
  for (let i = 0; i < 70; i++) {
    g.strokeStyle = `rgba(${50 + r() * 40},${80 + r() * 40},${30 + r() * 20},0.9)`;
    g.lineWidth = 3;
    const x = r() * W, y = H * (0.9 + r() * 0.1);
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + (r() - 0.5) * 30, y - 40, x + (r() - 0.5) * 50, y - 60 - r() * 60);
    g.stroke();
  }
  // Christ with the lantern, crowned, in a white robe and a jewelled mantle
  figure(g, { x: W * 0.56, y: H * 0.97, h: H * 0.88, robe: "#e8e2d2", mantle: "#8c2a1c", halo: "#e8d69a", beard: true, arm: "lantern", crown: true, hair: "#6b4a2a", turn: -0.2 });
  // warm light of the lantern on the ground and the robe
  const glow = g.createRadialGradient(W * 0.75, H * 0.75, 10, W * 0.75, H * 0.75, W * 0.55);
  glow.addColorStop(0, "rgba(255,190,90,0.35)");
  glow.addColorStop(1, "rgba(255,160,60,0)");
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);
  varnish(g, W, H);
  return c;
}

/** An Annunciation: the angel with a lily, the Virgin reading, the dove in a beam of light. */
function annunciation(): HTMLCanvasElement {
  const W = 1200, H = 860;
  const { c, g } = makeCanvas(W, H);
  // loggia: back wall with an arched opening to the sky, a chequered floor
  g.fillStyle = "#8c7a5e";
  g.fillRect(0, 0, W, H);
  const sky = g.createLinearGradient(0, H * 0.1, 0, H * 0.6);
  sky.addColorStop(0, "#5f86b8");
  sky.addColorStop(1, "#e3d6b4");
  g.fillStyle = sky;
  g.beginPath();
  g.moveTo(W * 0.4, H * 0.62);
  g.lineTo(W * 0.4, H * 0.3);
  g.arc(W * 0.5, H * 0.3, W * 0.1, Math.PI, 0);
  g.lineTo(W * 0.6, H * 0.62);
  g.fill();
  g.fillStyle = "#4e6b3f";
  g.fillRect(W * 0.4, H * 0.54, W * 0.2, H * 0.08);
  for (const x of [0.36, 0.64]) {
    g.fillStyle = "#b4a488";
    g.fillRect(W * x - 16, H * 0.1, 32, H * 0.55);
  }
  for (let i = 0; i < 12; i++) {
    for (let j = 0; j < 5; j++) {
      g.fillStyle = (i + j) % 2 ? "#d9cdb4" : "#5a4a3a";
      const y0 = H * (0.65 + j * 0.07), y1 = y0 + H * 0.07;
      const sk = (y: number) => (y - H * 0.6) * 0.6;
      const xa = (i / 12) * W, xb = ((i + 1) / 12) * W;
      g.beginPath();
      g.moveTo(xa - sk(y0) * (0.5 - i / 12), y0);
      g.lineTo(xb - sk(y0) * (0.5 - (i + 1) / 12), y0);
      g.lineTo(xb - sk(y1) * (0.5 - (i + 1) / 12), y1);
      g.lineTo(xa - sk(y1) * (0.5 - i / 12), y1);
      g.fill();
    }
  }
  // beam of light and the dove
  g.fillStyle = "rgba(255,236,170,0.35)";
  g.beginPath();
  g.moveTo(W * 0.3, 0);
  g.lineTo(W * 0.38, 0);
  g.lineTo(W * 0.74, H * 0.4);
  g.lineTo(W * 0.68, H * 0.44);
  g.fill();
  bird(g, W * 0.45, H * 0.14, 90, "#f4f0e6");
  // the angel and the Virgin
  figure(g, { x: W * 0.26, y: H * 0.96, h: H * 0.86, robe: "#ece6da", mantle: "#b89a6a", halo: "#f0cf6a", wings: "#e8dcc8", arm: "bless", skin: "#e2b391", turn: 0.7 });
  g.strokeStyle = "#3f6b2a";
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(W * 0.31, H * 0.55);
  g.lineTo(W * 0.36, H * 0.28);
  g.stroke();
  g.fillStyle = "#f8f6ee";
  for (let i = 0; i < 3; i++) {
    g.beginPath();
    g.ellipse(W * 0.355 + i * 4, H * (0.29 + i * 0.05), 16, 9, 0.5, 0, Math.PI * 2);
    g.fill();
  }
  figure(g, { x: W * 0.72, y: H * 0.96, h: H * 0.95, pose: "seat", robe: "#a3261c", mantle: "#2d4f9c", halo: "#f0cf6a", arm: "book", skin: "#e8b99a", hair: "#4a2e1a", turn: -0.6 });
  varnish(g, W, H);
  return c;
}

/** Old varnish and a darkened edge. */
function varnish(g: G, W: number, H: number) {
  g.fillStyle = "rgba(120,80,20,0.12)";
  g.fillRect(0, 0, W, H);
  const v = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(10,5,0,0.55)");
  g.fillStyle = v;
  g.fillRect(0, 0, W, H);
}

/** A framed painting on a wall: centre c at height yc, wall normal n (plan), picture w x h. */
function framedPainting(ctx: Ctx, canvas: HTMLCanvasElement, c: V2, n: V2, yc: number, w: number, h: number) {
  const right: V2 = [n[1], -n[0]];
  const P = (u: number, y: number, d: number): V3 => [c[0] + right[0] * u + n[0] * d, y, c[1] + right[1] * u + n[1] * d];
  const b = new GeoBuilder();
  b.paint = { joint: JOINT.none, expo: 0.5, cav: 1 };
  const nn: V3 = [n[0], 0, n[1]];
  const q = (u: number, y: number) => {
    const p = P(u, y, 0.07);
    return b.v(p[0], p[1], p[2], nn[0], nn[1], nn[2], (u + w / 2) / w, (y - (yc - h / 2)) / h);
  };
  const a = q(-w / 2, yc - h / 2), e = q(w / 2, yc - h / 2), f = q(w / 2, yc + h / 2), k = q(-w / 2, yc + h / 2);
  b.orientQuad(a, e, f, k);
  mesh(ctx, b, paintingMaterial(toTexture(canvas)), "painting");
  // gilded frame: four moulded bars
  const gold = ctx.g("goldInt");
  const fw = 0.14;
  gold.withPaint({ cav: 0.95 }, () => {
    const bar = (u0: number, u1: number, y0: number, y1: number) => {
      const p0 = P(u0, y0, 0), p1 = P(u1, y1, 0.13);
      gold.box(Math.min(p0[0], p1[0]), y0, Math.min(p0[2], p1[2]), Math.max(p0[0], p1[0]), y1, Math.max(p0[2], p1[2]));
    };
    bar(-w / 2 - fw, w / 2 + fw, yc - h / 2 - fw, yc - h / 2);
    bar(-w / 2 - fw, w / 2 + fw, yc + h / 2, yc + h / 2 + fw);
    bar(-w / 2 - fw, -w / 2, yc - h / 2, yc + h / 2);
    bar(w / 2, w / 2 + fw, yc - h / 2, yc + h / 2);
  });
  // a small brass label below
  gold.withPaint({ cav: 0.8 }, () => {
    const p0 = P(-0.2, yc - h / 2 - fw - 0.22, 0), p1 = P(0.2, yc - h / 2 - fw - 0.12, 0.02);
    gold.box(Math.min(p0[0], p1[0]), p0[1], Math.min(p0[2], p1[2]), Math.max(p0[0], p1[0]), p1[1], Math.max(p0[2], p1[2]));
  });
}

/** Paintings at the west end of the aisles, marble monuments at the other clear stretches. */
function aisles(ctx: Ctx) {
  const pick = (south: boolean) => {
    let best = -1, bd = Infinity;
    AISLE_SPOTS.forEach((s, i) => {
      if ((s.z > 0) !== south) return;
      const d = Math.abs(s.x + 64);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  };
  const lotw = pick(true), ann = pick(false);
  let v = 0;
  AISLE_SPOTS.forEach((s, i) => {
    if (i === lotw) framedPainting(ctx, lightOfTheWorld(), [s.x, s.z], s.n, F + 3.6, 1.55, 2.7);
    else if (i === ann) framedPainting(ctx, annunciation(), [s.x, s.z], s.n, F + 3.3, 2.5, 1.8);
    else monument(ctx, [s.x, s.z], s.n, v++);
  });
}

/** A wall monument: plinth, pedestal with cornice, and the carved marble above. */
function monument(ctx: Ctx, c: V2, n: V2, variant: number) {
  const right: V2 = [n[1], -n[0]];
  const box = (m: GeoBuilder, u0: number, u1: number, y0: number, y1: number, d0: number, d1: number) => {
    const a = [c[0] + right[0] * u0 + n[0] * d0, c[1] + right[1] * u0 + n[1] * d0];
    const b = [c[0] + right[0] * u1 + n[0] * d1, c[1] + right[1] * u1 + n[1] * d1];
    m.box(Math.min(a[0], b[0]), y0, Math.min(a[1], b[1]), Math.max(a[0], b[0]), y1, Math.max(a[1], b[1]));
  };
  const black = ctx.g("blackMarble"), white = ctx.g("whiteMarble");
  black.withPaint({ cav: 0.9 }, () => box(black, -1.2, 1.2, F, F + 0.32, 0, 0.62));
  white.withPaint({ cav: 0.9 }, () => {
    box(white, -1.0, 1.0, F + 0.32, F + 1.15, 0, 0.48);
    box(white, -1.12, 1.12, F + 1.15, F + 1.3, 0, 0.58);
  });
  black.withPaint({ cav: 0.9 }, () => box(black, -0.8, 0.8, F + 0.45, F + 1.02, 0.48, 0.5));
  placeRelief(ctx, monumentRelief(1.9, 3.6, variant), [c[0] + n[0] * 0.005, F + 1.3, c[1] + n[1] * 0.005], n, "whiteMarble", { cavK: 7 });
  const p0 = [c[0] + right[0] * -1.2, c[1] + right[1] * -1.2], p1 = [c[0] + right[0] * 1.2 + n[0] * 0.65, c[1] + right[1] * 1.2 + n[1] * 0.65];
  ctx.col.box(Math.min(p0[0], p1[0]), F - 0.5, Math.min(p0[1], p1[1]), Math.max(p0[0], p1[0]), F + 1.3, Math.max(p0[1], p1[1]));
}
