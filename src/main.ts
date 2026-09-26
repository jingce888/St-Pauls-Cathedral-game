import "@fontsource/cormorant-garamond/500.css";
import "@fontsource/cormorant-garamond/600.css";
import "@fontsource/cormorant-garamond/500-italic.css";
import "@fontsource-variable/inter";
import "./ui/style.css";
import { App, type WorldModule } from "./app/App";
import { World } from "./world/World";
import { Game, type PlaceId } from "./game/Game";
import * as THREE from "three";
import { Hud } from "./ui/Hud";
import { Menu } from "./ui/Menu";
import { where, type Gallery } from "./game/where";
import { poiAt, type Poi } from "./game/poi";

const app = new App(document.getElementById("app")!);
const world = new World();
let game: Game | null = null;

const modules: WorldModule[] = [
  { name: "data", label: "Surveying the City", weight: 2, build: () => world.load() },
  { name: "ground", label: "Paving the churchyard", weight: 2, build: (a) => world.buildGround(a) },
  { name: "cathedral", label: "Raising Wren's walls", weight: 6, build: (a) => world.buildCathedral(a) },
  { name: "city", label: "Rebuilding the City", weight: 4, build: (a) => world.buildCity(a) },
  { name: "player", label: "Opening the doors", weight: 1, build: (a) => { game = new Game(a, world); } },
];

const statusEl = document.getElementById("status")!;
const barEl = document.getElementById("progress-bar")!;
const startBtn = document.getElementById("start") as HTMLButtonElement;

declare global {
  interface Window {
    __stpauls: Record<string, unknown>;
  }
}

const cam = app.camera;
let yaw = 0, pitch = 0;
function setPose(x: number, y: number, z: number, yawDeg: number, pitchDeg: number) {
  yaw = (yawDeg * Math.PI) / 180;
  pitch = (pitchDeg * Math.PI) / 180;
  cam.position.set(x, y, z);
  cam.rotation.set(pitch, yaw, 0, "YXZ");
  cam.updateMatrixWorld();
}

window.__stpauls = {
  ready: false,
  lookAt: (x: number, y: number, z: number, tx: number, ty: number, tz: number) => {
    const dx = tx - x, dy = ty - y, dz = tz - z;
    const h = Math.hypot(dx, dz);
    setPose(x, y, z, (Math.atan2(-dx, -dz) * 180) / Math.PI, (Math.atan2(dy, h) * 180) / Math.PI);
  },
  app,
  world,
  setPose,
  setTime: (h: number) => app.lighting.setTime(h),
  stats: () => app.stats(),
  render: () => app.tick(1 / 60),
  goTo: (id: PlaceId) => game?.goTo(id),
  adapt: (k: number) => { app.adapt = app.adaptTarget = k; },
  simulate: (mx: number, my: number, seconds: number, run = false) => game?.simulate([mx, my], seconds, run),
  player: () => game?.player,
  game: () => game,
  /** Walks the whole climb: approach, 528 steps up, and (if `down`) all the way back down. */
  climb: (down = true) => {
    if (!game) return null;
    const stairs = world.cathedral.stairs.route.map((p) => [p[0], p[1], p[2]] as [number, number, number]);
    const approach = game.approachRoute().map(([x, , z]) => [x, world.terrain.height(x, z), z] as [number, number, number]);
    game.goTo("westFront");
    const up = game.followPath([...approach, ...stairs]);
    const res: Record<string, unknown> = { up };
    if (down && up.reached === up.total && !up.stuck) res.down = game.followPath(stairs.slice().reverse());
    return res;
  },
  /** Walks in through every door of the cathedral; each path starts outside and ends inside. */
  doors: () => {
    if (!game) return null;
    const T = world.terrain;
    const g = (x: number, z: number, y?: number) => [x, y ?? T.height(x, z), z] as [number, number, number];
    const paths: Record<string, [number, number, number][]> = {
      greatWestDoor: [g(-120, 0), g(-99, 0), g(-88, 0), g(-81, 0, 2.5), g(-76, 0, 2.5), g(-70, 0, 2.5)],
      westSideNorth: [g(-120, -6.3), g(-99, -6.3), g(-87, -6.3, 2.5), g(-84.1, -6.3, 2.5), g(-84.1, -9.9, 2.5), g(-82, -9.9, 2.5), g(-76, -9.9, 2.5), g(-72, -12, 2.5)],
      westSideSouth: [g(-120, 6.3), g(-99, 6.3), g(-87, 6.3, 2.5), g(-84.1, 6.3, 2.5), g(-84.1, 9.9, 2.5), g(-82, 9.9, 2.5), g(-76, 9.9, 2.5), g(-72, 12, 2.5)],
      northTransept: [g(0, -62), g(0, -50), g(0, -44, 2.5), g(0, -38, 2.5), g(0, -34, 2.5), g(0, -28, 2.5)],
      quire: [g(-8, 0, 2.5), g(10, 0, 2.5), g(24, 0, 2.5), g(40, 0, 2.5), g(54.5, 0, 2.5), g(56.6, 3.5, 3.01), g(60.5, 4.2, 3.01), g(62.5, 0, 3.01)],
      southTransept: [g(14.2, 50), g(14.2, 45), g(14.2, 38.8, 1.3), g(13.2, 37.7, 1.3), g(11.2, 37.9, 1.3), g(10.4, 39.5, 1.3), g(8.6, 43.6, 1.3), g(3.5, 45.2, 1.3), g(0, 44.6, 1.8), g(0, 42.4, 2.5), g(0, 38, 2.5), g(0, 34, 2.5), g(0, 28, 2.5)],
    };
    // a lap of each gallery
    const lap = (r: number, y: number, a0 = 0) => Array.from({ length: 73 }, (_, i) => [r * Math.cos(a0 + (i / 72) * Math.PI * 2), y, r * Math.sin(a0 + (i / 72) * Math.PI * 2)] as [number, number, number]);
    paths.whisperingLap = lap(16.0, 32.7, 1.2);
    paths.stoneLap = lap(18.3, 55.1, 0.4);
    paths.goldenLap = lap(4.02, 85.1, 0.3);
    const out: Record<string, unknown> = {};
    for (const [name, pts] of Object.entries(paths)) {
      const [x, y0, z] = pts[0];
      game.player.teleport(x, z, 0, 0, name.endsWith("Lap") || name === "quire" ? y0 : undefined);
      const r = game.followPath(pts, 120);
      out[name] = { ok: r.reached === r.total && !r.stuck && r.rescues === 0 && Math.abs(r.at[1] - pts[pts.length - 1][1]) < 0.05, ...r };
    }
    return out;
  },
  /** Walks a list of waypoints from the current position. */
  follow: (pts: [number, number, number][]) => game?.followPath(pts),
};

