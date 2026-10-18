fn main() {
    // Note: the undocumented power-overlay functions in platform/power.rs are
    // bound via `#[link(kind = "raw-dylib")]`, so no explicit powrprof import
    // library is needed here.
    tauri_build::build();
}
