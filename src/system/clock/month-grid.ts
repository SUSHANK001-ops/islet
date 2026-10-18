// Pure month-grid builder (Spec 11). No DOM, no Date mutation side effects —
// fully unit-testable. Produces a 6-row x 7-col grid of day cells for a given
// year/month, honoring the week-start day (0 = Sunday, 1 = Monday).

export interface DayCell {
  /** Day of month 1..31. */
  day: number;
  /** True when this cell belongs to the shown month (vs leading/trailing). */
  inMonth: boolean;
  /** ISO date YYYY-MM-DD for this cell. */
  date: string;
}

function iso(y: number, m0: number, d: number): string {
  const mm = String(m0 + 1).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

/** Days in month m0 (0-based) of year y. */
export function daysInMonth(y: number, m0: number): number {
  return new Date(y, m0 + 1, 0).getDate();
}

/**
 * Build the calendar grid for year `y`, month `m0` (0-based), with weeks
 * starting on `weekStart` (0=Sun, 1=Mon). Always returns 42 cells (6 weeks) so
 * the grid height never jumps month to month.
 */
export function buildMonthGrid(
  y: number,
  m0: number,
  weekStart: 0 | 1 = 0
): DayCell[] {
  const firstDow = new Date(y, m0, 1).getDay(); // 0..6, Sun=0
  // How many leading cells from the previous month.
  const lead = (firstDow - weekStart + 7) % 7;

  const thisCount = daysInMonth(y, m0);
  const prevMonth = m0 === 0 ? 11 : m0 - 1;
  const prevYear = m0 === 0 ? y - 1 : y;
  const prevCount = daysInMonth(prevYear, prevMonth);

  const cells: DayCell[] = [];

  // Leading days from previous month.
  for (let i = lead - 1; i >= 0; i--) {
    const d = prevCount - i;
    cells.push({ day: d, inMonth: false, date: iso(prevYear, prevMonth, d) });
  }
  // This month.
  for (let d = 1; d <= thisCount; d++) {
    cells.push({ day: d, inMonth: true, date: iso(y, m0, d) });
  }
  // Trailing days to fill 42 cells.
  const nextMonth = m0 === 11 ? 0 : m0 + 1;
  const nextYear = m0 === 11 ? y + 1 : y;
  let d = 1;
  while (cells.length < 42) {
    cells.push({ day: d, inMonth: false, date: iso(nextYear, nextMonth, d) });
    d++;
  }
  return cells;
}

/** Weekday short labels ordered by week start, via Intl for the OS locale. */
export function weekdayLabels(weekStart: 0 | 1 = 0): string[] {
  const base = new Date(2023, 0, 1); // a Sunday
  const fmt = new Intl.DateTimeFormat(undefined, { weekday: "short" });
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + ((i + weekStart) % 7));
    out.push(fmt.format(d));
  }
  return out;
}
