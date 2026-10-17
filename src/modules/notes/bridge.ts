import { invoke } from "@tauri-apps/api/core";

// Notes bridge. Rust owns the file; each call returns the updated list.

export interface Note {
  id: string;
  text: string;
  updatedAt: number;
}

export interface NoteList {
  schemaVersion: number;
  notes: Note[];
}

export function notesList(): Promise<NoteList> {
  return invoke("notes_list");
}

export function notesAdd(text: string): Promise<NoteList> {
  return invoke("notes_add", { text });
}

export function notesUpdate(id: string, text: string): Promise<NoteList> {
  return invoke("notes_update", { id, text });
}

export function notesDelete(id: string): Promise<NoteList> {
  return invoke("notes_delete", { id });
}
