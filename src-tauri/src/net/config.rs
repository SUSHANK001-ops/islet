//! Network allow-list + airplane mode (Spec 14). Versioned JSON, atomic writes.
//!
//! Closed by default: the only seeded entry is the character catalog host, and
//! it starts DISABLED. A feature that wants egress (AI, sync) adds/enables its
//! host via the config commands, after on-notch consent. Airplane mode is a
//! master switch that blocks everything regardless of the list.

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::store::migrate::{self, Migrated};
use crate::store::{read_json, write_json_atomic, StoreError};

pub const NET_CONFIG_FILE: &str = "net-config.json";
pub const NET_CONFIG_VERSION: u32 = 1;

/// One allow-listed host tied to a named feature.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AllowEntry {
    /// Lowercase host, e.g. "api.groq.com".
    pub host: String,
    /// Stable feature key that uses this host: "ai" | "sync" | "catalog".
    pub feature: String,
    /// Whether requests to this host are currently permitted.
    pub enabled: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NetConfig {
    pub schema_version: u32,
    /// Master off switch. When true, ALL egress is refused.
    #[serde(default)]
    pub airplane_mode: bool,
    pub hosts: Vec<AllowEntry>,
}

impl Default for NetConfig {
    fn default() -> Self {
        // First run mirrors v2 behavior: nothing enabled. The catalog host is
        // seeded only if it is actually configured, and starts disabled so the
        // first catalog action still goes through consent.
        let mut hosts = Vec::new();
        if let Some(host) = super::host_of(crate::app_config::CATALOG_BASE_URL) {
            hosts.push(AllowEntry {
                host,
                feature: "catalog".into(),
                enabled: false,
            });
        }
        NetConfig {
            schema_version: NET_CONFIG_VERSION,
            airplane_mode: false,
            hosts,
        }
    }
}

/// Result of checking a host against the config.
#[derive(Debug, PartialEq)]
pub enum AllowState {
    /// Host is not on the list at all.
    NotListed,
    /// Host is listed but its entry is disabled.
    Disabled,
    /// Host is listed and enabled.
    Enabled,
}

impl NetConfig {
    pub fn allow_state(&self, host: &str) -> AllowState {
        let host = host.to_ascii_lowercase();
        match self.hosts.iter().find(|e| e.host == host) {
            None => AllowState::NotListed,
            Some(e) if e.enabled => AllowState::Enabled,
            Some(_) => AllowState::Disabled,
        }
    }

    /// Add a host for a feature (idempotent). Re-adding updates the feature and
    /// sets the enabled state. Returns the (possibly new) config.
    pub fn upsert(&mut self, host: &str, feature: &str, enabled: bool) {
        let host = host.to_ascii_lowercase();
        if let Some(e) = self.hosts.iter_mut().find(|e| e.host == host) {
            e.feature = feature.to_string();
            e.enabled = enabled;
        } else {
            self.hosts.push(AllowEntry {
                host,
                feature: feature.to_string(),
                enabled,
            });
        }
    }

    pub fn set_enabled(&mut self, host: &str, enabled: bool) {
        let host = host.to_ascii_lowercase();
        if let Some(e) = self.hosts.iter_mut().find(|e| e.host == host) {
            e.enabled = enabled;
        }
    }

    pub fn remove(&mut self, host: &str) {
        let host = host.to_ascii_lowercase();
        self.hosts.retain(|e| e.host != host);
    }
}

fn steps() -> Vec<migrate::Step> {
    // No migrations yet (v1). Add steps here for future versions; never edit a
    // step once shipped.
    vec![]
}

/// Load config, migrating if needed. First run / unrecoverable -> defaults.
pub fn load(app: &AppHandle) -> NetConfig {
    match read_json::<serde_json::Value>(app, NET_CONFIG_FILE) {
        Ok(Some(raw)) => match migrate::run(raw, NET_CONFIG_VERSION, &steps()) {
            Migrated::Ok(v) => serde_json::from_value(v).unwrap_or_default(),
            Migrated::Recover(_) => NetConfig::default(),
        },
        _ => NetConfig::default(),
    }
}

/// Save config atomically (config changes are rare, so no debounce needed).
pub fn save(app: &AppHandle, cfg: &NetConfig) -> Result<(), StoreError> {
    write_json_atomic(app, NET_CONFIG_FILE, cfg)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn closed_by_default_for_unlisted_hosts() {
        let cfg = NetConfig {
            schema_version: NET_CONFIG_VERSION,
            airplane_mode: false,
            hosts: vec![],
        };
        assert_eq!(cfg.allow_state("api.groq.com"), AllowState::NotListed);
    }

    #[test]
    fn upsert_add_then_toggle() {
        let mut cfg = NetConfig {
            schema_version: NET_CONFIG_VERSION,
            airplane_mode: false,
            hosts: vec![],
        };
        cfg.upsert("API.Groq.com", "ai", false);
        assert_eq!(cfg.allow_state("api.groq.com"), AllowState::Disabled);
        cfg.set_enabled("api.groq.com", true);
        assert_eq!(cfg.allow_state("api.groq.com"), AllowState::Enabled);
        // Idempotent: re-upsert does not duplicate.
        cfg.upsert("api.groq.com", "ai", true);
        assert_eq!(cfg.hosts.len(), 1);
    }

    #[test]
    fn remove_host() {
        let mut cfg = NetConfig {
            schema_version: NET_CONFIG_VERSION,
            airplane_mode: false,
            hosts: vec![AllowEntry {
                host: "api.groq.com".into(),
                feature: "ai".into(),
                enabled: true,
            }],
        };
        cfg.remove("api.groq.com");
        assert!(cfg.hosts.is_empty());
    }

    #[test]
    fn host_match_is_case_insensitive() {
        let cfg = NetConfig {
            schema_version: NET_CONFIG_VERSION,
            airplane_mode: false,
            hosts: vec![AllowEntry {
                host: "api.groq.com".into(),
                feature: "ai".into(),
                enabled: true,
            }],
        };
        assert_eq!(cfg.allow_state("API.GROQ.COM"), AllowState::Enabled);
    }
}
