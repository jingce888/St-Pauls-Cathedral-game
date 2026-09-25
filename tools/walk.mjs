#!/usr/bin/env node
/**
 * Headless walking test: loads the game, teleports the player to a place and walks with fixed
 * input, printing the trace (checks stairs, collisions, falling) and optionally a screenshot.
 *
 *   node tools/walk.mjs --place=westFront --move=0,1 --secs=20 [--run] [--shot=name]
 */
import { chromium } from "playwright-core";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const arg = (n, d) => {
  const hit = argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : d;
};
const { createServer } = await import("vite");
const server = await createServer({ root: ROOT, logLevel: "error", server: { port: 5198, strictPort: false } });
await server.listen();
const url = `http://localhost:${server.httpServer.address().port}/?shoot&q=${arg("q", "low")}`;
const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  headless: true,
  args: ["--use-angle=swiftshader", "--use-gl=angle", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on("pageerror", (e) => console.log("[pageerror]", e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.__stpauls?.ready || window.__stpauls?.error, null, { timeout: 300000 });
  const err = await page.evaluate(() => window.__stpauls.error);
  if (err) throw new Error(err);
  const steps = arg("script", "").split(";").filter(Boolean);
  const place = arg("place", "westFront");
  await page.evaluate((p) => window.__stpauls.goTo(p), place);
  const plan = steps.length ? steps : [`${arg("move", "0,1")},${arg("secs", "10")},${argv.includes("--run") ? 1 : 0}`];
  for (const st of plan) {
    const [mx, my, secs, run, yaw] = st.split(",").map(Number);
    if (Number.isFinite(yaw)) await page.evaluate((y) => { window.__stpauls.player().yaw = (y * Math.PI) / 180; }, yaw);
    const trace = await page.evaluate(([a, b, c, d]) => window.__stpauls.simulate(a, b, c, !!d), [mx, my, secs, run]);
    console.log(`move ${mx},${my} for ${secs}s:`);
    for (let i = 0; i < trace.length; i += Math.max(1, Math.floor(trace.length / 25))) console.log("  ", JSON.stringify(trace[i]));
    console.log("   end", JSON.stringify(trace[trace.length - 1]));
  }
  const shot = arg("shot", "");
  if (shot) {
    await page.evaluate(() => window.__stpauls.render());
    await page.evaluate(() => window.__stpauls.render());
    await page.screenshot({ path: path.join(ROOT, "shots", `${shot}.png`) });
    console.log("shot", shot);
  }
} finally {
  await browser.close();
  await server.close();
}
