//! Migration runner for versioned JSON documents.
//!
//! Rules (AGENTS.md data rules):
//! - Every document has `schemaVersion`.
//! - A change is a NEW ordered step. Shipped steps are never edited.
//! - Unknown / corrupt / future-version data must be handled safely: back it
//!   up and fall back to defaults. Never crash, never silently lose the file.
//!
//! The runner works on `serde_json::Value` so it is reusable for any document
//! (settings, activity, character index, ...). Each store defines its own
//! current version and its own ordered list of steps.

use serde_json::Value;

/// One migration step: transform a document from `from_version` to the next.
pub struct Step {
    pub from_version: u32,
    /// Pure transform. Should set `schemaVersion` to the new version.
    pub apply: fn(Value) -> Value,
}

/// Read the `schemaVersion` field, defaulting to 0 when absent/invalid so a
/// legacy or malformed file is treated as "oldest" and routed to recovery.
pub fn version_of(doc: &Value) -> u32 {
    doc.get("schemaVersion")
        .and_then(|v| v.as_u64())
        .map(|v| v as u32)
        .unwrap_or(0)
}

/// Outcome of running migrations.
pub enum Migrated {
    /// Document was already current or was upgraded to `current`.
    Ok(Value),
    /// Document could not be migrated (unknown/future/broken). Caller should
    /// back up the original and reset to defaults. The original is returned so
    /// the caller can preserve it.
    Recover(Value),
}

/// Apply ordered steps to bring `doc` up to `current`. Steps may be given in
/// any order; they are applied by matching `from_version` repeatedly.
pub fn run(doc: Value, current: u32, steps: &[Step]) -> Migrated {
    let mut v = version_of(&doc);

    // Future version (file newer than this app) -> recover, do not downgrade.
    if v > current {
        return Migrated::Recover(doc);
    }

    let mut working = doc;
    // Apply steps until we reach `current` or get stuck (no matching step).
    let mut guard = 0;
    while v < current {
        let Some(step) = steps.iter().find(|s| s.from_version == v) else {
            // No path forward from this version -> recover.
            return Migrated::Recover(working);
        };
        working = (step.apply)(working);
        let next = version_of(&working);
        // A step must advance the version; otherwise we would loop forever.
        if next <= v {
            return Migrated::Recover(working);
        }
        v = next;
        guard += 1;
        if guard > 256 {
            return Migrated::Recover(working);
        }
    }

    Migrated::Ok(working)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn steps() -> Vec<Step> {
        vec![
            // v1 -> v2: rename "colour" to "color".
            Step {
                from_version: 1,
                apply: |mut v| {
                    if let Some(obj) = v.as_object_mut() {
                        if let Some(c) = obj.remove("colour") {
                            obj.insert("color".into(), c);
                        }
                        obj.insert("schemaVersion".into(), json!(2));
                    }
                    v
                },
            },
        ]
    }

    #[test]
    fn already_current_is_ok() {
        let doc = json!({ "schemaVersion": 2, "color": "blue" });
        match run(doc.clone(), 2, &steps()) {
            Migrated::Ok(v) => assert_eq!(v, doc),
            _ => panic!("expected Ok"),
        }
    }

    #[test]
    fn upgrades_v1_to_v2() {
        let doc = json!({ "schemaVersion": 1, "colour": "blue" });
        match run(doc, 2, &steps()) {
            Migrated::Ok(v) => {
                assert_eq!(version_of(&v), 2);
                assert_eq!(v.get("color").unwrap(), "blue");
                assert!(v.get("colour").is_none());
            }
            _ => panic!("expected Ok"),
        }
    }

    #[test]
    fn unknown_version_recovers() {
        // schemaVersion 0 (missing) with no step from 0 -> recover.
        let doc = json!({ "junk": true });
        match run(doc.clone(), 2, &steps()) {
            Migrated::Recover(v) => assert_eq!(v, doc),
            _ => panic!("expected Recover"),
        }
    }

    #[test]
    fn future_version_recovers_without_downgrade() {
        let doc = json!({ "schemaVersion": 99, "color": "x" });
        match run(doc.clone(), 2, &steps()) {
            Migrated::Recover(v) => assert_eq!(v, doc),
            _ => panic!("expected Recover"),
        }
    }
}
