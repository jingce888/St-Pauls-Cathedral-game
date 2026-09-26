#!/usr/bin/env node
/**
 * Headless capture (pattern from parapet's tools/shoot.mjs): starts Vite, opens the game with
 * ?shoot, teleports to named poses through window.__stpauls.setPose and writes
 * shots/<tag>-<pose>.png. Page errors fail the run.
 *
 *   node tools/shoot.mjs --tag=a1                       # all poses
 *   node tools/shoot.mjs --tag=a1 --poses=west,golden
 *   node tools/shoot.mjs --url=http://localhost:5173/   # use a running server
 *   CHROME=/path/to/chrome node tools/shoot.mjs
 */
import { chromium } from "playwright-core";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const arg = (n, d) => {
  const hit = argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : d;
};
const TAG = arg("tag", "shot");
const ONLY = arg("poses", "").split(",").filter(Boolean);
const W = Number(arg("w", 1280));
const H = Number(arg("h", 720));
const Q = arg("q", "high");
const TIME = arg("time", "");
const FRAMES = Number(arg("frames", 2));
const EXTRA = arg("extra", "");

/** Camera position p and look-at target t (world metres; x east along the nave, z south, y up). */
export const POSES = {
  test: { p: [-40, 1.7, 30], t: [0, 8, 0] },
  top: { p: [0, 420, 0.01], t: [0, 0, 0] },
  west: { p: [-178, 1.6, 0], t: [0, 42, 0] },
  westClose: { p: [-118, 1.6, 10], t: [-84, 20, 0] },
  westSteps: { p: [-100, 1.0, -6], t: [-86, 10, 0] },
  sw: { p: [-150, 1.6, 95], t: [-20, 35, 0] },
  south: { p: [5, 1.6, 95], t: [0, 40, 0] },
  southPortico: { p: [8, 1.2, 62], t: [0, 12, 38] },
  north: { p: [-10, 2.2, -78], t: [0, 30, 0] },
  ne: { p: [105, 2, -85], t: [20, 35, 0] },
  east: { p: [125, 2, 5], t: [0, 30, 0] },
  aerial: { p: [-260, 140, 200], t: [-10, 30, 0] },
  aerialN: { p: [120, 160, -240], t: [0, 40, 0] },
  domeClose: { p: [-38, 58, 20], t: [0, 70, 0] },
  stone: { p: [-19.3, 57, 1.5], t: [-200, 20, 20] },
  golden: { p: [-3.8, 86.9, 0.5], t: [-800, 10, 0] },
  goldenEast: { p: [3.8, 86.9, 0.5], t: [800, 10, 30] },
  goldenSouth: { p: [0.3, 86.9, 3.8], t: [60, 10, 800] },
  whisper: { p: [-11.5, 34.4, 11.0], t: [10, 26, -5], adapt: 5 },
  whisperUp: { p: [-11.5, 34.4, 11.0], t: [2, 60, -2], adapt: 5 },
  nave: { p: [-72, 4.2, 0], t: [30, 12, 0], adapt: 5 },
  naveUp: { p: [-50, 4.2, 0], t: [-40, 30, 0], adapt: 5 },
  crossing: { p: [-3, 4.2, 9], t: [0, 60, 0], adapt: 5 },
  crossingWide: { p: [-30, 4.2, -2], t: [10, 20, 5], adapt: 5 },
  stair1: { p: [-15.5 + 1.1, 12.0, 15.5 + 0.2], t: [-16, 14.5, 17], adapt: 10 },
  drumStair: { p: [18.8 * Math.cos(0.7), 38.0, 18.8 * Math.sin(0.7)], t: [18.8 * Math.cos(0.5), 39.5, 18.8 * Math.sin(0.5)], adapt: 10 },
  voidStair: { p: [14.2, 56.8, 1.5], t: [0, 66, 12], adapt: 10 },
  lanternRoom: { p: [0.4, 86.7, -1.2], t: [0, 86.5, 6], adapt: 4 },
  goldenDoor: { p: [0, 86.7, 5.5], t: [0, 86.2, 0], adapt: 1 },
  sideDoor: { p: [-81.5, 4.1, 9.9], t: [-68, 4, 12], adapt: 4 },
  southDoorOut: { p: [0, 3.6, 48], t: [0, 5.5, 37], adapt: 1 },
  southDoorIn: { p: [0, 4.1, 26], t: [0, 4.4, 40], adapt: 3 },
  westDoorIn: { p: [-68, 4.1, 0], t: [-90, 4.8, 0], adapt: 3 },
  // along the route (indices into world.cathedral.stairs.route, counted from the end if negative)
  stair1Top: { route: [228, 238], adapt: 10 },
  catwalk: { route: [-33, -27], adapt: 8 },
  spiralTop: { route: [-18, -14], adapt: 5 },
  lanternExit: { route: [-9, -2], adapt: 3 },
};

