//! Strict validation of an UNTRUSTED character manifest (CHARACTERS.md). A bad
//! pack must produce a clear error (which field, what is wrong) and NEVER crash
//! the app. Image-byte/limit checks that need the files live in the loader;
//! here we validate the manifest structure, ids, paths, counts and ranges.

use super::manifest::{Manifest, MANIFEST_VERSION, REQUIRED_STATES};

/// Limits from CHARACTERS.md.
const ID_MIN: usize = 3;
const ID_MAX: usize = 40;
const MAX_FRAME_DIM: u32 = 128;
const MAX_FRAMES_PER_STATE: usize = 64;
const FPS_MIN: u32 = 1;
const FPS_MAX: u32 = 24;
const MAX_STAGES: usize = 4;
const MAX_OUTFITS: usize = 30;

/// A validation problem with a human-readable message naming the field.
#[derive(Debug, Clone, PartialEq)]
pub struct ValidationError(pub String);

impl std::fmt::Display for ValidationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

fn err(msg: impl Into<String>) -> ValidationError {
    ValidationError(msg.into())
}

/// True if `id` is lowercase letters, digits and hyphens, 3..=40 chars.
pub fn is_valid_id(id: &str) -> bool {
    let len = id.chars().count();
    len >= ID_MIN
        && len <= ID_MAX
        && id
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

/// A relative path inside the pack is safe: not empty, not absolute, no drive
/// letter, no `..`, no URL scheme, no backslashes (normalize to forward only).
pub fn is_safe_rel_path(p: &str) -> bool {
    if p.is_empty() || p.len() > 256 {
        return false;
    }
    if p.contains("..") || p.contains('\\') || p.contains("://") {
        return false;
    }
    if p.starts_with('/') {
        return false;
    }
    // Drive letter like "C:"
    let bytes = p.as_bytes();
    if bytes.len() >= 2 && bytes[1] == b':' {
        return false;
    }
    // Only allow a conservative character set for file paths.
    p.chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | '/'))
}

