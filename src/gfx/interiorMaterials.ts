import * as THREE from "three";
import { patchMaterial } from "./materials";

/**
 * Materials of the interior route: the painted inner dome (Thornhill's eight scenes from the
 * life of St Paul, painted in brown and gold monochrome with feigned architecture), the gold
 * mosaics, the stone of the enclosed stairs (lit only by their lamps: the light is baked into
 * the vertex paint), the lamps themselves and the light of the lantern.
 */

export const interiorUniforms = {
  /** Sky light reaching the enclosed stairs and the void under the outer dome. */
  uStairAmbient: { value: 0.035 },
  /** Brightness of the stair lamps. */
  uLampK: { value: 1 },
};

const DOME_PARS = /* glsl */ `
uniform float uDomeY0;
uniform float uDomeY1;
`;

/**
 * Inner dome: 8 bays of painted scenes framed by feigned pilasters, a painted balustrade and
 * coffering below the oculus, a painted cornice at the springing.
 */
const DOME_ALBEDO = /* glsl */ `
  vec3 wp = vWorldPos;
  float th = atan(wp.z, wp.x);
  float t = clamp((wp.y - uDomeY0) / (uDomeY1 - uDomeY0), 0.0, 1.0);
  float sec = th / 6.2831853 * 8.0 + 0.5;
  float si = floor(sec);
  float u = fract(sec);
  vec3 ochre = vec3(0.34, 0.25, 0.14);
  vec3 light = vec3(0.62, 0.52, 0.36);
  vec3 dark = vec3(0.12, 0.08, 0.05);
  vec3 gold = vec3(0.55, 0.4, 0.17);
  vec3 col = ochre;
  float n = texture2D(uNoise, vec2(th * 3.0, t * 2.2)).r;
  float n2 = texture2D(uNoise, vec2(th * 11.0, t * 7.0) + si * 0.17).g;
  // feigned pilasters between the scenes: light shaft with shaded flanks
  float pw = 0.09;
  float dp = min(u, 1.0 - u);
  if (t < 0.7 && dp < pw) {
    float k = dp / pw;
    col = mix(dark * 1.4, light, smoothstep(0.1, 0.5, k));
    col *= 0.85 + 0.15 * sin(t * 90.0) * step(0.5, k);
  } else if (t < 0.06) {
    // painted plinth above the real cornice
    col = mix(dark, ochre * 1.2, smoothstep(0.02, 0.05, t));
  } else if (t < 0.7) {
    // the scene: sky above, figures and architecture below, framed
    float fu = (u - pw) / (1.0 - 2.0 * pw);
    float ft = (t - 0.08) / 0.55;
    float frame = step(fu, 0.035) + step(0.965, fu) + step(ft, 0.03) + step(0.97, ft);
    if (ft < 0.0 || ft > 1.0) frame = 1.0;
    vec3 sky = mix(vec3(0.5, 0.42, 0.3), vec3(0.66, 0.57, 0.42), ft);
    // figures: vertical masses standing on a ground line with irregular heads
    float cols = 7.0 + mod(si, 3.0);
    float fx = fu * cols;
    float fi = floor(fx);
    float h = 0.28 + 0.34 * fract(sin(fi * 12.9898 + si * 78.233) * 43758.5453);
    float body = smoothstep(0.42, 0.28, abs(fract(fx) - 0.5)) * step(ft, h + 0.04 * sin(fu * 60.0 + si));
    float archi = step(0.5, fract(fu * 2.0 + si * 0.3)) * step(ft, 0.78) * step(0.6, ft) * 0.6;
    vec3 scene = sky;
    scene = mix(scene, ochre * 0.8, archi);
    scene = mix(scene, mix(dark * 1.8, ochre, n2), body * 0.85);
    scene *= 0.85 + 0.3 * n;
    col = mix(scene, gold * (0.9 + 0.2 * n2), clamp(frame, 0.0, 1.0));
  } else if (t < 0.78) {
    // painted balustrade
    float b = abs(fract(th * 120.0 / 6.2831853) - 0.5);
    col = mix(light * 0.9, dark * 1.5, smoothstep(0.3, 0.42, b) * step(0.715, t) * step(t, 0.765));
  } else {
    // coffers diminishing towards the oculus
    float cu = fract(th * 32.0 / 6.2831853);
    float cv = fract((t - 0.78) * 22.0);
    float cof = step(0.12, cu) * step(cu, 0.88) * step(0.15, cv) * step(cv, 0.85);
    col = mix(light * 0.95, ochre * 0.7, cof);
    col = mix(col, gold, cof * step(0.45, abs(cu - 0.5) + abs(cv - 0.5)) * 0.4);
  }
  diffuseColor.rgb = col * (0.9 + 0.12 * n);
  surfRough = 0.8;
`;

