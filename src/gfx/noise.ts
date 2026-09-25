import * as THREE from "three";
import { rng } from "../core/rng";

/** Periodic value noise on a size x size grid with `period` lattice cells per tile. */
function periodicNoise(size: number, period: number, seed: number) {
  const r = rng(seed);
  const lat = new Float32Array(period * period);
  for (let i = 0; i < lat.length; i++) lat[i] = r();
  return (x: number, y: number) => {
    const fx = (x / size) * period, fy = (y / size) * period;
    const ix = Math.floor(fx), iy = Math.floor(fy);
    const tx = fx - ix, ty = fy - iy;
    const ux = tx * tx * tx * (tx * (tx * 6 - 15) + 10), uy = ty * ty * ty * (ty * (ty * 6 - 15) + 10);
    const x0 = ((ix % period) + period) % period, y0 = ((iy % period) + period) % period;
    const x1 = (x0 + 1) % period, y1 = (y0 + 1) % period;
    const a = lat[y0 * period + x0], b = lat[y0 * period + x1];
    const c = lat[y1 * period + x0], d = lat[y1 * period + x1];
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  };
}

function periodicFbm(size: number, base: number, octaves: number, seed: number, gain = 0.5) {
  const layers: ((x: number, y: number) => number)[] = [];
  for (let o = 0; o < octaves; o++) layers.push(periodicNoise(size, base << o, seed + o * 101));
  return (x: number, y: number) => {
    let s = 0, a = 1, n = 0;
    for (let o = 0; o < octaves; o++) {
      s += layers[o](x, y) * a;
      n += a;
      a *= gain;
    }
    return s / n;
  };
}

let _noise: THREE.DataTexture | null = null;

/**
 * Shared tileable noise, 256² RGBA, repeat wrapped:
 *  R: fbm (base period 4, 5 octaves) – large mottling
 *  G: fbm (base period 8, 4 octaves) – medium
 *  B: fine grain (period 64)
 *  A: ridged fbm (period 4) – streaks / veins
 */
export function noiseTexture(): THREE.DataTexture {
  if (_noise) return _noise;
  const size = 256;
  const f1 = periodicFbm(size, 4, 5, 11);
  const f2 = periodicFbm(size, 8, 4, 23);
  const f3 = periodicFbm(size, 64, 2, 37);
  const f4 = periodicFbm(size, 4, 5, 51, 0.55);
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // stretch contrast: fbm clusters around 0.5
      const s = (v: number, k: number) => Math.max(0, Math.min(1, 0.5 + (v - 0.5) * k));
      data[i] = Math.round(255 * s(f1(x, y), 2.2));
      data[i + 1] = Math.round(255 * s(f2(x, y), 2.2));
      data[i + 2] = Math.round(255 * s(f3(x, y), 1.8));
      const r = 1 - Math.abs(f4(x, y) * 2 - 1);
      data[i + 3] = Math.round(255 * Math.pow(r, 2.5));
    }
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  _noise = t;
  return t;
}

/** GLSL hash / value-noise helpers for shaders that need analytic noise. */
export const NOISE_GLSL = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
float fbm5(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5; }
  return s;
}
`;
