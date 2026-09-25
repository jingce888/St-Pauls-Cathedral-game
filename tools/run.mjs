#!/usr/bin/env node
/**
 * Runs a TypeScript module from src/ in Node through Vite's SSR loader (handles TS and the
 * bundler-style extensionless imports). The module's default export (if a function) is called.
 *
 *   node tools/run.mjs tools/tests/sun.test.ts
 */
import { createServer } from "vite";
import path from "node:path";

const file = process.argv[2];
if (!file) throw new Error("usage: node tools/run.mjs <module.ts> [args]");
const server = await createServer({ logLevel: "error", server: { middlewareMode: true, hmr: false }, appType: "custom" });
try {
  const mod = await server.ssrLoadModule("/" + path.relative(process.cwd(), path.resolve(file)).replaceAll("\\", "/"));
  if (typeof mod.default === "function") await mod.default(process.argv.slice(3));
} finally {
  await server.close();
}
