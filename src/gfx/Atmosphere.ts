import * as THREE from "three";
import { FullscreenPass, passMaterial } from "./fullscreen";
import { NOISE_GLSL } from "./noise";

/**
 * Physically based sky after S. Hillaire, "A Scalable and Production Ready Sky and Atmosphere
 * Rendering Technique" (EGSR 2020): a transmittance LUT, a multiple-scattering LUT and a
 * sky-view LUT recomputed whenever the sun moves. London air is hazier than the reference
 * atmosphere, so aerosols (Mie) are scaled by `haze`.
 *
 * Every lit material shares `atmoUniforms` and `ATMO_AERIAL_GLSL`, so distant geometry fades
 * into exactly the colour of the sky behind it (aerial perspective).
 *
 * Units: kilometres inside the atmosphere model; radiance is relative to a unit solar
 * illuminance and multiplied by `uSunIllum` (scene units, ~6 so a sunlit white wall is ~1).
 */

export const SUN_ILLUMINANCE = 6.0;
const RG = 6360.0, RT = 6460.0;
const RAYLEIGH = new THREE.Vector3(5.802e-3, 13.558e-3, 33.1e-3);
const MIE_SCA = 3.996e-3, MIE_EXT = 4.4e-3;
const OZONE = new THREE.Vector3(0.65e-3, 1.881e-3, 0.085e-3);

export const atmoUniforms = {
  uTransmittanceLUT: { value: null as THREE.Texture | null },
  uMultiScatLUT: { value: null as THREE.Texture | null },
  uSkyViewLUT: { value: null as THREE.Texture | null },
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uSunIllum: { value: SUN_ILLUMINANCE },
  uHaze: { value: 3.0 },
  uAerialScale: { value: 2.2 },
  uCamAltKm: { value: 0.02 },
  uMieG: { value: 0.78 },
  uTime: { value: 0 },
  uCloudCover: { value: 0.36 },
  uCloudShift: { value: new THREE.Vector2(0, 0) },
  uGroundRadiance: { value: new THREE.Vector3(0.1, 0.1, 0.1) },
  uNight: { value: 0 },
};

