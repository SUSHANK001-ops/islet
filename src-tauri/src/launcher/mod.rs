//! Safe, user-curated app launcher (AGENTS.md v2 Security rules).
//!
//! The frontend can NEVER pass a path or command to launch. It can only:
//!   - add an app (via an OS file picker; the picker IS the consent),
//!   - remove an app by id,
//!   - launch an app by id.
//! Rust stores a validated entry per app and re-validates on every launch. This
//! makes "open apps" impossible to abuse as an arbitrary-process primitive.
//!
//! Validation (on add AND on launch):
//!   - path must exist and be a regular file,
//!   - extension must be allow-listed (exe / lnk / url); scripts are rejected,
//!   - no UNC / remote paths (\\server\share), no `..` traversal,
//!   - path is canonicalized so the stored path is unambiguous.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::store::{read_json, write_json_atomic, StoreError};

pub const LAUNCHER_FILE: &str = "launcher.json";
pub const LAUNCHER_VERSION: u32 = 1;
const MAX_ENTRIES: usize = 50;

/// Extensions we allow a user to add. Executables and shortcuts only. Batch and
/// script files are intentionally excluded (they can run arbitrary commands).
const ALLOWED_EXTS: [&str; 3] = ["exe", "lnk", "url"];

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LauncherEntry {
    pub id: String,
    pub name: String,
    /// Canonical absolute path to the executable/shortcut. Never shown as an
    /// input the frontend can set; the frontend only ever sends an id.
    pub path: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LauncherList {
    pub schema_version: u32,
    pub entries: Vec<LauncherEntry>,
}

impl Default for LauncherList {
    fn default() -> Self {
        LauncherList {
            schema_version: LAUNCHER_VERSION,
            entries: Vec::new(),
        }
    }
}

/// Human-readable errors surfaced to the UI.
#[derive(Debug)]
pub enum LauncherError {
    Store(String),
    NotFound,
    Invalid(String),
    Full,
}

impl std::fmt::Display for LauncherError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LauncherError::Store(e) => write!(f, "{e}"),
            LauncherError::NotFound => write!(f, "that app is no longer in the list"),
            LauncherError::Invalid(why) => write!(f, "{why}"),
            LauncherError::Full => write!(f, "the launcher is full (max {MAX_ENTRIES})"),
        }
    }
}

impl From<StoreError> for LauncherError {
    fn from(e: StoreError) -> Self {
        LauncherError::Store(e.to_string())
    }
}

pub fn load(app: &AppHandle) -> LauncherList {
    match read_json::<LauncherList>(app, LAUNCHER_FILE) {
        Ok(Some(v)) if v.schema_version == LAUNCHER_VERSION => v,
        _ => LauncherList::default(),
    }
}

fn save(app: &AppHandle, list: &LauncherList) -> Result<(), LauncherError> {
    write_json_atomic(app, LAUNCHER_FILE, list).map_err(LauncherError::from)
}

/// Validate a path the user picked. Returns the canonical path + a default name
/// (the file stem) on success, or a friendly reason on failure. PURE given the
/// filesystem: no mutation, safe to call on add and on launch.
pub fn validate_path(raw: &Path) -> Result<(PathBuf, String), LauncherError> {
    let s = raw.to_string_lossy();

    // Reject UNC / remote paths outright (\\server\share or //server).
    if s.starts_with("\\\\") || s.starts_with("//") {
        return Err(LauncherError::Invalid("network paths are not allowed".into()));
    }
    // Reject traversal defensively (should not occur from a picker, but the
    // stored value is re-validated on launch and must stay trustworthy).
    if s.contains("..") {
        return Err(LauncherError::Invalid("invalid path".into()));
    }

    // Extension must be allow-listed.
    let ext = raw
        .extension()
        .map(|e| e.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default();
    if !ALLOWED_EXTS.contains(&ext.as_str()) {
        return Err(LauncherError::Invalid(format!(
            "only {} files can be added",
            ALLOWED_EXTS.join(", ")
        )));
    }

    // Must exist and be a regular file (not a directory / device).
    let meta = fs::metadata(raw)
        .map_err(|_| LauncherError::Invalid("that file no longer exists".into()))?;
    if !meta.is_file() {
        return Err(LauncherError::Invalid("that is not a file".into()));
    }

    // Canonicalize so the stored path is absolute and unambiguous.
    let canon = fs::canonicalize(raw)
        .map_err(|_| LauncherError::Invalid("could not resolve that path".into()))?;

    let name = canon
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "App".into());

    Ok((canon, name))
}

