import * as THREE from "three";
import { ATMO_COMMON_GLSL, atmoUniforms } from "./Atmosphere";
import { noiseTexture, NOISE_GLSL } from "./noise";
import { makeConeBrick, makeDomePaint, makeDomeTimber, makeLamp, makeLanternLight, makeMosaic, makeStairStone } from "./interiorMaterials";
import { DOME } from "../world/dims";

/**
 * Material library. Every lit surface is a MeshStandardMaterial patched with onBeforeCompile:
 *  - world position / physical uv varyings,
 *  - a surface function that turns the "semantic paint" vertex colour (see geo/Builder.ts)
 *    into albedo / roughness / bump for that material (Portland stone ashlar, lead, ...),
 *  - the sun's static two-cascade shadow (near: cathedral, far: city), see gfx/Lighting.ts,
 *  - aerial perspective from the shared atmosphere instead of three's fog.
 */

export const matUniforms = {
  uNoise: { value: null as THREE.Texture | null },
  uTime: atmoUniforms.uTime,
  uNight: atmoUniforms.uNight,
  /** 0..1 night floodlighting of the cathedral. */
  uFlood: { value: 0 },
  /** Interior ambient scale (inside the cathedral the sky is mostly occluded). */
  uInteriorAmbient: { value: 0.32 },
};

const VERT_PARS = /* glsl */ `
varying vec3 vWorldPos;
varying vec2 vSurfUv;
`;
const VERT_MAIN = /* glsl */ `
{
  vec4 swp = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    swp = instanceMatrix * swp;
  #endif
  swp = modelMatrix * swp;
  vWorldPos = swp.xyz;
  vSurfUv = uv;
}
`;

const FRAG_PARS = /* glsl */ `
varying vec3 vWorldPos;
varying vec2 vSurfUv;
uniform sampler2D uNoise;
uniform float uTime;
uniform float uNight;
uniform float uFlood;
uniform float uInteriorAmbient;
${ATMO_COMMON_GLSL}
${NOISE_GLSL}

// Height-field bump on an unparametrised surface (Mikkelsen 2010), in view space.
vec3 surfBump(vec3 n, vec3 pos, float h) {
  vec3 dpdx = dFdx(pos), dpdy = dFdy(pos);
  float dhdx = dFdx(h), dhdy = dFdy(h);
  vec3 r1 = cross(dpdy, n), r2 = cross(n, dpdx);
  float det = dot(dpdx, r1);
  vec3 grad = sign(det) * (dhdx * r1 + dhdy * r2);
  return normalize(abs(det) * n - grad);
}
float nz(vec2 p) { return texture2D(uNoise, p).r; }

`;

/** Placed after three's shadowmap_pars_fragment: 12-tap PCF for the static sun maps + cascade blend. */
const SHADOW_PARS = /* glsl */ `
#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0 && defined( SHADOWMAP_TYPE_PCF )
float sunPCF( sampler2DShadow map, vec2 mapSize, float intensity, float bias, float radius, vec4 coord ) {
  coord.xyz /= coord.w;
  coord.z += bias;
  if ( coord.x < 0.0 || coord.x > 1.0 || coord.y < 0.0 || coord.y > 1.0 || coord.z > 1.0 ) return 1.0;
  vec2 texel = 1.0 / mapSize;
  float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;
  float s = 0.0;
  for ( int i = 0; i < 12; i ++ ) {
    s += texture( map, vec3( coord.xy + vogelDiskSample( i, 12, phi ) * radius * texel, coord.z ) );
  }
  return mix( 1.0, s / 12.0, intensity );
}
#endif
#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 1 && defined( SHADOWMAP_TYPE_PCF )
float sunCascadeShadow() {
  vec4 c0 = vDirectionalShadowCoord[ 0 ];
  vec3 p0 = c0.xyz / c0.w;
  float edge = max( abs( p0.x - 0.5 ), abs( p0.y - 0.5 ) ) * 2.0;
  float w = smoothstep( 0.88, 0.985, edge );
  float sN = 1.0, sF = 1.0;
  if ( w < 0.999 ) sN = sunPCF( directionalShadowMap[ 0 ], directionalLightShadows[ 0 ].shadowMapSize, directionalLightShadows[ 0 ].shadowIntensity, directionalLightShadows[ 0 ].shadowBias, directionalLightShadows[ 0 ].shadowRadius, c0 );
  if ( w > 0.001 ) sF = sunPCF( directionalShadowMap[ 1 ], directionalLightShadows[ 1 ].shadowMapSize, directionalLightShadows[ 1 ].shadowIntensity, directionalLightShadows[ 1 ].shadowBias, directionalLightShadows[ 1 ].shadowRadius, vDirectionalShadowCoord[ 1 ] );
  return mix( sN, sF, w );
}
#endif
`;

