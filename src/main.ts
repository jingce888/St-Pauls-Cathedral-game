import "@fontsource/cormorant-garamond/500.css";
import "@fontsource/cormorant-garamond/600.css";
import "@fontsource/cormorant-garamond/500-italic.css";
import "@fontsource-variable/inter";
import "./ui/style.css";
import { App, type WorldModule } from "./app/App";
import { World } from "./world/World";
import { Game, type PlaceId } from "./game/Game";

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

startBtn.addEventListener("click", () => {
  document.getElementById("intro")!.classList.add("gone");
  if (game) {
    game.goTo("westFront");
    game.active = true;
    game.input.lock();
  }
  app.start();
});
