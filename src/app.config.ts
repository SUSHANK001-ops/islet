// The working name of the app lives here, in ONE place, so it can change later.
// AGENTS.md hard rule: "Keep the name in ONE config value so it can change later."
// The Rust side mirrors this in src-tauri/src/app_config.rs. If you rename, change both.
export const APP_NAME = "Islet" as const;

// Pill geometry (logical pixels), INFORMATIONAL for the frontend only.
// The Rust side (src-tauri/src/app_config.rs) is the source of truth for the
// actual OS window footprint; keep these values in sync with it. The visible
// black pill in CSS can be smaller than the closed window (the extra height is
// transparent and used to catch hover).
export const PILL = {
  closedWidth: 180,
  closedHeight: 36,
  openWidth: 400,
  openHeight: 580,
  // Gap from the very top of the active monitor's work area.
  topMargin: 0,
} as const;