export function makeDomePaint(y0: number, y1: number) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: false, roughness: 0.8, side: THREE.FrontSide });
  return patchMaterial(m, {
    key: "domePaint",
    pars: DOME_PARS,
    albedo: DOME_ALBEDO,
    uniforms: { uDomeY0: { value: y0 }, uDomeY1: { value: y1 } },
    ambient: "uInteriorAmbient",
  });
}

/** Venetian-style gold mosaic with coloured roundels (the Victorian spandrels and choir vaults). */
const MOSAIC_ALBEDO = /* glsl */ `
  vec3 wp = vWorldPos;
  vec2 suv = vSurfUv;
  vec2 tile = floor(suv * 55.0);
  float h = hash12(tile);
  vec3 gold = vec3(0.62, 0.43, 0.14) * (0.75 + 0.5 * h);
  // roundels and bands
  vec2 c = fract(suv * 0.25) - 0.5;
  float r = length(c);
  float ring = smoothstep(0.02, 0.0, abs(r - 0.33));
  float inner = step(r, 0.3);
  vec3 blue = vec3(0.03, 0.06, 0.16) * (0.8 + 0.4 * h);
  vec3 red = vec3(0.3, 0.05, 0.04) * (0.8 + 0.4 * h);
  vec3 col = mix(gold, blue, inner * 0.9);
  col = mix(col, red, ring);
  float fig = inner * step(abs(c.x), 0.07 + 0.05 * sin(c.y * 20.0)) * step(c.y, 0.2);
  col = mix(col, vec3(0.5, 0.42, 0.33), fig);
  diffuseColor.rgb = col;
  surfRough = mix(0.25, 0.45, h) + inner * 0.3;
  surfMetal = (1.0 - inner) * 0.85;
  surfAO = mix(0.6, 1.0, vColor.b);
`;
export function makeMosaic() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.8 });
  return patchMaterial(m, { key: "mosaic", albedo: MOSAIC_ALBEDO, ambient: "uInteriorAmbient" });
}

/**
 * Stone of the enclosed stairs. Paint: r = joint kind, g = lamp light (baked), b = cavity.
 */
const STAIR_PARS = /* glsl */ `
uniform float uStairAmbient;
uniform float uLampK;
`;
const STAIR_ALBEDO = /* glsl */ `
  vec3 paint = vColor.rgb;
  vec2 suv = vSurfUv;
  float courseH = 0.38;
  float ci = floor(suv.y / courseH);
  float blen = mix(0.55, 1.1, hash12(vec2(ci, 3.1)));
  float cu = (suv.x + hash12(vec2(ci, 7.7)) * 7.0) / blen;
  vec2 fw = max(fwidth(suv), vec2(1e-5));
  float fy = fract(suv.y / courseH), fx = fract(cu);
  float jy = 1.0 - smoothstep(0.006, 0.006 + fw.y * 1.5, min(fy, 1.0 - fy) * courseH);
  float jx = 1.0 - smoothstep(0.006, 0.006 + fw.x * 1.5, min(fx, 1.0 - fx) * blen);
  float j = max(jy, jx * step(0.5, paint.r)) * step(0.2, paint.r);
  float bh = hash12(vec2(floor(cu), ci));
  float n = texture2D(uNoise, suv * 0.21).r;
  float g = texture2D(uNoise, suv * 1.9).b;
  vec3 col = mix(vec3(0.46, 0.43, 0.38), vec3(0.54, 0.5, 0.44), bh) * (0.85 + 0.25 * n) * (0.94 + 0.1 * g);
  // worn treads are darker and smoother
  col *= 1.0 - j * 0.35;
  col *= mix(0.55, 1.0, paint.b);
  diffuseColor.rgb = col;
  surfRough = 0.8 + 0.1 * g;
  surfBumpH = (g * 0.0005 - j * 0.002);
  surfAO = mix(0.5, 1.0, paint.b);
  // the lamps: warm light baked per vertex (albedo x irradiance)
  surfEmissive = col * vec3(1.0, 0.72, 0.44) * paint.g * paint.g * uLampK * uSunIllum * 0.01;
`;
export function makeStairStone() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  return patchMaterial(m, {
    key: "stairStone",
    pars: STAIR_PARS,
    albedo: STAIR_ALBEDO,
    uniforms: interiorUniforms,
    ambient: "uStairAmbient",
    noAerial: true,
  });
}

