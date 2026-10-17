//! Feature modules + the shared machinery they use.
//! - `registry`: lifecycle (start/stop) driven by an on/off switch.
//! - `hub`: the shared in-memory values modules publish/read.
//! - `example`: a no-op module proving the wiring (Spec 2).
//! Real feature modules (focus, tasks, notes, media) arrive in later specs.

pub mod example;
pub mod focus;
pub mod hub;
pub mod registry;