export const ATMO_COMMON_GLSL = /* glsl */ `
#ifndef ATMO_COMMON
#define ATMO_COMMON
#define ATMO_RG ${RG.toFixed(1)}
#define ATMO_RT ${RT.toFixed(1)}
#define ATMO_PI 3.14159265359
const vec3 ATMO_RAYLEIGH = vec3(${RAYLEIGH.x}, ${RAYLEIGH.y}, ${RAYLEIGH.z});
const vec3 ATMO_OZONE = vec3(${OZONE.x}, ${OZONE.y}, ${OZONE.z});
const float ATMO_MIE_SCA = ${MIE_SCA};
const float ATMO_MIE_EXT = ${MIE_EXT};
uniform sampler2D uSkyViewLUT;
uniform vec3 uSunDir;
uniform float uSunIllum;
uniform float uHaze;
uniform float uAerialScale;
uniform float uCamAltKm;

// Haze only thickens the lowest layer (boundary layer) of aerosols.
float atmoMieDensity(float h) { return exp(-h / 1.2) * (1.0 + (uHaze - 1.0) * exp(-h / 0.8)); }

float atmoRaySphere(vec3 ro, vec3 rd, float r) {
  float b = dot(ro, rd);
  float c = dot(ro, ro) - r * r;
  float d = b * b - c;
  if (d < 0.0) return -1.0;
  d = sqrt(d);
  float t0 = -b - d, t1 = -b + d;
  if (t0 > 0.0) return t0;
  if (t1 > 0.0) return t1;
  return -1.0;
}

vec2 atmoSkyViewUv(vec3 dir) {
  float viewHeight = ATMO_RG + uCamAltKm;
  float vHorizon = sqrt(max(0.0, viewHeight * viewHeight - ATMO_RG * ATMO_RG));
  float cosBeta = vHorizon / viewHeight;
  float beta = acos(cosBeta);
  float zenithHorizonAngle = ATMO_PI - beta;
  float viewZenithAngle = acos(clamp(dir.y, -1.0, 1.0));
  vec2 uv;
  if (viewZenithAngle < zenithHorizonAngle) {
    float coord = viewZenithAngle / zenithHorizonAngle;
    coord = 1.0 - sqrt(max(0.0, 1.0 - coord));
    uv.y = coord * 0.5;
  } else {
    float coord = (viewZenithAngle - zenithHorizonAngle) / beta;
    uv.y = sqrt(clamp(coord, 0.0, 1.0)) * 0.5 + 0.5;
  }
  vec2 dh = dir.xz; float ldh = length(dh);
  vec2 sh = uSunDir.xz; float lsh = length(sh);
  float lightViewCos = (ldh > 1e-5 && lsh > 1e-5) ? dot(dh / ldh, sh / lsh) : 1.0;
  uv.x = sqrt(clamp(-lightViewCos * 0.5 + 0.5, 0.0, 1.0));
  // keep half a texel away from the edges (clamp-to-edge is not enough at the horizon seam)
  const vec2 LUT = vec2(192.0, 108.0);
  uv = (uv * (LUT - 1.0) + 0.5) / LUT;
  return uv;
}

/** Sky radiance (scene units) in a direction, without sun disk and clouds. */
vec3 atmoSky(vec3 dir) {
  return texture2D(uSkyViewLUT, atmoSkyViewUv(dir)).rgb * uSunIllum;
}

float atmoExpSeg(float h0, float h1, float H) {
  float dh = h1 - h0;
  if (abs(dh) < 1e-4) return exp(-h0 / H);
  return H * (exp(-h0 / H) - exp(-h1 / H)) / dh;
}

// Aerial perspective: attenuates the colour seen at worldPos and adds in-scattered light.
vec3 atmoAerial(vec3 color, vec3 worldPos, vec3 camPos) {
  vec3 v = worldPos - camPos;
  float dist = length(v);
  vec3 dir = v / max(dist, 1e-4);
  float dKm = dist * 0.001 * uAerialScale;
  float h0 = max(camPos.y, 0.0) * 0.001, h1 = max(worldPos.y, 0.0) * 0.001;
  float fR = atmoExpSeg(h0, h1, 8.0);
  float dm = mix(atmoMieDensity(h0), atmoMieDensity(h1), 0.5);
  vec3 ext = ATMO_RAYLEIGH * fR * dKm + vec3(ATMO_MIE_EXT * dm * dKm);
  vec3 T = exp(-ext);
  vec3 hdir = normalize(vec3(dir.x, max(dir.y, 0.035), dir.z));
  vec3 Lh = atmoSky(hdir);
  return color * T + Lh * (1.0 - T);
}
#endif
`;

// ------------------------------------------------------------------------------ LUT shaders

const LUT_COMMON = /* glsl */ `
precision highp float;
varying vec2 vUv;
#define PI 3.14159265359
const float RG = ${RG.toFixed(1)};
const float RT = ${RT.toFixed(1)};
const vec3 RAYLEIGH = vec3(${RAYLEIGH.x}, ${RAYLEIGH.y}, ${RAYLEIGH.z});
const vec3 OZONE = vec3(${OZONE.x}, ${OZONE.y}, ${OZONE.z});
const float MIE_SCA = ${MIE_SCA};
const float MIE_EXT = ${MIE_EXT};
uniform float uHaze;

float mieDensity(float h) { return exp(-h / 1.2) * (1.0 + (uHaze - 1.0) * exp(-h / 0.8)); }
vec3 extinctionAt(float h) {
  float dR = exp(-h / 8.0);
  float dM = mieDensity(h);
  float dO = max(0.0, 1.0 - abs(h - 25.0) / 15.0);
  return RAYLEIGH * dR + vec3(MIE_EXT * dM) + OZONE * dO;
}
float raySphere(vec3 ro, vec3 rd, float r) {
  float b = dot(ro, rd);
  float c = dot(ro, ro) - r * r;
  float d = b * b - c;
  if (d < 0.0) return -1.0;
  d = sqrt(d);
  float t0 = -b - d, t1 = -b + d;
  if (t0 > 0.0) return t0;
  if (t1 > 0.0) return t1;
  return -1.0;
}
vec2 transmittanceUv(float h, float mu) {
  float H = sqrt(RT * RT - RG * RG);
  float rho = sqrt(max(0.0, h * h - RG * RG));
  float disc = h * h * (mu * mu - 1.0) + RT * RT;
  float d = max(0.0, -h * mu + sqrt(max(disc, 0.0)));
  float dMin = RT - h, dMax = rho + H;
  return vec2((d - dMin) / (dMax - dMin), rho / H);
}
`;

