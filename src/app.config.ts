// The working name of the app lives here, in ONE place, so it can change later.
// AGENTS.md hard rule: "Keep the name in ONE config value so it can change later."
// The Rust side mirrors this in src-tauri/src/app_config.rs. If you rename, change both.
export const APP_NAME = "Islet" as const;

// Pill geometry (logical pixels). Kept small per the performance budgets.
export const PILL = {
  closedWidth: 120,
  closedHeight: 10,
  openWidth: 360,
  openHeight: 240,
  // Gap from the very top of the active monitor's work area.
  topMargin: 0,
} as const;