async function startVite() {
  const { createServer } = await import("vite");
  const server = await createServer({ root: ROOT, logLevel: "error", server: { port: 5199, strictPort: false } });
  await server.listen();
  const addr = server.httpServer.address();
  return { server, url: `http://localhost:${addr.port}/` };
}

const chromePath = process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
let vite = null;
let base = arg("url", "");
if (!base) {
  vite = await startVite();
  base = vite.url;
}
const poses = ONLY.length ? ONLY : Object.keys(POSES);
await fs.mkdir(path.join(ROOT, "shots"), { recursive: true });
const browser = await chromium.launch({
  executablePath: chromePath,
  headless: true,
  args: ["--use-angle=swiftshader", "--use-gl=angle", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl", "--hide-scrollbars", "--mute-audio"],
});
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    const t = m.text();
    if (m.type() === "error" || (m.type() === "warning" && !/GPU stall|ReadPixels|swiftshader|Automatic fallback/i.test(t))) errors.push(`${m.type()}: ${t}`);
    if (m.type() === "log" || m.type() === "debug") console.log(`  [page] ${t}`);
  });
  const url = `${base}?shoot&q=${Q}${EXTRA ? "&" + EXTRA : ""}`;
  const t0 = Date.now();
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => window.__stpauls?.ready === true || window.__stpauls?.error, null, { timeout: 600_000 });
  const err = await page.evaluate(() => window.__stpauls.error);
  if (err) throw new Error("boot failed: " + err);
  console.log(`[boot] ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  if (TIME) await page.evaluate((h) => window.__stpauls.setTime(Number(h)), TIME);
  const st = await page.evaluate(() => window.__stpauls.stats());
  console.log(`[gpu] ${st.renderer}  tier=${st.tier} reversedDepth=${st.reversedDepth}`);
  for (const name of poses) {
    const p = POSES[name];
    if (!p) { console.warn(`unknown pose ${name}`); continue; }
    const t1 = Date.now();
    if (p.route) {
      await page.evaluate(([i, j]) => {
        const r = window.__stpauls.world.cathedral.stairs.route;
        const a = r[i < 0 ? r.length + i : i], b = r[j < 0 ? r.length + j : j];
        window.__stpauls.lookAt(a[0], a[1] + 1.63, a[2], b[0], b[1] + 1.5, b[2]);
      }, p.route);
    } else await page.evaluate((p) => window.__stpauls.lookAt(...p.p, ...p.t), p);
    await page.evaluate((k) => window.__stpauls.adapt(k), p.adapt ?? 1);
    for (let i = 0; i < FRAMES; i++) await page.evaluate(() => window.__stpauls.render());
    const file = path.join(ROOT, "shots", `${TAG}-${name}.png`);
    await page.screenshot({ path: file });
    const s = await page.evaluate(() => window.__stpauls.stats());
    console.log(`${name.padEnd(12)} ${path.relative(ROOT, file)}  calls=${s.calls} tris=${s.triangles} ${((Date.now() - t1) / 1000).toFixed(1)}s`);
  }
} finally {
  await browser.close();
  await vite?.server.close();
}
if (errors.length) {
  console.error("\nPage errors/warnings:");
  for (const e of errors.slice(0, 40)) console.error("  " + e.slice(0, 600));
  process.exit(1);
}
