import { t } from "./i18n";
import { Icon, type IconName } from "./controls/icon";

// Shared empty state so no panel ever shows a blank area. Callers can select a
// meaningful icon while the default stays a neutral, hand-drawn grid glyph.
export function EmptyState({
  label,
  icon = "grid",
}: {
  label?: string;
  icon?: IconName;
}) {
  return (
    <div class="islet-empty">
      <Icon name={icon} size={22} class="islet-empty-icon" />
      <span>{label ?? t("common.comingSoon")}</span>
    </div>
  );
}
