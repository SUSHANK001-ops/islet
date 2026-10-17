import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";

// The frontend may ONLY call commands in src-tauri/src/commands.rs
// (AGENTS.md security rule). These thin wrappers are the single audit point for
// the character commands. Rust is the source of truth for pack logic; the
// frontend only renders what Rust hands back, already validated.

/** One animated state: frame indices into the sheet grid, fps, and whether it
 *  loops. Mirrors the Rust `StateSpec`. */
export interface StateSpec {
  frames: number[];
  fps: number;
  loop: boolean;
}

export interface SheetSpec {
  file: string;
  frameWidth: number;
  frameHeight: number;
  columns: number;
  scale: number;
  pixelArt: boolean;
}

export interface Manifest {
  schemaVersion: number;
  id: string;
  name: string;
  version: string;
  author: string;
  license: string;
  sheet: SheetSpec;
  states: Record<string, StateSpec>;
  moods: Record<string, string>;
  stages: { id: string; minFocusMinutes: number; sheet: string }[];
  personality: { energy: number; chatty: number; lazy: number };
  outfits: { id: string; name: string; layer: string }[];
}

/** A fully validated, loaded character ready to render. */
export interface LoadedCharacter {
  manifest: Manifest;
  /** Absolute path to the main sheet (inside the pack folder). */
  sheetPath: string;
}

export interface CharacterSummary {
  id: string;
  name: string;
  author: string;
  valid: boolean;
  problem: string | null;
}

export interface ActiveCharacter {
  schemaVersion: number;
  id: string | null;
  showInNotch: boolean;
}

/** List every pack in the library with a validity flag (picker UI). */
export function charactersList(): Promise<CharacterSummary[]> {
  return invoke("characters_list");
}

/** The active-character record (chosen id + notch visibility). */
export function characterGetActive(): Promise<ActiveCharacter> {
  return invoke("character_get_active");
}

/** Load the active character fully validated, or null when none is chosen. */
export function characterLoadActive(): Promise<LoadedCharacter | null> {
  return invoke("character_load_active");
}

/** Choose the active character by id (null = none) + notch visibility. */
export function characterSetActive(
  id: string | null,
  showInNotch: boolean
): Promise<ActiveCharacter> {
  return invoke("character_set_active", { id, showInNotch });
}

/** Open the folder picker and import the chosen pack. Null if cancelled. */
export function characterImport(): Promise<CharacterSummary | null> {
  return invoke("character_import");
}

/** Delete a pack by id. If it was active, the backend clears the active id. */
export function characterDelete(id: string): Promise<void> {
  return invoke("character_delete", { id });
}

/**
 * Turn an absolute pack file path into a URL the webview can load, via the
 * asset: protocol (scoped to $APPDATA/characters in tauri.conf.json). Outside
 * Tauri (tests/preview) this returns the path unchanged.
 */
export function assetUrl(absPath: string): string {
  try {
    return convertFileSrc(absPath);
  } catch {
    return absPath;
  }
}
