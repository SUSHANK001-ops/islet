import { invoke } from "@tauri-apps/api/core";

// Local calendar events bridge (Spec 11). Rust owns the versioned JSON file.

export interface CalEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  time?: string | null; // HH:MM
}

export interface EventList {
  schemaVersion: number;
  events: CalEvent[];
}

/** Events for a given YYYY-MM month, sorted. */
export function eventsListMonth(month: string): Promise<CalEvent[]> {
  return invoke("events_list_month", { month });
}

export function eventAdd(
  title: string,
  date: string,
  time?: string
): Promise<EventList> {
  return invoke("event_add", { title, date, time: time ?? null });
}

export function eventDelete(id: string): Promise<EventList> {
  return invoke("event_delete", { id });
}
