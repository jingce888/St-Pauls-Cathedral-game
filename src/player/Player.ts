import * as THREE from "three";
import { clamp, damp } from "../core/math";
import type { Collider } from "./collision";
import type { Terrain } from "../world/terrain";

/**
 * First-person walker. A capsule floats `STEP` above the feet so kerbs and stairs pass under it;
 * the feet follow the highest surface found by a few downward probes (so the front of the foot
 * finds the next tread first), and the eye follows the feet through a spring so every step up
 * a stair is felt as a small lift rather than a jump. Walls push the capsule sideways.
 */

const RADIUS = 0.28;
const HEIGHT = 1.78;
const EYE = 1.63;
const STEP = 0.42;
const GRAVITY = 9.81;
const WALK = 1.9;
const RUN = 4.2;
const STRIDE = 0.74;

export interface PlayerInput {
  /** -1..1 each: strafe right, forward. */
  move: THREE.Vector2;
  run: boolean;
  /** Look delta in radians (consumed each frame). */
  look: THREE.Vector2;
}

export interface StepEvent {
  /** Vertical change since the last footfall (stairs). */
  dy: number;
  surface: "stone" | "grass" | "metal";
  speed: number;
}

export class Player {
  readonly feet = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  grounded = true;
  /** Smoothed height of the eye above the datum (the camera y). */
  private eyeY = 0;
  private eyeVel = 0;
  private phase = 0;
  private lastFootY = 0;
  private bob = 0;
  /** Horizontal speed (m/s), smoothed. */
  speed = 0;
  /** Is the player climbing (vertical speed along stairs), smoothed m/s. */
  climb = 0;
  onStep: ((e: StepEvent) => void) | null = null;
  /** Extra limits: returns a corrected position or null. */
  bounds: ((p: THREE.Vector3) => void) | null = null;
  /** Speed multiplier (e.g. narrow stairs). */
  speedScale = 1;
  enabled = true;

  private seg = new THREE.Line3();
  private push = new THREE.Vector3();
  private wish = new THREE.Vector3();
  private tmp = new THREE.Vector3();

  constructor(private terrain: Terrain, private col: Collider) {}

  /** Places the player at (x, z) standing on whatever is there (or at y if given). */
  teleport(x: number, z: number, yawDeg: number, pitchDeg = 0, y?: number) {
    const g = this.groundAt(x, z, y !== undefined ? y + 0.5 : 400, y !== undefined ? 3 : 500);
    this.feet.set(x, Number.isFinite(g) ? g : (y ?? this.terrain.height(x, z)), z);
    this.vel.set(0, 0, 0);
    this.yaw = (yawDeg * Math.PI) / 180;
    this.pitch = (pitchDeg * Math.PI) / 180;
    this.eyeY = this.feet.y + EYE;
    this.eyeVel = 0;
    this.lastFootY = this.feet.y;
    this.grounded = true;
  }

  /** Highest walkable surface under (x, z) from yTop down over range. */
  groundAt(x: number, z: number, yTop: number, range: number): number {
    let y = this.terrain.height(x, z);
    if (y > yTop || y < yTop - range) y = -Infinity;
    const f = this.col.floorAt(x, z, yTop, range);
    return Math.max(y, f);
  }

  private probe(x: number, z: number, yTop: number, range: number): number {
    let best = this.groundAt(x, z, yTop, range);
    const r = RADIUS * 0.62;
    for (let k = 0; k < 4; k++) {
      const a = this.yaw + (k * Math.PI) / 2 + Math.PI / 4;
      best = Math.max(best, this.groundAt(x + Math.cos(a) * r, z + Math.sin(a) * r, yTop, range));
    }
    return best;
  }

