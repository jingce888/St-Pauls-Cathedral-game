/**
 * Dev-only preview of the carved reliefs (tools/relief.mjs screenshots it):
 *   /tools/relief.html?p=conversion&light=30
 */
import * as THREE from "three";
import { GeoBuilder } from "../src/geo/Builder";
import type { Relief } from "../src/geo/relief";
import * as S from "../src/world/cathedral/sculpture";

const PANELS: Record<string, () => Relief> = {
  conversion: () => S.conversionOfPaul(10.6, 4.45),
  arms: () => S.royalArms(8.75, 3.75),
  phoenix: () => S.phoenix(8.75, 3.75),
  preaching: () => S.paulPreaching(7.0, 2.4),
  cartouche: () => S.cartouche(4.4, 4.6),
  cherub: () => S.keystoneCherub(),
  drop: () => S.pierDrop(0.55, 3.2),
  fame: () => S.fameSpandrel(4.72, 5.25, 3.97, false),
  fameL: () => S.fameSpandrel(4.72, 5.25, 3.97, true),
  mon0: () => S.monumentRelief(1.9, 3.6, 0),
  mon1: () => S.monumentRelief(1.9, 3.6, 1),
  mon2: () => S.monumentRelief(1.9, 3.6, 2),
  frieze: () => S.friezeBand(3.6, 0.66),
};

const q = new URLSearchParams(location.search);
const name = q.get("p") ?? "conversion";
const relief = PANELS[name]();
const b = new GeoBuilder();
const tris = relief.build(b);
const geo = b.build();
// show the baked cavity as grey
const col = geo.getAttribute("color");
const rgb = new Float32Array(col.count * 3);
for (let i = 0; i < col.count; i++) {
  const c = col.getZ(i);
  rgb[i * 3] = 0.86 * c; rgb[i * 3 + 1] = 0.82 * c; rgb[i * 3 + 2] = 0.74 * c;
}
geo.setAttribute("color", new THREE.BufferAttribute(rgb, 3));
const W = innerWidth, H = innerHeight;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x303030);
const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
mesh.castShadow = mesh.receiveShadow = true;
scene.add(mesh);
const wall = new THREE.Mesh(new THREE.PlaneGeometry(relief.w * 1.1, relief.ht * 1.1), new THREE.MeshStandardMaterial({ color: 0xbfb8a8, roughness: 1 }));
wall.position.set(relief.w / 2, relief.ht / 2, 0);
wall.receiveShadow = true;
scene.add(wall);
const light = Number(q.get("light") ?? 35);
const sun = new THREE.DirectionalLight(0xffffff, 2.6);
sun.position.set(relief.w / 2 - Math.cos((light * Math.PI) / 180) * 20, relief.ht / 2 + 18, 14);
sun.target.position.set(relief.w / 2, relief.ht / 2, 0);
sun.castShadow = true;
const ext = Math.max(relief.w, relief.ht);
Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 80 });
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target, new THREE.HemisphereLight(0xdde6ff, 0x554433, 0.9));
const aspect = W / H;
const fitW = Math.max(relief.w, relief.ht * aspect) * 1.04;
const cam = new THREE.OrthographicCamera(-fitW / 2, fitW / 2, fitW / aspect / 2, -fitW / aspect / 2, 0.1, 100);
const tiltDeg = Number(q.get("tilt") ?? 0);
cam.position.set(relief.w / 2, relief.ht / 2 - Math.sin((tiltDeg * Math.PI) / 180) * 30, Math.cos((tiltDeg * Math.PI) / 180) * 30);
cam.lookAt(relief.w / 2, relief.ht / 2, 0);
renderer.render(scene, cam);
(window as unknown as { done: unknown }).done = { tris, verts: geo.getAttribute("position").count };
