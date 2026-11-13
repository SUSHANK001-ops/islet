import { invoke } from "@tauri-apps/api/core";

// The frontend may ONLY call commands in src-tauri/src/commands.rs
// (AGENTS.md security rule). These thin wrappers are the single audit point for
// the network-floor commands (Spec 14). The frontend can read config + the
// egress ledger and toggle entries, but it can NEVER make a raw network
// request — all egress happens in Rust through net::request.

/** One allow-listed host tied to a named feature. Mirrors Rust `AllowEntry`. */
export interface AllowEntry {
  host: string;
  feature: string;
  enabled: boolean;
}

/** Network config: airplane mode + the host allow-list. Mirrors `NetConfig`. */
export interface NetConfig {
  schemaVersion: number;
  airplaneMode: boolean;
  hosts: AllowEntry[];
}

/** One egress-ledger line (metadata only — never headers or bodies). */
export interface LedgerEntry {
  time: string;
  feature: string;
  host: string;
  method: string;
  bytesOut: number;
  bytesIn: number;
  result: "ok" | "rejected" | "error" | string;
}

export interface Ledger {
  schemaVersion: number;
  entries: LedgerEntry[];
}

export function netGetConfig(): Promise<NetConfig> {
  return invoke("net_get_config");
}

export function netSetAirplaneMode(on: boolean): Promise<NetConfig> {
  return invoke("net_set_airplane_mode", { on });
}

export function netSetHostEnabled(host: string, enabled: boolean): Promise<NetConfig> {
  return invoke("net_set_host_enabled", { host, enabled });
}

export function netRemoveHost(host: string): Promise<NetConfig> {
  return invoke("net_remove_host", { host });
}

/** Read the egress ledger newest-first. */
export function netGetLedger(): Promise<Ledger> {
  return invoke("net_get_ledger");
}

export function netClearLedger(): Promise<void> {
  return invoke("net_clear_ledger");
}
