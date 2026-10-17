//! Character pack loading, listing, import and delete. Rust is the source of
//! truth for all pack logic (CHARACTERS.md). Packs are untrusted: every pack is
//! validated before it is ever used, and imports are validated before commit.
//!
//! On-disk layout:
//!   <app_data>/characters/<id>/manifest.json, sheet.png, ...
//! Built-in packs ship read-only under the app resources; user packs live in
//! app data. For v1 the loader reads from app data; the sample pack is copied
//! there on first run by `ensure_builtin`.

pub mod manifest;
pub mod validate;

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::store::{data_root, read_json, write_json_atomic, StoreError};
use manifest::Manifest;
use validate::{validate, ValidationError};

/// The id of the built-in default pack that ships with the app.
pub const BUILTIN_ID: &str = "sponge-pal";

/// Small persisted record of which character is active and whether it is shown
/// in the notch. Versioned like every other saved file (data rule).
const ACTIVE_FILE: &str = "character-active.json";
const ACTIVE_VERSION: u32 = 1;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ActiveCharacter {
    pub schema_version: u32,
    /// Chosen pack id, or None to show no character.
    pub id: Option<String>,
    /// Whether the character animates inside the closed notch.
    pub show_in_notch: bool,
}

impl Default for ActiveCharacter {
    fn default() -> Self {
        ActiveCharacter {
            schema_version: ACTIVE_VERSION,
            id: Some(BUILTIN_ID.to_string()),
            show_in_notch: true,
        }
    }
}

/// Read the active-character record (defaults to the built-in, shown in notch).
pub fn active(app: &AppHandle) -> ActiveCharacter {
    match read_json::<ActiveCharacter>(app, ACTIVE_FILE) {
        Ok(Some(v)) => v,
        _ => ActiveCharacter::default(),
    }
}

/// Persist the active-character record (atomic; this is rare, so not debounced).
pub fn set_active(app: &AppHandle, value: &ActiveCharacter) -> Result<(), CharError> {
    write_json_atomic(app, ACTIVE_FILE, value).map_err(CharError::from)
}

/// Per-pack byte limits from CHARACTERS.md.
const MAX_SHEET_BYTES: u64 = 1024 * 1024; // 1 MB per sheet
const MAX_PACK_BYTES: u64 = 3 * 1024 * 1024; // 3 MB whole pack
const MAX_SHEET_DIM: u32 = 1024; // 1024x1024 max

/// Summary for the picker UI.
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CharacterSummary {
    pub id: String,
    pub name: String,
    pub author: String,
    pub valid: bool,
    /// First validation problem, if invalid (for a friendly message).
    pub problem: Option<String>,
}

/// A loaded, validated character ready for the renderer.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LoadedCharacter {
    pub manifest: Manifest,
    /// Absolute path to the main sheet, for the frontend to read via the asset
    /// protocol. Only ever inside the pack folder.
    pub sheet_path: String,
}

/// Errors surfaced to the UI. Human-readable.
#[derive(Debug)]
pub enum CharError {
    Store(String),
    NotFound(String),
    Invalid(Vec<ValidationError>),
    Io(String),
}

impl std::fmt::Display for CharError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CharError::Store(e) => write!(f, "{e}"),
            CharError::NotFound(id) => write!(f, "character '{id}' not found"),
            CharError::Invalid(errs) => {
                let joined = errs
                    .iter()
                    .map(|e| e.0.clone())
                    .collect::<Vec<_>>()
                    .join("; ");
                write!(f, "invalid pack: {joined}")
            }
            CharError::Io(e) => write!(f, "{e}"),
        }
    }
}

impl From<StoreError> for CharError {
    fn from(e: StoreError) -> Self {
        CharError::Store(e.to_string())
    }
}

/// The characters directory in app data, created if missing.
fn characters_dir(app: &AppHandle) -> Result<PathBuf, CharError> {
    let dir = data_root(app)?.join("characters");
    fs::create_dir_all(&dir).map_err(|e| CharError::Io(e.to_string()))?;
    Ok(dir)
}

fn pack_dir(app: &AppHandle, id: &str) -> Result<PathBuf, CharError> {
    // id is validated before this is called, but re-guard defensively.
    if !validate::is_valid_id(id) {
        return Err(CharError::NotFound(id.to_string()));
    }
    Ok(characters_dir(app)?.join(id))
}

/// Read + parse a pack's manifest (no validation here).
fn read_manifest(dir: &Path) -> Result<Manifest, CharError> {
    let path = dir.join("manifest.json");
    let bytes = fs::read(&path).map_err(|e| CharError::Io(e.to_string()))?;
    serde_json::from_slice::<Manifest>(&bytes).map_err(|e| CharError::Io(e.to_string()))
}

