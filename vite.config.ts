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
    // Do NOT open a browser tab; the app runs in the Tauri window, not a browser.
    open: false,
    watch: {
      // Never watch the Rust side. cargo writes locked build-script .exe files
      // into target/, which crashes Vite's file watcher (EBUSY). Tauri has its
      // own watcher for src-tauri, so Vite must ignore it entirely.
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    target: "es2022",
    sourcemap: false,
    minify: "esbuild",
  },
});
