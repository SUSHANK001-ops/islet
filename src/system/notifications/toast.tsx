import { useState } from "preact/hooks";
import { t } from "../../ui/i18n";
import { Icon } from "../../ui/controls/icon";
import { activeToast, dismissToast } from "./store";

// Toast card (Spec 11, screenshot 4 structure, Islet tokens). App mark + title
// + one body line + expand/close. Auto-dismiss (~4s) is handled in the store;
// this just renders the current toast. Slide/fade via CSS; reduced-motion safe.
export function Toast() {
  const n = activeToast.value;
  const [expanded, setExpanded] = useState(false);
  if (!n) return null;

  return (
    <div class="islet-toast" role="status" aria-live="polite">
      <span class="islet-toast-mark" aria-hidden="true">
        <Icon name="bell" size={18} />
      </span>
      <div class="islet-toast-body">
        <span class="islet-toast-title">{n.title}</span>
        <span class={`islet-toast-text${expanded ? " expanded" : ""}`}>{n.body}</span>
      </div>
      <div class="islet-toast-actions">
        <button
          class="islet-sb-item"
          aria-label={t("notif.expand")}
          onClick={() => setExpanded((e) => !e)}
        >
          <Icon name="expand" size={16} />
        </button>
        <button class="islet-sb-item" aria-label={t("notif.close")} onClick={dismissToast}>
          <Icon name="close" size={16} />
        </button>
      </div>
    </div>
  );
}