const DIR_LIGHT_REPLACEMENT = /* glsl */ `
#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )
  {
    DirectionalLight sunDL = directionalLights[ 0 ];
    getDirectionalLightInfo( sunDL, directLight );
    float sunSh = 1.0;
    #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 1 && defined( SHADOWMAP_TYPE_PCF )
      sunSh = sunCascadeShadow();
    #elif defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
      sunSh = getShadow( directionalShadowMap[ 0 ], directionalLightShadows[ 0 ].shadowMapSize, directionalLightShadows[ 0 ].shadowIntensity, directionalLightShadows[ 0 ].shadowBias, directionalLightShadows[ 0 ].shadowRadius, vDirectionalShadowCoord[ 0 ] );
    #endif
    directLight.color *= ( directLight.visible && receiveShadow ) ? sunSh : 1.0;
    RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
  }
#endif
`;

function replaceDirLights(src: string): string {
  const start = src.indexOf("#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )");
  if (start < 0) throw new Error("lights_fragment_begin: directional block not found");
  const end = src.indexOf("#endif", src.indexOf("#pragma unroll_loop_end", start)) + "#endif".length;
  return src.slice(0, start) + DIR_LIGHT_REPLACEMENT + src.slice(end);
}

export interface SurfaceSpec {
  /** Unique cache key. */
  key: string;
  /** GLSL placed at file scope in the fragment shader. */
  pars?: string;
  /** Runs in place of <color_fragment>. May modify diffuseColor, and declare `float surfRough`, `float surfBumpH`, `float surfAO`. */
  albedo: string;
  /** Extra uniforms. */
  uniforms?: Record<string, THREE.IUniform>;
  /** Scales the ambient (IBL) light, e.g. for interiors. GLSL float expression. */
  ambient?: string;
  /** Emissive addition, GLSL vec3 expression evaluated after lighting (radiance). */
  emissive?: string;
  /** Skip aerial perspective (interiors, tiny distances). */
  noAerial?: boolean;
  /** GLSL at file scope in the vertex shader (extra attributes / varyings). */
  vertPars?: string;
  /** GLSL run at the end of the vertex shader's main(). */
  vertMain?: string;
}

