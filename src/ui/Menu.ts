import { atmoUniforms } from "../gfx/Atmosphere";
import { TIER_ORDER, saveTier, type Tier } from "../app/quality";
import type { App } from "../app/App";
import type { Game, PlaceId } from "../game/Game";
import { PLACES } from "../game/Game";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export const TIME_PRESETS: [string, number][] = [
  ["Dawn", 5.2],
  ["Morning", 8.5],
  ["Midday", 13.1],
  ["Afternoon", 16.5],
  ["Golden hour", 20.1],
  ["Dusk", 21.25],
  ["Night", 23.0],
];

const TRAVEL: [PlaceId, string][] = [
  ["westFront", "Ludgate Hill, facing the west front"],
  ["northChurchyard", "The north portico and churchyard"],
  ["southChurchyard", "The south side, towards the Thames"],
  ["nave", "Inside, at the west end of the nave"],
  ["crossing", "Under the dome, at the foot of the dome stair"],
  ["whisperingGallery", "257 steps · 30 m"],
  ["stoneGallery", "376 steps · 53 m"],
  ["goldenGallery", "528 steps · 85 m"],
];

const fmtTime = (h: number) => {
  const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
  return `${String(hh % 24).padStart(2, "0")}:${String(mm % 60).padStart(2, "0")}`;
};

/** The pause menu: travel, light (time, haze, clouds), settings, controls. */
export class Menu {
  private el = $("menu");
  open = false;
  onClose: (() => void) | null = null;
  onLabels: ((on: boolean) => void) | null = null;

  constructor(private app: App, private game: Game) {
    $("resume").addEventListener("click", () => this.close());
    // travel
    const travel = $("travel");
    for (const [id, sub] of TRAVEL) {
      const b = document.createElement("button");
      b.innerHTML = `<b>${PLACES[id].label}</b><span>${sub}</span>`;
      b.addEventListener("click", () => {
        this.game.goTo(id);
        this.close();
      });
      travel.appendChild(b);
    }
    // time of day
    const time = $<HTMLInputElement>("time"), timeOut = $("time-out");
    const setTime = (h: number) => {
      this.app.lighting.setTime(h);
      time.value = String(h);
      timeOut.textContent = fmtTime(h);
    };
    time.addEventListener("input", () => setTime(Number(time.value)));
    setTime(this.app.lighting.hours);
    const presets = $("presets");
    for (const [name, h] of TIME_PRESETS) {
      const b = document.createElement("button");
      b.textContent = name;
      b.addEventListener("click", () => setTime(h));
      presets.appendChild(b);
    }
    // haze and clouds
    const haze = $<HTMLInputElement>("haze"), hazeOut = $("haze-out");
    const setHaze = (v: number) => {
      this.app.lighting.setHaze(v);
      hazeOut.textContent = v < 1.8 ? "Crystal clear" : v < 2.6 ? "Clear" : v < 4 ? "London" : v < 5.8 ? "Hazy" : "Pea-souper";
    };
    haze.addEventListener("input", () => setHaze(Number(haze.value)));
    setHaze(Number(haze.value));
    const clouds = $<HTMLInputElement>("clouds"), cloudOut = $("cloud-out");
    const setClouds = (v: number) => {
      atmoUniforms.uCloudCover.value = v;
      cloudOut.textContent = v < 0.15 ? "None" : v < 0.35 ? "Fair" : v < 0.6 ? "Broken" : v < 0.8 ? "Overcast" : "Grey";
      this.app.lighting.markDirty();
    };
    clouds.value = String(atmoUniforms.uCloudCover.value);
    clouds.addEventListener("input", () => setClouds(Number(clouds.value)));
    setClouds(Number(clouds.value));
    // quality (needs a reload: shadow maps, city radius and textures are chosen at start)
    const q = $("quality"), qOut = $("q-out");
    qOut.textContent = `${this.app.tier}${this.app.tierReason === "saved" || this.app.tierReason === "url" ? "" : " (auto)"}`;
    for (const t of [...TIER_ORDER].reverse() as Tier[]) {
      const b = document.createElement("button");
      b.textContent = t[0].toUpperCase() + t.slice(1);
      if (t === this.app.tier) b.classList.add("on");
      b.addEventListener("click", () => {
        saveTier(t);
        const u = new URL(location.href);
        u.searchParams.set("q", t);
        location.href = u.toString();
      });
      q.appendChild(b);
    }
    // controls
    const sens = $<HTMLInputElement>("sens");
    sens.addEventListener("input", () => (this.game.input.sensitivity = Number(sens.value)));
    const fov = $<HTMLInputElement>("fov"), fovOut = $("fov-out");
    fov.addEventListener("input", () => {
      this.game.baseFov = Number(fov.value);
      fovOut.textContent = `${fov.value}°`;
    });
    const labels = $<HTMLInputElement>("labels-on");
    labels.addEventListener("change", () => this.onLabels?.(labels.checked));
    // close on Escape while open is handled by the game (pointer lock)
  }

  setWhere(name: string) {
    $("menu-where").textContent = name;
  }

  show() {
    this.open = true;
    this.el.classList.remove("hidden");
  }
  close() {
    this.open = false;
    this.el.classList.add("hidden");
    this.onClose?.();
  }
  /** Cycles through the time presets (T key). */
  nextTime() {
    const h = this.app.lighting.hours;
    const next = TIME_PRESETS.find(([, t]) => t > h + 0.05) ?? TIME_PRESETS[0];
    this.app.lighting.setTime(next[1]);
    ($<HTMLInputElement>("time")).value = String(next[1]);
    $("time-out").textContent = fmtTime(next[1]);
    return next[0];
  }
}
