import * as THREE from "three";
import type { App } from "../app/App";
import { Terrain } from "./terrain";
import { loadChurchyard, loadCity, type CityData, type Churchyard } from "./cityData";
import { buildGroundMaps, buildGroundMeshes, makeGroundMaterial } from "./ground";
import { buildCathedral, type CathedralResult } from "./cathedral";
import { planLoop } from "./cathedral/plan";
import { buildCity, type CityResult } from "./city";

const DATA = `${import.meta.env.BASE_URL}data/`;

/**
 * Everything that is built once at load time: data, ground, cathedral, city, churchyard.
 * Collects the collision geometry for the player.
 */
export class World {
  terrain!: Terrain;
  city!: CityData;
  churchyard!: Churchyard;
  cathedral!: CathedralResult;
  cityResult!: CityResult;
  readonly colliders: THREE.BufferGeometry[] = [];

  async load() {
    [this.terrain, this.city, this.churchyard] = await Promise.all([
      Terrain.load(`${DATA}terrain.bin`),
      loadCity(`${DATA}city.bin`),
      loadChurchyard(`${DATA}churchyard.json`),
    ]);
  }

  /** The cathedral's outline on the ground (for contact shadows in the ground map). */
  footprint(): [number, number][] {
    return planLoop().map((f) => [f.a[0], f.a[1]] as [number, number]);
  }

  buildGround(app: App) {
    const scale = app.tier === "low" ? 0.5 : 1;
    const t0 = performance.now();
    const maps = buildGroundMaps(this.city, this.churchyard, [this.footprint()], app.q.anisotropy, scale);
    const t1 = performance.now();
    const mat = makeGroundMaterial(maps);
    for (const m of buildGroundMeshes(this.terrain, mat)) app.scene.add(m);
    if (import.meta.env.DEV) console.debug(`[ground] maps ${(t1 - t0).toFixed(0)} ms, meshes ${(performance.now() - t1).toFixed(0)} ms`);
  }

  buildCity(app: App) {
    const t0 = performance.now();
    this.cityResult = buildCity(this.city, this.terrain, app.mats, {
      radius: app.q.cityRadius,
      nearRadius: Math.min(1500, app.q.cityRadius),
      collideRadius: 520,
    });
    app.scene.add(this.cityResult.group);
    this.colliders.push(this.cityResult.collision);
    if (import.meta.env.DEV) console.debug(`[city] ${JSON.stringify(this.cityResult.stats)} in ${(performance.now() - t0).toFixed(0)} ms`);
  }

  buildCathedral(app: App) {
    this.cathedral = buildCathedral(app);
    app.scene.add(this.cathedral.group);
    this.colliders.push(this.cathedral.collision);
    if (import.meta.env.DEV) console.log("cathedral", JSON.stringify(this.cathedral.report), JSON.stringify(this.cathedral.drawn));
  }
}
