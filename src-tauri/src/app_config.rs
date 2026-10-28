//! The app's working name, kept in ONE place on the Rust side.
//! Mirrors `src/app.config.ts` on the frontend. If you rename, change both.
//! AGENTS.md hard rule: "Keep the name in ONE config value so it can change later."

pub const APP_NAME: &str = "Islet";

/// The app version, mirrored from Cargo for the catalog User-Agent + minAppVersion.
pub const APP_VERSION: &str = env!("CARGO_PKG_VERSION");

/// Character catalog config (Spec 13). The base URL is the SINGLE allow-listed
/// host the app may contact, and only after a user click. Empty = "not set up"
/// (the Browse screen says so; local import still works). The user supplies
/// this when they host the catalog as static files.
pub const CATALOG_BASE_URL: &str = "";

/// Ed25519 public key (32 bytes, hex) used to verify the signed catalog index.
/// The matching PRIVATE key is NEVER in the repo. An all-zero placeholder means
/// "no key configured" -> the catalog refuses to verify, so Browse stays off
/// until a real key is set alongside CATALOG_BASE_URL.
pub const CATALOG_PUBLIC_KEY_HEX: &str =
    "0000000000000000000000000000000000000000000000000000000000000000";

/// Pill geometry used for WINDOW PLACEMENT only (logical px). The window is a
/// fixed large transparent canvas (see window/mod.rs); the pill is centered in
/// it by CSS. Rust only needs the pill's closed width (to align the pill to the
/// monitor edge) and the top margin. Visual sizes live in `src/app.config.ts`.
pub struct PillGeometry {
    pub closed_width: f64,
    /// Closed notch height, used only to keep a freely-dragged notch on-screen.
    /// Keep roughly in step with `.islet-pill.has-character` in shell.css.
    pub closed_height: f64,
    pub top_margin: f64,
}

pub const PILL: PillGeometry = PillGeometry {
    closed_width: 180.0,
    closed_height: 46.0,
    top_margin: 0.0,
};
