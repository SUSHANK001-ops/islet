import { invoke } from "@tauri-apps/api/core";

// Character catalog bridge (Spec 13). The frontend only passes an id; Rust
// re-fetches + re-verifies the signed index on every call, so a forged
// url/hash can never be injected from here. All network + crypto is in Rust.

export interface CatalogEntry {
  id: string;
  name: string;
  version: string;
  author: string;
  license: string;
  sourceUrl: string;
  packFile: string;
  packSha256: string;
  packSizeBytes: number;
  previewFile: string | null;
  previewSha256: string | null;
  minAppVersion: string | null;
  tags: string[];
  placeholder: boolean;
}

export interface CharacterSummary {
  id: string;
  name: string;
  author: string;
  valid: boolean;
  problem: string | null;
}

/** Is the catalog set up (base URL + real signing key)? */
export function catalogIsConfigured(): Promise<boolean> {
  return invoke("catalog_is_configured");
}

/** Fetch + verify the signed index (call only after consent). */
export function catalogFetch(): Promise<CatalogEntry[]> {
  return invoke("catalog_fetch");
}

/** Verified preview as a data URL, or null. */
export function catalogPreview(id: string): Promise<string | null> {
  return invoke("catalog_preview", { id });
}

/** Download, hash-check, validate and install a catalog entry by id. */
export function catalogInstall(id: string): Promise<CharacterSummary> {
  return invoke("catalog_install", { id });
}
