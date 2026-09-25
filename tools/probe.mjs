#!/usr/bin/env node
/** Evaluates a JS expression inside the booted game (headless) and prints the JSON result. */
import { chromium } from "playwright-core";
const expr = process.argv[2] ?? "window.__stpauls.stats()";
const { createServer } = await import("vite");
const server = await createServer({ logLevel: "error", server: { port: 5198 } });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", headless: true, args: ["--use-angle=swiftshader", "--use-gl=angle", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  page.on("pageerror", (e) => console.error("pageerror", e.message));
  await page.goto(`http://localhost:${server.httpServer.address().port}/?shoot&q=${process.env.Q ?? "high"}`);
  await page.waitForFunction(() => window.__stpauls?.ready === true || window.__stpauls?.error, null, { timeout: 600000 });
  const out = await page.evaluate(`(async () => { const S = window.__stpauls; const app = S.app; return (${expr}); })()`);
  console.log(JSON.stringify(out, null, 1));
} finally {
  await browser.close();
  await server.close();
}
