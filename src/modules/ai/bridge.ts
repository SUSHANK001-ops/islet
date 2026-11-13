import { invoke } from "@tauri-apps/api/core";

// The frontend may ONLY call commands in src-tauri/src/commands.rs
// (AGENTS.md security rule). These thin wrappers are the single audit point for
// the BYOK AI commands (Spec 15). The API key is set here but NEVER read back:
// the config getter returns `hasKey` instead of the secret, and the actual
// request (with the Authorization header) is made entirely in Rust.

/** One chat message. Mirrors the Rust `ChatMessage`. */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** The redacted AI config the UI shows. The key is never returned. */
export interface AiConfigPublic {
  schemaVersion: number;
  baseUrl: string;
  model: string;
  hasKey: boolean;
  enabled: boolean;
  shareContext: boolean;
}

export function aiGetConfig(): Promise<AiConfigPublic> {
  return invoke("ai_get_config");
}

/**
 * Update the AI config. Pass `apiKey: null` to keep the existing key, "" to
 * clear it, or a new string to replace it. Saving also syncs the provider host
 * into the network allow-list on the Rust side.
 */
export function aiSetConfig(opts: {
  baseUrl: string;
  model: string;
  apiKey: string | null;
  enabled: boolean;
  shareContext: boolean;
}): Promise<AiConfigPublic> {
  return invoke("ai_set_config", {
    baseUrl: opts.baseUrl,
    model: opts.model,
    apiKey: opts.apiKey,
    enabled: opts.enabled,
    shareContext: opts.shareContext,
  });
}

/** Send a chat turn. Returns the assistant's reply text. */
export function aiChat(messages: ChatMessage[]): Promise<string> {
  return invoke("ai_chat", { messages });
}
