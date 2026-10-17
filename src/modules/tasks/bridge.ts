import { invoke } from "@tauri-apps/api/core";

// Tasks bridge. Rust owns the file; each call returns the updated list.

export interface Task {
  id: string;
  title: string;
  done: boolean;
  createdAt: number;
}

export interface TaskList {
  schemaVersion: number;
  tasks: Task[];
}

export function tasksList(): Promise<TaskList> {
  return invoke("tasks_list");
}

export function tasksAdd(title: string): Promise<TaskList> {
  return invoke("tasks_add", { title });
}

export function tasksToggle(id: string): Promise<TaskList> {
  return invoke("tasks_toggle", { id });
}

export function tasksDelete(id: string): Promise<TaskList> {
  return invoke("tasks_delete", { id });
}