/** Wraps a MeshStandardMaterial with the shared patches and a surface function. */
export function patchMaterial<T extends THREE.MeshStandardMaterial>(mat: T, spec: SurfaceSpec): T {
  matUniforms.uNoise.value ??= noiseTexture();
  // walls are single-sided surfaces: both sides must go into the (static) shadow maps
  mat.shadowSide = THREE.DoubleSide;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, matUniforms, {
      uSkyViewLUT: atmoUniforms.uSkyViewLUT,
      uSunDir: atmoUniforms.uSunDir,
      uSunIllum: atmoUniforms.uSunIllum,
      uHaze: atmoUniforms.uHaze,
      uAerialScale: atmoUniforms.uAerialScale,
      uCamAltKm: atmoUniforms.uCamAltKm,
    }, spec.uniforms ?? {});
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\n" + VERT_PARS + (spec.vertPars ?? ""))
      .replace("#include <fog_vertex>", "#include <fog_vertex>\n" + VERT_MAIN + (spec.vertMain ?? ""));
    let lightsBegin = THREE.ShaderChunk.lights_fragment_begin;
    lightsBegin = replaceDirLights(lightsBegin);
    if (spec.ambient) {
      lightsBegin = lightsBegin.replace(
        "vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );",
        "vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );",
      );
    }
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\n" + FRAG_PARS + (spec.pars ?? ""))
      .replace(
        "#include <color_fragment>",
        `float surfRough = -1.0; float surfBumpH = 0.0; float surfAO = 1.0; float surfMetal = -1.0; vec3 surfEmissive = vec3(0.0);
        {
          ${spec.albedo}
        }`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        "#include <roughnessmap_fragment>\n if (surfRough >= 0.0) roughnessFactor = surfRough;",
      )
      .replace(
        "#include <metalnessmap_fragment>",
        "#include <metalnessmap_fragment>\n if (surfMetal >= 0.0) metalnessFactor = surfMetal;",
      )
      .replace(
        "#include <normal_fragment_maps>",
        "#include <normal_fragment_maps>\n if (surfBumpH != 0.0) normal = surfBump(normal, -vViewPosition, surfBumpH);",
      )
      .replace("#include <shadowmap_pars_fragment>", "#include <shadowmap_pars_fragment>\n" + SHADOW_PARS)
      .replace("#include <lights_fragment_begin>", lightsBegin)
      .replace(
        "#include <aomap_fragment>",
        `#include <aomap_fragment>
        {
          float ambK = surfAO * (${spec.ambient ?? "1.0"});
          reflectedLight.indirectDiffuse *= ambK;
          ${spec.ambient
            ? `// indoors: the sky arrives after bouncing off warm stone; reflections of it are as dim
          float il = dot(reflectedLight.indirectDiffuse, vec3(0.2126, 0.7152, 0.0722));
          reflectedLight.indirectDiffuse = mix(reflectedLight.indirectDiffuse, il * vec3(1.1, 1.0, 0.84), 0.8);
          reflectedLight.indirectSpecular *= ambK * 0.8;
          float sl = dot(reflectedLight.indirectSpecular, vec3(0.2126, 0.7152, 0.0722));
          reflectedLight.indirectSpecular = mix(reflectedLight.indirectSpecular, sl * vec3(1.1, 1.0, 0.84), 0.8);`
            : "reflectedLight.indirectSpecular *= mix(ambK, 1.0, 0.25) * surfAO;"}
        }`,
      )
      .replace(
        "#include <fog_fragment>",
        (spec.emissive ? `gl_FragColor.rgb += ${spec.emissive};\n` : "") +
          "gl_FragColor.rgb += surfEmissive;\n" +
          (spec.noAerial ? "" : "gl_FragColor.rgb = atmoAerial(gl_FragColor.rgb, vWorldPos, cameraPosition);"),
      );
  };
  mat.customProgramCacheKey = () => "sp:" + spec.key;
  return mat;
}

// ---------------------------------------------------------------------------------- stone

/**
 * Portland stone ashlar. Paint: r = joint kind, g = rain exposure, b = cavity.
 * Courses 0.56 m high run at the same heights all round the building (v = world height);
 * blocks 0.8-1.7 m long, staggered course by course; each block gets its own tone.
 * Weathering: rain-washed white where exposed, soot-grey where sheltered, vertical streaks
 * below ledges, a darker splash zone near the ground.
 */
const STONE_PARS = /* glsl */ `
uniform vec3 uStoneA;
uniform vec3 uStoneB;
uniform float uClean;
float stoneJoints(vec2 suv, float kind, out vec2 blockId) {
  // kind: 0 none, .33 drums (horizontal), .66 blocks (vertical), 1 ashlar
  float courseH = 0.56;
  float cv = suv.y / courseH;
  float ci = floor(cv);
  float fy = fract(cv);
  float blen = mix(0.85, 1.7, hash12(vec2(ci, 3.1)));
  float cu = (suv.x + hash12(vec2(ci, 7.7)) * 7.0) / blen;
  float bi = floor(cu);
  float fx = fract(cu);
  blockId = vec2(bi, ci);
  vec2 fw = max(fwidth(suv), vec2(1e-5));
  float jw = 0.005;
  float dy = min(fy, 1.0 - fy) * courseH;
  float dx = min(fx, 1.0 - fx) * blen;
  float jy = 1.0 - smoothstep(jw, jw + fw.y * 1.5, dy);
  float jx = 1.0 - smoothstep(jw, jw + fw.x * 1.5, dx);
  float hasH = step(0.2, kind) * (1.0 - step(0.5, kind) * step(kind, 0.8));
  float hasV = step(0.5, kind);
  if (kind > 0.2 && kind < 0.5) { hasV = 0.0; }
  // drums: courses every ~1.1 m
  float j = max(jy * hasH, jx * hasV);
  // fade out when joints become sub-pixel (prevents shimmer at distance)
  float px = max(fw.x, fw.y);
  return j * (1.0 - smoothstep(0.012, 0.05, px));
}
`;

