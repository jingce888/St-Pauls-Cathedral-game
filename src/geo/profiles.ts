import type { V2 } from "../core/math";
import type { Profile } from "./Builder";

/**
 * Builds classical moulding profiles as (d, y) polylines: d is the outward projection from the
 * wall (or the radius for lathed elements), y the height, listed bottom to top. Curved
 * mouldings are sampled and shaded smoothly; the joins between mouldings are creased.
 */
export class P {
  pts: V2[] = [];
  smooth: boolean[] = [];
  d: number;
  y: number;
  constructor(d = 0, y = 0) {
    this.d = d;
    this.y = y;
    this.pts.push([d, y]);
    this.smooth.push(false);
  }
  private add(d: number, y: number, smooth = false) {
    this.d = d;
    this.y = y;
    this.pts.push([d, y]);
    this.smooth.push(smooth);
    return this;
  }
  private curve(fn: (t: number) => V2, n: number) {
    for (let i = 1; i <= n; i++) {
      const [dd, yy] = fn(i / n);
      this.add(dd, yy, i < n);
    }
    return this;
  }
  /** Vertical face. */
  up(h: number) { return this.add(this.d, this.y + h); }
  /** Horizontal step (positive = outward, faces down; negative = inward, faces up). */
  out(w: number) { return this.add(this.d + w, this.y); }
  /** Move to an absolute point with a straight segment. */
  to(d: number, y: number) { return this.add(d, y); }
  /** Chamfer/slope. */
  slope(w: number, h: number) { return this.add(this.d + w, this.y + h); }
  /** Convex quarter round (ovolo / echinus) going outward and up. */
  ovolo(w: number, h: number, n = 5) {
    const d0 = this.d, y0 = this.y;
    return this.curve((t) => {
      const a = (t * Math.PI) / 2;
      return [d0 + w * Math.sin(a), y0 + h * (1 - Math.cos(a))];
    }, n);
  }
  /** Convex quarter round going inward and up (e.g. the top of a torus). */
  roundIn(w: number, h: number, n = 5) {
    const d0 = this.d, y0 = this.y;
    return this.curve((t) => {
      const a = (t * Math.PI) / 2;
      return [d0 - w * (1 - Math.cos(a)), y0 + h * Math.sin(a)];
    }, n);
  }
  /** Concave quarter (cavetto) going outward and up. */
  cavetto(w: number, h: number, n = 5) {
    const d0 = this.d, y0 = this.y;
    return this.curve((t) => {
      const a = (t * Math.PI) / 2;
      return [d0 + w * (1 - Math.cos(a)), y0 + h * Math.sin(a)];
    }, n);
  }
  /** Concave quarter going inward and up (apophyge, top of a scotia). */
  cavettoIn(w: number, h: number, n = 5) {
    const d0 = this.d, y0 = this.y;
    return this.curve((t) => {
      const a = (t * Math.PI) / 2;
      return [d0 - w * Math.sin(a), y0 + h * (1 - Math.cos(a))];
    }, n);
  }
  /** Cyma recta (concave below, convex above), outward and up — the crowning moulding. */
  cymaRecta(w: number, h: number, n = 8) {
    const d0 = this.d, y0 = this.y;
    return this.curve((t) => [d0 + w * (0.5 - 0.5 * Math.cos(t * Math.PI)), y0 + h * t], n);
  }
  /** Cyma reversa (convex below, concave above), outward and up — bed mouldings. */
  cymaReversa(w: number, h: number, n = 8) {
    const d0 = this.d, y0 = this.y;
    return this.curve((t) => [d0 + w * Math.sin((t * Math.PI) / 2) ** 0.8 * (0.5 + 0.5 * t), y0 + h * t], n);
  }
  /** Half-round torus of radius r bulging outward. */
  torus(r: number, n = 7) {
    const d0 = this.d, y0 = this.y;
    return this.curve((t) => {
      const a = t * Math.PI;
      return [d0 + r * Math.sin(a), y0 + r * (1 - Math.cos(a))];
    }, n);
  }
  /** Scotia: a concave hollow of depth w over height h (returns to the same d). */
  scotia(w: number, h: number, n = 7) {
    const d0 = this.d, y0 = this.y;
    return this.curve((t) => [d0 - w * Math.sin(t * Math.PI), y0 + h * t], n);
  }
  build(): Profile {
    return { pts: this.pts, smooth: this.smooth };
  }
  /** Profile mirrored to go top to bottom (for soffits etc.) is not needed; scale utility: */
  static scale(p: Profile, sd: number, sy: number, dd = 0, dy = 0): Profile {
    return { pts: p.pts.map(([d, y]) => [d * sd + dd, y * sy + dy] as V2), smooth: p.smooth };
  }
}