/// Validate the whole manifest. Returns all problems found (so a pack author
/// can fix them in one pass) — empty vec means valid.
pub fn validate(m: &Manifest) -> Vec<ValidationError> {
    let mut errors = Vec::new();

    if m.schema_version != MANIFEST_VERSION {
        errors.push(err(format!(
            "schemaVersion must be {MANIFEST_VERSION}, got {}",
            m.schema_version
        )));
    }

    if !is_valid_id(&m.id) {
        errors.push(err(
            "id must be 3-40 chars of lowercase letters, digits and hyphens",
        ));
    }
    if m.name.trim().is_empty() {
        errors.push(err("name must not be empty"));
    }
    if m.author.trim().is_empty() {
        errors.push(err("author must not be empty"));
    }
    if m.license.trim().is_empty() {
        errors.push(err("license must not be empty"));
    }

    // Sheet.
    let s = &m.sheet;
    if !is_safe_rel_path(&s.file) {
        errors.push(err("sheet.file is not a safe relative path"));
    }
    if s.frame_width == 0 || s.frame_width > MAX_FRAME_DIM {
        errors.push(err(format!(
            "sheet.frameWidth must be 1..={MAX_FRAME_DIM}"
        )));
    }
    if s.frame_height == 0 || s.frame_height > MAX_FRAME_DIM {
        errors.push(err(format!(
            "sheet.frameHeight must be 1..={MAX_FRAME_DIM}"
        )));
    }
    if s.columns == 0 {
        errors.push(err("sheet.columns must be >= 1"));
    }
    if s.scale == 0 || s.scale > 8 {
        errors.push(err("sheet.scale must be 1..=8"));
    }

    // Required states must all exist.
    for req in REQUIRED_STATES {
        if !m.states.contains_key(req) {
            errors.push(err(format!("missing required state: {req}")));
        }
    }

    // Each state: frame count + fps range. Frame indices are checked against
    // the real sheet grid in the loader (needs image dimensions).
    for (name, st) in &m.states {
        if st.frames.is_empty() {
            errors.push(err(format!("state '{name}' has no frames")));
        }
        if st.frames.len() > MAX_FRAMES_PER_STATE {
            errors.push(err(format!(
                "state '{name}' has more than {MAX_FRAMES_PER_STATE} frames"
            )));
        }
        if st.fps < FPS_MIN || st.fps > FPS_MAX {
            errors.push(err(format!(
                "state '{name}' fps must be {FPS_MIN}..={FPS_MAX}"
            )));
        }
    }

    // Stages.
    if m.stages.len() > MAX_STAGES {
        errors.push(err(format!("more than {MAX_STAGES} stages")));
    }
    for stage in &m.stages {
        if !is_safe_rel_path(&stage.sheet) {
            errors.push(err(format!("stage '{}' sheet path is unsafe", stage.id)));
        }
    }

    // Outfits.
    if m.outfits.len() > MAX_OUTFITS {
        errors.push(err(format!("more than {MAX_OUTFITS} outfits")));
    }
    for o in &m.outfits {
        if !is_safe_rel_path(&o.layer) {
            errors.push(err(format!("outfit '{}' layer path is unsafe", o.id)));
        }
    }

    errors
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::characters::manifest::{SheetSpec, StateSpec};
    use std::collections::BTreeMap;

    fn good_states() -> BTreeMap<String, StateSpec> {
        let mut m = BTreeMap::new();
        for s in REQUIRED_STATES {
            m.insert(
                s.to_string(),
                StateSpec {
                    frames: vec![0, 1],
                    fps: 6,
                    r#loop: true,
                },
            );
        }
        m
    }

    fn good() -> Manifest {
        Manifest {
            schema_version: 1,
            id: "sample-cat".into(),
            name: "Sample Cat".into(),
            version: "1.0.0".into(),
            author: "Me".into(),
            license: "CC-BY-4.0".into(),
            sheet: SheetSpec {
                file: "sheet.png".into(),
                frame_width: 32,
                frame_height: 32,
                columns: 8,
                scale: 4,
                pixel_art: true,
            },
            states: good_states(),
            moods: BTreeMap::new(),
            stages: vec![],
            personality: Default::default(),
            outfits: vec![],
        }
    }

    #[test]
    fn a_good_manifest_validates() {
        assert!(validate(&good()).is_empty());
    }

    #[test]
    fn id_rules() {
        assert!(is_valid_id("sample-cat"));
        assert!(is_valid_id("abc"));
        assert!(!is_valid_id("ab")); // too short
        assert!(!is_valid_id("Has-Caps"));
        assert!(!is_valid_id("under_score"));
        assert!(!is_valid_id("space cat"));
    }

    #[test]
    fn path_safety() {
        assert!(is_safe_rel_path("sheet.png"));
        assert!(is_safe_rel_path("stages/baby.png"));
        assert!(!is_safe_rel_path("../escape.png"));
        assert!(!is_safe_rel_path("/abs/path.png"));
        assert!(!is_safe_rel_path("C:/win.png"));
        assert!(!is_safe_rel_path("http://x/y.png"));
        assert!(!is_safe_rel_path("back\\slash.png"));
        assert!(!is_safe_rel_path(""));
    }

    #[test]
    fn missing_required_state_fails() {
        let mut m = good();
        m.states.remove("sad");
        let errs = validate(&m);
        assert!(errs.iter().any(|e| e.0.contains("missing required state: sad")));
    }

    #[test]
    fn fps_out_of_range_fails() {
        let mut m = good();
        m.states.get_mut("idle").unwrap().fps = 99;
        assert!(validate(&m).iter().any(|e| e.0.contains("fps must be")));
    }

    #[test]
    fn too_many_frames_fails() {
        let mut m = good();
        m.states.get_mut("idle").unwrap().frames = (0..100).collect();
        assert!(validate(&m).iter().any(|e| e.0.contains("more than 64 frames")));
    }

    #[test]
    fn unsafe_sheet_path_fails() {
        let mut m = good();
        m.sheet.file = "../../secret.png".into();
        assert!(validate(&m).iter().any(|e| e.0.contains("safe relative path")));
    }

    #[test]
    fn bad_frame_dims_fail() {
        let mut m = good();
        m.sheet.frame_width = 999;
        assert!(validate(&m).iter().any(|e| e.0.contains("frameWidth")));
    }
}
