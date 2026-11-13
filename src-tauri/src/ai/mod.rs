//! BYOK AI companion (Spec 15).
//!
//! The character can chat and coach using a provider the user configured
//! (OpenAI-compatible, e.g. Groq). Hard rules:
//! - No key / not enabled => no request is ever made.
//! - Every request goes through `net::request`, so the provider host must be
//!   allow-listed + enabled + airplane mode off, and every call is logged.
//! - The API key is sent ONLY as the Authorization header to the provider host.
//!   It is never logged (the ledger stores metadata only).
//! - User context (tasks/notes/focus) is included ONLY when the user opts in
//!   (`share_context`) and only their OWN data — never other apps or files.

pub mod config;

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::net::{self, NetRequest};
use config::AiConfig;

/// One chat message. `role` is "system" | "user" | "assistant".
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug)]
pub enum AiError {
    NotConfigured,
    Net(String),
    Provider { status: u16, message: String },
    BadResponse(String),
}

impl std::fmt::Display for AiError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AiError::NotConfigured => write!(f, "AI is not set up yet"),
            AiError::Net(e) => write!(f, "{e}"),
            AiError::Provider { status, message } => {
                write!(f, "the AI provider returned an error ({status}): {message}")
            }
            AiError::BadResponse(e) => write!(f, "could not read the AI response: {e}"),
        }
    }
}

impl std::error::Error for AiError {}

// --- Request/response shapes for the OpenAI-compatible chat API ---

#[derive(Serialize)]
struct ChatRequest<'a> {
    model: &'a str,
    messages: &'a [ChatMessage],
    /// Keep replies short and snappy for the little companion.
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<u32>,
    temperature: f32,
    /// Streaming is a later refinement; v1 uses a single JSON reply.
    stream: bool,
}

#[derive(Deserialize)]
struct ChatResponse {
    choices: Vec<Choice>,
}

#[derive(Deserialize)]
struct Choice {
    message: RespMessage,
}

#[derive(Deserialize)]
struct RespMessage {
    content: String,
}

/// The companion's base personality. Kept short; mood nuance arrives in Spec 16.
const SYSTEM_PROMPT: &str = "You are Pip, a small, warm focus-and-study companion \
living in a pill at the top of the user's screen. Be concise, kind, and \
practical. Prefer one or two short sentences. Never pretend to have access to \
the user's files or other apps.";

/// Build the full message list: system prompt, optional user-context note, then
/// the conversation. Context is included only when `share_context` is on.
fn build_messages(cfg: &AiConfig, context: Option<String>, convo: Vec<ChatMessage>) -> Vec<ChatMessage> {
    let mut out = Vec::with_capacity(convo.len() + 2);
    out.push(ChatMessage {
        role: "system".to_string(),
        content: SYSTEM_PROMPT.to_string(),
    });
    if cfg.share_context {
        if let Some(ctx) = context {
            if !ctx.trim().is_empty() {
                out.push(ChatMessage {
                    role: "system".to_string(),
                    content: format!("Here is the user's current focus context:\n{ctx}"),
                });
            }
        }
    }
    out.extend(convo);
    out
}

/// Send a chat turn. `convo` is the running conversation (user/assistant turns).
/// `context` is a short, pre-built summary of the user's own hub/tasks/notes;
/// it is only attached when the user opted into sharing context.
///
/// Blocking (uses the net choke point's blocking client); call from
/// spawn_blocking in the command layer.
pub fn chat(
    app: &AppHandle,
    convo: Vec<ChatMessage>,
    context: Option<String>,
) -> Result<String, AiError> {
    let cfg = config::load(app);
    if !cfg.is_usable() {
        return Err(AiError::NotConfigured);
    }

    let messages = build_messages(&cfg, context, convo);
    let body = ChatRequest {
        model: &cfg.model,
        messages: &messages,
        max_tokens: Some(512),
        temperature: 0.6,
        stream: false,
    };
    let body_bytes = serde_json::to_vec(&body).map_err(|e| AiError::BadResponse(e.to_string()))?;

    // Route through the single choke point: host allow-list + airplane mode +
    // https + size/timeout + ledger are all enforced here. The key rides as the
    // Authorization header, which the ledger never records.
    let req = NetRequest::post_json("ai", &cfg.chat_url(), body_bytes)
        .header("Authorization", &format!("Bearer {}", cfg.api_key.trim()))
        .with_max_bytes(512 * 1024)
        .with_timeout(45);

    let resp = net::request(app, req).map_err(|e| AiError::Net(e.to_string()))?;

    if resp.status < 200 || resp.status >= 300 {
        // Surface a trimmed provider error without dumping the whole body.
        let msg = String::from_utf8_lossy(&resp.body);
        let short: String = msg.chars().take(300).collect();
        return Err(AiError::Provider {
            status: resp.status,
            message: short,
        });
    }

    let parsed: ChatResponse =
        serde_json::from_slice(&resp.body).map_err(|e| AiError::BadResponse(e.to_string()))?;
    let reply = parsed
        .choices
        .into_iter()
        .next()
        .map(|c| c.message.content)
        .ok_or_else(|| AiError::BadResponse("empty response".to_string()))?;
    Ok(reply.trim().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn usable_cfg() -> AiConfig {
        let mut c = AiConfig::default();
        c.enabled = true;
        c.api_key = "sk-test".into();
        c.share_context = true;
        c
    }

    #[test]
    fn build_messages_prepends_system_prompt() {
        let cfg = AiConfig::default();
        let convo = vec![ChatMessage { role: "user".into(), content: "hi".into() }];
        let msgs = build_messages(&cfg, Some("ignored".into()), convo);
        assert_eq!(msgs[0].role, "system");
        assert!(msgs[0].content.contains("Pip"));
        // share_context is off by default -> no context message, just system+user.
        assert_eq!(msgs.len(), 2);
        assert_eq!(msgs[1].content, "hi");
    }

    #[test]
    fn context_included_only_when_opted_in() {
        let cfg = usable_cfg();
        let convo = vec![ChatMessage { role: "user".into(), content: "hi".into() }];
        let msgs = build_messages(&cfg, Some("3 open tasks".into()), convo);
        // system + context + user
        assert_eq!(msgs.len(), 3);
        assert!(msgs[1].content.contains("3 open tasks"));
    }

    #[test]
    fn blank_context_is_skipped() {
        let cfg = usable_cfg();
        let convo = vec![ChatMessage { role: "user".into(), content: "hi".into() }];
        let msgs = build_messages(&cfg, Some("   ".into()), convo);
        assert_eq!(msgs.len(), 2, "blank context not attached");
    }

    #[test]
    fn request_body_is_valid_openai_shape() {
        let cfg = usable_cfg();
        let messages = build_messages(&cfg, None, vec![ChatMessage {
            role: "user".into(),
            content: "hello".into(),
        }]);
        let body = ChatRequest {
            model: &cfg.model,
            messages: &messages,
            max_tokens: Some(512),
            temperature: 0.6,
            stream: false,
        };
        let v: serde_json::Value = serde_json::to_value(&body).unwrap();
        assert_eq!(v["model"], cfg.model);
        assert_eq!(v["stream"], false);
        assert!(v["messages"].is_array());
    }
}
