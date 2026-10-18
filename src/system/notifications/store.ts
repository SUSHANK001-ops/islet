import { signal } from "@preact/signals";

// Islet's OWN notification history (Spec 11). A bounded in-memory ring buffer;
// items come from Islet events (timer finished, download finished, errors) via
// `pushNotification`. Reading OTHER apps' notifications is out of scope (needs
// package identity; documented in windows-notes.md).

export interface IsletNotification {
  id: string;
  title: string;
  body: string;
  at: number; // epoch ms
  read: boolean;
}

const MAX = 50;

export const notifications = signal<IsletNotification[]>([]);
/** The currently-visible toast (newest unread), or null. */
export const activeToast = signal<IsletNotification | null>(null);

/** Count of unread notifications (drives the bell dot + pill badge). */
export function unreadCount(): number {
  return notifications.value.filter((n) => !n.read).length;
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;

/** Add a notification: prepend, bound the list, and raise a toast ~4s. */
export function pushNotification(title: string, body: string): void {
  const n: IsletNotification = {
    id: `nt${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    title,
    body,
    at: Date.now(),
    read: false,
  };
  notifications.value = [n, ...notifications.value].slice(0, MAX);
  activeToast.value = n;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    activeToast.value = null;
  }, 4000);
}

/** Dismiss the current toast immediately (close button). */
export function dismissToast(): void {
  if (toastTimer) clearTimeout(toastTimer);
  activeToast.value = null;
}

/** Mark all notifications read (opening the flyout). */
export function markAllRead(): void {
  notifications.value = notifications.value.map((n) => ({ ...n, read: true }));
}

/** Clear the history. */
export function clearNotifications(): void {
  notifications.value = [];
}
