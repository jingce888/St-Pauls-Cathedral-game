import * as THREE from "three";

export const FULLSCREEN_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

/** One oversized triangle covering the viewport, rendered with an orthographic camera. */
export class FullscreenPass {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  readonly mesh: THREE.Mesh;

  constructor() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.mesh = new THREE.Mesh(g);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  render(renderer: THREE.WebGLRenderer, material: THREE.Material, target: THREE.WebGLRenderTarget | null) {
    this.mesh.material = material;
    renderer.setRenderTarget(target);
    renderer.render(this.scene, this.camera);
  }
}

export function passMaterial(fragmentShader: string, uniforms: Record<string, THREE.IUniform>, defines: Record<string, string | number> = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: FULLSCREEN_VERT,
    fragmentShader,
    uniforms,
    defines,
    depthTest: false,
    depthWrite: false,
  });
}
