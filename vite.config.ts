import { defineConfig } from "vite";

export default defineConfig({
  // Relative asset paths: the built site runs from any folder or sub-path (GitHub Pages, itch.io...).
  base: "./",
  server: { port: 5173, host: true },
  preview: { port: 4173, host: true },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: { three: ["three"] },
      },
    },
  },
});
