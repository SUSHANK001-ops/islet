//! The single network choke point (Spec 14).
//!
//! Hard rules (these override everything; see AGENTS.v3.md):
//! - This module is the ONLY place that opens an outbound socket. Every other
//!   module asks `net::request(...)`; nothing else builds an HTTP client.
//! - Closed by default: a request is rejected unless its host is on the
//!   allow-list AND that entry is enabled AND airplane mode is off.
//! - HTTPS only. No redirects (a redirect could leave the allow-listed host).
//! - Every attempt (allowed OR rejected) writes one line to the egress ledger,
//!   and a rejected attempt NEVER opens a socket.
//! - Size + timeout caps on every response.
//!
//! The frontend never gets a raw URL fetch. It can only read config + the
//! ledger and toggle entries via `commands.rs`; actual requests are made by
//! Rust features (AI, sync) through `request()`.

// The request choke point + its helpers are the stable surface that Spec 15
// (BYOK AI) and Spec 18 (sync) call into. They are intentionally present ahead
// of their first caller so the safety floor lands and is reviewed on its own.
// This allow is removed as soon as the AI client calls `net::request`.
#![allow(dead_code)]

pub mod config;
pub mod ledger;

use std::io::Read;
use std::time::Duration;

use tauri::AppHandle;

use crate::app_config::{APP_NAME, APP_VERSION};

/// Default response size cap (1 MB) when a caller does not specify one. AI
/// streaming callers pass their own larger cap; config/sync use small caps.
pub const DEFAULT_MAX_BYTES: usize = 1024 * 1024;
/// Default request timeout. Callers may lower it; never silently raise it.
pub const DEFAULT_TIMEOUT_SECS: u64 = 30;

/// Why a request was refused before any socket opened. Kept human-readable for
/// the UI and the ledger.
#[derive(Debug, Clone, PartialEq)]
pub enum NetError {
    AirplaneMode,
    HostNotAllowed(String),
    FeatureDisabled(String),
    NotHttps,
    TooLarge,
    Network(String),
}

impl std::fmt::Display for NetError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            NetError::AirplaneMode => write!(f, "network is off (airplane mode)"),
            NetError::HostNotAllowed(h) => write!(f, "host not allowed: {h}"),
            NetError::FeatureDisabled(h) => {
                write!(f, "network for this feature is turned off: {h}")
            }
            NetError::NotHttps => write!(f, "only https requests are allowed"),
            NetError::TooLarge => write!(f, "the response exceeded the size limit"),
            NetError::Network(e) => write!(f, "network error: {e}"),
        }
    }
}

impl std::error::Error for NetError {}

/// A single outbound request built by a Rust feature. `feature` is a stable key
/// (e.g. "ai", "sync", "catalog") used for the allow-list and the ledger.
pub struct NetRequest {
    pub feature: String,
    pub method: String,
    pub url: String,
    /// Extra headers (e.g. Authorization). Never logged verbatim.
    pub headers: Vec<(String, String)>,
    /// Request body (JSON for AI/sync). Only the byte COUNT is logged, not the
    /// content, so prompts are never written to the ledger.
    pub body: Option<Vec<u8>>,
    pub max_bytes: usize,
    pub timeout_secs: u64,
}

impl NetRequest {
    pub fn get(feature: &str, url: &str) -> Self {
        NetRequest {
            feature: feature.to_string(),
            method: "GET".to_string(),
            url: url.to_string(),
            headers: Vec::new(),
            body: None,
            max_bytes: DEFAULT_MAX_BYTES,
            timeout_secs: DEFAULT_TIMEOUT_SECS,
        }
    }

    pub fn post_json(feature: &str, url: &str, body: Vec<u8>) -> Self {
        NetRequest {
            feature: feature.to_string(),
            method: "POST".to_string(),
            url: url.to_string(),
            headers: vec![("Content-Type".to_string(), "application/json".to_string())],
            body: Some(body),
            max_bytes: DEFAULT_MAX_BYTES,
            timeout_secs: DEFAULT_TIMEOUT_SECS,
        }
    }

    pub fn header(mut self, name: &str, value: &str) -> Self {
        self.headers.push((name.to_string(), value.to_string()));
        self
    }

    pub fn with_max_bytes(mut self, max: usize) -> Self {
        self.max_bytes = max;
        self
    }

    pub fn with_timeout(mut self, secs: u64) -> Self {
        self.timeout_secs = secs;
        self
    }
}

/// A successful response: status + the size-capped body bytes.
pub struct NetResponse {
    pub status: u16,
    pub body: Vec<u8>,
}