const STONE_ALBEDO = /* glsl */ `
  vec3 paint = vColor.rgb;
  float kind = paint.r, expo = paint.g, cav = paint.b;
  vec3 wp = vWorldPos;
  vec2 bid;
  vec2 suv = vSurfUv;
  if (kind > 0.2 && kind < 0.5) suv.y *= 0.5;
  float j = stoneJoints(suv, kind, bid);
  float bh = hash12(bid + floor(wp.xz * 0.02) * 13.0);
  // base tone: warm cream Portland stone, block to block variation
  vec3 base = mix(uStoneA, uStoneB, bh * 0.8 + 0.2 * nz(wp.xz * 0.013 + wp.y * 0.007));
  float mott = texture2D(uNoise, vec2(dot(wp.xz, vec2(0.7, 0.3)), wp.y) * 0.09).g;
  base *= 0.92 + 0.16 * mott;
  // shells and fine grain (Portland Whitbed)
  float grain = texture2D(uNoise, suv * 1.7).b;
  base *= 0.965 + 0.07 * grain;
  // weathering: sheltered areas collect soot, exposed ones are washed
  float streak = texture2D(uNoise, vec2(suv.x * 0.9, wp.y * 0.035)).a;
  float shelter = clamp(1.0 - expo * 1.35, 0.0, 1.0);
  float dirt = shelter * (0.35 + 0.65 * streak) * (1.0 - uClean * 0.55);
  // green-grey splash zone near the ground
  float splash = (1.0 - smoothstep(0.0, 1.4, wp.y)) * 0.35;
  // lichen / soot on ledges
  float ledge = smoothstep(0.8, 0.95, expo) * 0.18 * texture2D(uNoise, wp.xz * 0.35).r;
  vec3 sootC = vec3(0.26, 0.25, 0.24);
  vec3 col = base;
  col = mix(col, col * sootC * 2.2, clamp(dirt * 0.55, 0.0, 1.0));
  col = mix(col, col * vec3(0.72, 0.74, 0.68), splash);
  col = mix(col, col * vec3(0.62, 0.63, 0.6), ledge);
  // joints: slightly darker mortar line
  col *= 1.0 - j * 0.28;
  col *= mix(0.55, 1.0, cav);
  diffuseColor.rgb = col;
  surfRough = 0.84 + 0.1 * grain - 0.08 * ledge;
  surfBumpH = (grain * 0.0006 - j * 0.0025) * (1.0 - smoothstep(20.0, 60.0, length(wp - cameraPosition)));
  surfAO = mix(0.45, 1.0, cav);
`;

export function makeStone(opts: { interior?: boolean; tint?: THREE.ColorRepresentation; key?: string } = {}) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0 });
  const a = new THREE.Color(opts.tint ?? 0xd9d0bd).convertSRGBToLinear();
  const b = a.clone().multiply(new THREE.Color(0.96, 0.95, 0.93));
  return patchMaterial(m, {
    key: opts.key ?? (opts.interior ? "stoneInt" : "stone"),
    pars: STONE_PARS,
    albedo: STONE_ALBEDO,
    uniforms: {
      uStoneA: { value: a },
      uStoneB: { value: b },
      uClean: { value: opts.interior ? 1 : 0.35 },
    },
    ambient: opts.interior ? "uInteriorAmbient" : undefined,
  });
}

// ---------------------------------------------------------------------------------- lead

