import { describe, it, expect } from "vitest";
import { buildMonthGrid, daysInMonth } from "./month-grid";

describe("month-grid", () => {
  it("always returns 42 cells (6 weeks)", () => {
    expect(buildMonthGrid(2026, 9, 0)).toHaveLength(42);
    expect(buildMonthGrid(2024, 1, 1)).toHaveLength(42); // leap Feb
  });

  it("marks in-month vs leading/trailing correctly", () => {
    // October 2026: Oct 1 is a Thursday (dow 4). Sunday-start -> 4 lead cells.
    const grid = buildMonthGrid(2026, 9, 0);
    const lead = grid.filter((c, i) => i < 4);
    expect(lead.every((c) => !c.inMonth)).toBe(true);
    expect(grid[4].inMonth).toBe(true);
    expect(grid[4].day).toBe(1);
    expect(grid[4].date).toBe("2026-10-01");
  });

  it("honors a Monday week start", () => {
    // Monday-start shifts the lead count by one relative to Sunday-start.
    const sun = buildMonthGrid(2026, 9, 0);
    const mon = buildMonthGrid(2026, 9, 1);
    expect(sun[0].date).not.toBe(mon[0].date);
  });

  it("daysInMonth handles leap years", () => {
    expect(daysInMonth(2024, 1)).toBe(29);
    expect(daysInMonth(2026, 1)).toBe(28);
    expect(daysInMonth(2026, 0)).toBe(31);
  });
});
