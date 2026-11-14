import { invoke } from "@tauri-apps/api/core";

// The frontend may ONLY call commands in src-tauri/src/commands.rs
// (AGENTS.md security rule). Thin wrappers for the coding-agent companion
// (Spec 17). Read-only by design: the only mutation is recording a human's
// approve/decline decision — Islet never runs what an agent proposes.

export type EventKind = "file_read" | "file_edit" | "command_proposed" | "status";
export type Decision = "pending" | "approved" | "declined";

/** One validated agent event. Mirrors the Rust `AgentEvent` (camelCase wire). */
export interface AgentEvent {
  id: string;
  agent: string;
  kind: EventKind;
  title: string;
  detail?: string | null;
  path?: string | null;
  time: string;
  decision: Decision;
}

export interface AgentLog {
  schemaVersion: number;
  events: AgentEvent[];
}

/** Drain the inbox and read the log newest-first. Call on a slow interval only
 *  while the Agents panel is open (poll only while needed). */
export function agentsPoll(): Promise<AgentLog> {
  return invoke("agents_poll");
}

/** Record approve/decline for a command-proposal event (human click only). */
export function agentsDecide(id: string, approve: boolean): Promise<AgentLog> {
  return invoke("agents_decide", { id, approve });
}

export function agentsClear(): Promise<void> {
  return invoke("agents_clear");
}