const LEAD_ALBEDO = /* glsl */ `
  vec3 paint = vColor.rgb;
  vec3 wp = vWorldPos;
  vec2 suv = vSurfUv;
  // lead sheets: laps every 2.4 m along the slope, seams every ~0.9 m around
  vec2 fw = max(fwidth(suv), vec2(1e-5));
  float lap = fract(suv.y / 2.4);
  float lapLine = 1.0 - smoothstep(0.0, fw.y / 2.4 * 2.0 + 0.004, min(lap, 1.0 - lap));
  lapLine *= 1.0 - smoothstep(0.02, 0.08, max(fw.x, fw.y));
  // white lead carbonate patina running down from laps
  float streak = texture2D(uNoise, vec2(suv.x * 0.6, suv.y * 0.04)).a;
  float patina = smoothstep(0.35, 0.95, streak) * (0.55 + 0.45 * fract(-suv.y / 2.4));
  vec3 lead = vec3(0.135, 0.14, 0.142);
  vec3 white = vec3(0.36, 0.365, 0.355);
  vec3 col = mix(lead, white, patina * 0.55 * paint.g);
  col *= 0.9 + 0.2 * texture2D(uNoise, suv * 0.2).g;
  col *= 1.0 - lapLine * 0.35;
  col *= mix(0.6, 1.0, paint.b);
  diffuseColor.rgb = col;
  surfRough = 0.58 + 0.2 * patina;
  surfMetal = 0.12 - 0.08 * patina;
  surfBumpH = -lapLine * 0.004;
  surfAO = mix(0.5, 1.0, paint.b);
`;

export function makeLead() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.3 });
  return patchMaterial(m, { key: "lead", albedo: LEAD_ALBEDO });
}

// ---------------------------------------------------------------------------------- gold

const GOLD_ALBEDO = /* glsl */ `
  float n = texture2D(uNoise, vWorldPos.xz * 0.9 + vWorldPos.y * 0.4).g;
  diffuseColor.rgb = vec3(1.0, 0.72, 0.29) * (0.92 + 0.12 * n);
  surfRough = 0.2 + 0.12 * n;
  surfMetal = 1.0;
  surfAO = mix(0.6, 1.0, vColor.b);
`;
export function makeGold() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 1 });
  return patchMaterial(m, { key: "gold", albedo: GOLD_ALBEDO });
}

// ---------------------------------------------------------------------------------- iron

const IRON_ALBEDO = /* glsl */ `
  float n = texture2D(uNoise, vWorldPos.xz * 0.5 + vWorldPos.y).b;
  diffuseColor.rgb = vec3(0.018, 0.019, 0.02) * (0.8 + 0.4 * n);
  surfRough = 0.42 + 0.2 * n;
  surfMetal = 0.4;
`;
export function makeIron() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.4 });
  return patchMaterial(m, { key: "iron", albedo: IRON_ALBEDO });
}

// ---------------------------------------------------------------------------------- glass

/**
 * Leaded clear glass. Seen from outside: dark, reflective, with a grid of glazing bars. Seen from
 * inside (back face): bright daylight coming through.
 */
const GLASS_ALBEDO = /* glsl */ `
  vec2 suv = vSurfUv;
  vec2 fw = max(fwidth(suv), vec2(1e-5));
  vec2 g = abs(fract(suv / vec2(0.42, 0.52)) - 0.5) * vec2(0.42, 0.52);
  float bar = 1.0 - smoothstep(0.012, 0.012 + max(fw.x, fw.y) * 1.5, min(g.x, g.y));
  bar *= 1.0 - smoothstep(0.03, 0.1, max(fw.x, fw.y));
  float wob = texture2D(uNoise, suv * 0.35).g;
  bool inside = !gl_FrontFacing;
  if (inside) {
    diffuseColor.rgb = vec3(0.02);
    vec3 day = atmoSky(normalize(vec3(0.0, 0.35, 1.0))) * 1.1 + vec3(0.25, 0.24, 0.22) * uSunIllum * 0.09;
    surfEmissive = mix(day * (0.8 + 0.3 * wob), vec3(0.0), bar) * (1.0 - uNight * 0.97);
    surfRough = 0.9;
  } else {
    diffuseColor.rgb = mix(vec3(0.012, 0.014, 0.016), vec3(0.03), bar);
    surfRough = mix(0.06 + 0.05 * wob, 0.6, bar);
    surfMetal = 0.0;
    surfEmissive = vec3(1.0, 0.72, 0.42) * 0.9 * uNight * (1.0 - bar) * (0.6 + 0.4 * wob);
  }
`;
export function makeGlass() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.1, metalness: 0, side: THREE.DoubleSide });
  return patchMaterial(m, { key: "glass", albedo: GLASS_ALBEDO });
}

