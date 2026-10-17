import { t } from "./i18n";

// Shared empty state so no panel ever shows a blank area (AGENTS.md module
// rule: design empty, loading and error states).
export function EmptyState({ label }: { label?: string }) {
  return (
    <div class="islet-empty">
      <span class="islet-empty-icon" aria-hidden="true">
        ·
      </span>
      <span>{label ?? t("common.comingSoon")}</span>
    </div>
  );
}
