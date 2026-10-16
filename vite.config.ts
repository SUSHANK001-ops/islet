import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

// Tauri expects a fixed dev port and no auto-clear so backend logs stay visible.
// Release builds drop source maps per AGENTS.md "Bundle" performance rule.
export default defineConfig({
  plugins: [preact()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  build: {
    target: "es2022",
    sourcemap: false,
    minify: "esbuild",
  },
});
