//! A no-op example module proving the registry lifecycle + switch wiring.
//! It does nothing but log start/stop. Real feature modules (focus, tasks, ...)
//! follow this exact shape in later specs.

use super::registry::Module;

pub struct ExampleModule;

impl Module for ExampleModule {
    fn id(&self) -> &'static str {
        "example"
    }

    fn start(&self) {
        // Real modules would register scheduler timers / platform listeners.
        eprintln!("islet: example module started");
    }

    fn stop(&self) {
        eprintln!("islet: example module stopped");
    }
}