const TRANSMITTANCE_FRAG = /* glsl */ `
${LUT_COMMON}
void main() {
  float H = sqrt(RT * RT - RG * RG);
  float rho = H * vUv.y;
  float h = sqrt(rho * rho + RG * RG);
  float dMin = RT - h, dMax = rho + H;
  float d = dMin + vUv.x * (dMax - dMin);
  float mu = d == 0.0 ? 1.0 : (H * H - rho * rho - d * d) / (2.0 * h * d);
  mu = clamp(mu, -1.0, 1.0);
  vec3 ro = vec3(0.0, h, 0.0);
  vec3 rd = vec3(sqrt(max(0.0, 1.0 - mu * mu)), mu, 0.0);
  float tMax = raySphere(ro, rd, RT);
  const int N = 40;
  float dt = max(tMax, 0.0) / float(N);
  vec3 od = vec3(0.0);
  for (int i = 0; i < N; i++) {
    vec3 p = ro + rd * (float(i) + 0.5) * dt;
    od += extinctionAt(length(p) - RG) * dt;
  }
  gl_FragColor = vec4(exp(-od), 1.0);
}`;

const TRANS_SAMPLE = /* glsl */ `
uniform sampler2D uTrans;
vec3 sunTransmittance(vec3 p, vec3 sun) {
  float h = length(p);
  vec3 up = p / h;
  float mu = dot(up, sun);
  if (raySphere(p, sun, RG) > 0.0) return vec3(0.0);
  return texture2D(uTrans, transmittanceUv(h, mu)).rgb;
}
`;

const MULTISCAT_FRAG = /* glsl */ `
${LUT_COMMON}
${TRANS_SAMPLE}
const float GROUND_ALBEDO = 0.3;
void main() {
  float cosSun = vUv.x * 2.0 - 1.0;
  float h = RG + clamp(vUv.y, 0.002, 0.998) * (RT - RG);
  vec3 ro = vec3(0.0, h, 0.0);
  vec3 sun = vec3(sqrt(max(0.0, 1.0 - cosSun * cosSun)), cosSun, 0.0);
  vec3 L2 = vec3(0.0), fms = vec3(0.0);
  const int SQ = 8;
  for (int i = 0; i < SQ; i++) {
    for (int j = 0; j < SQ; j++) {
      float u = (float(i) + 0.5) / float(SQ), v = (float(j) + 0.5) / float(SQ);
      float phi = 2.0 * PI * u;
      float ct = 1.0 - 2.0 * v, st = sqrt(max(0.0, 1.0 - ct * ct));
      vec3 rd = vec3(st * cos(phi), ct, st * sin(phi));
      float tG = raySphere(ro, rd, RG);
      float tT = raySphere(ro, rd, RT);
      float tMax = tG > 0.0 ? tG : tT;
      const int N = 20;
      float dt = max(tMax, 0.0) / float(N);
      vec3 T = vec3(1.0), Lp = vec3(0.0), fp = vec3(0.0);
      for (int k = 0; k < N; k++) {
        vec3 p = ro + rd * (float(k) + 0.5) * dt;
        float hh = length(p) - RG;
        vec3 scat = RAYLEIGH * exp(-hh / 8.0) + vec3(MIE_SCA * mieDensity(hh));
        vec3 ext = extinctionAt(hh);
        vec3 Ts = exp(-ext * dt);
        vec3 S = scat * sunTransmittance(p, sun) / (4.0 * PI);
        Lp += T * (S - S * Ts) / max(ext, vec3(1e-7));
        fp += T * (scat - scat * Ts) / max(ext, vec3(1e-7));
        T *= Ts;
      }
      if (tG > 0.0) {
        vec3 p = ro + rd * tG;
        vec3 up = normalize(p);
        Lp += T * sunTransmittance(p + up * 0.001, sun) * max(dot(up, sun), 0.0) * GROUND_ALBEDO / PI;
      }
      L2 += Lp;
      fms += fp;
    }
  }
  L2 /= float(SQ * SQ);
  fms /= float(SQ * SQ);
  gl_FragColor = vec4(L2 / max(vec3(1.0) - fms, vec3(1e-3)), 1.0);
}`;

