import * as THREE from "three";
import { rng } from "../core/rng";
import { patchMaterial } from "./materials";

/**
 * Painted and mosaic pictures, drawn procedurally on canvases at load time: robed figures with
 * haloes and wings, lettering, ornament borders, gold grounds. The mosaic material samples the
 * picture per tessera, sets gold tesserae metallic and draws the grout between them; the
 * painting material is a varnished canvas.
 */

type G = CanvasRenderingContext2D;

export function makeCanvas(w: number, h: number): { c: HTMLCanvasElement; g: G } {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, g: c.getContext("2d")! };
}

export function toTexture(c: HTMLCanvasElement, anisotropy = 8) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}

// ------------------------------------------------------------------------------ materials

export function paintingMaterial(tex: THREE.Texture) {
  const m = new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 0.5 });
  return patchMaterial(m, {
    key: "painting",
    albedo: `
      float n = texture2D(uNoise, vSurfUv * 7.0).r;
      diffuseColor.rgb *= 0.94 + 0.08 * n;
      surfRough = 0.42 + 0.2 * n;
      surfAO = mix(0.7, 1.0, vColor.b);
    `,
    ambient: "uInteriorAmbient",
  });
}

/** Gold-ground mosaic: tiles = number of tesserae across (u) and down (v) the picture. */
export function mosaicMaterial(tex: THREE.Texture, tiles: [number, number]) {
  const m = new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 0.35, metalness: 0.5 });
  return patchMaterial(m, {
    key: "mosaicPic",
    pars: "uniform vec2 uTiles;",
    uniforms: { uTiles: { value: new THREE.Vector2(...tiles) } },
    albedo: `
      vec2 tq = vMapUv * uTiles;
      vec2 cell = floor(tq);
      vec2 f = fract(tq);
      vec4 t = texture2D(map, (cell + 0.5) / uTiles);
      float h = hash12(cell);
      vec3 c = t.rgb * (0.82 + 0.36 * h);
      float edge = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
      float fw = max(fwidth(tq.x), fwidth(tq.y));
      float grout = smoothstep(0.0, 0.1 + fw, edge);
      float gold = smoothstep(0.08, 0.25, t.r - t.b) * smoothstep(0.25, 0.5, t.r) * step(t.g, t.r);
      diffuseColor.rgb = mix(vec3(0.06, 0.05, 0.04), c, mix(0.35 + 0.65 * grout, 1.0, smoothstep(0.3, 0.8, fw)));
      surfMetal = gold * 0.9 * mix(grout, 1.0, smoothstep(0.3, 0.8, fw));
      surfRough = mix(0.55, 0.22 + 0.2 * h, gold);
      surfAO = mix(0.6, 1.0, vColor.b);
    `,
    ambient: "uInteriorAmbient * 1.3",
    specDesat: 0.2,
  });
}

// ------------------------------------------------------------------------------ grounds and ornament

export const GOLD = ["#c9962e", "#e3b54c", "#b07f22", "#d8a53c"];

/** Gold ground: blotchy warm gold like set tesserae. */
export function goldGround(g: G, x: number, y: number, w: number, h: number, seed = 1) {
  const r = rng(seed);
  const grad = g.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, "#d9a943");
  grad.addColorStop(1, "#b98a2d");
  g.fillStyle = grad;
  g.fillRect(x, y, w, h);
  for (let i = 0; i < (w * h) / 900; i++) {
    g.fillStyle = GOLD[Math.floor(r() * GOLD.length)];
    g.globalAlpha = 0.25;
    const s = 6 + r() * 18;
    g.fillRect(x + r() * w, y + r() * h, s, s);
  }
  g.globalAlpha = 1;
}

