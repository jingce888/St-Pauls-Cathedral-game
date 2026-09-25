import * as THREE from "three";
import { Atmosphere, atmoUniforms, SUN_ILLUMINANCE, sunTransmittance } from "./Atmosphere";
import { londonDate, solarPosition, sunDirection } from "./sun";
import { clamp, smoothstep } from "../core/math";

export interface LightingQuality {
  nearMap: number;
  farMap: number;
  farShadows: boolean;
}

/**
 * The sun and sky. The cathedral and the city never move, so both shadow maps are rendered only
 * when the sun moves (renderer.shadowMap.autoUpdate = false): a detailed near cascade over the
 * cathedral and churchyard and a coarse far cascade over the city seen from the galleries.
 */
export class Lighting {
  readonly sun: THREE.DirectionalLight;
  readonly sunFar: THREE.DirectionalLight;
  readonly sunDir = new THREE.Vector3(0, 1, 0);
  readonly atmosphere: Atmosphere;
  private pmrem: THREE.PMREMGenerator;
  private env: THREE.Texture | null = null;
  private dirty = true;
  private envDirty = true;
  private lastEnvSunDir = new THREE.Vector3();
  /** Date on which the sun is computed; the clock time is `hours` (London local time). */
  month = 5;
  day = 16;
  hours = 17.25;
  /** Base exposure from the sky brightness, before eye adaptation. */
  exposure = 1;
  sunElevation = 0;
  sunAzimuth = 0;
  readonly nearBox = new THREE.Box3(new THREE.Vector3(-175, -4, -150), new THREE.Vector3(160, 112, 150));
  readonly farBox = new THREE.Box3(new THREE.Vector3(-3000, -15, -3000), new THREE.Vector3(3000, 320, 3000));

