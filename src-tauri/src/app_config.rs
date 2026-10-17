//! The app's working name, kept in ONE place on the Rust side.
//! Mirrors `src/app.config.ts` on the frontend. If you rename, change both.
//! AGENTS.md hard rule: "Keep the name in ONE config value so it can change later."

pub const APP_NAME: &str = "Islet";

/// Pill geometry in logical pixels. Mirrors `PILL` in `src/app.config.ts`.
pub struct PillGeometry {
    pub closed_width: f64,
    pub closed_height: f64,
    pub open_width: f64,
    pub open_height: f64,
    pub top_margin: f64,
}

pub const PILL: PillGeometry = PillGeometry {
    closed_width: 180.0,
    closed_height: 36.0,
    // The open WINDOW is intentionally larger than the visible panel: the extra
    // area is transparent and gives the panel room to grow and to show fully
    // rounded corners + a drop shadow without being clipped. The panel itself
    // caps its height and scrolls its body (see shell.css).
    open_width: 400.0,
    open_height: 580.0,
    top_margin: 0.0,
};