/** Border band of blue with a row of pearls and red fillets. */
export function border(g: G, x: number, y: number, w: number, h: number, t: number) {
  g.save();
  g.lineWidth = t;
  g.strokeStyle = "#1c2f63";
  g.strokeRect(x + t / 2, y + t / 2, w - t, h - t);
  g.lineWidth = t * 0.15;
  g.strokeStyle = "#8c2319";
  g.strokeRect(x + t * 0.1, y + t * 0.1, w - t * 0.2, h - t * 0.2);
  g.strokeRect(x + t * 0.9, y + t * 0.9, w - t * 1.8, h - t * 1.8);
  g.fillStyle = "#efe6cf";
  const step = t * 1.1;
  for (let i = x + t; i < x + w - t / 2; i += step) {
    for (const yy of [y + t / 2, y + h - t / 2]) {
      g.beginPath();
      g.arc(i, yy, t * 0.18, 0, Math.PI * 2);
      g.fill();
    }
  }
  for (let j = y + t; j < y + h - t / 2; j += step) {
    for (const xx of [x + t / 2, x + w - t / 2]) {
      g.beginPath();
      g.arc(xx, j, t * 0.18, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.restore();
}

/** Serif capitals centred at (x, y). */
export function letters(g: G, text: string, x: number, y: number, size: number, color = "#2a1a0c", spacing = 0.12) {
  g.save();
  g.font = `600 ${size}px "Times New Roman", Georgia, serif`;
  g.fillStyle = color;
  g.textAlign = "left";
  g.textBaseline = "middle";
  const chars = [...text];
  const widths = chars.map((c) => g.measureText(c).width + size * spacing);
  const total = widths.reduce((a, b) => a + b, 0) - size * spacing;
  let cx = x - total / 2;
  chars.forEach((c, i) => {
    g.fillText(c, cx, y);
    cx += widths[i];
  });
  g.restore();
}

/** Vine scroll with leaves and grapes (for mosaic bands). */
export function vineScroll(g: G, x: number, y: number, w: number, h: number, seed = 3, stem = "#2f5a2a", leafC = "#3f7a33", fruit = "#5b2a6e") {
  const r = rng(seed);
  const n = Math.max(1, Math.round(w / (h * 1.2)));
  g.save();
  g.strokeStyle = stem;
  g.lineWidth = h * 0.05;
  g.lineCap = "round";
  g.beginPath();
  for (let i = 0; i <= 80 * n; i++) {
    const t = i / (80 * n);
    const px = x + w * t, py = y + h / 2 + Math.sin(t * Math.PI * 2 * n) * h * 0.22;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.stroke();
  for (let k = 0; k < 2 * n; k++) {
    const up = k % 2 === 0 ? -1 : 1;
    const cx = x + (w * (k + 0.5)) / (2 * n), cy = y + h / 2 + up * h * 0.15;
    g.beginPath();
    for (let i = 0; i <= 30; i++) {
      const t = i / 30;
      const a = up * (Math.PI / 2 + t * Math.PI * 1.6);
      const rr = h * 0.3 * (1 - 0.7 * t);
      const px = cx + Math.cos(a) * rr, py = cy - Math.sin(a) * rr;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.lineWidth = h * 0.035;
    g.stroke();
    // leaves and a bunch of grapes
    for (let l = 0; l < 3; l++) {
      g.fillStyle = leafC;
      const a = r() * Math.PI * 2;
      g.beginPath();
      g.ellipse(cx + Math.cos(a) * h * 0.2, cy + Math.sin(a) * h * 0.2, h * 0.13, h * 0.07, a, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = fruit;
    for (let q = 0; q < 7; q++) {
      g.beginPath();
      g.arc(cx + (q % 3 - 1) * h * 0.05, cy + Math.floor(q / 3) * h * 0.05, h * 0.03, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.restore();
}

// ------------------------------------------------------------------------------ figures

export interface FigSpec {
  /** Feet centre and height of a standing figure (px). */
  x: number;
  y: number;
  h: number;
  pose?: "stand" | "seat";
  robe: string;
  mantle?: string;
  skin?: string;
  hair?: string;
  beard?: boolean;
  halo?: string | null;
  arm?: "bless" | "book" | "lantern" | "raise" | "write" | "down" | "scroll";
  wings?: string | null;
  /** Head turned to the viewer's right (+) or left (-). */
  turn?: number;
  crown?: boolean;
}

function shade(hex: string, k: number) {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l * k)));
  return `#${c.getHexString()}`;
}

/** Fills a path with a sideways-lit gradient (form shadow on the right). */
function volumeFill(g: G, x0: number, x1: number, base: string) {
  const grad = g.createLinearGradient(x0, 0, x1, 0);
  grad.addColorStop(0, shade(base, 0.6));
  grad.addColorStop(0.3, shade(base, 1.18));
  grad.addColorStop(0.55, base);
  grad.addColorStop(1, shade(base, 0.45));
  g.fillStyle = grad;
  g.fill();
}

function wing(g: G, x: number, y: number, s: number, dir: number, color: string) {
  g.save();
  g.translate(x, y);
  g.scale(dir, 1);
  const feathers = 8;
  for (let i = feathers - 1; i >= 0; i--) {
    const t = i / (feathers - 1);
    const a = -1.35 + t * 1.25;
    const len = s * (0.55 + 0.45 * (1 - t));
    g.fillStyle = shade(color, 0.75 + 0.35 * t);
    g.beginPath();
    g.ellipse(Math.cos(a) * len * 0.5 + s * 0.08, Math.sin(a) * len * 0.5 - s * 0.05, len * 0.52, s * 0.07, a, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = shade(color, 1.1);
  g.beginPath();
  g.ellipse(s * 0.12, -s * 0.2, s * 0.2, s * 0.12, -0.9, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/** A robed figure: halo, wings, robe with folds, mantle, arms and attributes, head. */
export function figure(g: G, f: FigSpec) {
  const { x, y, h } = f;
  const seat = f.pose === "seat";
  const skin = f.skin ?? "#d8a27c";
  const hair = f.hair ?? "#4a2e1a";
  const headY = y - (seat ? 0.74 : 0.905) * h, headR = 0.062 * h;
  const shY = headY + 0.115 * h;
  const turn = f.turn ?? 0;
  if (f.wings) {
    wing(g, x - 0.08 * h, shY + 0.02 * h, 0.55 * h, -1, f.wings);
    wing(g, x + 0.08 * h, shY + 0.02 * h, 0.55 * h, 1, f.wings);
  }
  if (f.halo) {
    const hg = g.createRadialGradient(x, headY, headR * 0.5, x, headY, headR * 1.9);
    hg.addColorStop(0, shade(f.halo, 1.25));
    hg.addColorStop(0.85, f.halo);
    hg.addColorStop(1, shade(f.halo, 0.6));
    g.fillStyle = hg;
    g.beginPath();
    g.arc(x, headY - 0.005 * h, headR * 1.9, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = shade(f.halo, 0.55);
    g.lineWidth = h * 0.006;
    g.stroke();
  }
  // robe
  g.beginPath();
  if (!seat) {
    g.moveTo(x - 0.13 * h, shY);
    g.bezierCurveTo(x - 0.17 * h, y - 0.5 * h, x - 0.19 * h, y - 0.2 * h, x - 0.21 * h, y);
    g.lineTo(x + 0.21 * h, y);
    g.bezierCurveTo(x + 0.19 * h, y - 0.2 * h, x + 0.17 * h, y - 0.5 * h, x + 0.13 * h, shY);
  } else {
    g.moveTo(x - 0.13 * h, shY);
    g.bezierCurveTo(x - 0.16 * h, y - 0.45 * h, x - 0.22 * h, y - 0.36 * h, x - 0.25 * h, y - 0.3 * h);
    g.bezierCurveTo(x - 0.27 * h, y - 0.15 * h, x - 0.25 * h, y - 0.05 * h, x - 0.23 * h, y);
    g.lineTo(x + 0.23 * h, y);
    g.bezierCurveTo(x + 0.25 * h, y - 0.05 * h, x + 0.27 * h, y - 0.15 * h, x + 0.25 * h, y - 0.3 * h);
    g.bezierCurveTo(x + 0.22 * h, y - 0.36 * h, x + 0.16 * h, y - 0.45 * h, x + 0.13 * h, shY);
  }
  g.quadraticCurveTo(x, shY - 0.03 * h, x - 0.13 * h, shY);
  g.closePath();
  volumeFill(g, x - 0.22 * h, x + 0.22 * h, f.robe);
  // folds
  g.save();
  g.clip();
  g.lineCap = "round";
  for (let i = -3; i <= 3; i++) {
    const fx = x + i * 0.05 * h;
    g.strokeStyle = shade(f.robe, 0.55);
    g.globalAlpha = 0.55;
    g.lineWidth = 0.012 * h;
    g.beginPath();
    g.moveTo(fx * 0.4 + x * 0.6, y - (seat ? 0.35 : 0.55) * h);
    g.bezierCurveTo(fx + 0.01 * h, y - 0.35 * h, fx - 0.01 * h, y - 0.15 * h, fx + i * 0.012 * h, y);
    g.stroke();
    g.strokeStyle = shade(f.robe, 1.4);
    g.globalAlpha = 0.3;
    g.lineWidth = 0.008 * h;
    g.beginPath();
    g.moveTo(fx * 0.4 + x * 0.6 + 0.015 * h, y - (seat ? 0.35 : 0.55) * h);
    g.bezierCurveTo(fx + 0.025 * h, y - 0.35 * h, fx + 0.005 * h, y - 0.15 * h, fx + i * 0.012 * h + 0.015 * h, y);
    g.stroke();
  }
  g.restore();
  g.globalAlpha = 1;
  // mantle over one shoulder, across to the knees
  if (f.mantle) {
    g.beginPath();
    g.moveTo(x + 0.13 * h, shY - 0.005 * h);
    g.bezierCurveTo(x + 0.22 * h, y - 0.55 * h, x + 0.14 * h, y - (seat ? 0.28 : 0.3) * h, x - 0.2 * h, y - (seat ? 0.22 : 0.26) * h);
    g.lineTo(x - 0.19 * h, y - (seat ? 0.36 : 0.45) * h);
    g.bezierCurveTo(x - 0.1 * h, y - 0.5 * h, x - 0.02 * h, shY + 0.1 * h, x - 0.06 * h, shY);
    g.closePath();
    volumeFill(g, x - 0.2 * h, x + 0.22 * h, f.mantle);
    g.save();
    g.clip();
    g.strokeStyle = shade(f.mantle, 0.55);
    g.globalAlpha = 0.5;
    g.lineWidth = 0.01 * h;
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      g.moveTo(x + (0.12 - i * 0.03) * h, shY + i * 0.02 * h);
      g.quadraticCurveTo(x + (0.05 - i * 0.02) * h, y - 0.45 * h, x - (0.12 - i * 0.015) * h, y - (0.3 - i * 0.02) * h);
      g.stroke();
    }
    g.restore();
    g.globalAlpha = 1;
  }
  // arms (sleeves) and hands
  const sleeve = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => {
    g.strokeStyle = shade(f.mantle ?? f.robe, 0.95);
    g.lineWidth = 0.065 * h;
    g.lineCap = "round";
    g.lineJoin = "round";
    g.beginPath();
    g.moveTo(ax, ay);
    g.quadraticCurveTo(bx, by, cx, cy);
    g.stroke();
    g.strokeStyle = shade(f.mantle ?? f.robe, 0.6);
    g.lineWidth = 0.012 * h;
    g.stroke();
    g.fillStyle = skin;
    g.beginPath();
    g.ellipse(cx, cy, 0.024 * h, 0.03 * h, 0, 0, Math.PI * 2);
    g.fill();
  };
  const lS: [number, number] = [x - 0.12 * h, shY + 0.03 * h], rS: [number, number] = [x + 0.12 * h, shY + 0.03 * h];
  switch (f.arm ?? "down") {
    case "bless":
      sleeve(...lS, x - 0.2 * h, shY + 0.2 * h, x - 0.17 * h, shY + 0.02 * h);
      sleeve(...rS, x + 0.16 * h, shY + 0.2 * h, x + 0.06 * h, shY + 0.25 * h);
      book(g, x + 0.02 * h, shY + 0.18 * h, 0.12 * h);
      break;
    case "book":
      sleeve(...lS, x - 0.16 * h, shY + 0.22 * h, x - 0.04 * h, shY + 0.24 * h);
      sleeve(...rS, x + 0.16 * h, shY + 0.22 * h, x + 0.06 * h, shY + 0.26 * h);
      book(g, x + 0.01 * h, shY + 0.19 * h, 0.13 * h);
      break;
    case "write":
      sleeve(...lS, x - 0.16 * h, shY + 0.25 * h, x - 0.02 * h, y - 0.36 * h);
      sleeve(...rS, x + 0.2 * h, shY + 0.18 * h, x + 0.1 * h, y - 0.38 * h);
      book(g, x + 0.03 * h, y - 0.42 * h, 0.16 * h, true);
      g.strokeStyle = "#f4ecd8";
      g.lineWidth = 0.006 * h;
      g.beginPath();
      g.moveTo(x + 0.1 * h, y - 0.38 * h);
      g.lineTo(x + 0.16 * h, y - 0.5 * h);
      g.stroke();
      break;
    case "raise":
      sleeve(...lS, x - 0.24 * h, shY + 0.05 * h, x - 0.27 * h, shY - 0.12 * h);
      sleeve(...rS, x + 0.24 * h, shY + 0.05 * h, x + 0.27 * h, shY - 0.12 * h);
      break;
    case "scroll":
      sleeve(...lS, x - 0.17 * h, shY + 0.2 * h, x - 0.1 * h, shY + 0.3 * h);
      sleeve(...rS, x + 0.17 * h, shY + 0.2 * h, x + 0.1 * h, shY + 0.3 * h);
      g.fillStyle = "#efe4c4";
      g.fillRect(x - 0.1 * h, shY + 0.28 * h, 0.2 * h, 0.2 * h);
      g.strokeStyle = "#5a4630";
      g.lineWidth = 0.004 * h;
      for (let i = 0; i < 5; i++) {
        g.beginPath();
        g.moveTo(x - 0.08 * h, shY + (0.32 + i * 0.03) * h);
        g.lineTo(x + 0.08 * h, shY + (0.32 + i * 0.03) * h);
        g.stroke();
      }
      break;
    case "lantern": {
      sleeve(...lS, x - 0.2 * h, shY + 0.12 * h, x - 0.16 * h, shY + 0.02 * h);
      sleeve(...rS, x + 0.2 * h, shY + 0.18 * h, x + 0.2 * h, shY + 0.34 * h);
      const lx = x + 0.2 * h, ly = shY + 0.44 * h;
      const glow = g.createRadialGradient(lx, ly, 0, lx, ly, 0.35 * h);
      glow.addColorStop(0, "rgba(255,210,120,0.95)");
      glow.addColorStop(0.2, "rgba(255,170,60,0.5)");
      glow.addColorStop(1, "rgba(255,150,40,0)");
      g.fillStyle = glow;
      g.fillRect(lx - 0.35 * h, ly - 0.35 * h, 0.7 * h, 0.7 * h);
      g.fillStyle = "#6b4a1c";
      g.beginPath();
      g.moveTo(lx - 0.045 * h, ly - 0.06 * h);
      g.lineTo(lx + 0.045 * h, ly - 0.06 * h);
      g.lineTo(lx + 0.055 * h, ly + 0.06 * h);
      g.lineTo(lx - 0.055 * h, ly + 0.06 * h);
      g.closePath();
      g.fill();
      g.fillStyle = "#ffd58a";
      g.fillRect(lx - 0.035 * h, ly - 0.045 * h, 0.07 * h, 0.09 * h);
      g.strokeStyle = "#6b4a1c";
      g.lineWidth = 0.008 * h;
      g.beginPath();
      g.moveTo(lx, ly - 0.06 * h);
      g.lineTo(lx, ly - 0.1 * h);
      g.stroke();
      break;
    }
    default:
      sleeve(...lS, x - 0.16 * h, shY + 0.2 * h, x - 0.15 * h, shY + 0.36 * h);
      sleeve(...rS, x + 0.16 * h, shY + 0.2 * h, x + 0.15 * h, shY + 0.36 * h);
  }
  // neck and head
  g.fillStyle = shade(skin, 0.8);
  g.fillRect(x - 0.022 * h, headY + headR * 0.6, 0.044 * h, 0.05 * h);
  const hg = g.createRadialGradient(x - headR * 0.3 + turn * headR * 0.3, headY - headR * 0.3, headR * 0.1, x, headY, headR * 1.2);
  hg.addColorStop(0, shade(skin, 1.15));
  hg.addColorStop(1, shade(skin, 0.7));
  g.fillStyle = hg;
  g.beginPath();
  g.ellipse(x + turn * headR * 0.15, headY, headR * 0.82, headR, 0, 0, Math.PI * 2);
  g.fill();
  // hair
  g.fillStyle = hair;
  g.beginPath();
  g.ellipse(x - turn * headR * 0.1, headY - headR * 0.35, headR * 0.92, headR * 0.72, 0, Math.PI, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.ellipse(x - headR * 0.72, headY + headR * 0.1, headR * 0.25, headR * 0.7, 0.1, 0, Math.PI * 2);
  g.ellipse(x + headR * 0.72, headY + headR * 0.1, headR * 0.25, headR * 0.7, -0.1, 0, Math.PI * 2);
  g.fill();
  if (f.beard) {
    g.beginPath();
    g.ellipse(x + turn * headR * 0.15, headY + headR * 0.72, headR * 0.55, headR * 0.5, 0, 0, Math.PI);
    g.fill();
  }
  // features
  g.fillStyle = shade(skin, 0.45);
  for (const s of [-1, 1]) {
    g.beginPath();
    g.ellipse(x + turn * headR * 0.25 + s * headR * 0.32, headY - headR * 0.05, headR * 0.12, headR * 0.06, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = shade(skin, 0.55);
  g.lineWidth = headR * 0.08;
  g.beginPath();
  g.moveTo(x + turn * headR * 0.3, headY);
  g.lineTo(x + turn * headR * 0.35 + headR * 0.05, headY + headR * 0.3);
  g.stroke();
  g.beginPath();
  g.moveTo(x + turn * headR * 0.28 - headR * 0.15, headY + headR * 0.5);
  g.lineTo(x + turn * headR * 0.28 + headR * 0.15, headY + headR * 0.5);
  g.stroke();
  if (f.crown) {
    g.strokeStyle = "#3d3a1c";
    g.lineWidth = headR * 0.14;
    for (let i = 0; i < 9; i++) {
      const a = Math.PI + (i / 8) * Math.PI;
      g.beginPath();
      g.moveTo(x + Math.cos(a) * headR * 0.8, headY - headR * 0.45 + Math.sin(a) * headR * 0.35);
      g.lineTo(x + Math.cos(a) * headR * 1.05, headY - headR * 0.55 + Math.sin(a) * headR * 0.5);
      g.stroke();
    }
    g.fillStyle = "#e6c35a";
    g.fillRect(x - headR * 0.85, headY - headR * 0.62, headR * 1.7, headR * 0.2);
  }
}

function book(g: G, x: number, y: number, s: number, open = false) {
  g.fillStyle = open ? "#efe6cc" : "#7d1f18";
  g.beginPath();
  g.rect(x - s / 2, y - s * 0.35, s, s * 0.7);
  g.fill();
  g.strokeStyle = open ? "#6a5638" : "#e0b449";
  g.lineWidth = s * 0.06;
  g.stroke();
  if (open) {
    g.beginPath();
    g.moveTo(x, y - s * 0.35);
    g.lineTo(x, y + s * 0.35);
    g.stroke();
  } else {
    g.fillStyle = "#e0b449";
    g.fillRect(x - s * 0.08, y - s * 0.2, s * 0.16, s * 0.4);
    g.fillRect(x - s * 0.2, y - s * 0.06, s * 0.4, s * 0.12);
  }
}

// ------------------------------------------------------------------------------ symbols

/** The evangelists' symbols: winged man, lion, ox, eagle (simple emblems). */
export function evangelistSymbol(g: G, kind: number, x: number, y: number, s: number) {
  g.save();
  g.translate(x, y);
  const c = ["#e9e0cc", "#b8862f", "#8a5a33", "#6d5a45"][kind];
  wing(g, -s * 0.15, -s * 0.2, s * 0.8, -1, "#dfe3ea");
  wing(g, s * 0.15, -s * 0.2, s * 0.8, 1, "#dfe3ea");
  g.fillStyle = c;
  if (kind === 0) {
    figure(g, { x: 0, y: s * 0.55, h: s * 1.1, robe: "#e9e0cc", halo: "#f2d27a", arm: "book", skin: "#e0b08c" });
  } else {
    g.beginPath();
    g.ellipse(0, s * 0.15, s * 0.42, s * 0.28, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.ellipse(kind === 3 ? s * 0.05 : s * 0.3, -s * 0.2, s * (kind === 3 ? 0.14 : 0.22), s * 0.2, 0, 0, Math.PI * 2);
    g.fill();
    if (kind === 1) {
      g.fillStyle = "#8a5a1f";
      g.beginPath();
      g.arc(s * 0.3, -s * 0.2, s * 0.3, 0, Math.PI * 2);
      g.globalAlpha = 0.6;
      g.fill();
      g.globalAlpha = 1;
    } else if (kind === 2) {
      g.strokeStyle = "#efe6cc";
      g.lineWidth = s * 0.05;
      g.beginPath();
      g.moveTo(s * 0.15, -s * 0.35);
      g.quadraticCurveTo(s * 0.1, -s * 0.55, s * 0.2, -s * 0.6);
      g.moveTo(s * 0.45, -s * 0.35);
      g.quadraticCurveTo(s * 0.5, -s * 0.55, s * 0.4, -s * 0.6);
      g.stroke();
    } else {
      g.fillStyle = "#e0b449";
      g.beginPath();
      g.moveTo(s * 0.17, -s * 0.22);
      g.lineTo(s * 0.35, -s * 0.15);
      g.lineTo(s * 0.17, -s * 0.12);
      g.fill();
    }
    g.fillStyle = c;
    for (const lx of [-0.25, 0.25]) g.fillRect(lx * s - s * 0.05, s * 0.3, s * 0.1, s * 0.35);
  }
  g.restore();
}