  constructor(
    private renderer: THREE.WebGLRenderer,
    private scene: THREE.Scene,
    noise: THREE.Texture,
    q: LightingQuality,
  ) {
    this.atmosphere = new Atmosphere(noise);
    scene.add(this.atmosphere.skyMesh);
    this.pmrem = new THREE.PMREMGenerator(renderer);

    // order matters: the near cascade must be the first directional light (see materials.ts)
    this.sun = new THREE.DirectionalLight(0xffffff, 1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(q.nearMap, q.nearMap);
    this.sun.shadow.bias = -0.00025;
    this.sun.shadow.normalBias = 0.09;
    this.sun.shadow.radius = 2.2;
    this.sun.shadow.autoUpdate = false;
    scene.add(this.sun, this.sun.target);

    this.sunFar = new THREE.DirectionalLight(0x000000, 0);
    this.sunFar.castShadow = q.farShadows;
    this.sunFar.shadow.mapSize.set(q.farMap, q.farMap);
    this.sunFar.shadow.bias = -0.0006;
    this.sunFar.shadow.normalBias = 1.2;
    this.sunFar.shadow.radius = 1.4;
    this.sunFar.shadow.autoUpdate = false;
    scene.add(this.sunFar, this.sunFar.target);

    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.shadowMap.autoUpdate = false;
  }

  setTime(hours: number) {
    if (Math.abs(hours - this.hours) < 1e-4) return;
    this.hours = hours;
    this.dirty = true;
  }
  setDate(month: number, day: number) {
    this.month = month;
    this.day = day;
    this.dirty = true;
  }
  /** Forces the sky, environment and shadows to be recomputed (e.g. after a cloud change). */
  markDirty() {
    this.dirty = true;
  }
  setHaze(h: number) {
    atmoUniforms.uHaze.value = h;
    this.dirty = true;
  }

  /** Call once per frame. Returns true when the sun moved (shadows re-rendered this frame). */
  update(): boolean {
    if (!this.dirty) return false;
    this.dirty = false;
    const { azimuth, elevation } = solarPosition(londonDate(this.month, this.day, this.hours));
    this.sunAzimuth = azimuth;
    this.sunElevation = elevation;
    sunDirection(azimuth, elevation, this.sunDir);
    // Below the horizon the "sun" light becomes moonlight / city glow from above.
    const night = 1 - smoothstep(-6, 2, elevation);
    atmoUniforms.uNight.value = night;
    const lightDir = this.sunDir.clone();
    if (elevation < 3) {
      // keep shadows sensible: never let the light graze below ~3 degrees
      lightDir.y = Math.max(lightDir.y, Math.sin((3 * Math.PI) / 180));
      lightDir.normalize();
    }
    atmoUniforms.uSunDir.value.copy(this.sunDir);
    this.atmosphere.update(this.renderer);

    // sun colour at the ground
    const T = sunTransmittance(this.sunDir, atmoUniforms.uHaze.value);
    const sunI = SUN_ILLUMINANCE * (1 - night);
    this.sun.color.setRGB(T.x, T.y, T.z);
    this.sun.intensity = sunI * smoothstep(-1.5, 1.5, elevation);
    if (night > 0.5) {
      // moonlight
      this.sun.color.setRGB(0.55, 0.62, 0.85);
      this.sun.intensity = 0.02;
    }

    // exposure from horizontal illuminance (sun + sky), in stops
    const sinE = Math.max(0, Math.sin((elevation * Math.PI) / 180));
    const Tl = (T.x * 0.2126 + T.y * 0.7152 + T.z * 0.0722);
    const eSun = sunI * Tl * sinE;
    const eSky = SUN_ILLUMINANCE * (0.02 + 0.2 * Math.pow(sinE, 0.7)) * (1 - night * 0.995);
    const eTot = Math.max(eSun + eSky, 1e-4);
    // a sunlit horizontal white-ish surface should land around 0.6 before tonemapping
    this.exposure = clamp(2.4 / Math.pow(eTot, 0.75), 0.45, 40);

    // ground radiance for the environment's lower hemisphere: a grey city lit by sun and sky
    const g = (0.1 / Math.PI) * eTot;
    atmoUniforms.uGroundRadiance.value.set(g * 0.95, g * 0.93, g * 0.88);

    this.fitShadow(this.sun, this.nearBox, lightDir);
    this.fitShadow(this.sunFar, this.farBox, lightDir);
    this.sun.shadow.needsUpdate = true;
    this.sunFar.shadow.needsUpdate = true;
    this.renderer.shadowMap.needsUpdate = true;

    if (this.lastEnvSunDir.distanceTo(this.sunDir) > 0.002 || !this.env) this.envDirty = true;
    return true;
  }

  /** Rebuilds the image based lighting if needed (after update). */
  updateEnvironment() {
    if (!this.envDirty) return;
    this.envDirty = false;
    this.lastEnvSunDir.copy(this.sunDir);
    const old = this.env;
    this.env = this.atmosphere.buildEnvironment(this.renderer, this.pmrem);
    this.scene.environment = this.env;
    if (old && old !== this.env) old.dispose();
  }

  private fitShadow(light: THREE.DirectionalLight, box: THREE.Box3, dir: THREE.Vector3) {
    const center = box.getCenter(new THREE.Vector3());
    light.target.position.copy(center);
    light.position.copy(center).addScaledVector(dir, 4000);
    light.updateMatrixWorld();
    light.target.updateMatrixWorld();
    const cam = light.shadow.camera as THREE.OrthographicCamera;
    cam.position.copy(light.position);
    cam.lookAt(center);
    cam.updateMatrixWorld();
    const inv = cam.matrixWorldInverse;
    const min = new THREE.Vector3(Infinity, Infinity, Infinity), max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    const p = new THREE.Vector3();
    for (let i = 0; i < 8; i++) {
      p.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).applyMatrix4(inv);
      min.min(p);
      max.max(p);
    }
    cam.left = min.x;
    cam.right = max.x;
    cam.bottom = min.y;
    cam.top = max.y;
    cam.near = Math.max(1, -max.z - 50);
    cam.far = -min.z + 50;
    cam.updateProjectionMatrix();
  }
}