/// Parse a PNG's width/height from its IHDR chunk without an image crate.
/// PNG layout: 8-byte signature, then IHDR (length, "IHDR", width u32 BE,
/// height u32 BE ...). Returns None if it is not a valid PNG header.
fn png_dimensions(bytes: &[u8]) -> Option<(u32, u32)> {
    const SIG: [u8; 8] = [137, 80, 78, 71, 13, 10, 26, 10];
    if bytes.len() < 24 || bytes[0..8] != SIG || &bytes[12..16] != b"IHDR" {
        return None;
    }
    let w = u32::from_be_bytes([bytes[16], bytes[17], bytes[18], bytes[19]]);
    let h = u32::from_be_bytes([bytes[20], bytes[21], bytes[22], bytes[23]]);
    Some((w, h))
}

/// Full validation of a pack directory: manifest rules + image limits + frame
/// indices against the real sheet grid + total pack size.
fn validate_pack_dir(dir: &Path, manifest: &Manifest) -> Result<(), CharError> {
    let mut errors = validate(manifest);

    // Whole-pack size.
    if dir_size(dir) > MAX_PACK_BYTES {
        errors.push(ValidationError("pack exceeds 3 MB".into()));
    }

    // Main sheet: exists, PNG, within size + dimension limits.
    let sheet_path = dir.join(&manifest.sheet.file);
    match fs::read(&sheet_path) {
        Ok(bytes) => {
            if bytes.len() as u64 > MAX_SHEET_BYTES {
                errors.push(ValidationError("sheet.png exceeds 1 MB".into()));
            }
            match png_dimensions(&bytes) {
                Some((w, h)) => {
                    if w > MAX_SHEET_DIM || h > MAX_SHEET_DIM {
                        errors.push(ValidationError("sheet exceeds 1024x1024".into()));
                    }
                    // Frame indices must fit the grid.
                    let cols = manifest.sheet.columns.max(1);
                    let rows = (h / manifest.sheet.frame_height.max(1)).max(1);
                    let max_index = cols * rows;
                    for (name, st) in &manifest.states {
                        if st.frames.iter().any(|&fidx| fidx >= max_index) {
                            errors.push(ValidationError(format!(
                                "state '{name}' references a frame outside the sheet"
                            )));
                        }
                    }
                }
                None => errors.push(ValidationError("sheet.png is not a valid PNG".into())),
            }
        }
        Err(_) => errors.push(ValidationError("sheet.png is missing".into())),
    }

    if errors.is_empty() {
        Ok(())
    } else {
        Err(CharError::Invalid(errors))
    }
}

/// Recursively sum file sizes under `dir` (best effort).
fn dir_size(dir: &Path) -> u64 {
    let mut total = 0u64;
    if let Ok(entries) = fs::read_dir(dir) {
        for e in entries.flatten() {
            let p = e.path();
            if p.is_dir() {
                total += dir_size(&p);
            } else if let Ok(meta) = e.metadata() {
                total += meta.len();
            }
        }
    }
    total
}

/// List all packs in app data with a validity flag.
pub fn list(app: &AppHandle) -> Result<Vec<CharacterSummary>, CharError> {
    let dir = characters_dir(app)?;
    let mut out = Vec::new();
    if let Ok(entries) = fs::read_dir(&dir) {
        for e in entries.flatten() {
            if !e.path().is_dir() {
                continue;
            }
            let id = e.file_name().to_string_lossy().to_string();
            match read_manifest(&e.path()) {
                Ok(manifest) => {
                    let problems = validate_pack_dir(&e.path(), &manifest);
                    out.push(CharacterSummary {
                        id: manifest.id.clone(),
                        name: manifest.name.clone(),
                        author: manifest.author.clone(),
                        valid: problems.is_ok(),
                        problem: problems.err().map(|e| e.to_string()),
                    });
                }
                Err(_) => out.push(CharacterSummary {
                    id,
                    name: String::new(),
                    author: String::new(),
                    valid: false,
                    problem: Some("manifest.json missing or invalid".into()),
                }),
            }
        }
    }
    out.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(out)
}

/// Load + fully validate a pack for rendering.
pub fn load(app: &AppHandle, id: &str) -> Result<LoadedCharacter, CharError> {
    let dir = pack_dir(app, id)?;
    if !dir.exists() {
        return Err(CharError::NotFound(id.to_string()));
    }
    let manifest = read_manifest(&dir)?;
    validate_pack_dir(&dir, &manifest)?;
    let sheet_path = dir.join(&manifest.sheet.file);
    Ok(LoadedCharacter {
        manifest,
        sheet_path: sheet_path.to_string_lossy().to_string(),
    })
}

