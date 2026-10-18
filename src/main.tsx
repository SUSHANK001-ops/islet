import { render } from "preact";
import "./ui/tokens.css";
import "./app/shell.css";
import "./system/system.css";
import { Shell } from "./app/shell";
import { initSettings } from "./app/settings-store";

// Load persisted settings before first paint of the shell content. The pill
// itself shows immediately; the panel reads settings once they are in.
void initSettings();

const root = document.getElementById("root");

// DEV-ONLY gallery: mounted only in a dev build AND at #/dev/gallery. The
// dynamic import keeps the gallery code out of the production bundle entirely
// (Vite tree-shakes a branch guarded by import.meta.env.DEV = false in release),
// and scripts/check-no-dev.mjs fails the build if its marker ever reaches dist/.
if (import.meta.env.DEV && location.hash === "#/dev/gallery") {
  void import("./dev/gallery").then(({ DevGallery }) => {
    if (root) render(<DevGallery />, root);
  });
} else if (root) {
  render(<Shell />, root);
}