const SKYVIEW_FRAG = /* glsl */ `
${LUT_COMMON}
${TRANS_SAMPLE}
uniform sampler2D uMS;
uniform float uSunCos;
uniform float uCamAlt;
uniform float uG;
vec3 multiScat(vec3 p, vec3 sun) {
  float h = length(p);
  float mu = dot(p / h, sun);
  vec2 uv = vec2(mu * 0.5 + 0.5, clamp((h - RG) / (RT - RG), 0.0, 1.0));
  uv = (uv * 31.0 + 0.5) / 32.0;
  return texture2D(uMS, uv).rgb;
}
float cornetteShanks(float g, float c) {
  float k = 3.0 / (8.0 * PI) * (1.0 - g * g) / (2.0 + g * g);
  return k * (1.0 + c * c) / pow(1.0 + g * g - 2.0 * g * c, 1.5);
}
void main() {
  float viewHeight = RG + uCamAlt;
  float vHorizon = sqrt(max(0.0, viewHeight * viewHeight - RG * RG));
  float beta = acos(vHorizon / viewHeight);
  float zenithHorizonAngle = PI - beta;
  vec2 uv = (vUv * vec2(192.0, 108.0) - 0.5) / vec2(191.0, 107.0);
  float vza;
  if (uv.y < 0.5) {
    float coord = 1.0 - 2.0 * uv.y;
    coord = 1.0 - coord * coord;
    vza = zenithHorizonAngle * coord;
  } else {
    float coord = uv.y * 2.0 - 1.0;
    vza = zenithHorizonAngle + beta * coord * coord;
  }
  float cvz = cos(vza), svz = sin(vza);
  float coordx = uv.x * uv.x;
  float lvc = -(coordx * 2.0 - 1.0);
  float lvs = sqrt(max(0.0, 1.0 - lvc * lvc));
  vec3 rd = vec3(svz * lvc, cvz, svz * lvs);
  vec3 sun = vec3(sqrt(max(0.0, 1.0 - uSunCos * uSunCos)), uSunCos, 0.0);
  vec3 ro = vec3(0.0, viewHeight, 0.0);
  float tG = raySphere(ro, rd, RG);
  float tT = raySphere(ro, rd, RT);
  float tMax = tG > 0.0 ? tG : tT;
  tMax = min(max(tMax, 0.0), 800.0);
  const int N = 32;
  float ct = dot(rd, sun);
  float phR = 3.0 / (16.0 * PI) * (1.0 + ct * ct);
  float phM = cornetteShanks(uG, ct);
  vec3 T = vec3(1.0), L = vec3(0.0);
  float tPrev = 0.0;
  for (int k = 0; k < N; k++) {
    // quadratic step distribution: dense near the viewer (and the horizon haze)
    float f0 = float(k) / float(N), f1 = float(k + 1) / float(N);
    float t0 = tMax * f0 * f0, t1 = tMax * f1 * f1;
    float dt = t1 - t0;
    vec3 p = ro + rd * (t0 + 0.5 * dt);
    float hh = length(p) - RG;
    vec3 scR = RAYLEIGH * exp(-hh / 8.0);
    float scM = MIE_SCA * mieDensity(hh);
    vec3 ext = extinctionAt(hh);
    vec3 Ts = exp(-ext * dt);
    vec3 sunT = sunTransmittance(p, sun);
    vec3 S = sunT * (scR * phR + scM * phM) + multiScat(p, sun) * (scR + vec3(scM));
    L += T * (S - S * Ts) / max(ext, vec3(1e-7));
    T *= Ts;
    tPrev = t1;
  }
  gl_FragColor = vec4(L, 1.0);
}`;