app
  .boot(modules, (f, label) => {
    barEl.style.width = `${(f * 100).toFixed(1)}%`;
    statusEl.textContent = label;
  })
  .then(() => {
    statusEl.textContent = "Ready";
    startBtn.disabled = false;
    setPose(-40, 1.7, 30, -50, 8);
    window.__stpauls.ready = true;
    if (new URLSearchParams(location.search).has("shoot")) {
      // headless capture renders on demand (tools/shoot.mjs calls render())
      document.getElementById("intro")!.classList.add("gone");
    }
  })
  .catch((e) => {
    console.error(e);
    window.__stpauls.error = String(e?.stack ?? e);
    statusEl.textContent = "Something went wrong: " + (e?.message ?? e);
  });

let ui: ReturnType<typeof startUi> | null = null;

/** HUD, pause menu, information cards and keys, once the world is built. */
function startUi(g: Game) {
  const hud = new Hud(world.terrain);
  const menu = new Menu(app, g);
  const card = document.getElementById("card")!;
  const labelsBox = document.getElementById("labels-on") as HTMLInputElement;
  let photo = false;
  let lastGallery: Gallery | null = null;
  let current: Poi | null = null;
  let shown: Poi | null = null;
  let whereName = "";
  const dir = new THREE.Vector3();

  const showCard = (p: Poi | null) => {
    shown = p;
    card.classList.toggle("hidden", !p);
    if (p) card.innerHTML = `<h3>${p.title}</h3><div class="meta">${p.cn} · ${p.meta}</div><p>${p.en}</p><p lang="zh">${p.zh}</p>`;
  };
  const openMenu = () => {
    if (menu.open) return;
    g.input.clear();
    g.active = false;
    menu.setWhere(whereName);
    menu.show();
    hud.show(false);
    g.input.unlock();
  };
  menu.onClose = () => {
    g.active = true;
    hud.show(true);
    g.input.lock();
  };
  menu.onLabels = (on) => (hud.labelsOn = on);
  g.input.onUnlock = () => {
    if (!menu.open && g.active) openMenu();
  };
  const act = () => showCard(shown ? null : current);
  g.input.onKey = (code) => {
    if (menu.open) {
      if (code === "Escape") menu.close();
      return;
    }
    if (!g.active) return;
    switch (code) {
      case "KeyE": act(); break;
      case "KeyT": hud.toast(menu.nextTime(), "Time of day · 时间"); break;
      case "KeyL":
        hud.labelsOn = !hud.labelsOn;
        labelsBox.checked = hud.labelsOn;
        hud.toast(hud.labelsOn ? "Labels on" : "Labels off", "Landmarks from the galleries · 地标标签");
        break;
      case "KeyP":
        photo = !photo;
        hud.photo(photo);
        break;
      case "Tab":
      case "KeyM":
        openMenu();
        break;
    }
  };
  // touch buttons
  const touchUi = document.getElementById("touch")!;
  addEventListener("touchstart", () => touchUi.classList.remove("hidden"), { once: true });
  document.getElementById("t-menu")!.addEventListener("click", openMenu);
  document.getElementById("t-act")!.addEventListener("click", act);
  const run = document.getElementById("t-run")!;
  run.addEventListener("click", () => {
    g.input.holdRun = !g.input.holdRun;
    run.classList.toggle("on", g.input.holdRun);
  });

  app.onFrame((dt) => {
    if (!g.active) return;
    const p = g.player;
    const w = where(p.feet.x, p.feet.y, p.feet.z, world.cathedral.stairs);
    whereName = w.name;
    hud.update(dt, app.camera, p.yaw, p.feet.y, w);
    app.adaptTarget = w.adapt;
    if (w.gallery && w.gallery !== lastGallery) hud.toast(w.name, w.sub);
    lastGallery = w.gallery;
    app.camera.getWorldDirection(dir);
    current = poiAt(p.feet, app.camera.position, dir);
    if (shown && shown !== current) showCard(null);
    hud.prompt(current && !shown ? `<kbd>E</kbd> ${current.title} <small>${current.cn}</small>` : null);
  });
  return { hud, menu, openMenu };
}

startBtn.addEventListener("click", () => {
  document.getElementById("intro")!.classList.add("gone");
  if (game) {
    ui ??= startUi(game);
    game.goTo("westFront");
    game.active = true;
    ui.hud.show(true);
    ui.hud.toast("St Paul's Cathedral", "Ludgate Hill · 圣保罗大教堂");
    game.input.lock();
  }
  app.start();
});
