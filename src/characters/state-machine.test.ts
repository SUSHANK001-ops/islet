import { describe, it, expect } from "vitest";
import { resolveState, notchState, type CharacterSignals } from "./state-machine";
import type { Manifest } from "./bridge";

// Minimal manifest with the five required states plus an optional one, enough
// to exercise state selection without touching the DOM or the renderer.
function manifest(states: string[]): Manifest {
  const entries = Object.fromEntries(
    states.map((s) => [s, { frames: [0], fps: 6, loop: true }])
  );
  return {
    schemaVersion: 1,
    id: "test",
    name: "Test",
    version: "1.0.0",
    author: "t",
    license: "CC-BY-4.0",
    sheet: { file: "sheet.png", frameWidth: 32, frameHeight: 32, columns: 4, scale: 1, pixelArt: true },
    states: entries,
    moods: {},
    stages: [],
    personality: { energy: 0.5, chatty: 0.5, lazy: 0.5 },
    outfits: [],
  };
}

const ALL = ["idle", "working", "celebrating", "sleeping", "sad"];

function signals(partial: Partial<CharacterSignals>): CharacterSignals {
  return { focusing: false, justCompleted: false, hour: 12, closed: false, ...partial };
}

describe("resolveState (panel)", () => {
  const m = manifest(ALL);

  it("celebrates right after a completed round, over everything else", () => {
    expect(resolveState(m, signals({ justCompleted: true, focusing: true }))).toBe(
      "celebrating"
    );
  });

  it("works while focusing", () => {
    expect(resolveState(m, signals({ focusing: true }))).toBe("working");
  });

  it("rests via the mood map when not focusing (idle with no mood map)", () => {
    // This manifest defines no mood map, so the mood-driven resting state
    // falls back to idle regardless of the computed mood.
    expect(resolveState(m, signals({ hour: 3 }))).toBe("idle");
    expect(resolveState(m, signals({ hour: 14 }))).toBe("idle");
  });

  it("maps the tired mood to sleeping when the pack defines it", () => {
    const withMoods = manifest(ALL);
    withMoods.moods = { tired: "sleeping", proud: "celebrating" };
    // Small hours -> tired -> sleeping via the mood map.
    expect(resolveState(withMoods, signals({ hour: 3 }))).toBe("sleeping");
  });

  it("falls back to idle when a preferred state is missing", () => {
    const noCelebrate = manifest(["idle", "working", "sleeping", "sad"]);
    expect(
      resolveState(noCelebrate, signals({ justCompleted: true }))
    ).toBe("idle");
  });
});

describe("notchState (closed)", () => {
  const m = manifest(ALL);

  it("never plays working/celebrating in the notch, even while focusing", () => {
    const s = notchState(m, signals({ focusing: true, justCompleted: true }));
    expect(s).toBe("idle");
  });

  it("may sleep late at night", () => {
    expect(notchState(m, signals({ hour: 3 }))).toBe("sleeping");
  });

  it("uses idle if sleeping is not defined", () => {
    const noSleep = manifest(["idle", "working", "celebrating", "sad"]);
    expect(notchState(noSleep, signals({ hour: 3 }))).toBe("idle");
  });
});
