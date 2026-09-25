import * as THREE from "three";
import { MeshBVH } from "three-mesh-bvh";

/**
 * One static bounding volume hierarchy over everything the player can bump into or stand on
 * (steps, floors, galleries, walls, railings, street furniture). The open ground is not in it:
 * it is the analytic terrain, sampled directly.
 */
export class Collider {
  readonly bvh: MeshBVH;
  readonly geometry: THREE.BufferGeometry;
  private ray = new THREE.Ray();
  private box = new THREE.Box3();
  private triPoint = new THREE.Vector3();
  private segPoint = new THREE.Vector3();
  private dir = new THREE.Vector3();

  constructor(geoms: THREE.BufferGeometry[]) {
    let n = 0;
    for (const g of geoms) n += g.index ? g.index.count : g.getAttribute("position").count;
    const pos = new Float32Array(n * 3);
    let o = 0;
    for (const g of geoms) {
      const p = g.getAttribute("position");
      const idx = g.index;
      const count = idx ? idx.count : p.count;
      for (let i = 0; i < count; i++) {
        const k = idx ? idx.getX(i) : i;
        pos[o++] = p.getX(k);
        pos[o++] = p.getY(k);
        pos[o++] = p.getZ(k);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.geometry = geo;
    this.bvh = new MeshBVH(geo, { targetLeafSize: 10 } as ConstructorParameters<typeof MeshBVH>[1]);
  }

  get triangles() {
    return this.geometry.getAttribute("position").count / 3;
  }

  /** Highest surface under (x, z) at or below yTop and above yTop - range; -Infinity if none. */
  floorAt(x: number, z: number, yTop: number, range: number): number {
    this.ray.origin.set(x, yTop, z);
    this.ray.direction.set(0, -1, 0);
    const hit = this.bvh.raycastFirst(this.ray, THREE.DoubleSide, 0, range);
    return hit ? hit.point.y : -Infinity;
  }

  /** Distance to the first surface along a ray (Infinity if none within far). */
  cast(origin: THREE.Vector3, dir: THREE.Vector3, far: number): number {
    this.ray.origin.copy(origin);
    this.ray.direction.copy(dir);
    const hit = this.bvh.raycastFirst(this.ray, THREE.DoubleSide, 0, far);
    return hit ? hit.distance : Infinity;
  }

  /**
   * Pushes a vertical capsule (segment a-b, radius r) horizontally out of the geometry.
   * Floor and ceiling contacts are ignored (the ground probe handles those).
   * Returns the horizontal correction.
   */
  pushOut(seg: THREE.Line3, r: number, out: THREE.Vector3): THREE.Vector3 {
    out.set(0, 0, 0);
    const box = this.box;
    box.makeEmpty();
    box.expandByPoint(seg.start);
    box.expandByPoint(seg.end);
    box.min.addScalar(-r);
    box.max.addScalar(r);
    const tp = this.triPoint, sp = this.segPoint, dir = this.dir;
    this.bvh.shapecast({
      intersectsBounds: (b) => b.intersectsBox(box),
      intersectsTriangle: (tri) => {
        const d = tri.closestPointToSegment(seg, tp, sp);
        if (d >= r) return false;
        dir.subVectors(sp, tp);
        dir.y = 0;
        const h = dir.length();
        if (h < 1e-5) {
          // segment passes through the triangle: push along the triangle's horizontal normal
          tri.getNormal(dir);
          dir.y = 0;
          if (dir.lengthSq() < 0.25) return false;
        } else if (h < d * 0.7) {
          return false; // mostly vertical contact: a floor or a ceiling
        }
        dir.normalize();
        const depth = r - d + 1e-3;
        seg.start.addScaledVector(dir, depth);
        seg.end.addScaledVector(dir, depth);
        out.addScaledVector(dir, depth);
        return false;
      },
    });
    return out;
  }
}
