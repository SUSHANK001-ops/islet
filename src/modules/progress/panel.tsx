import { useEffect, useState } from "preact/hooks";
import { t } from "../../ui/i18n";
import { progressSummary, type DaySummary } from "./bridge";
import { currentStreak, longestStreak, totalMinutes, heatLevel } from "./streak";
import { totalFocusMinutes } from "../../characters/character-store";

const DAYS = 119; // 17 weeks * 7 - a tidy heatmap grid

// Progress tab: streak stats + a focus heatmap built from the daily activity
// files. Also feeds the character growth signal (total focus minutes).
export default function ProgressPanel() {
  const [days, setDays] = useState<DaySummary[] | null>(null);

  useEffect(() => {
    let alive = true;
    progressSummary(DAYS)
      .then((d) => {
        if (!alive) return;
        setDays(d);
        // Feed growth: lifetime-ish total from the visible window. (A true
        // lifetime total would need a full-history scan; this window is enough
        // to drive stage changes and is cheap.)
        totalFocusMinutes.value = totalMinutes(d);
      })
      .catch(() => alive && setDays([]));
    return () => {
      alive = false;
    };
  }, []);

  if (days === null) {
    return <div class="islet-empty">{t("common.loading")}</div>;
  }

  if (days.every((d) => d.focusCount === 0)) {
    return (
      <div class="islet-empty">
        <span class="islet-empty-icon">🌱</span>
        <span>{t("progress.empty")}</span>
      </div>
    );
  }

  const streak = currentStreak(days);
  const best = longestStreak(days);
  const mins = totalMinutes(days);

  // Lay out the heatmap in columns of 7 (weeks).
  const weeks: DaySummary[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  return (
    <div class="islet-progress">
      <div class="islet-progress-stats">
        <div class="islet-stat">
          <span class="islet-stat-num">{streak}</span>
          <span class="islet-stat-label">{t("progress.streak")}</span>
        </div>
        <div class="islet-stat">
          <span class="islet-stat-num">{best}</span>
          <span class="islet-stat-label">{t("progress.best")}</span>
        </div>
        <div class="islet-stat">
          <span class="islet-stat-num">{Math.round(mins / 60)}</span>
          <span class="islet-stat-label">{t("progress.hours")}</span>
        </div>
      </div>

      <div class="islet-heatmap" role="img" aria-label={t("progress.heatmap")}>
        {weeks.map((week, wi) => (
          <div class="islet-heat-col" key={wi}>
            {week.map((d) => (
              <span
                key={d.date}
                class={`islet-heat-cell lvl-${heatLevel(d.focusCount)}`}
                title={`${d.date}: ${d.focusCount}`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
