import * as THREE from "three";
import { FullscreenPass, passMaterial } from "./fullscreen";

/**
 * HDR pipeline: the scene renders into a multisampled half-float target; a bloom mip chain
 * (Karis-averaged first downsample, tent upsampling) is added, then exposure, AgX tone mapping,
 * a light filmic grade, vignette, grain and dithering go to the screen.
 */

const DOWN_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uFirst;
uniform float uThreshold;
varying vec2 vUv;
vec3 s(vec2 o) { return texture2D(tSrc, vUv + uTexel * o).rgb; }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 karis(vec3 a, vec3 b, vec3 c, vec3 d) { vec3 m = (a + b + c + d) * 0.25; return m / (1.0 + luma(m)); }
void main() {
  vec3 a = s(vec2(-2, 2)), b = s(vec2(0, 2)), c = s(vec2(2, 2));
  vec3 d = s(vec2(-2, 0)), e = s(vec2(0)), f = s(vec2(2, 0));
  vec3 g = s(vec2(-2, -2)), h = s(vec2(0, -2)), i = s(vec2(2, -2));
  vec3 j = s(vec2(-1, 1)), k = s(vec2(1, 1)), l = s(vec2(-1, -1)), m = s(vec2(1, -1));
  vec3 col;
  if (uFirst > 0.5) {
    col = karis(j, k, l, m) * 0.5 + (karis(a, b, d, e) + karis(b, c, e, f) + karis(d, e, g, h) + karis(e, f, h, i)) * 0.125;
    col /= max(1.0 - luma(col), 0.02);
    float br = max(col.r, max(col.g, col.b));
    float knee = uThreshold * 0.5;
    float soft = clamp(br - uThreshold + knee, 0.0, 2.0 * knee);
    soft = soft * soft / (4.0 * knee + 1e-4);
    col *= max(soft, br - uThreshold) / max(br, 1e-4);
  } else {
    col = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  }
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}`;

const UP_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform sampler2D tCur;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec2 d = uTexel;
  vec3 s = texture2D(tSrc, vUv + vec2(-d.x, d.y)).rgb + 2.0 * texture2D(tSrc, vUv + vec2(0.0, d.y)).rgb
    + texture2D(tSrc, vUv + vec2(d.x, d.y)).rgb + 2.0 * texture2D(tSrc, vUv + vec2(-d.x, 0.0)).rgb
    + 4.0 * texture2D(tSrc, vUv).rgb + 2.0 * texture2D(tSrc, vUv + vec2(d.x, 0.0)).rgb
    + texture2D(tSrc, vUv + vec2(-d.x, -d.y)).rgb + 2.0 * texture2D(tSrc, vUv + vec2(0.0, -d.y)).rgb
    + texture2D(tSrc, vUv + vec2(d.x, -d.y)).rgb;
  gl_FragColor = vec4(texture2D(tCur, vUv).rgb + s / 16.0, 1.0);
}`;

const COMPOSITE_FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform float uBloom;
uniform float uExposure;
uniform float uSaturation;
uniform float uContrast;
uniform vec3 uLift;
uniform vec3 uGain;
uniform float uVignette;
uniform float uGrain;
uniform float uTime;
uniform float uFade;
uniform vec2 uRes;
uniform float uSharpen;
varying vec2 vUv;

const mat3 SRGB_TO_REC2020 = mat3(0.6274, 0.0691, 0.0164, 0.3293, 0.9195, 0.0880, 0.0433, 0.0113, 0.8956);
const mat3 REC2020_TO_SRGB = mat3(1.6605, -0.1246, -0.0182, -0.5876, 1.1329, -0.1006, -0.0728, -0.0083, 1.1187);
vec3 agxContrast(vec3 x) {
  vec3 x2 = x * x, x4 = x2 * x2;
  return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
}
vec3 agx(vec3 c) {
  const mat3 inset = mat3(vec3(0.856627153315983, 0.137318972929847, 0.11189821299995),
    vec3(0.0951212405381588, 0.761241990602591, 0.0767994186031903),
    vec3(0.0482516061458583, 0.101439036467562, 0.811302368396859));
  const mat3 outset = mat3(vec3(1.1271005818144368, -0.1413297634984383, -0.14132976349843826),
    vec3(-0.11060664309660323, 1.157823702216272, -0.11060664309660294),
    vec3(-0.016493938717834573, -0.016493938717834257, 1.2519364065950405));
  const float minEv = -12.47393, maxEv = 4.026069;
  c = SRGB_TO_REC2020 * c;
  c = inset * c;
  c = max(c, 1e-10);
  c = clamp((log2(c) - minEv) / (maxEv - minEv), 0.0, 1.0);
  c = agxContrast(c);
  c = outset * c;
  c = pow(max(vec3(0.0), c), vec3(2.2));
  c = REC2020_TO_SRGB * c;
  return clamp(c, 0.0, 1.0);
}
float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }

void main() {
  vec3 col = texture2D(tScene, vUv).rgb;
  if (uSharpen > 0.0) {
    vec2 t = 1.0 / uRes;
    vec3 n = texture2D(tScene, vUv + vec2(0.0, t.y)).rgb + texture2D(tScene, vUv - vec2(0.0, t.y)).rgb
      + texture2D(tScene, vUv + vec2(t.x, 0.0)).rgb + texture2D(tScene, vUv - vec2(t.x, 0.0)).rgb;
    col = max(col + (col * 4.0 - n) * uSharpen * 0.25, 0.0);
  }
  col += texture2D(tBloom, vUv).rgb * uBloom;
  col *= uExposure;
  col = agx(col);
  // filmic grade: a touch of contrast and saturation, warm highlights, cool shadows
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, uSaturation);
  col = pow(col, vec3(1.0 / 2.2));
  col = (col - 0.5) * uContrast + 0.5;
  col = uGain * (col + uLift * (1.0 - col));
  col = pow(clamp(col, 0.0, 1.0), vec3(2.2));
  vec2 q = vUv - 0.5;
  q.x *= uRes.x / uRes.y;
  col *= mix(1.0 - uVignette, 1.0, smoothstep(1.2, 0.3, length(q)));
  col = mix(col, vec3(0.0), uFade);
  vec3 s = toSRGB(col);
  s += (hash(gl_FragCoord.xy + fract(uTime * 13.7) * 71.3) - 0.5) * uGrain + (hash(gl_FragCoord.yx * 1.37) - 0.5) / 255.0;
  gl_FragColor = vec4(s, 1.0);
}`;

export interface PostQuality {
  samples: number;
  bloom: boolean;
  renderScale: number;
}

export class Post {
  private fs = new FullscreenPass();
  sceneRT!: THREE.WebGLRenderTarget;
  private down: THREE.WebGLRenderTarget[] = [];
  private up: THREE.WebGLRenderTarget[] = [];
  private mDown = passMaterial(DOWN_FRAG, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uFirst: { value: 0 }, uThreshold: { value: 1.2 } });
  private mUp = passMaterial(UP_FRAG, { tSrc: { value: null }, tCur: { value: null }, uTexel: { value: new THREE.Vector2() } });
  readonly mComposite = passMaterial(COMPOSITE_FRAG, {
    tScene: { value: null },
    tBloom: { value: null },
    uBloom: { value: 0.12 },
    uExposure: { value: 1 },
    uSaturation: { value: 1.06 },
    uContrast: { value: 1.05 },
    uLift: { value: new THREE.Vector3(0.006, 0.008, 0.014) },
    uGain: { value: new THREE.Vector3(1.0, 0.985, 0.955) },
    uVignette: { value: 0.22 },
    uGrain: { value: 0.012 },
    uTime: { value: 0 },
    uFade: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uSharpen: { value: 0 },
  });
  private black: THREE.DataTexture;
  width = 1;
  height = 1;
  levels = 6;

  constructor(private renderer: THREE.WebGLRenderer, public q: PostQuality, readonly reversedDepth: boolean) {
    this.black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    this.black.needsUpdate = true;
  }

  setSize(w: number, h: number) {
    this.width = w;
    this.height = h;
    this.sceneRT?.dispose();
    for (const t of [...this.down, ...this.up]) t.dispose();
    this.down = [];
    this.up = [];
    this.sceneRT = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      samples: this.q.samples,
      depthBuffer: true,
      stencilBuffer: false,
      depthTexture: new THREE.DepthTexture(w, h, THREE.FloatType),
    });
    this.sceneRT.texture.generateMipmaps = false;
    let bw = w, bh = h;
    for (let i = 0; i < this.levels; i++) {
      bw = Math.max(1, bw >> 1);
      bh = Math.max(1, bh >> 1);
      const o = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
      this.down.push(new THREE.WebGLRenderTarget(bw, bh, o));
      this.up.push(new THREE.WebGLRenderTarget(bw, bh, o));
    }
    this.mComposite.uniforms.uRes.value.set(w, h);
  }

  render(scene: THREE.Scene, camera: THREE.Camera, time: number) {
    const r = this.renderer;
    r.setRenderTarget(this.sceneRT);
    r.clear(true, true, false);
    r.render(scene, camera);

    let bloomTex: THREE.Texture = this.black;
    if (this.q.bloom) {
      let src: THREE.Texture = this.sceneRT.texture;
      let sw = this.width, sh = this.height;
      for (let i = 0; i < this.down.length; i++) {
        const u = this.mDown.uniforms;
        u.tSrc.value = src;
        u.uTexel.value.set(1 / sw, 1 / sh);
        u.uFirst.value = i === 0 ? 1 : 0;
        this.fs.render(r, this.mDown, this.down[i]);
        src = this.down[i].texture;
        sw = this.down[i].width;
        sh = this.down[i].height;
      }
      let prev: THREE.Texture = this.down[this.down.length - 1].texture;
      for (let i = this.down.length - 2; i >= 0; i--) {
        const u = this.mUp.uniforms;
        u.tSrc.value = prev;
        u.tCur.value = this.down[i].texture;
        u.uTexel.value.set(1 / this.down[i + 1].width, 1 / this.down[i + 1].height);
        this.fs.render(r, this.mUp, this.up[i]);
        prev = this.up[i].texture;
      }
      bloomTex = prev;
    }
    const c = this.mComposite.uniforms;
    c.tScene.value = this.sceneRT.texture;
    c.tBloom.value = bloomTex;
    c.uTime.value = time;
    this.fs.render(r, this.mComposite, null);
  }
}
