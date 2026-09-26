import * as THREE from "three";
import { LANDMARKS, bearing } from "../game/geo";
import type { Terrain } from "../world/terrain";
import type { Where } from "../game/where";
import { STEPS } from "../world/dims";

const $ = (id: string) => document.getElementById(id)!;

/**
 * Heads-up display: compass, the name of the place, height above the churchyard, the step
 * counter on the stairs, toasts, prompts and landmark labels over the view from the galleries.
 */
export class Hud {
  private root = $("hud");
  private strip = $("compass-strip");
  private placeName = $("place-name");
  private placeSub = $("place-sub");
  private alt = $("alt-m");
  private stairs = $("stairs");
  private stepN = $("step-n");
  private fill = $("stairs-fill");
  private toastEl = $("toast");
  private promptEl = $("prompt");
  private labelsEl = $("labels");
  private lastPlace = "";
  private stairsShown = 0;
  private labelEls: { el: HTMLElement; pos: THREE.Vector3; rank: number; dist: HTMLElement }[] = [];
  private v = new THREE.Vector3();
  private pxPerDeg = 3.2;
  labelsOn = true;
  private labelFade = 0;

  constructor(terrain: Terrain) {
    // compass strip: three turns so any heading has neighbours on both sides
    const names: Record<number, string> = { 0: "N", 45: "NE", 90: "E", 135: "SE", 180: "S", 225: "SW", 270: "W", 315: "NW" };
    const parts: string[] = [];
    for (let t = -360; t <= 720; t += 15) {
      const d = ((t % 360) + 360) % 360;
      const x = t * this.pxPerDeg;
      if (names[d] !== undefined) parts.push(`<span class="cardinal" style="left:${x}px">${names[d]}</span>`);
      else parts.push(`<span style="left:${x}px">${d}</span>`);
      for (let k = 1; k < 3; k++) parts.push(`<i style="left:${x + k * 5 * this.pxPerDeg}px"></i>`);
    }
    this.strip.innerHTML = parts.join("");
    // landmark labels
    for (const l of LANDMARKS) {
      const el = document.createElement("div");
      el.className = "label";
      el.innerHTML = `<b>${l.name}</b><small>${l.sub}</small><small class="dist"></small>`;
      el.style.opacity = "0";
      this.labelsEl.appendChild(el);
      const y = terrain.height(l.x, l.z) + l.h;
      this.labelEls.push({ el, pos: new THREE.Vector3(l.x, y, l.z), rank: l.rank, dist: el.querySelector(".dist") as HTMLElement });
    }
  }

  show(on: boolean) {
    this.root.classList.toggle("hidden", !on);
  }

  /** Photo mode: everything but the view (and the labels) fades out. */
  photo(on: boolean) {
    this.root.classList.toggle("photo", on);
  }

  toast(title: string, sub: string) {
    this.toastEl.classList.remove("hidden");
    this.toastEl.innerHTML = `<h2>${title}</h2><p>${sub}</p>`;
    // restart the animation
    this.toastEl.style.animation = "none";
    void this.toastEl.offsetWidth;
    this.toastEl.style.animation = "";
  }

  prompt(html: string | null) {
    if (!html) {
      this.promptEl.classList.add("hidden");
      return;
    }
    this.promptEl.innerHTML = html;
    this.promptEl.classList.remove("hidden");
  }

  update(dt: number, cam: THREE.PerspectiveCamera, yaw: number, feetY: number, w: Where) {
    // compass
    const heading = bearing(-Math.sin(yaw), -Math.cos(yaw));
    this.strip.style.transform = `translateX(${(-heading * this.pxPerDeg).toFixed(1)}px)`;
    // place
    const key = w.name + "|" + w.sub;
    if (key !== this.lastPlace) {
      this.lastPlace = key;
      this.placeName.textContent = w.name;
      this.placeSub.textContent = w.sub;
    }
    this.alt.textContent = Math.max(0, feetY).toFixed(1);
    // stairs
    if (w.steps !== null) this.stairsShown = 6;
    else this.stairsShown -= dt;
    const showStairs = this.stairsShown > 0;
    this.stairs.classList.toggle("hidden", !showStairs);
    if (w.steps !== null) {
      this.stepN.textContent = String(w.steps);
      this.fill.style.height = `${((w.steps / STEPS.golden) * 100).toFixed(1)}%`;
    }
    // landmark labels (only high up, where they are useful)
    const want = this.labelsOn && feetY > 40 && !w.inside ? 1 : 0;
    this.labelFade += (want - this.labelFade) * (1 - Math.exp(-4 * dt));
    this.labelsEl.style.display = this.labelFade < 0.01 ? "none" : "";
    if (this.labelFade < 0.01) return;
    const W = innerWidth, H = innerHeight;
    const placed: { x: number; y: number }[] = [];
    const order = this.labelEls.map((l, i) => ({ l, i, d: l.pos.distanceTo(cam.position) })).sort((a, b) => a.l.rank - b.l.rank || a.d - b.d);
    for (const { l, d } of order) {
      this.v.copy(l.pos).project(cam);
      let op = 0;
      let sx = 0, sy = 0;
      if (this.v.z < 1 && Math.abs(this.v.x) < 1.05 && this.v.y > -1 && this.v.y < 1.2) {
        sx = (this.v.x * 0.5 + 0.5) * W;
        sy = (-this.v.y * 0.5 + 0.5) * H;
        const clash = placed.some((p) => Math.abs(p.x - sx) < 150 && Math.abs(p.y - sy) < 44);
        if (!clash && (l.rank === 1 || d < 2500)) {
          op = 1;
          placed.push({ x: sx, y: sy });
        }
      }
      const o = op * this.labelFade;
      l.el.style.opacity = o.toFixed(2);
      if (o > 0) {
        l.el.style.transform = `translate(${sx.toFixed(0)}px, ${sy.toFixed(0)}px) translate(-50%, -100%)`;
        l.dist.textContent = d > 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.round(d / 10) * 10} m`;
      }
    }
  }
}
