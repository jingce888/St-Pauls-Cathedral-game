#!/usr/bin/env node
/**
 * Route test: loads the game headless and lets the autopilot walk from Ludgate Hill through the
 * great west door, up all 528 steps to the Golden Gallery and back down again. Fails if the
 * walker gets stuck or has to be caught after a fall anywhere on the way.
 *
 *   node tools/route.mjs [--q=low] [--shots]
 */
import { chromium } from "playwright-core";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const arg = (n, d) => argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const { createServer } = await import("vite");
const server = await createServer({ root: ROOT, logLevel: "error", server: { port: 5197, strictPort: false } });
await server.listen();
const url = `http://localhost:${server.httpServer.address().port}/?shoot&q=${arg("q", "low")}`;
const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  headless: true,
  args: ["--use-angle=swiftshader", "--use-gl=angle", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
let ok = false;
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on("pageerror", (e) => console.log("[pageerror]", e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.__stpauls?.ready || window.__stpauls?.error, null, { timeout: 300000 });
  const err = await page.evaluate(() => window.__stpauls.error);
  if (err) throw new Error(err);
  const t0 = Date.now();
  const res = await page.evaluate(() => window.__stpauls.climb(true));
  console.log(JSON.stringify(res, null, 1));
  console.log(`simulated in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  const up = res.up, down = res.down;
  ok = up.reached === up.total && !up.stuck && up.rescues === 0 && down && down.reached === down.total && !down.stuck && down.rescues === 0;
  console.log(ok ? "ROUTE OK: up and down without getting stuck or falling" : "ROUTE FAILED");
  const doors = await page.evaluate(() => window.__stpauls.doors());
  for (const [name, r] of Object.entries(doors)) {
    console.log(`${r.ok ? "door OK  " : "door FAIL"} ${name.padEnd(15)} reached ${r.reached}/${r.total} at ${r.at.join(",")}${r.stuck ? "  " + r.stuck : ""}${r.rescues ? "  rescues " + r.rescues : ""}`);
    ok &&= r.ok;
  }
} finally {
  await browser.close();
  await server.close();
}
process.exit(ok ? 0 : 1);