/// Delete a pack folder entirely.
pub fn delete(app: &AppHandle, id: &str) -> Result<(), CharError> {
    let dir = pack_dir(app, id)?;
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|e| CharError::Io(e.to_string()))?;
    }
    Ok(())
}

/// Import an already-extracted pack folder from `src`: validate it in a temp
/// location, then atomically move it into place. Rejects if invalid so a bad
/// pack never lands in the library.
pub fn import_dir(app: &AppHandle, src: &Path) -> Result<CharacterSummary, CharError> {
    let manifest = read_manifest(src)?;
    if !validate::is_valid_id(&manifest.id) {
        return Err(CharError::Invalid(vec![ValidationError(
            "id must be 3-40 chars of lowercase letters, digits and hyphens".into(),
        )]));
    }
    validate_pack_dir(src, &manifest)?;

    let dest = pack_dir(app, &manifest.id)?;
    // Copy into a temp sibling, then rename over the destination (atomic-ish).
    let tmp = characters_dir(app)?.join(format!(".import-{}", manifest.id));
    let _ = fs::remove_dir_all(&tmp);
    copy_dir(src, &tmp).map_err(|e| CharError::Io(e))?;
    let _ = fs::remove_dir_all(&dest);
    fs::rename(&tmp, &dest).map_err(|e| CharError::Io(e.to_string()))?;

    Ok(CharacterSummary {
        id: manifest.id.clone(),
        name: manifest.name.clone(),
        author: manifest.author.clone(),
        valid: true,
        problem: None,
    })
}

fn copy_dir(src: &Path, dest: &Path) -> Result<(), String> {
    fs::create_dir_all(dest).map_err(|e| e.to_string())?;
    for entry in fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let from = entry.path();
        // Skip symlinks defensively (safety rule: no symlinks).
        let meta = fs::symlink_metadata(&from).map_err(|e| e.to_string())?;
        if meta.file_type().is_symlink() {
            continue;
        }
        let to = dest.join(entry.file_name());
        if from.is_dir() {
            copy_dir(&from, &to)?;
        } else {
            fs::copy(&from, &to).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// Export a pack to a single `.islet-char` file (a ZIP of the pack folder).
/// `dest` is the file path the user picked in the save dialog.
pub fn export(app: &AppHandle, id: &str, dest: &Path) -> Result<(), CharError> {
    use std::io::{Read, Write};
    use zip::write::SimpleFileOptions;

    let dir = pack_dir(app, id)?;
    if !dir.exists() {
        return Err(CharError::NotFound(id.to_string()));
    }

    let file = fs::File::create(dest).map_err(|e| CharError::Io(e.to_string()))?;
    let mut zip = zip::ZipWriter::new(file);
    let opts = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    // Walk the pack folder and add each file under its relative path.
    fn add_dir(
        zip: &mut zip::ZipWriter<fs::File>,
        base: &Path,
        dir: &Path,
        opts: SimpleFileOptions,
    ) -> Result<(), CharError> {
        for entry in fs::read_dir(dir).map_err(|e| CharError::Io(e.to_string()))? {
            let entry = entry.map_err(|e| CharError::Io(e.to_string()))?;
            let path = entry.path();
            // Never follow symlinks (safety rule).
            let meta = fs::symlink_metadata(&path).map_err(|e| CharError::Io(e.to_string()))?;
            if meta.file_type().is_symlink() {
                continue;
            }
            let rel = path
                .strip_prefix(base)
                .map_err(|e| CharError::Io(e.to_string()))?
                .to_string_lossy()
                .replace('\\', "/");
            if path.is_dir() {
                add_dir(zip, base, &path, opts)?;
            } else {
                zip.start_file(rel, opts).map_err(|e| CharError::Io(e.to_string()))?;
                let mut f = fs::File::open(&path).map_err(|e| CharError::Io(e.to_string()))?;
                let mut buf = Vec::new();
                f.read_to_end(&mut buf).map_err(|e| CharError::Io(e.to_string()))?;
                zip.write_all(&buf).map_err(|e| CharError::Io(e.to_string()))?;
            }
        }
        Ok(())
    }

    add_dir(&mut zip, &dir, &dir, opts)?;
    zip.finish().map_err(|e| CharError::Io(e.to_string()))?;
    Ok(())
}

/// Import a `.islet-char` file: extract to a temp folder (with zip-slip
/// protection), then validate + commit via `import_dir`. A bad or unsafe
/// archive is rejected and nothing lands in the library.
pub fn import_file(app: &AppHandle, archive: &Path) -> Result<CharacterSummary, CharError> {
    use std::io::copy;

    let file = fs::File::open(archive).map_err(|e| CharError::Io(e.to_string()))?;
    let mut zip = zip::ZipArchive::new(file).map_err(|e| CharError::Io(e.to_string()))?;

    // Extract into a unique temp folder under the characters dir.
    let tmp = characters_dir(app)?.join(format!(".unzip-{}", unique_suffix()));
    let _ = fs::remove_dir_all(&tmp);
    fs::create_dir_all(&tmp).map_err(|e| CharError::Io(e.to_string()))?;

    for i in 0..zip.len() {
        let mut entry = zip.by_index(i).map_err(|e| CharError::Io(e.to_string()))?;
        // Zip-slip protection: use the sanitized name and reject traversal.
        let Some(safe) = entry.enclosed_name() else {
            let _ = fs::remove_dir_all(&tmp);
            return Err(CharError::Invalid(vec![ValidationError(
                "archive contains an unsafe path".into(),
            )]));
        };
        let out = tmp.join(&safe);
        if entry.is_dir() {
            fs::create_dir_all(&out).map_err(|e| CharError::Io(e.to_string()))?;
        } else {
            if let Some(parent) = out.parent() {
                fs::create_dir_all(parent).map_err(|e| CharError::Io(e.to_string()))?;
            }
            let mut f = fs::File::create(&out).map_err(|e| CharError::Io(e.to_string()))?;
            copy(&mut entry, &mut f).map_err(|e| CharError::Io(e.to_string()))?;
        }
    }

    // Some archives nest the pack one folder deep; if the temp root has no
    // manifest but a single subdir does, import that subdir.
    let src = if tmp.join("manifest.json").exists() {
        tmp.clone()
    } else {
        single_subdir_with_manifest(&tmp).unwrap_or_else(|| tmp.clone())
    };

    let result = import_dir(app, &src);
    let _ = fs::remove_dir_all(&tmp);
    result
}

/// If `dir` has exactly one subdirectory and it contains a manifest, return it.
fn single_subdir_with_manifest(dir: &Path) -> Option<PathBuf> {
    let mut subdirs = fs::read_dir(dir)
        .ok()?
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.is_dir());
    let first = subdirs.next()?;
    if subdirs.next().is_some() {
        return None; // more than one subdir: ambiguous
    }
    first.join("manifest.json").exists().then_some(first)
}

fn unique_suffix() -> String {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| format!("{:x}", d.as_nanos()))
        .unwrap_or_else(|_| "tmp".into())
}

