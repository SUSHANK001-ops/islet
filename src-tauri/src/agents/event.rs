//! Coding-agent event schema + validation (Spec 17).
//!
//! Events come from a supported local coding agent (Claude Code, Codex, …) via
//! a trusted local channel (a watched app-data inbox folder). The content is
//! UNTRUSTED: it is validated here before anything is stored or shown. Hard
//! rules (AGENTS.v3.md): read-only by default, strict schema, approvals need a
//! human click, never scrape terminals or inject clicks.

use serde::{Deserialize, Serialize};

/// Hard caps so a malformed or hostile file can never blow up memory/UI.
pub const MAX_AGENT_LEN: usize = 60;
pub const MAX_TITLE_LEN: usize = 200;
pub const MAX_DETAIL_LEN: usize = 2000;
pub const MAX_PATH_LEN: usize = 400;

/// What the agent is doing. A closed set: anything else is rejected so the UI
/// never has to render an unknown kind.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum EventKind {
    /// The agent read a file (informational).
    FileRead,
    /// The agent edited a file (informational).
    FileEdit,
    /// The agent proposes to run a command and is WAITING for approval.
    CommandProposed,
    /// A free-form status note (informational).
    Status,
}

impl EventKind {
    /// Only a command proposal is actionable (needs a human decision). Every
    /// other kind is informational / read-only.
    pub fn needs_approval(&self) -> bool {
        matches!(self, EventKind::CommandProposed)
    }
}

/// One validated agent event, as stored and shown. `id` is assigned by Islet on
/// ingest (not trusted from the file).
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AgentEvent {
    pub id: String,
    /// Which agent produced it, e.g. "claude-code". Sanitized + length-capped.
    pub agent: String,
    pub kind: EventKind,
    /// Short human-readable summary (e.g. "Edit src/main.rs").
    pub title: String,
    /// Optional longer detail (e.g. the proposed command text). Shown verbatim
    /// for a command proposal so the human sees exactly what would run.
    #[serde(default)]
    pub detail: Option<String>,
    /// Optional file path involved (display only; never executed/opened).
    #[serde(default)]
    pub path: Option<String>,
    /// ISO time the event was ingested.
    pub time: String,
    /// For command proposals: pending until the user decides.
    #[serde(default)]
    pub decision: Decision,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum Decision {
    #[default]
    Pending,
    Approved,
    Declined,
}

/// The raw shape an agent writes into the inbox. Deliberately minimal; Islet
/// fills in id/time/decision. Unknown fields are ignored by serde.
#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RawEvent {
    pub agent: String,
    pub kind: EventKind,
    pub title: String,
    #[serde(default)]
    pub detail: Option<String>,
    #[serde(default)]
    pub path: Option<String>,
}

#[derive(Debug, PartialEq)]
pub enum EventError {
    EmptyAgent,
    EmptyTitle,
}

impl std::fmt::Display for EventError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            EventError::EmptyAgent => write!(f, "event is missing an agent name"),
            EventError::EmptyTitle => write!(f, "event is missing a title"),
        }
    }
}

/// Strip control characters and collapse whitespace, then hard-cap length. Used
/// on every string field so nothing from an untrusted file can break the UI or
/// smuggle escape sequences into a log.
fn sanitize(s: &str, max: usize) -> String {
    let cleaned: String = s
        .chars()
        .map(|c| if c.is_control() { ' ' } else { c })
        .collect();
    cleaned.split_whitespace().collect::<Vec<_>>().join(" ")
        .chars()
        .take(max)
        .collect()
}

/// Validate + normalize a raw event into a stored AgentEvent. `id` and `time`
/// are supplied by the caller (Islet-assigned, never trusted from the file).
pub fn validate(raw: RawEvent, id: String, time: String) -> Result<AgentEvent, EventError> {
    let agent = sanitize(&raw.agent, MAX_AGENT_LEN);
    if agent.is_empty() {
        return Err(EventError::EmptyAgent);
    }
    let title = sanitize(&raw.title, MAX_TITLE_LEN);
    if title.is_empty() {
        return Err(EventError::EmptyTitle);
    }
    let detail = raw
        .detail
        .map(|d| sanitize(&d, MAX_DETAIL_LEN))
        .filter(|d| !d.is_empty());
    let path = raw
        .path
        .map(|p| sanitize(&p, MAX_PATH_LEN))
        .filter(|p| !p.is_empty());

    Ok(AgentEvent {
        id,
        agent,
        kind: raw.kind,
        title,
        detail,
        path,
        time,
        decision: Decision::Pending,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn raw(kind: EventKind) -> RawEvent {
        RawEvent {
            agent: "claude-code".into(),
            kind,
            title: "Edit src/main.rs".into(),
            detail: None,
            path: Some("src/main.rs".into()),
        }
    }

    #[test]
    fn only_command_proposals_need_approval() {
        assert!(EventKind::CommandProposed.needs_approval());
        assert!(!EventKind::FileRead.needs_approval());
        assert!(!EventKind::FileEdit.needs_approval());
        assert!(!EventKind::Status.needs_approval());
    }

    #[test]
    fn validate_fills_id_and_time_and_defaults_pending() {
        let e = validate(raw(EventKind::CommandProposed), "e1".into(), "T".into()).unwrap();
        assert_eq!(e.id, "e1");
        assert_eq!(e.time, "T");
        assert_eq!(e.decision, Decision::Pending);
        assert_eq!(e.agent, "claude-code");
    }

    #[test]
    fn empty_agent_or_title_rejected() {
        let mut r = raw(EventKind::Status);
        r.agent = "   ".into();
        assert_eq!(validate(r, "e".into(), "T".into()), Err(EventError::EmptyAgent));

        let mut r2 = raw(EventKind::Status);
        r2.title = "".into();
        assert_eq!(validate(r2, "e".into(), "T".into()), Err(EventError::EmptyTitle));
    }

    #[test]
    fn sanitize_strips_control_chars_and_caps_length() {
        let s = sanitize("hello\n\tworld\u{0007}", 100);
        assert_eq!(s, "hello world");
        let long = "a".repeat(500);
        assert_eq!(sanitize(&long, 10).len(), 10);
    }

    #[test]
    fn blank_detail_and_path_become_none() {
        let mut r = raw(EventKind::FileEdit);
        r.detail = Some("   ".into());
        r.path = Some("".into());
        let e = validate(r, "e".into(), "T".into()).unwrap();
        assert!(e.detail.is_none());
        assert!(e.path.is_none());
    }

    #[test]
    fn unknown_kind_is_rejected_by_serde() {
        let json = r#"{"agent":"x","kind":"delete_everything","title":"t"}"#;
        let parsed: Result<RawEvent, _> = serde_json::from_str(json);
        assert!(parsed.is_err(), "unknown kinds must not deserialize");
    }
}
