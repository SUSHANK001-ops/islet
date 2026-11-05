import { useEffect, useState } from "preact/hooks";
import { t } from "../../ui/i18n";
import { Icon } from "../../ui/controls/icon";
import { FlyoutSection } from "../flyout-shell";
import { buildMonthGrid, weekdayLabels, type DayCell } from "./month-grid";
import {
  eventsListMonth,
  eventAdd,
  eventToggle,
  eventDelete,
  type CalEvent,
} from "./bridge";

function isoToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export default function ClockFlyout() {
  const today = isoToday();
  const [now, setNow] = useState(() => new Date());
  const [view, setView] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [selectedDay, setSelectedDay] = useState(today);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("");

  // The seconds display exists only while this surface is mounted.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const monthKey = `${view.year}-${String(view.month + 1).padStart(2, "0")}`;
  async function refresh() {
    setEvents(await eventsListMonth(monthKey).catch(() => []));
  }
  useEffect(() => {
    let alive = true;
    eventsListMonth(monthKey)
      .then((items) => alive && setEvents(items))
      .catch(() => alive && setEvents([]));
    return () => {
      alive = false;
    };
  }, [monthKey]);

  const grid = buildMonthGrid(view.year, view.month, 0);
  const labels = weekdayLabels(0);
  const dayEvents = events.filter((event) => event.date === selectedDay);
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
    setView((current) => {
      const rawMonth = current.month + delta;
      const year = current.year + Math.floor(rawMonth / 12);
      const month = ((rawMonth % 12) + 12) % 12;
      setSelectedDay(`${year}-${String(month + 1).padStart(2, "0")}-01`);
      setAdding(false);
      return { year, month };
    });
  }

  async function submit() {
    const trimmed = title.trim();
    if (!trimmed) return;
    await eventAdd(trimmed, selectedDay, time || undefined).catch(() => null);
    setTitle("");
    setTime("");
    setAdding(false);
    await refresh();
  }

  async function toggle(id: string) {
    await eventToggle(id).catch(() => null);
    await refresh();
  }

  async function remove(id: string) {
    await eventDelete(id).catch(() => null);
    await refresh();
  }

  function cell(cellValue: DayCell) {
    const isToday = cellValue.date === today;
    const selected = cellValue.date === selectedDay;
    const count = events.filter((event) => event.date === cellValue.date).length;
    return (
      <button
        key={cellValue.date}
        type="button"
        class={`islet-cal-cell${cellValue.inMonth ? "" : " muted"}${
          isToday ? " today" : ""
        }${selected ? " selected" : ""}`}
        aria-pressed={selected}
        title={count ? t("clock.eventCount", { n: count }) : t("clock.addOnDate")}
        onClick={() => {
          setSelectedDay(cellValue.date);
          setAdding(true);
        }}
      >
        <span class="islet-num">{cellValue.day}</span>
        {count > 0 ? <span class="islet-cal-dot" aria-hidden="true" /> : null}
      </button>
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
          {labels.map((label) => (
            <div key={label} class="islet-cal-wd">{label}</div>
          ))}
          {grid.map(cell)}
        </div>
      </FlyoutSection>

      <section class="islet-day-popover" aria-label={t("clock.events", { date: selectedDay })}>
        <header class="islet-day-popover-head">
          <span>{selectedDay}</span>
          <button class="islet-sb-item" aria-label={t("clock.newEvent")} onClick={() => setAdding(true)}>
            <Icon name="plus" size={16} />
          </button>
        </header>

        {dayEvents.length > 0 ? (
          <ul class="islet-event-list">
            {dayEvents.map((event) => (
              <li key={event.id} class={`islet-event${event.completed ? " completed" : ""}`}>
                <button
                  class={`islet-event-check${event.completed ? " checked" : ""}`}
                  aria-label={t(event.completed ? "clock.reopenEvent" : "clock.completeEvent")}
                  aria-pressed={event.completed}
                  onClick={() => void toggle(event.id)}
                >
                  {event.completed ? <Icon name="checklist" size={14} /> : null}
                </button>
                <span class="islet-event-copy">
                  <span>{event.title}</span>
                  {event.time ? <time>{event.time}</time> : null}
                </span>
                <button class="islet-icon-btn" aria-label={t("clock.deleteEvent")} onClick={() => void remove(event.id)}>
                  <Icon name="close" size={15} />
                </button>
              </li>
            ))}
          </ul>
        ) : !adding ? (
          <p class="islet-dim">{t("clock.noEvents")}</p>
        ) : null}

        {adding ? (
          <form class="islet-event-add" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
            <input
              class="islet-input"
              autoFocus
              placeholder={t("clock.newEvent")}
              value={title}
              onInput={(event) => setTitle(event.currentTarget.value)}
            />
            <input
              class="islet-input islet-event-time"
              type="time"
              value={time}
              aria-label={t("clock.eventTime")}
              onInput={(event) => setTime(event.currentTarget.value)}
            />
            <button type="submit" class="islet-btn primary" disabled={!title.trim()}>
              {t("clock.save")}
            </button>
          </form>
        ) : null}
      </section>
    </div>
  );
}
