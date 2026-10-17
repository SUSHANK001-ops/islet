// Tiny translation layer. All user-facing text goes through `t()` so nothing
// is hardcoded (AGENTS.md Definition of Done). This is intentionally minimal:
// a flat key -> string map per locale, English only for now. Spec 2+ can load
// locale files; the call sites never change.

export type Locale = "en";

type Strings = Record<string, string>;

const en: Strings = {
  "app.tagline": "focus companion",

  "tab.focus": "Focus",
  "tab.tasks": "Tasks",
  "tab.notes": "Notes",
  "tab.media": "Media",
  "tab.launcher": "Apps",
  "tab.settings": "Settings",

  "common.comingSoon": "Coming soon",
  "common.loading": "Loading…",
  "common.error": "Something went wrong",
  "common.on": "On",
  "common.off": "Off",
  "common.allow": "Allow",
  "common.notNow": "Not now",

  "settings.title": "Settings",
  "settings.theme": "Theme",
  "settings.theme.light": "Light",
  "settings.theme.dark": "Dark",
  "settings.monitor": "Monitor",
  "settings.monitor.primary": "Primary",
  "settings.startup": "Launch at startup",
  "settings.hotkey": "Toggle shortcut",
  "settings.tabs": "Tabs",
  "settings.notchPosition": "Notch position",
  "settings.notchPosition.left": "Left",
  "settings.notchPosition.center": "Center",
  "settings.notchPosition.right": "Right",
  "settings.notchOpacity": "Notch transparency",
  "settings.hideFromCapture": "Hide from screen capture",
  "settings.gameMode": "Game mode (hide in full-screen)",

  "settings.character": "Character",
  "settings.character.inNotch": "Show in notch",
  "settings.character.none": "None",
  "settings.character.import": "Import…",
  "settings.character.delete": "Delete",
  "settings.character.active": "Active",
  "settings.character.invalid": "Needs attention",
  "settings.character.empty": "No characters yet. Import one to get started.",
  "settings.character.imported": "Imported “{name}”.",
  "settings.character.importFailed": "That folder is not a valid character pack.",

  "character.unavailable":
    "Your character’s artwork isn’t ready yet. Drop sheet.png into its pack folder.",

  "notch.drag": "Drag to move",
  "settings.notchPosition.reset": "Reset position",

  "hotkey.conflict":
    "The shortcut {combo} is in use by another app. Open the tray icon to toggle Islet instead.",

  "perm.notifications.title": "Allow notifications?",
  "perm.notifications.body":
    "Islet can tell you when a focus round ends. You can change this later in Settings.",

  "focus.idle": "Ready to focus",
  "focus.working": "Focusing",
  "focus.shortBreak": "Short break",
  "focus.longBreak": "Long break",
  "focus.start": "Start",
  "focus.pause": "Pause",
  "focus.resume": "Resume",
  "focus.reset": "Reset",
  "focus.preset": "{min} min",
  "focus.round": "Round {n} of {total}",
  "focus.todayCount": "{n} done today",
  "focus.minutes": "min",
  "focus.customMinutes": "Custom minutes",

  "tasks.add": "Add a task…",
  "tasks.empty": "No tasks yet. Add one above.",
  "tasks.delete": "Delete task",
  "tasks.openCount": "{n} open",

  "notes.add": "Write a quick note…",
  "notes.empty": "No notes yet.",
  "notes.delete": "Delete note",
  "notes.save": "Save",

  "media.nothing": "Nothing playing",
  "media.previous": "Previous",
  "media.playPause": "Play / Pause",
  "media.next": "Next",
  "media.unknownArtist": "Unknown artist",
  "media.openYtMusic": "Open YouTube Music",
  "media.openHint": "Play in your browser, control it here.",

  "launcher.add": "Add an app…",
  "launcher.remove": "Remove app",
  "launcher.empty": "No apps yet. Add one to launch it from here.",
};

const locales: Record<Locale, Strings> = { en };

let current: Locale = "en";

export function setLocale(locale: Locale): void {
  current = locale;
}

/**
 * Look up a translation. Supports {name} placeholders filled from `vars`.
 * Falls back to the key itself if missing, so a missing string is visible in
 * dev rather than crashing.
 */
export function t(key: string, vars?: Record<string, string | number>): string {
  const raw = locales[current][key] ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, name) =>
    name in vars ? String(vars[name]) : `{${name}}`
  );
}
