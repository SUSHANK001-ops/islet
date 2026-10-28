import {
  pendingPermissions,
  decidePermission,
  type PermissionRequest,
} from "./permission-store";

/**
 * Renders the first pending permission request directly on the notch surface.
 * Accept / Decline are handled here so the user never leaves the island.
 * Only one is shown at a time to keep the surface tiny (performance budget).
 */
export function PermissionPrompt() {
  const queue = pendingPermissions.value;
  if (queue.length === 0) return null;
  const req: PermissionRequest = queue[0];

  return (
    <div
      class="islet-perm"
      role="alertdialog"
      aria-labelledby="perm-title"
      data-islet-hit="18"
    >
      <span id="perm-title" class="islet-perm-title">
        {req.title}
      </span>
      <p>{req.body}</p>
      <div class="islet-perm-actions">
        <button
          class="islet-btn danger"
          onClick={() => decidePermission(req.id, "denied")}
        >
          Not now
        </button>
        <button
          class="islet-btn primary"
          onClick={() => decidePermission(req.id, "granted")}
        >
          Allow
        </button>
      </div>
    </div>
  );
}
