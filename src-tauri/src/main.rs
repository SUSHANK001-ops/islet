// Prevents an extra console window on Windows in release. Does nothing on other OSes.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    islet_lib::run();
}