/// Extract the host (lowercased) from an https URL, without pulling in a URL
/// crate. Returns None for anything that is not a plain `https://host/...`.
pub fn host_of(url: &str) -> Option<String> {
    let rest = url.strip_prefix("https://")?;
    // Host ends at the first '/', '?' or '#'.
    let end = rest
        .find(|c| c == '/' || c == '?' || c == '#')
        .unwrap_or(rest.len());
    let authority = &rest[..end];
    // Strip userinfo (never allowed) and port.
    if authority.contains('@') {
        return None;
    }
    let host = authority.split(':').next().unwrap_or(authority);
    if host.is_empty() {
        return None;
    }
    Some(host.to_ascii_lowercase())
}

/// The ONE function that performs outbound network. Resolves the request
/// against the allow-list + airplane mode BEFORE opening any socket, writes the
/// ledger either way, and enforces https / no-redirects / size / timeout.
pub fn request(app: &AppHandle, req: NetRequest) -> Result<NetResponse, NetError> {
    // 1) Must be https and parseable.
    let Some(host) = host_of(&req.url) else {
        ledger::record(app, &req.feature, "", &req.method, 0, 0, "rejected");
        return Err(NetError::NotHttps);
    };

    // 2) Gate against config BEFORE touching the network.
    let cfg = config::load(app);
    if cfg.airplane_mode {
        ledger::record(app, &req.feature, &host, &req.method, 0, 0, "rejected");
        return Err(NetError::AirplaneMode);
    }
    match cfg.allow_state(&host) {
        config::AllowState::NotListed => {
            ledger::record(app, &req.feature, &host, &req.method, 0, 0, "rejected");
            return Err(NetError::HostNotAllowed(host));
        }
        config::AllowState::Disabled => {
            ledger::record(app, &req.feature, &host, &req.method, 0, 0, "rejected");
            return Err(NetError::FeatureDisabled(host));
        }
        config::AllowState::Enabled => {}
    }

    // 3) Perform the request with hard caps. ureq is the existing small client.
    let bytes_out = req.body.as_ref().map(|b| b.len()).unwrap_or(0) as u64;
    let agent = ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(req.timeout_secs))
        .redirects(0) // no redirects: a redirect could leave the allowed host
        .user_agent(&format!("{APP_NAME}/{APP_VERSION}"))
        .build();

    let mut builder = agent.request(&req.method, &req.url);
    for (name, value) in &req.headers {
        builder = builder.set(name, value);
    }

    let resp = match req.body {
        Some(body) => builder.send_bytes(&body),
        None => builder.call(),
    };

    // ureq returns Err for non-2xx too; treat a Response error as a status we
    // still surface (the AI layer needs the error body), but network failures
    // (DNS/TLS/timeout) are a hard error.
    let (status, reader): (u16, Box<dyn Read + Send + Sync>) = match resp {
        Ok(r) => (r.status(), r.into_reader()),
        Err(ureq::Error::Status(code, r)) => (code, r.into_reader()),
        Err(e) => {
            ledger::record(app, &req.feature, &host, &req.method, bytes_out, 0, "error");
            return Err(NetError::Network(e.to_string()));
        }
    };

    // 4) Read at most max_bytes + 1 so we can detect overflow and stop.
    let mut limited = reader.take((req.max_bytes as u64) + 1);
    let mut buf = Vec::new();
    if let Err(e) = limited.read_to_end(&mut buf) {
        ledger::record(app, &req.feature, &host, &req.method, bytes_out, 0, "error");
        return Err(NetError::Network(e.to_string()));
    }
    if buf.len() > req.max_bytes {
        ledger::record(
            app,
            &req.feature,
            &host,
            &req.method,
            bytes_out,
            buf.len() as u64,
            "rejected",
        );
        return Err(NetError::TooLarge);
    }

    ledger::record(
        app,
        &req.feature,
        &host,
        &req.method,
        bytes_out,
        buf.len() as u64,
        "ok",
    );
    Ok(NetResponse { status, body: buf })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn host_of_parses_https_only() {
        assert_eq!(
            host_of("https://api.groq.com/openai/v1"),
            Some("api.groq.com".into())
        );
        assert_eq!(
            host_of("https://API.Groq.com:443/x"),
            Some("api.groq.com".into())
        );
        assert_eq!(host_of("http://api.groq.com/x"), None); // not https
        assert_eq!(host_of("ftp://host/x"), None);
        assert_eq!(host_of("https:///nohost"), None);
        assert_eq!(host_of("https://user@host/x"), None); // userinfo rejected
    }

    #[test]
    fn net_error_messages_are_friendly() {
        assert_eq!(
            NetError::AirplaneMode.to_string(),
            "network is off (airplane mode)"
        );
        assert!(NetError::HostNotAllowed("x".into())
            .to_string()
            .contains("x"));
    }
}
