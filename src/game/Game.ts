import * as THREE from "three";
import type { App } from "../app/App";
import type { World } from "../world/World";
import { Collider } from "../player/collision";
import { Player } from "../player/Player";
import { Input } from "../player/Input";

/** Named places for fast travel and the debug API: position, facing (degrees), optional height. */
export const PLACES = {
  westFront: { x: -132, z: -6, yaw: -88, pitch: 8, label: "West Front" },
  westSteps: { x: -95, z: -12, yaw: -80, pitch: 12, label: "West Steps" },
  northChurchyard: { x: -8, z: -70, yaw: 170, pitch: 14, label: "North Churchyard" },
  southChurchyard: { x: 30, z: 72, yaw: 10, pitch: 14, label: "South Churchyard" },
  eastEnd: { x: 110, z: 18, yaw: 100, pitch: 10, label: "East End" },
  nave: { x: -70, z: 0, y: 2.5, yaw: -90, pitch: 8, label: "The Nave" },
  crossing: { x: -12, z: 8, y: 2.5, yaw: 155, pitch: 10, label: "Under the Dome" },
  whisperingGallery: { x: -2.8, z: 15.86, y: 32.7, yaw: -10, pitch: -10, label: "Whispering Gallery" },
  stoneGallery: { x: -18.4, z: 4, y: 55.1, yaw: 95, pitch: -4, label: "Stone Gallery" },
  goldenGallery: { x: -3.9, z: 0.6, y: 85.1, yaw: 90, pitch: -6, label: "Golden Gallery" },
} as const;
export type PlaceId = keyof typeof PLACES;

/**
 * Glue between the world, the player and the camera: owns the collider, the walker and the
 * input devices, and runs them every frame.
 */
export class Game {
  readonly input: Input;
  readonly player: Player;
  readonly collider: Collider;
  /** When false the camera is left alone (headless captures, photo mode). */
  active = false;
  baseFov = 70;

  constructor(private app: App, readonly world: World) {
    this.collider = new Collider(world.colliders);
    this.player = new Player(world.terrain, this.collider);
    this.input = new Input(app.renderer.domElement, document.getElementById("stick"));
    const terrain = world.terrain;
    this.player.bounds = (p, px, pz) => {
      const r = Math.hypot(p.x, p.z);
      const R = 470;
      if (r > R) {
        p.x *= R / r;
        p.z *= R / r;
      }
      // the river bank: no walking into the Thames
      if (p.y < terrain.bank + 1 && terrain.height(p.x, p.z) < terrain.bank - 0.8) {
        p.x = px;
        p.z = pz;
      }
    };
    this.goTo("westFront");
    app.onFrame((dt) => this.frame(dt));
  }

  goTo(id: PlaceId) {
    const p = PLACES[id];
    this.player.teleport(p.x, p.z, p.yaw, p.pitch, "y" in p ? p.y : undefined);
    this.player.apply(this.app.camera);
  }

  private frame(dt: number) {
    if (!this.active) return;
    this.input.update(dt);
    this.player.update(dt, this.input);
    this.player.apply(this.app.camera);
    const fov = this.baseFov / this.input.zoom;
    const cam = this.app.camera;
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  }

  /** The walk from Ludgate Hill into the cathedral and to the foot of the dome stair. */
  approachRoute(): [number, number, number][] {
    return [
      [-132, 0, -6], [-110, 0, -2], [-99, 0, -1], [-88, 0, -1], [-82, 0, 0], [-77, 0, 0], [-60, 0, 0],
      [-30, 0, 0], [-14, 0, 3], [-11.5, 0, 8.5], [-11.2, 0, 11.2],
    ];
  }

  /**
   * Headless autopilot: walks through the given waypoints at 60 Hz and reports how far it got,
   * where it got stuck, and whether it fell (falls are caught and counted).
   */
  followPath(points: [number, number, number][], maxSeconds = 1200, run = false) {
    const pl = this.player;
    const inp = { move: new THREE.Vector2(0, 1), run, look: new THREE.Vector2() };
    let rescues = 0;
    const prevRescue = pl.onRescue;
    const events: string[] = [];
    pl.onRescue = () => {
      rescues++;
      events.push(`rescue near waypoint ${i} at ${pl.feet.toArray().map((v) => v.toFixed(2)).join(",")}`);
    };
    let i = 0, best = Infinity, sinceBest = 0, t = 0;
    const dt = 1 / 60;
    let stuck: string | null = null;
    let maxOff = 0;
    while (t < maxSeconds) {
      const [tx, ty, tz] = points[i];
      let d = Math.hypot(tx - pl.feet.x, tz - pl.feet.z);
      while (i < points.length - 1) {
        const n = points[i + 1];
        const dn = Math.hypot(n[0] - pl.feet.x, n[2] - pl.feet.z);
        if (d < 0.3 || (dn < d && d < 0.9 && Math.abs(n[1] - pl.feet.y) < 1.2)) {
          i++;
          best = Infinity;
          sinceBest = 0;
          d = dn;
        } else break;
      }
      if (i === points.length - 1 && d < 0.3) break;
      const [ax, , az] = points[i];
      pl.yaw = Math.atan2(-(ax - pl.feet.x), -(az - pl.feet.z));
      inp.move.set(0, 1);
      pl.update(dt, inp);
      t += dt;
      maxOff = Math.max(maxOff, Math.abs(points[i][1] - pl.feet.y));
      void ty;
      if (d < best - 0.05) {
        best = d;
        sinceBest = 0;
      } else if ((sinceBest += dt) > 4) {
        stuck = `stuck before waypoint ${i}/${points.length - 1} (${points[i].map((v) => v.toFixed(2)).join(",")}) at ${pl.feet.toArray().map((v) => v.toFixed(2)).join(",")}`;
        break;
      }
    }
    pl.onRescue = prevRescue;
    pl.apply(this.app.camera);
    return { reached: i, total: points.length - 1, time: +t.toFixed(1), rescues, stuck, events, maxOff: +maxOff.toFixed(2), at: pl.feet.toArray().map((v) => +v.toFixed(2)) };
  }

  /** Headless helper: walks with fixed input for `seconds` (60 Hz), returns the trace. */
  simulate(move: [number, number], seconds: number, run = false): { x: number; y: number; z: number }[] {
    const trace: { x: number; y: number; z: number }[] = [];
    const inp = { move: new THREE.Vector2(...move), run, look: new THREE.Vector2() };
    const n = Math.round(seconds * 60);
    for (let i = 0; i < n; i++) {
      this.player.update(1 / 60, inp);
      if (i % 6 === 0) trace.push({ x: +this.player.feet.x.toFixed(2), y: +this.player.feet.y.toFixed(3), z: +this.player.feet.z.toFixed(2) });
    }
    this.player.apply(this.app.camera);
    return trace;
  }
}