/// Copy the bundled built-in pack(s) into app data on first run so the user
/// always has a default character. Built-ins ship read-only under the app's
/// resource dir (`packs/characters/<id>`); user packs live only in app data.
///
/// We copy rather than read in place so import/delete/switch all work uniformly
/// against one directory, and so a future pack update can refresh the copy. A
/// pack is re-copied only if it is missing in app data (never clobbers a user's
/// customised copy, and costs nothing on later launches).
pub fn ensure_builtin(app: &AppHandle) {
    let Ok(dest_root) = characters_dir(app) else {
        return;
    };
    // Resolve the bundled packs dir from Tauri resources. In dev this resolves
    // under the resource dir; `tauri.conf.json` bundles `packs/` as a resource.
    let Ok(res_dir) = app.path().resource_dir() else {
        return;
    };
    let src_root = res_dir.join("packs").join("characters");
    if !src_root.exists() {
        return;
    }
    for id in [BUILTIN_ID] {
        let src = src_root.join(id);
        let dest = dest_root.join(id);
        if src.exists() && !dest.exists() {
            if let Err(e) = copy_dir(&src, &dest) {
                eprintln!("islet: failed to seed built-in character '{id}': {e}");
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn png_dimensions_reads_ihdr() {
        // Minimal PNG header: signature + IHDR length + "IHDR" + 64x48.
        let mut b = vec![137, 80, 78, 71, 13, 10, 26, 10];
        b.extend_from_slice(&[0, 0, 0, 13]); // IHDR length
        b.extend_from_slice(b"IHDR");
        b.extend_from_slice(&64u32.to_be_bytes());
        b.extend_from_slice(&48u32.to_be_bytes());
        b.extend_from_slice(&[8, 6, 0, 0, 0]); // bit depth etc.
        assert_eq!(png_dimensions(&b), Some((64, 48)));
    }

    #[test]
    fn png_dimensions_rejects_non_png() {
        assert_eq!(png_dimensions(b"not a png at all......."), None);
    }
}
