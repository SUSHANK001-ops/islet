//! Safe, user-started character catalog downloads (Spec 13).
//!
//! Hard security rules (these override everything):
//! - ONE host only: `app_config::CATALOG_BASE_URL`. Empty = not set up.
//! - HTTPS only; no cookies; no redirects to another host; no identifiers
//!   beyond the app name+version User-Agent.
//! - Only after a user click (the frontend gates the first fetch behind the
//!   on-notch consent card; the optional daily check is default OFF).
//! - Signed index: `index.json` is verified against a BUILT-IN Ed25519 public
//!   key using the detached signature in `index.sig`. Reject if unsigned or
//!   wrongly signed.
//! - Hash check: each pack has a SHA-256 + size in the signed index; verified
//!   after download. Reject on mismatch.
//! - Limits: index ≤ 256 KB, pack ≤ 3 MB, preview ≤ 64 KB, 15 s timeout; stop
//!   reading at the limit even if the server sends more.
//! - Never trust the download: after the hash check, run the normal Rust
//!   validator (`import_dir`) which checks paths/limits/safety. Install via a
//!   temp folder, then rename. A failed install leaves nothing behind.
//! - Licenses: catalog entries must be CC0-1.0, CC-BY-4.0, or MIT.

use std::io::Read;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::app_config::{APP_NAME, APP_VERSION, CATALOG_BASE_URL, CATALOG_PUBLIC_KEY_HEX};

use super::{import_dir, CharacterSummary};

const MAX_INDEX_BYTES: usize = 256 * 1024;
const MAX_PACK_BYTES: usize = 3 * 1024 * 1024;
const MAX_PREVIEW_BYTES: usize = 64 * 1024;
const TIMEOUT_SECS: u64 = 15;
const ALLOWED_LICENSES: [&str; 3] = ["CC0-1.0", "CC-BY-4.0", "MIT"];

/// One entry in the signed catalog index.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CatalogEntry {
    pub id: String,
    pub name: String,
    pub version: String,
    pub author: String,
    pub license: String,
    pub source_url: String,
    pub pack_file: String,
    pub pack_sha256: String,
    pub pack_size_bytes: u64,
    #[serde(default)]
    pub preview_file: Option<String>,
    #[serde(default)]
    pub preview_sha256: Option<String>,
    #[serde(default)]
    pub min_app_version: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    /// Test-only packs are never shown in Browse or shipped.
    #[serde(default)]
    pub placeholder: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CatalogIndex {
    pub schema_version: u32,
    pub characters: Vec<CatalogEntry>,
}

#[derive(Debug)]
pub enum CatalogError {
    NotConfigured,
    Network(String),
    TooLarge(&'static str),
    BadSignature,
    BadHash,
    BadLicense(String),
    Invalid(String),
}

impl std::fmt::Display for CatalogError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CatalogError::NotConfigured => write!(f, "catalog is not set up"),
            CatalogError::Network(e) => write!(f, "could not reach the catalog: {e}"),
            CatalogError::TooLarge(what) => write!(f, "{what} exceeds the size limit"),
            CatalogError::BadSignature => write!(f, "the catalog signature is invalid"),
            CatalogError::BadHash => write!(f, "the download did not match its checksum"),
            CatalogError::BadLicense(l) => write!(f, "license not allowed: {l}"),
            CatalogError::Invalid(e) => write!(f, "{e}"),
        }
    }
}

/// Is the catalog configured (base URL + a non-placeholder public key)?
pub fn is_configured() -> bool {
    !CATALOG_BASE_URL.is_empty()
        && CATALOG_PUBLIC_KEY_HEX
            != "0000000000000000000000000000000000000000000000000000000000000000"
}

fn agent() -> ureq::Agent {
    ureq::AgentBuilder::new()
        .timeout(std::time::Duration::from_secs(TIMEOUT_SECS))
        // No redirects: a redirect could leave the allow-listed host.
        .redirects(0)
        .user_agent(&format!("{APP_NAME}/{APP_VERSION}"))
        .build()
}

