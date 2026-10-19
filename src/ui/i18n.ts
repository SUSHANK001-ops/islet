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
  "tab.progress": "Progress",
  "tab.settings": "Settings",
  "tab.clock": "Clock",
  "tab.sound": "Sound",
  "tab.battery": "Battery",
  "tab.quick": "Quick settings",
  "tab.notifications": "Notifications",
  "tab.system": "System",

  "notch.collapse": "Collapse",

  "clock.prev": "Previous month",
  "clock.next": "Next month",
  "clock.events": "Events · {date}",
  "clock.noEvents": "No events",
  "clock.newEvent": "New event",
  "clock.save": "Save",
  "clock.deleteEvent": "Delete event",

  "sound.unsupported": "No audio device found",
  "sound.mute": "Mute",
  "sound.unmute": "Unmute",
  "sound.mixer": "Mixer",
  "sound.defaultDevice": "Default device",

  "power.title": "Power",
  "power.plan": "Plan",
  "power.efficiency": "Efficiency",
  "power.balanced": "Balanced",
  "power.performance": "Performance",
  "power.charging": "Charging",
  "power.onBattery": "On battery",
  "power.openSettings": "Open Windows settings",

  "quick.wifi": "Wi-Fi",
  "quick.bluetooth": "Bluetooth",
  "quick.connected": "Connected",
  "quick.dnd": "Do not disturb",
  "quick.viaSettings": "In Settings",
  "quick.project": "Project",
  "quick.accessibility": "Accessibility",
  "quick.more": "More Windows controls",

  "notif.empty": "No notifications",
  "notif.clear": "Clear",
  "notif.expand": "Expand",
  "notif.close": "Close",
  "pillStyle.offer.title": "Try the status bar?",
  "pillStyle.offer.body":
    "Show live system items — clock, sound, battery and more — right on the pill.",
  "pillStyle.offer.try": "Use status bar",
  "pillStyle.offer.keep": "Keep notch",
  "settings.pillStyle": "Pill style",
  "settings.pillStyle.notch": "Notch",
  "settings.pillStyle.statusBar": "Status bar",
  "settings.openOnHover": "Open items on hover",
  "settings.visibility": "Pill visibility",
  "settings.visibility.always": "Always visible",
  "settings.visibility.autoHide": "Auto-hide",
  "settings.visibility.hidden": "Hidden (hotkey only)",
  "settings.autohideDelay": "Auto-hide delay",

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

  "progress.streak": "Day streak",
  "progress.best": "Best streak",
  "progress.hours": "Focus hours",
  "progress.heatmap": "Focus heatmap",
  "progress.empty": "Finish a focus round to start your streak.",

  "settings.character.export": "Export…",
  "settings.character.exportFile": "Export a character",
  "settings.character.importFile": "Import file…",
  "settings.character.exported": "Exported “{name}”.",
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