// ---------------------------------------------------------------------------------- paving

const PAVING_ALBEDO = /* glsl */ `
  vec3 wp = vWorldPos;
  vec2 p = wp.xz;
  // York stone flags 0.9 x 0.6 m in staggered rows
  float row = floor(p.y / 0.6);
  float off = hash12(vec2(row, 1.7)) * 0.9;
  vec2 cell = vec2(floor((p.x + off) / 0.9), row);
  vec2 f = vec2(fract((p.x + off) / 0.9) * 0.9, fract(p.y / 0.6) * 0.6);
  vec2 fw = max(fwidth(p), vec2(1e-5));
  float jx = 1.0 - smoothstep(0.004, 0.004 + fw.x * 1.5, min(f.x, 0.9 - f.x));
  float jy = 1.0 - smoothstep(0.004, 0.004 + fw.y * 1.5, min(f.y, 0.6 - f.y));
  float j = max(jx, jy) * (1.0 - smoothstep(0.02, 0.07, max(fw.x, fw.y)));
  float h = hash12(cell);
  vec3 c = mix(vec3(0.34, 0.31, 0.27), vec3(0.43, 0.4, 0.35), h);
  float n = texture2D(uNoise, p * 0.05).r;
  float g = texture2D(uNoise, p * 0.9).b;
  c *= 0.85 + 0.25 * n;
  c *= 0.93 + 0.12 * g;
  // wet-looking dark stains and gum spots
  c *= 1.0 - 0.18 * smoothstep(0.62, 0.9, texture2D(uNoise, p * 0.11 + 0.5).a);
  c *= 1.0 - j * 0.35;
  diffuseColor.rgb = c * mix(0.5, 1.0, vColor.b);
  surfRough = 0.82 + 0.1 * g;
  surfBumpH = -j * 0.003 + g * 0.0004;
  surfAO = mix(0.4, 1.0, vColor.b);
`;
export function makePaving() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  return patchMaterial(m, { key: "paving", albedo: PAVING_ALBEDO });
}

const ASPHALT_ALBEDO = /* glsl */ `
  vec2 p = vWorldPos.xz;
  float n = texture2D(uNoise, p * 0.07).r, g = texture2D(uNoise, p * 1.3).b;
  vec3 c = vec3(0.075, 0.075, 0.078) * (0.85 + 0.3 * n) * (0.9 + 0.2 * g);
  diffuseColor.rgb = c * mix(0.5, 1.0, vColor.b);
  surfRough = 0.9 - 0.2 * smoothstep(0.7, 0.9, n);
  surfBumpH = g * 0.0005;
`;
export function makeAsphalt() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  return patchMaterial(m, { key: "asphalt", albedo: ASPHALT_ALBEDO });
}

const GRASS_ALBEDO = /* glsl */ `
  vec2 p = vWorldPos.xz;
  float n = texture2D(uNoise, p * 0.04).r, m = texture2D(uNoise, p * 0.3).g, g = texture2D(uNoise, p * 3.1).b;
  vec3 c = mix(vec3(0.05, 0.11, 0.025), vec3(0.11, 0.17, 0.045), n);
  c = mix(c, vec3(0.13, 0.13, 0.06), smoothstep(0.65, 0.95, m) * 0.5);
  c *= 0.8 + 0.4 * g;
  diffuseColor.rgb = c * mix(0.5, 1.0, vColor.b);
  surfRough = 0.95;
  surfBumpH = g * 0.004;
`;
export function makeGrass() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  return patchMaterial(m, { key: "grass", albedo: GRASS_ALBEDO });
}

/** Plain coloured surface (vertex paint b = cavity only). */
export function makePlain(color: THREE.ColorRepresentation, rough = 0.8, metal = 0, key = "plain", interior = false) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, color, roughness: rough, metalness: metal });
  return patchMaterial(m, {
    key: key,
    albedo: `
      float n = texture2D(uNoise, vWorldPos.xz * 0.3 + vWorldPos.y * 0.2).g;
      diffuseColor.rgb *= (0.9 + 0.2 * n) * mix(0.55, 1.0, vColor.b);
      surfAO = mix(0.5, 1.0, vColor.b);
    `,
    ambient: interior ? "uInteriorAmbient" : undefined,
  });
}