/// Build an absolute URL under the catalog base, rejecting anything that could
/// escape the host (absolute URLs, `..`, backslashes).
fn catalog_url(rel: &str) -> Result<String, CatalogError> {
    if rel.contains("..") || rel.contains("://") || rel.contains('\\') {
        return Err(CatalogError::Invalid("unsafe catalog path".into()));
    }
    if !CATALOG_BASE_URL.starts_with("https://") {
        return Err(CatalogError::NotConfigured);
    }
    let base = CATALOG_BASE_URL.trim_end_matches('/');
    Ok(format!("{base}/{}", rel.trim_start_matches('/')))
}

/// GET a URL and read at most `max` bytes (stop even if the server sends more).
fn get_limited(url: &str, max: usize) -> Result<Vec<u8>, CatalogError> {
    let resp = agent()
        .get(url)
        .call()
        .map_err(|e| CatalogError::Network(e.to_string()))?;
    let mut reader = resp.into_reader().take((max as u64) + 1);
    let mut buf = Vec::new();
    reader
        .read_to_end(&mut buf)
        .map_err(|e| CatalogError::Network(e.to_string()))?;
    Ok(buf)
}

fn sha256_hex(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let mut h = Sha256::new();
    h.update(bytes);
    hex(&h.finalize())
}

fn hex(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push_str(&format!("{b:02x}"));
    }
    s
}

fn hex_to_bytes(s: &str) -> Option<Vec<u8>> {
    if s.len() % 2 != 0 {
        return None;
    }
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).ok())
        .collect()
}

/// Verify the detached Ed25519 signature `sig` over `msg` with the built-in key.
fn verify_signature(msg: &[u8], sig: &[u8]) -> bool {
    use ed25519_dalek::{Signature, Verifier, VerifyingKey};
    let Some(key_bytes) = hex_to_bytes(CATALOG_PUBLIC_KEY_HEX) else {
        return false;
    };
    let Ok(key_arr): Result<[u8; 32], _> = key_bytes.try_into() else {
        return false;
    };
    let Ok(vk) = VerifyingKey::from_bytes(&key_arr) else {
        return false;
    };
    if sig.len() != 64 {
        return false;
    }
    let mut sig_arr = [0u8; 64];
    sig_arr.copy_from_slice(sig);
    let signature = Signature::from_bytes(&sig_arr);
    vk.verify(msg, &signature).is_ok()
}

/// Fetch + verify the catalog index. Returns only non-placeholder entries with
/// an allowed license and a compatible minAppVersion.
pub fn fetch_index() -> Result<Vec<CatalogEntry>, CatalogError> {
    if !is_configured() {
        return Err(CatalogError::NotConfigured);
    }
    let index_url = catalog_url("index.json")?;
    let sig_url = catalog_url("index.sig")?;

    let index_bytes = get_limited(&index_url, MAX_INDEX_BYTES)?;
    if index_bytes.len() > MAX_INDEX_BYTES {
        return Err(CatalogError::TooLarge("index"));
    }
    let sig_raw = get_limited(&sig_url, 4096)?;
    // The .sig file is hex-encoded (64-byte signature => 128 hex chars).
    let sig_text = String::from_utf8_lossy(&sig_raw);
    let sig = hex_to_bytes(sig_text.trim()).ok_or(CatalogError::BadSignature)?;

    if !verify_signature(&index_bytes, &sig) {
        return Err(CatalogError::BadSignature);
    }

    let index: CatalogIndex =
        serde_json::from_slice(&index_bytes).map_err(|e| CatalogError::Invalid(e.to_string()))?;

    let filtered = index
        .characters
        .into_iter()
        .filter(|e| !e.placeholder)
        .filter(|e| ALLOWED_LICENSES.contains(&e.license.as_str()))
        .filter(|e| min_version_ok(e.min_app_version.as_deref()))
        .collect();
    Ok(filtered)
}