/** Attic base for a column of diameter D, as a lathe profile (r, y) starting at y0. Height ~0.5 D. */
export function atticBaseLathe(D: number, y0: number, withPlinth = false): Profile {
  const r = D / 2;
  const u = D / 60; // one "minute"
  const p = new P(withPlinth ? r * 1.4 : r * 1.25, y0);
  if (withPlinth) p.up(10 * u).to(r * 1.25, p.y);
  p.torus(4.5 * u, 7).to(r * 1.16, p.y).up(0.8 * u).scotia(3.2 * u, 5 * u).up(0.8 * u).to(r * 1.12, p.y).torus(3.2 * u, 6);
  p.to(r * 1.05, p.y).up(u).cavettoIn(r * 0.05, 3 * u);
  return p.build();
}

/** The same base as a sweep profile (d, y) for a pilaster: d measured from the pilaster face. */
export function atticBaseSweep(W: number, y0: number): Profile {
  const u = W / 60;
  const p = new P(12 * u, y0);
  p.up(8 * u).to(9 * u, p.y).torus(4.5 * u, 6).to(7 * u, p.y).up(0.8 * u).scotia(3 * u, 5 * u).up(0.8 * u).to(5.5 * u, p.y).torus(3 * u, 5);
  p.to(2 * u, p.y).up(u).cavettoIn(2 * u, 3 * u).to(0, p.y);
  return p.build();
}

/**
 * Corinthian / Composite entablature, total height H, as a sweep profile starting at y0 on the
 * wall face. Proportions after Palladio: architrave 0.3 H, frieze 0.3 H, cornice 0.4 H with a
 * projection of ~0.45 H.
 */
export function entablature(H: number, y0: number, proj = 0.42 * H, opts: { frieze?: number } = {}): Profile {
  const a = 0.29 * H, f = (opts.frieze ?? 0.29) * H, c = H - a - f;
  const p = new P(0.02 * H, y0);
  // architrave: three fasciae and a crowning cyma reversa
  p.up(a * 0.26).out(0.012 * H).up(a * 0.3).out(0.014 * H).up(a * 0.26).cymaReversa(0.05 * H, a * 0.14).up(a * 0.04);
  // frieze
  p.to(0.02 * H, p.y).up(f);
  // cornice: bed mouldings, dentil band, ovolo, modillion band, soffit, corona, cyma recta
  p.cymaReversa(0.05 * H, c * 0.1).up(c * 0.02).out(0.02 * H).up(c * 0.14).out(0.02 * H).ovolo(0.06 * H, c * 0.1).up(c * 0.03);
  p.up(c * 0.14); // modillion band (brackets instanced separately)
  p.out(proj - p.d); // soffit
  p.up(c * 0.2); // corona
  p.cymaReversa(0.03 * H, c * 0.05).up(c * 0.02).cymaRecta(0.1 * H, c * 0.17).up(c * 0.03);
  p.to(0, p.y);
  return p.build();
}

/** A simple cornice / string course of height h projecting w. */
export function cornice(h: number, w: number, y0: number): Profile {
  const p = new P(0, y0);
  p.cymaReversa(w * 0.25, h * 0.2).up(h * 0.05).out(w * 0.25).up(h * 0.35).cymaRecta(w * 0.45, h * 0.3).up(h * 0.1).to(0, p.y);
  return p.build();
}

/** Plinth / base moulding at the foot of a wall. */
export function plinth(h: number, w: number, y0: number): Profile {
  const p = new P(w, y0);
  p.up(h * 0.55).cymaReversa(-w * 0.55, h * 0.3).up(h * 0.05).to(0, p.y + h * 0.1);
  return p.build();
}

/** Pedestal (dado) base and cap for the upper order band and balustrades. */
export function pedestalCap(h: number, w: number, y0: number): Profile {
  const p = new P(0, y0);
  p.ovolo(w * 0.4, h * 0.35).up(h * 0.1).out(w * 0.25).up(h * 0.35).cymaRecta(w * 0.2, h * 0.15).up(h * 0.05).to(0, p.y);
  return p.build();
}
export function pedestalBase(h: number, w: number, y0: number): Profile {
  const p = new P(w, y0);
  p.up(h * 0.35).cymaReversa(-w * 0.5, h * 0.35).up(h * 0.1).cavettoIn(w * 0.4, h * 0.2).to(0, p.y);
  return p.build();
}

/** Architrave (window surround) profile of width w and projection t, swept around an opening. */
export function architraveSurround(w: number, t: number): Profile {
  // here d = outward projection from the wall, y = distance from the opening edge outwards
  const p = new P(0, 0);
  p.up(0.02).out(t * 0.5).up(w * 0.3).out(t * 0.2).up(w * 0.35).cymaReversa(t * 0.3, w * 0.25).up(w * 0.05).to(0, p.y);
  return p.build();
}
