//! BYOK AI configuration (Spec 15). Versioned JSON, atomic writes.
//!
//! The user brings their own API key for an OpenAI-compatible provider (Groq by
//! default suggestion). The key is stored locally in app data — it is NOT an
//! account and never leaves the PC except as the Authorization header on a
//! request to the provider host the user configured (gated by the net/ floor).
//!
//! No key / not enabled => AI is simply off and the app works exactly like v2.

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::store::migrate::{self, Migrated};
use crate::store::{read_json, write_json_atomic, StoreError};

pub const AI_CONFIG_FILE: &str = "ai-config.json";
pub const AI_CONFIG_VERSION: u32 = 1;

/// A sensible default so the settings form is pre-filled but fully editable.
pub const DEFAULT_BASE_URL: &str = "https://api.groq.com/openai/v1";
pub const DEFAULT_MODEL: &str = "llama-3.1-8b-instant";

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AiConfig {
    pub schema_version: u32,
    /// OpenAI-compatible base URL, e.g. "https://api.groq.com/openai/v1".
    pub base_url: String,
    /// Model id, e.g. "llama-3.1-8b-instant".
    pub model: String,
    /// The user's API key. Stored locally; sent only as the Authorization
    /// header to `base_url`'s host. Never logged (the ledger stores metadata).
    #[serde(default)]
    pub api_key: String,
    /// Master on/off for the AI feature. Off by default (opt-in).
    #[serde(default)]
    pub enabled: bool,
    /// Whether Islet may include the user's own context (hub/tasks/notes) in a
    /// prompt. Off by default — the user opts in to sharing their data.
    #[serde(default)]
    pub share_context: bool,
}

impl Default for AiConfig {
    fn default() -> Self {
        AiConfig {
            schema_version: AI_CONFIG_VERSION,
            base_url: DEFAULT_BASE_URL.to_string(),
            model: DEFAULT_MODEL.to_string(),
            api_key: String::new(),
            enabled: false,
            share_context: false,
        }
    }
}

impl AiConfig {
    /// True when the feature can actually make a request.
    pub fn is_usable(&self) -> bool {
        self.enabled && !self.api_key.trim().is_empty() && !self.base_url.trim().is_empty()
    }

    /// The host of the configured base URL (for the net allow-list), if valid.
    pub fn host(&self) -> Option<String> {
        crate::net::host_of(self.base_url.trim())
    }

    /// The chat-completions endpoint under the base URL.
    pub fn chat_url(&self) -> String {
        let base = self.base_url.trim().trim_end_matches('/');
        format!("{base}/chat/completions")
    }
}

/// A redacted copy for sending to the frontend: the key is replaced with a
/// boolean "hasKey" so the actual secret never crosses to JS or logs.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AiConfigPublic {
    pub schema_version: u32,
    pub base_url: String,
    pub model: String,
    pub has_key: bool,
    pub enabled: bool,
    pub share_context: bool,
}

impl From<&AiConfig> for AiConfigPublic {
    fn from(c: &AiConfig) -> Self {
        AiConfigPublic {
            schema_version: c.schema_version,
            base_url: c.base_url.clone(),
            model: c.model.clone(),
            has_key: !c.api_key.trim().is_empty(),
            enabled: c.enabled,
            share_context: c.share_context,
        }
    }
}

fn steps() -> Vec<migrate::Step> {
    // No migrations yet (v1). Never edit a step once shipped.
    vec![]
}

pub fn load(app: &AppHandle) -> AiConfig {
    match read_json::<serde_json::Value>(app, AI_CONFIG_FILE) {
        Ok(Some(raw)) => match migrate::run(raw, AI_CONFIG_VERSION, &steps()) {
            Migrated::Ok(v) => serde_json::from_value(v).unwrap_or_default(),
            Migrated::Recover(_) => AiConfig::default(),
        },
        _ => AiConfig::default(),
    }
}

pub fn save(app: &AppHandle, cfg: &AiConfig) -> Result<(), StoreError> {
    write_json_atomic(app, AI_CONFIG_FILE, cfg)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_is_disabled_and_unusable() {
        let c = AiConfig::default();
        assert!(!c.enabled);
        assert!(!c.is_usable());
        assert_eq!(c.host().as_deref(), Some("api.groq.com"));
    }

    #[test]
    fn usable_requires_enabled_key_and_url() {
        let mut c = AiConfig::default();
        c.enabled = true;
        assert!(!c.is_usable(), "no key yet");
        c.api_key = "sk-test".into();
        assert!(c.is_usable());
        c.base_url = "   ".into();
        assert!(!c.is_usable(), "blank url");
    }

    #[test]
    fn chat_url_joins_without_double_slash() {
        let mut c = AiConfig::default();
        c.base_url = "https://api.groq.com/openai/v1/".into();
        assert_eq!(c.chat_url(), "https://api.groq.com/openai/v1/chat/completions");
    }

    #[test]
    fn public_view_hides_the_key() {
        let mut c = AiConfig::default();
        c.api_key = "secret".into();
        let pubv = AiConfigPublic::from(&c);
        assert!(pubv.has_key);
        // Serialized form must not contain the key.
        let j = serde_json::to_string(&pubv).unwrap();
        assert!(!j.contains("secret"));
        assert!(!j.contains("apiKey"));
    }
}
