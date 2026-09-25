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
    this.player.bounds = (p) => {
      const r = Math.hypot(p.x, p.z);
      const R = 470;
      if (r > R) {
        p.x *= R / r;
        p.z *= R / r;
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