  update(dt: number, input: PlayerInput) {
    // look
    this.yaw -= input.look.x;
    this.pitch = clamp(this.pitch - input.look.y, -1.45, 1.45);
    input.look.set(0, 0);
    if (!this.enabled) return;

    // wish velocity in the horizontal plane
    const fwd = input.move.y, side = input.move.x;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    this.wish.set(-sy * fwd + cy * side, 0, -cy * fwd - sy * side);
    const wl = this.wish.length();
    if (wl > 1) this.wish.multiplyScalar(1 / wl);
    // slower on stairs: the climb rate limits the pace like real legs
    const stairK = 1 - 0.3 * clamp(Math.abs(this.climb) / 0.6, 0, 1);
    const target = (input.run ? RUN : WALK) * this.speedScale * stairK;
    this.wish.multiplyScalar(target);
    const acc = this.grounded ? 9 : 1.5;
    const k = damp(acc, dt);
    this.vel.x += (this.wish.x - this.vel.x) * k;
    this.vel.z += (this.wish.z - this.vel.z) * k;

    // move in sub-steps so thin railings are never skipped
    const dist = Math.hypot(this.vel.x, this.vel.z) * dt;
    const n = Math.max(1, Math.ceil(dist / 0.12));
    const h = dt / n;
    const prevY = this.feet.y;
    for (let i = 0; i < n; i++) this.subStep(h);
    this.bounds?.(this.feet);

    // feel of walking
    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.speed += (hs - this.speed) * damp(8, dt);
    const vy = (this.feet.y - prevY) / Math.max(dt, 1e-4);
    this.climb += (vy - this.climb) * damp(4, dt);
    if (this.grounded) {
      const before = this.phase;
      this.phase += (hs * dt) / STRIDE;
      if (Math.floor(before) !== Math.floor(this.phase)) {
        this.onStep?.({ dy: this.feet.y - this.lastFootY, surface: "stone", speed: hs });
        this.lastFootY = this.feet.y;
      }
    }
    const bobAmp = 0.022 * clamp(hs / WALK, 0, 1.6) * (1 - 0.6 * clamp(Math.abs(this.climb) / 0.4, 0, 1));
    this.bob += (bobAmp - this.bob) * damp(6, dt);

    // eye spring (critically damped): smooths stair steps and landings
    const targetEye = this.feet.y + EYE;
    const w = this.grounded ? 16 : 40;
    const diff = targetEye - this.eyeY;
    if (Math.abs(diff) > 1.5) {
      this.eyeY = targetEye;
      this.eyeVel = 0;
    } else {
      const acc2 = w * w * diff - 2 * w * this.eyeVel;
      this.eyeVel += acc2 * dt;
      this.eyeY += this.eyeVel * dt;
    }
  }

  private subStep(h: number) {
    const f = this.feet;
    f.x += this.vel.x * h;
    f.z += this.vel.z * h;
    // walls: capsule from STEP above the feet to the head
    for (let it = 0; it < 3; it++) {
      this.seg.start.set(f.x, f.y + STEP + RADIUS, f.z);
      this.seg.end.set(f.x, f.y + HEIGHT - RADIUS, f.z);
      const p = this.col.pushOut(this.seg, RADIUS, this.push);
      if (p.lengthSq() < 1e-8) break;
      f.x += p.x;
      f.z += p.z;
      // lose the velocity into the wall
      const pl = p.length();
      const nx = p.x / pl, nz = p.z / pl;
      const vn = this.vel.x * nx + this.vel.z * nz;
      if (vn < 0) {
        this.vel.x -= vn * nx;
        this.vel.z -= vn * nz;
      }
    }
    // ground
    const snapDown = this.grounded ? STEP : 0.05;
    const g = this.probe(f.x, f.z, f.y + STEP, STEP + snapDown + Math.max(0, -this.vel.y * h) + 0.02);
    if (Number.isFinite(g) && g >= f.y - snapDown - Math.max(0, -this.vel.y * h)) {
      f.y = g;
      this.vel.y = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
      this.vel.y -= GRAVITY * h;
      f.y += this.vel.y * h;
      // landed on something below?
      const g2 = this.probe(f.x, f.z, f.y + 0.6 - this.vel.y * h, 1.2);
      if (Number.isFinite(g2) && g2 >= f.y) {
        f.y = g2;
        this.vel.y = 0;
        this.grounded = true;
      }
    }
  }

  /** Applies the pose to a camera. */
  apply(cam: THREE.PerspectiveCamera) {
    const b = Math.sin(this.phase * Math.PI) ;
    const bobY = (Math.abs(b) - 0.5) * this.bob;
    const sway = Math.cos(this.phase * Math.PI) * this.bob * 0.35;
    cam.position.set(this.feet.x, this.eyeY + bobY, this.feet.z);
    this.tmp.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    cam.position.addScaledVector(this.tmp, sway);
    cam.rotation.set(this.pitch, this.yaw, 0, "YXZ");
    cam.updateMatrixWorld();
  }

  get eye(): number {
    return this.eyeY;
  }
}
