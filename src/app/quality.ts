/**
 * Quality tiers: one place that decides how much work a device gets. The tier is chosen from
 * the GPU's capabilities (and whether the device is touch-first) and can be forced with
 * ?q=ultra|high|medium|low; the choice is remembered. A dynamic-resolution stepper then keeps
 * the frame rate near the target without changing the tier.
 */

export type Tier = "ultra" | "high" | "medium" | "low";
export const TIER_ORDER: Tier[] = ["low", "medium", "high", "ultra"];

export interface TierSettings {
  dprCap: number;
  renderScale: number;
  samples: number;
  bloom: boolean;
  nearMap: number;
  farMap: number;
  farShadows: boolean;
  /** Radius (m) of the OpenStreetMap city that is built. */
  cityRadius: number;
  /** Distance (m) within which balusters and capitals use their detailed meshes. */
  detailDistance: number;
  anisotropy: number;
}

export const TIERS: Record<Tier, TierSettings> = {
  ultra: { dprCap: 2, renderScale: 1, samples: 4, bloom: true, nearMap: 8192, farMap: 4096, farShadows: true, cityRadius: 3000, detailDistance: 110, anisotropy: 8 },
  high: { dprCap: 1.5, renderScale: 1, samples: 4, bloom: true, nearMap: 4096, farMap: 4096, farShadows: true, cityRadius: 3000, detailDistance: 80, anisotropy: 8 },
  medium: { dprCap: 1.25, renderScale: 0.85, samples: 2, bloom: true, nearMap: 4096, farMap: 2048, farShadows: true, cityRadius: 2200, detailDistance: 55, anisotropy: 4 },
  low: { dprCap: 1, renderScale: 0.7, samples: 0, bloom: false, nearMap: 2048, farMap: 1024, farShadows: false, cityRadius: 1500, detailDistance: 35, anisotropy: 2 },
};

const KEY = "stpauls.quality";

export function chooseTier(gl: WebGL2RenderingContext | null): { tier: Tier; auto: boolean; reason: string } {
  const params = new URLSearchParams(location.search);
  const q = params.get("q");
  if (q && q !== "auto" && q in TIERS) {
    try { localStorage.setItem(KEY, q); } catch { /* private mode */ }
    return { tier: q as Tier, auto: false, reason: "url" };
  }
  if (q === "auto") {
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  } else {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved && saved in TIERS) return { tier: saved as Tier, auto: false, reason: "saved" };
    } catch { /* ignore */ }
  }
  if (!gl) return { tier: "low", auto: true, reason: "no webgl2" };
  const coarse = matchMedia("(pointer: coarse)").matches;
  const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
  let renderer = "";
  const dbg = gl.getExtension("WEBGL_debug_renderer_info");
  if (dbg) renderer = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL));
  const r = renderer.toLowerCase();
  if (/swiftshader|llvmpipe|software/.test(r)) return { tier: "low", auto: true, reason: "software renderer" };
  if (coarse) return { tier: maxTex >= 8192 ? "medium" : "low", auto: true, reason: "touch device" };
  if (/rtx|radeon rx|rx [5-9]\d{3}|apple m[2-9]|apple m1 (pro|max|ultra)|arc a7/.test(r) && maxTex >= 16384) return { tier: "ultra", auto: true, reason: renderer };
  if (/intel|uhd|iris|mali|adreno|powervr/.test(r)) return { tier: "medium", auto: true, reason: renderer };
  return { tier: "high", auto: true, reason: renderer || "unknown gpu" };
}

export function saveTier(t: Tier) {
  try { localStorage.setItem(KEY, t); } catch { /* ignore */ }
}

/** Keeps frame time near the target by scaling the render resolution. */
export class DynamicResolution {
  scale: number;
  private acc = 0;
  private n = 0;
  private cooldown = 2;
  enabled = true;
  constructor(public min: number, public max: number, start: number, public targetMs = 1000 / 58) {
    this.scale = start;
  }
  /** Returns true when the scale changed. */
  tick(frameMs: number, dt: number): boolean {
    if (!this.enabled) return false;
    this.cooldown -= dt;
    this.acc += Math.min(frameMs, 100);
    this.n++;
    if (this.cooldown > 0 || this.n < 30) return false;
    const avg = this.acc / this.n;
    this.acc = 0;
    this.n = 0;
    let next = this.scale;
    if (avg > this.targetMs * 1.18) next = Math.max(this.min, this.scale - 0.1);
    else if (avg < this.targetMs * 0.72) next = Math.min(this.max, this.scale + 0.05);
    if (Math.abs(next - this.scale) < 1e-3) return false;
    this.scale = next;
    this.cooldown = 1.5;
    return true;
  }
}
