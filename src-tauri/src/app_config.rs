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
    closed_width: 160.0,
    closed_height: 24.0,
    open_width: 360.0,
    open_height: 240.0,
    top_margin: 0.0,
};
