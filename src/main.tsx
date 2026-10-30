import { render } from "preact";
import "./ui/tokens.css";
import "./app/shell.css";
import "./system/system.css";
import { Shell } from "./app/shell";
import { initSettings, settings } from "./app/settings-store";
import { publishInitialHitRegions } from "./app/hit-regions";
import { showIslandReady } from "./app/window-bridge";

const root = document.getElementById("root");

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/**
 * Keep the native WebView hidden until settings, theme, layout, and the first
 * safe hit region are ready. This prevents WebView2's white startup backing
 * surface from appearing through a transparent always-on-top window.
 */
async function boot(): Promise<void> {
  await initSettings();

  document.documentElement.classList.toggle(
    "theme-light",
    settings.value.theme === "light"
  );
  document.documentElement.style.setProperty(
    "--islet-pill-opacity",
    String(settings.value.notchOpacity)
  );

  // DEV-ONLY gallery: mounted only in a dev build AND at #/dev/gallery. The
  // dynamic import keeps gallery code out of the production bundle.
  if (import.meta.env.DEV && location.hash === "#/dev/gallery") {
    const { DevGallery } = await import("./dev/gallery");
    if (root) render(<DevGallery />, root);
  } else if (root) {
    render(<Shell />, root);
  }

  // Two compositor boundaries ensure CSS has loaded and Preact effects/layout
  // have committed before the transparent native window becomes visible.
  await nextFrame();
  await nextFrame();
  await publishInitialHitRegions();
  await showIslandReady().catch(() => {
    // Browser preview has no native window. Rendering is already complete.
  });
}

void boot();
