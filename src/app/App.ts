import * as THREE from "three";
import { chooseTier, DynamicResolution, TIERS, type Tier, type TierSettings } from "./quality";
import { runSteps } from "../core/scheduler";
import { Lighting } from "../gfx/Lighting";
import { Post } from "../gfx/Post";
import { atmoUniforms } from "../gfx/Atmosphere";
import { noiseTexture } from "../gfx/noise";
import { createMaterialSet, type MaterialSet } from "../gfx/materials";
import { damp } from "../core/math";

export interface WorldModule {
  name: string;
  label: string;
  weight: number;
  build(app: App): void | Promise<void>;
}

/**
 * Owns the renderer, scene, camera, lighting and post-processing, runs the boot sequence and
 * the frame loop. Game systems (world, player, HUD, audio) plug in through `modules` and
 * `onFrame` callbacks.
 */
export class App {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly tier: Tier;
  readonly q: TierSettings;
  readonly tierReason: string;
  post!: Post;
  lighting!: Lighting;
  mats!: MaterialSet;
  readonly dynres: DynamicResolution;
  readonly reversedDepth: boolean;
  private frameCbs: ((dt: number, t: number) => void)[] = [];
  private last = performance.now();
  time = 0;
  running = false;
  /** Eye adaptation multiplier (inside vs. outside), smoothed. */
  adapt = 1;
  adaptTarget = 1;
  fps = 60;
  private frameMs = 16;
  private shootMode: boolean;

  constructor(container: HTMLElement) {
    this.shootMode = new URLSearchParams(location.search).has("shoot");
    // probe capabilities with a throwaway context
    const probe = document.createElement("canvas").getContext("webgl2");
    const { tier, reason } = chooseTier(probe);
    probe?.getExtension("WEBGL_lose_context")?.loseContext();
    this.tier = tier;
    this.q = TIERS[tier];
    this.tierReason = reason;

    const canvas = document.createElement("canvas");
    container.appendChild(canvas);
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      stencil: false,
      depth: true,
      powerPreference: "high-performance",
      reversedDepthBuffer: false,
      preserveDrawingBuffer: this.shootMode,
    });
    this.reversedDepth = this.renderer.capabilities.reversedDepthBuffer === true;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.autoClear = false;
    this.renderer.info.autoReset = false;

    this.camera = new THREE.PerspectiveCamera(70, 1, 0.15, 24000);
    this.camera.position.set(-150, 1.7, 0);
    this.dynres = new DynamicResolution(0.5, this.q.renderScale, this.q.renderScale);
    this.dynres.enabled = !this.shootMode;
    addEventListener("resize", () => this.resize());
  }

  onFrame(cb: (dt: number, t: number) => void) {
    this.frameCbs.push(cb);
  }

  async boot(modules: WorldModule[], onProgress: (f: number, label: string) => void) {
    const noise = noiseTexture();
    this.post = new Post(this.renderer, { samples: this.q.samples, bloom: this.q.bloom, renderScale: this.q.renderScale }, this.reversedDepth);
    this.lighting = new Lighting(this.renderer, this.scene, noise, {
      nearMap: Math.min(this.q.nearMap, this.renderer.capabilities.maxTextureSize),
      farMap: Math.min(this.q.farMap, this.renderer.capabilities.maxTextureSize),
      farShadows: this.q.farShadows,
    });
    this.mats = createMaterialSet();
    this.resize();
    await runSteps(
      [
        { name: "sky", label: "Mixing the London sky", weight: 1, run: () => { this.lighting.update(); this.lighting.updateEnvironment(); } },
        ...modules.map((m) => ({ name: m.name, label: m.label, weight: m.weight, run: () => m.build(this) })),
        { name: "compile", label: "Lighting the stone", weight: 2, run: () => this.warmup() },
      ],
      onProgress,
    );
  }

  /** Compiles shaders and renders the shadow maps once so the first frame does not stutter. */
  private warmup() {
    this.lighting.update();
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.compile(this.scene, this.camera);
    this.renderFrame(0);
  }

  resize() {
    const w = Math.max(1, innerWidth), h = Math.max(1, innerHeight);
    const dpr = Math.min(devicePixelRatio || 1, this.q.dprCap);
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(w, h, true);
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    const s = dpr * this.dynres.scale;
    this.renderer.setSize(Math.round(w * dpr), Math.round(h * dpr), false);
    this.post?.setSize(Math.max(2, Math.round(w * s)), Math.max(2, Math.round(h * s)));
    if (this.post) this.post.mComposite.uniforms.uSharpen.value = this.dynres.scale < 0.95 ? 0.35 : 0.0;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = () => {
      if (!this.running) return;
      requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      this.tick(dt);
      const ms = performance.now() - now;
      this.frameMs = this.frameMs * 0.9 + ms * 0.1;
      this.fps = this.fps * 0.95 + (1 / Math.max(dt, 1e-3)) * 0.05;
      if (this.dynres.tick(dt * 1000, dt)) this.resize();
    };
    requestAnimationFrame(loop);
  }

  tick(dt: number) {
    this.time += dt;
    atmoUniforms.uTime.value = this.time;
    atmoUniforms.uCloudShift.value.x += dt * 0.004;
    atmoUniforms.uCloudShift.value.y += dt * 0.0015;
    for (const cb of this.frameCbs) cb(dt, this.time);
    this.adapt += (this.adaptTarget - this.adapt) * damp(this.adaptTarget > this.adapt ? 0.9 : 1.6, dt);
    this.renderFrame(dt);
  }

  renderFrame(_dt: number) {
    const moved = this.lighting.update();
    if (moved) this.lighting.updateEnvironment();
    atmoUniforms.uCamAltKm.value = 0.02 + Math.max(0, this.camera.position.y) * 0.001;
    this.post.mComposite.uniforms.uExposure.value = this.lighting.exposure * this.adapt;
    this.renderer.info.reset();
    this.post.render(this.scene, this.camera, this.time);
  }

  stats() {
    const i = this.renderer.info;
    return {
      calls: i.render.calls,
      triangles: i.render.triangles,
      geometries: i.memory.geometries,
      textures: i.memory.textures,
      fps: Math.round(this.fps),
      frameMs: +this.frameMs.toFixed(2),
      scale: this.dynres.scale,
      tier: this.tier,
      reason: this.tierReason,
      reversedDepth: this.reversedDepth,
      renderer: rendererName(this.renderer),
    };
  }
}

function rendererName(r: THREE.WebGLRenderer): string {
  const gl = r.getContext();
  const dbg = gl.getExtension("WEBGL_debug_renderer_info");
  return dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
}
