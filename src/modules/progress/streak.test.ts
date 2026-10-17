import { describe, it, expect } from "vitest";
import {
  totalMinutes,
  currentStreak,
  longestStreak,
  heatLevel,
} from "./streak";
import type { DaySummary } from "./bridge";

function day(date: string, focusCount: number, focusMinutes = focusCount * 25): DaySummary {
  return { date, focusCount, focusMinutes };
}

describe("totalMinutes", () => {
  it("sums focus minutes", () => {
    expect(totalMinutes([day("a", 1, 25), day("b", 2, 50)])).toBe(75);
  });
});

describe("currentStreak", () => {
  it("counts consecutive active days back from the end", () => {
    const days = [day("1", 0), day("2", 1), day("3", 2), day("4", 1)];
    expect(currentStreak(days)).toBe(3);
  });
  it("allows an empty today without breaking the prior streak", () => {
    const days = [day("1", 1), day("2", 1), day("3", 0)];
    expect(currentStreak(days)).toBe(2);
  });
  it("is zero with no activity", () => {
    expect(currentStreak([day("1", 0), day("2", 0)])).toBe(0);
  });
});

describe("longestStreak", () => {
  it("finds the best run anywhere", () => {
    const days = [day("1", 1), day("2", 1), day("3", 0), day("4", 1), day("5", 1), day("6", 1)];
    expect(longestStreak(days)).toBe(3);
  });
});

describe("heatLevel", () => {
  it("buckets counts into 0..4", () => {
    expect(heatLevel(0)).toBe(0);
    expect(heatLevel(2)).toBe(1);
    expect(heatLevel(4)).toBe(2);
    expect(heatLevel(6)).toBe(3);
    expect(heatLevel(9)).toBe(4);
  });
});
