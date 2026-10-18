import { useEffect, useState } from "preact/hooks";
import { t } from "../../ui/i18n";
import { Icon } from "../../ui/controls/icon";
import { FlyoutSection } from "../flyout-shell";
import { buildMonthGrid, weekdayLabels, type DayCell } from "./month-grid";
import { eventsListMonth, eventAdd, eventDelete, type CalEvent } from "./bridge";

// Clock & calendar flyout (Spec 11). Big live clock (seconds tick only while
// mounted/open), month grid with today highlighted + prev/next, and inline
// local events. OS-locale formatting via Intl.

function isoToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export default function ClockFlyout() {
  const [now, setNow] = useState(() => new Date());
  const [view, setView] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");

  // Seconds tick only while this flyout is mounted (closed == asleep).
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const monthKey = `${view.year}-${String(view.month + 1).padStart(2, "0")}`;
  useEffect(() => {
    let alive = true;
    eventsListMonth(monthKey)
      .then((e) => alive && setEvents(e))
      .catch(() => alive && setEvents([]));
    return () => {
      alive = false;
    };
  }, [monthKey]);

  const today = isoToday();
  const grid = buildMonthGrid(view.year, view.month, 0);
  const labels = weekdayLabels(0);
  const selectedDay = today.startsWith(monthKey) ? today : `${monthKey}-01`;
  const dayEvents = events.filter((e) => e.date === selectedDay);

  const timeStr = now.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
  const dateStr = now.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const monthTitle = new Date(view.year, view.month, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  function step(delta: number) {
    setView((v) => {
      const m = v.month + delta;
      const year = v.year + Math.floor(m / 12);
      const month = ((m % 12) + 12) % 12;
      return { year, month };
    });
  }

  async function submit() {
    const trimmed = title.trim();
    if (!trimmed) return;
    await eventAdd(trimmed, selectedDay).catch(() => {});
    setTitle("");
    setAdding(false);
    setEvents(await eventsListMonth(monthKey).catch(() => events));
  }

  async function remove(id: string) {
    await eventDelete(id).catch(() => {});
    setEvents(await eventsListMonth(monthKey).catch(() => events));
  }

  function cell(c: DayCell) {
    const isToday = c.date === today;
    const has = events.some((e) => e.date === c.date);
    return (
      <div
        key={c.date}
        class={`islet-cal-cell${c.inMonth ? "" : " muted"}${isToday ? " today" : ""}`}
      >
        <span class="islet-num">{c.day}</span>
        {has ? <span class="islet-cal-dot" aria-hidden="true" /> : null}
      </div>
    );
  }

  return (
    <div class="islet-clock">
      <div class="islet-clock-time islet-num">{timeStr}</div>
      <div class="islet-clock-date">{dateStr}</div>

      <FlyoutSection>
        <div class="islet-cal-head">
          <span class="islet-cal-month">{monthTitle}</span>
          <div class="islet-cal-nav">
            <button class="islet-sb-item" aria-label={t("clock.prev")} onClick={() => step(-1)}>
              <Icon name="chevron-left" size={16} />
            </button>
            <button class="islet-sb-item" aria-label={t("clock.next")} onClick={() => step(1)}>
              <Icon name="chevron-right" size={16} />
            </button>
          </div>
        </div>
        <div class="islet-cal-grid">
          {labels.map((l) => (
            <div key={l} class="islet-cal-wd">{l}</div>
          ))}
          {grid.map(cell)}
        </div>
      </FlyoutSection>

      <FlyoutSection title={t("clock.events", { date: selectedDay })}>
        {dayEvents.length === 0 ? (
          <p class="islet-dim">{t("clock.noEvents")}</p>
        ) : (
          <ul class="islet-event-list">
            {dayEvents.map((e) => (
              <li key={e.id} class="islet-event">
                <span>{e.title}</span>
                <button
                  class="islet-icon-btn"
                  aria-label={t("clock.deleteEvent")}
                  onClick={() => remove(e.id)}
                >
                  <Icon name="close" size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {adding ? (
          <form
            class="islet-event-add"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <input
              class="islet-input"
              autoFocus
              placeholder={t("clock.newEvent")}
              value={title}
              onInput={(e) => setTitle(e.currentTarget.value)}
            />
            <button type="submit" class="islet-btn primary">
              {t("clock.save")}
            </button>
          </form>
        ) : (
          <button class="islet-btn islet-event-new" onClick={() => setAdding(true)}>
            <Icon name="plus" size={16} /> {t("clock.newEvent")}
          </button>
        )}
      </FlyoutSection>
    </div>
  );
}
