import { describe, it, expect, beforeEach } from "vitest";
import {
  settings,
  updateSettings,
  moveTab,
  toggleTab,
  enabledTabs,
} from "./settings-store";

describe("settings-store", () => {
  beforeEach(() => {
    // Reset to a known order/state before each test.
    settings.value = {
      schemaVersion: 1,
      theme: "dark",
      monitorName: null,
      launchAtStartup: false,
      tabs: [
        { id: "focus", enabled: true },
        { id: "tasks", enabled: true },
        { id: "notes", enabled: true },
        { id: "media", enabled: true },
      ],
    };
  });

  it("merges a partial update", () => {
    updateSettings({ theme: "light", launchAtStartup: true });
    expect(settings.value.theme).toBe("light");
    expect(settings.value.launchAtStartup).toBe(true);
    // Untouched fields remain.
    expect(settings.value.monitorName).toBe(null);
  });

  it("moves a tab down and up", () => {
    moveTab("focus", 1);
    expect(settings.value.tabs.map((t) => t.id)).toEqual([
      "tasks",
      "focus",
      "notes",
      "media",
    ]);
    moveTab("focus", -1);
    expect(settings.value.tabs.map((t) => t.id)).toEqual([
      "focus",
      "tasks",
      "notes",
      "media",
    ]);
  });

  it("does not move past the ends", () => {
    moveTab("focus", -1);
    expect(settings.value.tabs[0].id).toBe("focus");
    moveTab("media", 1);
    expect(settings.value.tabs[3].id).toBe("media");
  });

  it("toggles a tab and filters enabled ones in order", () => {
    toggleTab("tasks");
    expect(enabledTabs().map((t) => t.id)).toEqual(["focus", "notes", "media"]);
  });
});
