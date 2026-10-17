import { describe, it, expect } from "vitest";
import {
  computeMood,
  moodState,
  resolveStage,
  timingNudges,
  type MoodInput,
} from "./mood";
import type { Manifest } from "./bridge";

function input(partial: Partial<MoodInput>): MoodInput {
  return {
    roundsToday: 0,
    skippedBreaks: 0,
    idleMinutes: 0,
    hour: 12,
    justCompleted: false,
    ...partial,
  };
}

function manifest(over: Partial<Manifest> = {}): Manifest {
  return {
    schemaVersion: 1,
    id: "t",
    name: "T",
    version: "1.0.0",
    author: "a",
    license: "CC-BY-4.0",
    sheet: { file: "sheet.png", frameWidth: 32, frameHeight: 32, columns: 4, scale: 1, pixelArt: true },
    states: {
      idle: { frames: [0], fps: 6, loop: true },
      working: { frames: [1], fps: 8, loop: true },
      celebrating: { frames: [2], fps: 10, loop: false },
      sleeping: { frames: [3], fps: 2, loop: true },
      sad: { frames: [4], fps: 4, loop: true },
    },
    moods: { happy: "idle", tired: "sleeping", bored: "sad", proud: "celebrating" },
    stages: [],
    personality: { energy: 0.5, chatty: 0.5, lazy: 0.5 },
    outfits: [],
    ...over,
  };
}

describe("computeMood", () => {
  it("is proud right after a completion", () => {
    expect(computeMood(input({ justCompleted: true }))).toBe("proud");
  });
  it("is proud on a very productive day", () => {
    expect(computeMood(input({ roundsToday: 4 }))).toBe("proud");
  });
  it("is tired in the small hours", () => {
    expect(computeMood(input({ hour: 3 }))).toBe("tired");
  });
  it("is tired after a long idle stretch", () => {
    expect(computeMood(input({ idleMinutes: 45 }))).toBe("tired");
  });
  it("is bored when idle a while with nothing done", () => {
    expect(computeMood(input({ idleMinutes: 15, roundsToday: 0 }))).toBe("bored");
  });
  it("is happy by default", () => {
    expect(computeMood(input({ hour: 14, roundsToday: 1 }))).toBe("happy");
  });
});

describe("moodState", () => {
  const m = manifest();
  it("maps a mood to the pack's state", () => {
    expect(moodState(m, "tired")).toBe("sleeping");
    expect(moodState(m, "proud")).toBe("celebrating");
  });
  it("falls back to idle when the mood or target is missing", () => {
    const noMap = manifest({ moods: {} });
    expect(moodState(noMap, "tired")).toBe("idle");
    const badTarget = manifest({ moods: { tired: "nope" } });
    expect(moodState(badTarget, "tired")).toBe("idle");
  });
});

describe("resolveStage", () => {
  const staged = manifest({
    stages: [
      { id: "spore", minFocusMinutes: 0, sheet: "sheet.png" },
      { id: "bubbly", minFocusMinutes: 600, sheet: "stages/bubbly.png" },
      { id: "mighty", minFocusMinutes: 3000, sheet: "stages/mighty.png" },
    ],
  });

  it("returns null when there are no stages", () => {
    expect(resolveStage(manifest(), 10000)).toBeNull();
  });
  it("picks the first stage for a new user", () => {
    expect(resolveStage(staged, 0)?.id).toBe("spore");
  });
  it("advances with total focus minutes", () => {
    expect(resolveStage(staged, 700)?.id).toBe("bubbly");
    expect(resolveStage(staged, 5000)?.id).toBe("mighty");
  });
  it("does not exceed the highest reached stage", () => {
    expect(resolveStage(staged, 2999)?.id).toBe("bubbly");
  });
});

describe("timingNudges", () => {
  it("clamps out-of-range personality values", () => {
    const wild = manifest({ personality: { energy: 5, chatty: -2, lazy: 2 } });
    const n = timingNudges(wild);
    expect(n.idleIntervalScale).toBeGreaterThanOrEqual(0.5);
    expect(n.fidgetEverySecs).toBeGreaterThanOrEqual(6);
  });
  it("makes lazy characters animate slower than energetic ones", () => {
    const lazy = timingNudges(manifest({ personality: { energy: 0, chatty: 0, lazy: 1 } }));
    const energetic = timingNudges(manifest({ personality: { energy: 1, chatty: 1, lazy: 0 } }));
    expect(lazy.idleIntervalScale).toBeGreaterThan(energetic.idleIntervalScale);
    expect(energetic.fidgetEverySecs).toBeLessThan(lazy.fidgetEverySecs);
  });
});
