import { signal } from "@preact/signals";

// A permission request that Islet itself needs (e.g. "show notifications",
// "run at startup"). AGENTS.md: "Ask for a permission only when the feature
// that needs it is first used." This surface renders ON the notch so the user
// can accept or decline without a separate OS dialog stealing focus.
//
// NOTE: this is for Islet's OWN capabilities. Approving requests from other
// apps (VS Code / Kiro) is out of v1 scope and is recorded in docs/ideas.md.
export interface PermissionRequest {
  id: string;
  // Stable key so the same capability is not asked twice. Also the i18n key.
  capability: "notifications" | "runAtStartup" | "hideFromCapture";
  // Human-readable, translatable text. In v1 these come from a strings map.
  title: string;
  body: string;
}

export type PermissionDecision = "granted" | "denied";

// Queue of pending requests. Signals keep this reactive without a state lib.
export const pendingPermissions = signal<PermissionRequest[]>([]);

// Decisions the user has made this session. Spec 2 will persist these to the
// versioned settings store; for the spike we keep them in memory only.
export const permissionDecisions = signal<Record<string, PermissionDecision>>({});

/** Enqueue a permission request if it is not already pending or decided. */
export function requestPermission(req: PermissionRequest): void {
  if (permissionDecisions.value[req.capability]) return;
  if (pendingPermissions.value.some((p) => p.capability === req.capability)) return;
  pendingPermissions.value = [...pendingPermissions.value, req];
}

/** Record the user's choice and drop the request from the queue. */
export function decidePermission(id: string, decision: PermissionDecision): void {
  const req = pendingPermissions.value.find((p) => p.id === id);
  if (!req) return;
  permissionDecisions.value = {
    ...permissionDecisions.value,
    [req.capability]: decision,
  };
  pendingPermissions.value = pendingPermissions.value.filter((p) => p.id !== id);
}

/** True when there is at least one request waiting on the notch. */
export function hasPendingPermission(): boolean {
  return pendingPermissions.value.length > 0;
}
