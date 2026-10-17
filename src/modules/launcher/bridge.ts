import { invoke } from "@tauri-apps/api/core";

// Safe app launcher bridge. The frontend NEVER passes a path or command: it
// adds via the OS picker (launcher_add opens it), and launches by id. Rust
// validates on add and re-validates on every launch (AGENTS.md security rules).

export interface LauncherEntry {
  id: string;
  name: string;
  /** Informational only. Shown as a subtitle; never sent back to launch. */
  path: string;
}

export interface LauncherList {
  schemaVersion: number;
  entries: LauncherEntry[];
}

/** List saved apps. */
export function launcherList(): Promise<LauncherList> {
  return invoke("launcher_list");
}

/** Open the picker and add the chosen app. Null if the user cancels. */
export function launcherAdd(): Promise<LauncherList | null> {
  return invoke("launcher_add");
}

/** Remove a saved app by id. */
export function launcherRemove(id: string): Promise<LauncherList> {
  return invoke("launcher_remove", { id });
}

/** Rename a saved app (display name only). */
export function launcherRename(id: string, name: string): Promise<LauncherList> {
  return invoke("launcher_rename", { id, name });
}

/** Launch a saved app by id. Rust re-validates the stored path before opening. */
export function launcherLaunch(id: string): Promise<void> {
  return invoke("launcher_launch", { id });
}