// ------------------------------------------------------------------------------ sky dome shader

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
  #ifdef USE_REVERSED_DEPTH_BUFFER
  p.z = 0.0;
  #else
  p.z = p.w;
  #endif
  gl_Position = p;
}`;

const SKY_FRAG = /* glsl */ `
${ATMO_COMMON_GLSL}
${NOISE_GLSL}
uniform sampler2D uTransmittanceLUT;
uniform sampler2D uNoise;
uniform float uTime;
uniform float uCloudCover;
uniform vec2 uCloudShift;
uniform vec3 uGroundRadiance;
uniform float uEnvMode;
uniform float uNight;
varying vec3 vDir;

vec2 transUv(float h, float mu) {
  float H = sqrt(ATMO_RT * ATMO_RT - ATMO_RG * ATMO_RG);
  float rho = sqrt(max(0.0, h * h - ATMO_RG * ATMO_RG));
  float disc = h * h * (mu * mu - 1.0) + ATMO_RT * ATMO_RT;
  float d = max(0.0, -h * mu + sqrt(max(disc, 0.0)));
  float dMin = ATMO_RT - h, dMax = rho + H;
  return vec2((d - dMin) / (dMax - dMin), rho / H);
}
vec3 transTo(float hKm, vec3 dir) {
  return texture2D(uTransmittanceLUT, transUv(ATMO_RG + hKm, dir.y)).rgb;
}
float cloudNoise(vec2 p) {
  // three octaves from the tiling noise texture + analytic detail
  float n = texture2D(uNoise, p * 0.021).r * 0.55;
  n += texture2D(uNoise, p * 0.047 + 0.31).g * 0.3;
  n += texture2D(uNoise, p * 0.13 + 0.77).b * 0.15;
  return n;
}
void main() {
  vec3 d = normalize(vDir);
  vec3 col;
  if (d.y < -0.002 && uEnvMode > 0.5) {
    // ground seen from above for the environment map: the city and its haze
    float k = smoothstep(-0.002, -0.25, d.y);
    col = mix(atmoSky(vec3(d.x, 0.02, d.z)), uGroundRadiance, k);
    gl_FragColor = vec4(col, 1.0);
    return;
  }
  // below the horizon (only visible past the edge of the world) show the hazy horizon
  vec3 dd = d;
  dd.y = max(dd.y, 0.004);
  col = atmoSky(dd);
  if (d.y < 0.0) col = mix(col, uGroundRadiance * 1.3 + col * 0.35, smoothstep(0.0, -0.12, d.y));

  // sun disk with limb darkening
  float cs = dot(d, uSunDir);
  float sunR = 0.0047;
  float cosR = cos(sunR);
  if (uEnvMode < 0.5 && cs > cosR - 0.00002) {
    float r = acos(clamp(cs, -1.0, 1.0)) / sunR;
    float limb = 1.0 - 0.6 * (1.0 - sqrt(max(0.0, 1.0 - min(r, 1.0) * min(r, 1.0))));
    float edge = smoothstep(1.0, 0.96, r);
    vec3 T = transTo(uCamAltKm, uSunDir);
    col += T * uSunIllum * 2600.0 * limb * edge * (1.0 - uNight);
  }

  // cloud layer at ~1.6 km
  if (d.y > 0.0) {
    float hC = 1.6;
    float t = (hC - uCamAltKm) / max(d.y, 0.02);
    vec2 p = d.xz * t + uCloudShift;
    float n = cloudNoise(p);
    float cover = uCloudCover;
    float dens = smoothstep(1.0 - cover - 0.08, 1.0 - cover + 0.2, n);
    if (dens > 0.001) {
      vec2 toSun = normalize(uSunDir.xz + 1e-4) * 0.9;
      float n2 = cloudNoise(p + toSun);
      float lit = clamp(0.62 + (n - n2) * 4.5, 0.0, 1.0);
      vec3 sunT = transTo(hC, uSunDir);
      float sunUp = smoothstep(-0.08, 0.1, uSunDir.y);
      float silver = pow(max(cs, 0.0), 8.0) * (1.0 - dens) * 2.5;
      vec3 amb = atmoSky(vec3(0.0, 1.0, 0.0)) * 1.6 + atmoSky(normalize(vec3(d.x, 0.1, d.z))) * 0.6;
      vec3 sunL = sunT * uSunIllum * 0.16 * sunUp;
      vec3 cc = amb * (0.55 + 0.25 * lit) + sunL * (lit * 1.1 + silver);
      // thin clouds let the sky through
      float alpha = dens * smoothstep(0.0, 0.08, d.y);
      // distant clouds melt into the horizon haze
      float far = 1.0 - exp(-t * 0.018);
      cc = mix(cc, col, far * 0.85);
      col = mix(col, cc, alpha * 0.96);
    }
  }
  // stars at night
  if (uNight > 0.01 && d.y > 0.0) {
    vec3 sp = d * 300.0;
    vec3 cell = floor(sp);
    float r = hash13(cell);
    if (r > 0.9965) {
      vec3 c = cell + 0.5;
      float sd = length(sp - c);
      col += vec3(0.9, 0.95, 1.0) * smoothstep(0.35, 0.0, sd) * (r - 0.9965) * 300.0 * uNight * 0.02 * smoothstep(0.0, 0.2, d.y);
    }
  }
  gl_FragColor = vec4(col, 1.0);
}`;

// --------------------------------------------------------------------------------- CPU model

function mieDensity(h: number, haze: number) {
  return Math.exp(-h / 1.2) * (1 + (haze - 1) * Math.exp(-h / 0.8));
}

/** Transmittance from the ground (altitude hKm) towards the sun, computed on the CPU. */
export function sunTransmittance(sunDir: THREE.Vector3, haze: number, hKm = 0.02): THREE.Vector3 {
  const ro = new THREE.Vector3(0, RG + hKm, 0);
  const rd = sunDir.clone().normalize();
  // planet occlusion
  const b = ro.dot(rd), c = ro.lengthSq() - RG * RG;
  if (b * b - c > 0 && -b - Math.sqrt(b * b - c) > 0) return new THREE.Vector3(0, 0, 0);
  const bT = ro.dot(rd), cT = ro.lengthSq() - RT * RT;
  const tMax = -bT + Math.sqrt(Math.max(0, bT * bT - cT));
  const N = 64;
  const od = new THREE.Vector3();
  const p = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    // quadratic spacing for accuracy at grazing angles
    const f0 = i / N, f1 = (i + 1) / N;
    const t0 = tMax * f0 * f0, t1 = tMax * f1 * f1;
    p.copy(ro).addScaledVector(rd, (t0 + t1) / 2);
    const h = p.length() - RG;
    const dR = Math.exp(-h / 8), dM = mieDensity(h, haze), dO = Math.max(0, 1 - Math.abs(h - 25) / 15);
    const dt = t1 - t0;
    od.x += (RAYLEIGH.x * dR + MIE_EXT * dM + OZONE.x * dO) * dt;
    od.y += (RAYLEIGH.y * dR + MIE_EXT * dM + OZONE.y * dO) * dt;
    od.z += (RAYLEIGH.z * dR + MIE_EXT * dM + OZONE.z * dO) * dt;
  }
  return new THREE.Vector3(Math.exp(-od.x), Math.exp(-od.y), Math.exp(-od.z));
}

// ---------------------------------------------------------------------------------- the class

export class Atmosphere {
  private fs = new FullscreenPass();
  readonly transmittance: THREE.WebGLRenderTarget;
  readonly multiScat: THREE.WebGLRenderTarget;
  readonly skyView: THREE.WebGLRenderTarget;
  private mTrans: THREE.ShaderMaterial;
  private mMS: THREE.ShaderMaterial;
  private mSV: THREE.ShaderMaterial;
  readonly skyMesh: THREE.Mesh;
  readonly skyMaterial: THREE.ShaderMaterial;
  private lastHaze = -1;
  private cubeRT: THREE.WebGLCubeRenderTarget | null = null;
  private envRT: THREE.WebGLRenderTarget | null = null;

  constructor(noise: THREE.Texture) {
    const opts = {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false,
      generateMipmaps: false,
    } as const;
    this.transmittance = new THREE.WebGLRenderTarget(256, 64, opts);
    this.multiScat = new THREE.WebGLRenderTarget(32, 32, opts);
    this.skyView = new THREE.WebGLRenderTarget(192, 108, opts);
    atmoUniforms.uTransmittanceLUT.value = this.transmittance.texture;
    atmoUniforms.uMultiScatLUT.value = this.multiScat.texture;
    atmoUniforms.uSkyViewLUT.value = this.skyView.texture;

    this.mTrans = passMaterial(TRANSMITTANCE_FRAG, { uHaze: atmoUniforms.uHaze });
    this.mMS = passMaterial(MULTISCAT_FRAG, { uHaze: atmoUniforms.uHaze, uTrans: { value: this.transmittance.texture } });
    this.mSV = passMaterial(SKYVIEW_FRAG, {
      uHaze: atmoUniforms.uHaze,
      uTrans: { value: this.transmittance.texture },
      uMS: { value: this.multiScat.texture },
      uSunCos: { value: 1 },
      uCamAlt: { value: 0.02 },
      uG: atmoUniforms.uMieG,
    });

    this.skyMaterial = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: {
        ...atmoUniforms,
        uNoise: { value: noise },
        uEnvMode: { value: 0 },
      },
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: true,
    });
    this.skyMesh = new THREE.Mesh(new THREE.SphereGeometry(10, 48, 24), this.skyMaterial);
    this.skyMesh.frustumCulled = false;
    this.skyMesh.renderOrder = 10000;
    this.skyMesh.name = "sky";
  }

  /** Recomputes the LUTs for the current sun direction. Cheap (a few thousand texels). */
  update(renderer: THREE.WebGLRenderer) {
    const prev = renderer.getRenderTarget();
    const haze = atmoUniforms.uHaze.value;
    if (haze !== this.lastHaze) {
      this.fs.render(renderer, this.mTrans, this.transmittance);
      this.fs.render(renderer, this.mMS, this.multiScat);
      this.lastHaze = haze;
    }
    this.mSV.uniforms.uSunCos.value = THREE.MathUtils.clamp(atmoUniforms.uSunDir.value.y, -1, 1);
    this.mSV.uniforms.uCamAlt.value = atmoUniforms.uCamAltKm.value;
    this.fs.render(renderer, this.mSV, this.skyView);
    renderer.setRenderTarget(prev);
  }

  /**
   * Renders the sky (with a hazy city below the horizon) into a cube map and prefilters it for
   * image based lighting.
   */
  buildEnvironment(renderer: THREE.WebGLRenderer, pmrem: THREE.PMREMGenerator): THREE.Texture {
    if (!this.cubeRT) this.cubeRT = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType });
    const scene = new THREE.Scene();
    const mesh = new THREE.Mesh(this.skyMesh.geometry, this.skyMaterial);
    mesh.frustumCulled = false;
    scene.add(mesh);
    this.skyMaterial.uniforms.uEnvMode.value = 1;
    const cam = new THREE.CubeCamera(0.1, 100, this.cubeRT);
    cam.update(renderer, scene);
    this.skyMaterial.uniforms.uEnvMode.value = 0;
    this.envRT?.dispose();
    this.envRT = pmrem.fromCubemap(this.cubeRT.texture);
    return this.envRT.texture;
  }
}
