import { useEffect } from "preact/hooks";
import { t } from "../../ui/i18n";
import { Icon } from "../../ui/controls/icon";
import { FlyoutSection } from "../flyout-shell";
import { notifications, markAllRead, clearNotifications } from "./store";

// Notifications flyout (Spec 11). Islet's own notification history with an
// unread indicator. Opening marks all read. Empty/loading/error states.
export default function NotificationsFlyout() {
  const items = notifications.value;

  // Opening the flyout marks everything read.
  useEffect(() => {
    markAllRead();
  }, []);

  if (items.length === 0) {
    return (
      <div class="islet-empty">
        <span class="islet-empty-icon" aria-hidden="true">·</span>
        <span>{t("notif.empty")}</span>
      </div>
    );
  }

  return (
    <FlyoutSection
      title={t("tab.notifications")}
      right={
        <button class="islet-link-btn" onClick={clearNotifications}>
          {t("notif.clear")}
        </button>
      }
    >
      <ul class="islet-notif-list">
        {items.map((n) => (
          <li key={n.id} class={`islet-notif${n.read ? "" : " unread"}`}>
            <span class="islet-notif-mark" aria-hidden="true">
              <Icon name="bell" size={16} />
            </span>
            <div class="islet-notif-body">
              <span class="islet-notif-title">{n.title}</span>
              <span class="islet-notif-text">{n.body}</span>
            </div>
          </li>
        ))}
      </ul>
    </FlyoutSection>
  );
}