/// Add a validated entry from a picked path. Returns the updated list.
pub fn add(app: &AppHandle, picked: &Path) -> Result<LauncherList, LauncherError> {
    let (canon, default_name) = validate_path(picked)?;
    let mut list = load(app);
    if list.entries.len() >= MAX_ENTRIES {
        return Err(LauncherError::Full);
    }
    let canon_str = canon.to_string_lossy().to_string();
    // De-dup on the canonical path.
    if list.entries.iter().any(|e| e.path == canon_str) {
        return Ok(list);
    }
    list.entries.push(LauncherEntry {
        id: new_id(),
        name: default_name,
        path: canon_str,
    });
    save(app, &list)?;
    Ok(list)
}

/// Remove an entry by id. Returns the updated list.
pub fn remove(app: &AppHandle, id: &str) -> Result<LauncherList, LauncherError> {
    let mut list = load(app);
    let before = list.entries.len();
    list.entries.retain(|e| e.id != id);
    if list.entries.len() != before {
        save(app, &list)?;
    }
    Ok(list)
}

/// Resolve an id to its stored path, RE-VALIDATING it before returning. The
/// caller launches the returned path via the opener. Re-validation means a path
/// that became invalid (deleted, replaced by a script, moved to a share) is
/// refused even though it is stored.
pub fn resolve_for_launch(app: &AppHandle, id: &str) -> Result<PathBuf, LauncherError> {
    let list = load(app);
    let entry = list
        .entries
        .iter()
        .find(|e| e.id == id)
        .ok_or(LauncherError::NotFound)?;
    let (canon, _) = validate_path(Path::new(&entry.path))?;
    Ok(canon)
}

fn new_id() -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("l{nanos:x}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn rejects_non_allowlisted_extension() {
        // A .bat script must be refused even if it exists.
        let dir = std::env::temp_dir().join(format!("islet-l-{}", new_id()));
        std::fs::create_dir_all(&dir).unwrap();
        let bat = dir.join("evil.bat");
        let mut f = std::fs::File::create(&bat).unwrap();
        writeln!(f, "echo hi").unwrap();
        let r = validate_path(&bat);
        assert!(matches!(r, Err(LauncherError::Invalid(_))));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn rejects_missing_file() {
        let missing = std::env::temp_dir().join("islet-does-not-exist.exe");
        assert!(matches!(validate_path(&missing), Err(LauncherError::Invalid(_))));
    }

    #[test]
    fn rejects_unc_path() {
        let unc = Path::new("\\\\server\\share\\app.exe");
        assert!(matches!(validate_path(unc), Err(LauncherError::Invalid(_))));
    }

    #[test]
    fn accepts_allowlisted_existing_file() {
        // Create a fake ".exe" (content irrelevant; we only validate path+ext).
        let dir = std::env::temp_dir().join(format!("islet-l-{}", new_id()));
        std::fs::create_dir_all(&dir).unwrap();
        let exe = dir.join("myapp.exe");
        std::fs::File::create(&exe).unwrap();
        let r = validate_path(&exe);
        assert!(r.is_ok(), "a real .exe file should validate: {r:?}");
        let (_canon, name) = r.unwrap();
        assert_eq!(name, "myapp");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn default_list_is_empty_current_version() {
        let l = LauncherList::default();
        assert_eq!(l.schema_version, LAUNCHER_VERSION);
        assert!(l.entries.is_empty());
    }
}