/// Fetch a preview image for an entry, size-capped and hash-checked when the
/// index provides a `previewSha256`. Returns raw PNG bytes for the UI to show
/// (as a data URL); None when the entry has no preview. A hash mismatch or an
/// oversize image is rejected (returns an error) rather than shown.
pub fn fetch_preview(entry: &CatalogEntry) -> Result<Option<Vec<u8>>, CatalogError> {
    let Some(ref file) = entry.preview_file else {
        return Ok(None);
    };
    let url = catalog_url(file)?;
    let bytes = get_limited(&url, MAX_PREVIEW_BYTES)?;
    if bytes.len() > MAX_PREVIEW_BYTES {
        return Err(CatalogError::TooLarge("preview"));
    }
    if let Some(ref want) = entry.preview_sha256 {
        if sha256_hex(&bytes) != want.to_lowercase() {
            return Err(CatalogError::BadHash);
        }
    }
    Ok(Some(bytes))
}

/// Compare `minAppVersion` (e.g. "0.2.0") against APP_VERSION (major.minor.patch).
fn min_version_ok(min: Option<&str>) -> bool {
    let Some(min) = min else { return true };
    fn parse(v: &str) -> (u32, u32, u32) {
        let mut it = v.split('.').map(|p| p.parse::<u32>().unwrap_or(0));
        (it.next().unwrap_or(0), it.next().unwrap_or(0), it.next().unwrap_or(0))
    }
    parse(APP_VERSION) >= parse(min)
}

/// Download, hash-check, validate, and install one catalog entry. Returns the
/// installed pack summary. A failed step installs nothing.
pub fn install(app: &AppHandle, entry: &CatalogEntry) -> Result<CharacterSummary, CatalogError> {
    if !is_configured() {
        return Err(CatalogError::NotConfigured);
    }
    if !ALLOWED_LICENSES.contains(&entry.license.as_str()) {
        return Err(CatalogError::BadLicense(entry.license.clone()));
    }
    if entry.pack_size_bytes > MAX_PACK_BYTES as u64 {
        return Err(CatalogError::TooLarge("pack"));
    }

    let pack_url = catalog_url(&entry.pack_file)?;
    let bytes = get_limited(&pack_url, MAX_PACK_BYTES)?;
    if bytes.len() > MAX_PACK_BYTES {
        return Err(CatalogError::TooLarge("pack"));
    }
    // Hash check BEFORE touching disk.
    if sha256_hex(&bytes) != entry.pack_sha256.to_lowercase() {
        return Err(CatalogError::BadHash);
    }

    // Write the .islet-char to a temp file, then reuse the validated import
    // path (unzip -> validate -> temp-dir -> rename). import_file re-validates
    // everything (paths, limits, safety) so the download is never trusted.
    let tmp_dir = std::env::temp_dir().join(format!("islet-dl-{}", entry.id));
    let _ = std::fs::create_dir_all(&tmp_dir);
    let archive: PathBuf = tmp_dir.join(format!("{}.islet-char", entry.id));
    std::fs::write(&archive, &bytes).map_err(|e| CatalogError::Invalid(e.to_string()))?;

    let result = super::import_file(app, &archive)
        .map_err(|e| CatalogError::Invalid(e.to_string()));
    let _ = std::fs::remove_dir_all(&tmp_dir);
    result
}

// Keep import_dir referenced for future direct-folder catalog installs; the
// zip path uses import_file above.
#[allow(unused_imports)]
use import_dir as _import_dir;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn not_configured_by_default() {
        // The shipped placeholder key + empty URL means Browse stays off.
        assert!(!is_configured());
    }

    #[test]
    fn rejects_unsafe_catalog_paths() {
        assert!(catalog_url("../secret").is_err());
        assert!(catalog_url("https://evil/x").is_err());
    }

    #[test]
    fn hex_roundtrip() {
        assert_eq!(hex(&[0x00, 0xff, 0x10]), "00ff10");
        assert_eq!(hex_to_bytes("00ff10"), Some(vec![0, 255, 16]));
        assert_eq!(hex_to_bytes("xyz"), None);
    }

    #[test]
    fn sha256_known_vector() {
        // SHA-256("abc")
        assert_eq!(
            sha256_hex(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn min_version_gate() {
        assert!(min_version_ok(None));
        assert!(min_version_ok(Some("0.0.1")));
        assert!(!min_version_ok(Some("999.0.0")));
    }

    #[test]
    fn bad_license_rejected_shape() {
        assert!(!ALLOWED_LICENSES.contains(&"GPL-3.0"));
        assert!(ALLOWED_LICENSES.contains(&"CC0-1.0"));
    }
}