/** Brick of the cone, lit by baked lamp light like the stairs. */
const BRICK_ALBEDO = /* glsl */ `
  vec3 paint = vColor.rgb;
  vec2 suv = vSurfUv;
  float row = floor(suv.y / 0.075);
  float off = mod(row, 2.0) * 0.115;
  vec2 f = vec2(fract((suv.x + off) / 0.23) * 0.23, fract(suv.y / 0.075) * 0.075);
  vec2 fw = max(fwidth(suv), vec2(1e-5));
  float j = max(1.0 - smoothstep(0.005, 0.005 + fw.x * 1.5, min(f.x, 0.23 - f.x)), 1.0 - smoothstep(0.005, 0.005 + fw.y * 1.5, min(f.y, 0.075 - f.y)));
  j *= 1.0 - smoothstep(0.01, 0.03, max(fw.x, fw.y));
  float h = hash12(vec2(floor((suv.x + off) / 0.23), row));
  float n = texture2D(uNoise, suv * 0.13).r;
  vec3 col = mix(vec3(0.25, 0.1, 0.06), vec3(0.36, 0.17, 0.1), h) * (0.8 + 0.35 * n);
  col = mix(col, vec3(0.4, 0.38, 0.33), j * 0.6);
  // whitewash near the top of the cone (seen through the oculus)
  col = mix(col, vec3(0.62, 0.6, 0.55) * (0.9 + 0.1 * n), uWash);
  col *= mix(0.55, 1.0, paint.b);
  diffuseColor.rgb = col;
  surfRough = 0.9;
  surfAO = mix(0.5, 1.0, paint.b);
  surfEmissive = col * vec3(1.0, 0.72, 0.44) * paint.g * paint.g * uLampK * uSunIllum * 0.01;
`;
export function makeConeBrick(wash: number, key: string) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  return patchMaterial(m, {
    key,
    pars: STAIR_PARS + "uniform float uWash;\n",
    albedo: BRICK_ALBEDO,
    uniforms: { ...interiorUniforms, uWash: { value: wash } },
    ambient: "uStairAmbient",
    noAerial: true,
  });
}

/** Rough sawn timber of the outer dome's framing, lamp-lit. */
const TIMBER_ALBEDO = /* glsl */ `
  vec3 paint = vColor.rgb;
  vec2 suv = vSurfUv;
  float board = floor(suv.x / 0.22);
  float h = hash12(vec2(board, 1.0));
  float grain = texture2D(uNoise, vec2(suv.x * 3.0, suv.y * 0.15)).a;
  vec3 col = mix(vec3(0.13, 0.08, 0.045), vec3(0.2, 0.13, 0.075), h) * (0.8 + 0.3 * grain);
  vec2 fw = max(fwidth(suv), vec2(1e-5));
  float gap = 1.0 - smoothstep(0.004, 0.004 + fw.x * 1.5, min(fract(suv.x / 0.22), 1.0 - fract(suv.x / 0.22)) * 0.22);
  col *= 1.0 - 0.6 * gap;
  col *= mix(0.55, 1.0, paint.b);
  diffuseColor.rgb = col;
  surfRough = 0.85;
  surfEmissive = col * vec3(1.0, 0.72, 0.44) * paint.g * paint.g * uLampK * uSunIllum * 0.01;
`;
export function makeDomeTimber() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  return patchMaterial(m, {
    key: "domeTimber",
    pars: STAIR_PARS,
    albedo: TIMBER_ALBEDO,
    uniforms: interiorUniforms,
    ambient: "uStairAmbient",
    noAerial: true,
  });
}

/** Warm electric lamps (bulkheads on the stair walls, chandeliers). */
export function makeLamp() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4 });
  return patchMaterial(m, {
    key: "lamp",
    albedo: `diffuseColor.rgb = vec3(0.9, 0.8, 0.6); surfEmissive = vec3(1.0, 0.78, 0.5) * uSunIllum * 0.2 * (0.4 + 0.6 * vColor.g);`,
    noAerial: true,
  });
}

/** The light falling through the lantern into the top of the cone. */
export function makeLanternLight() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  return patchMaterial(m, {
    key: "lanternLight",
    albedo: `
      diffuseColor.rgb = vec3(0.0);
      vec3 sky = atmoSky(normalize(vec3(0.3, 1.0, 0.2)));
      surfEmissive = (sky * 1.4 + vec3(1.0, 0.95, 0.85) * uSunIllum * 0.02 * (1.0 - uNight)) * (1.0 - uNight * 0.95);
    `,
    noAerial: true,
  });
}