/** Black and white marble paving of the cathedral floor (Dickinson, 1709-10). */
const MARBLE_ALBEDO = /* glsl */ `
  vec2 p = vWorldPos.xz;
  // diagonal chequer of 0.76 m squares, with a compass pattern under the dome
  float r = length(p);
  vec2 q = mat2(0.70710678, -0.70710678, 0.70710678, 0.70710678) * p / 0.76;
  vec2 cell = floor(q);
  vec2 fw = max(fwidth(q), vec2(1e-5));
  // box-filtered chequer (no shimmer or moire at a distance)
  vec2 w2 = fw * 1.5;
  vec2 i2 = 2.0 * (abs(fract((q - 0.5 * w2) * 0.5) - 0.5) - abs(fract((q + 0.5 * w2) * 0.5) - 0.5)) / w2;
  float chk = 0.5 - 0.5 * i2.x * i2.y;
  vec2 f = fract(q);
  float jl = 1.0 - smoothstep(0.0, fw.x * 1.2 + 0.006, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
  float isBlack = chk;
  // compass star under the dome
  if (r < 10.5) {
    float a = atan(p.y, p.x);
    float star = abs(fract(a / 6.2831853 * 16.0) - 0.5) * 2.0;
    float band = step(abs(r - 9.8), 0.35) + step(abs(r - 4.1), 0.18);
    isBlack = step(r, 2.2 + 7.0 * (1.0 - star) * step(r, 9.2)) * step(0.4, r) + band;
    isBlack = clamp(isBlack, 0.0, 1.0);
    if (r < 0.9) isBlack = 0.3; // brass
    jl = 0.0;
  }
  float n = texture2D(uNoise, p * 0.23).a;
  vec3 white = vec3(0.78, 0.76, 0.72) * (0.9 + 0.1 * n);
  vec3 black = vec3(0.025, 0.025, 0.028) * (0.9 + 0.3 * n);
  vec3 c = mix(white, black, isBlack);
  if (r < 0.9) c = vec3(0.7, 0.5, 0.2);
  c *= 1.0 - jl * 0.25;
  diffuseColor.rgb = c;
  surfRough = mix(0.22, 0.34, n) + 0.25 * smoothstep(0.2, 1.0, max(fw.x, fw.y));
  surfAO = mix(0.4, 1.0, vColor.b);
`;
export function makeMarbleFloor() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.2 });
  return patchMaterial(m, { key: "marble", albedo: MARBLE_ALBEDO, ambient: "uInteriorAmbient" });
}

/** A named set of the materials the cathedral and churchyard are built from. */
export function createMaterialSet() {
  const domePaint = makeDomePaint(DOME.innerSpring, DOME.innerCrown);
  return {
    domePaint,
    mosaic: makeMosaic(),
    stairStone: makeStairStone(),
    coneBrick: makeConeBrick(0, "coneBrick"),
    coneWash: makeConeBrick(1, "coneWash"),
    domeTimber: makeDomeTimber(),
    lamp: makeLamp(),
    lanternLight: makeLanternLight(),
    stone: makeStone(),
    stoneInt: makeStone({ interior: true, tint: 0xd8cfbc }),
    lead: makeLead(),
    gold: makeGold(),
    iron: makeIron(),
    glass: makeGlass(),
    paving: makePaving(),
    asphalt: makeAsphalt(),
    grass: makeGrass(),
    marble: makeMarbleFloor(),
    wood: makePlain(0x3b2616, 0.62, 0, "wood", true),
    darkStone: makeStone({ tint: 0x8c877d, key: "darkStone" }),
    brick: makePlain(0x7a3f2c, 0.9, 0, "brick", true),
    timber: makePlain(0x4a3522, 0.85, 0, "timber", true),
    plaster: makePlain(0xcfc6b4, 0.9, 0, "plaster", true),
  };
}
export type MaterialSet = ReturnType<typeof createMaterialSet>;
export type MatKey = keyof MaterialSet;
