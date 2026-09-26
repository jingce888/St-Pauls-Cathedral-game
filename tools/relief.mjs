#!/usr/bin/env node
/** Screenshots relief panels: node tools/relief.mjs conversion arms ... [--light=35] [--tilt=20] */
import { chromium } from "playwright-core";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const names = argv.filter((a) => !a.startsWith("--"));
const opt = (n, d) => argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const { createServer } = await import("vite");
const server = await createServer({ root: ROOT, logLevel: "error", server: { port: 5198, strictPort: false } });
await server.listen();
const base = `http://localhost:${server.httpServer.address().port}/tools/relief.html`;
const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--use-angle=swiftshader", "--use-gl=angle", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
await fs.mkdir(path.join(ROOT, "shots"), { recursive: true });
try {
  for (const n of names) {
    const page = await browser.newPage({ viewport: { width: Number(opt("w", 1600)), height: Number(opt("h", 700)) } });
    page.on("pageerror", (e) => console.log("[pageerror]", e.message));
    await page.goto(`${base}?p=${n}&light=${opt("light", 35)}&tilt=${opt("tilt", 0)}`);
    await page.waitForFunction(() => window.done, null, { timeout: 120000 });
    const info = await page.evaluate(() => window.done);
    const file = path.join(ROOT, "shots", `relief-${n}${opt("tag", "")}.png`);
    await page.screenshot({ path: file });
    console.log(n, JSON.stringify(info), file);
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
