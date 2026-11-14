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
  "tab.ai": "Companion",
  "tab.agents": "Agents",
  "tab.settings": "Settings",
  "tab.clock": "Clock",
  "tab.sound": "Sound",
  "tab.battery": "Battery",
  "tab.quick": "Quick settings",
  "tab.notifications": "Notifications",
  "tab.system": "System",
  "tab.nav": "Sections",

  "notch.collapse": "Collapse",
  "settings.moveUp": "Move up",
  "settings.moveDown": "Move down",

  "clock.prev": "Previous month",
  "clock.next": "Next month",
  "clock.events": "Events · {date}",
  "clock.noEvents": "No events",
  "clock.newEvent": "New event",
  "clock.eventNote": "Write the event or reminder…",
  "clock.save": "Save",
  "clock.deleteEvent": "Delete event",
  "clock.completeEvent": "Complete event",
  "clock.reopenEvent": "Mark event incomplete",
  "clock.eventTime": "Event time",
  "clock.addOnDate": "Add an event on this date",
  "clock.eventCount": "{n} events",

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
  "settings.openOnHover": "Open panel on hover",
  "settings.visibility": "Pill visibility",
  "settings.visibility.always": "Always visible",
  "settings.visibility.autoHide": "Auto-hide",
  "settings.visibility.hidden": "Hidden (hotkey only)",
  "settings.autohideDelay": "Auto-hide delay",
  "settings.autohideFiveSeconds": "5 seconds",

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
  "focus.customShort": "Minutes",

  "tasks.add": "Add a task…",
  "tasks.addAction": "Add task",
  "tasks.empty": "No tasks yet. Add one above.",
  "tasks.delete": "Delete task",
  "tasks.openCount": "{n} open",
  "tasks.error": "Couldn’t load your tasks. Try reopening the panel.",
  "tasks.clearDone": "Clear completed",
  "tasks.remaining": "{n} left",
  "tasks.allDone": "All done",

  "notes.add": "Write a quick note…",
  "notes.addAction": "Add note",
  "notes.empty": "No notes yet.",
  "notes.delete": "Delete note",
  "notes.save": "Save",
  "notes.saved": "Saved",
  "notes.error": "Couldn’t load your notes. Try reopening the panel.",
  "notes.hint": "Enter to add · Shift+Enter for a new line",

  "media.nothing": "Nothing playing",
  "media.previous": "Previous",
  "media.playPause": "Play / Pause",
  "media.next": "Next",
  "media.unknownArtist": "Unknown artist",
  "media.openYtMusic": "Open YouTube Music",
  "media.openHint": "Play in your browser, control it here.",

  "launcher.add": "Add installed app",
  "launcher.remove": "Remove app",
  "launcher.rename": "Rename app",
  "launcher.renamePlaceholder": "App name",
  "launcher.saveName": "Save name",
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
  "settings.character.browse": "Browse online",
  "settings.credits": "Credits",

  "browse.intro":
    "Browse free characters from the Islet catalog. Nothing is downloaded until you choose Install.",
  "browse.open": "Browse characters",
  "browse.notConfigured": "Catalog not set up yet. You can still import a character from a file.",
  "browse.empty": "No characters in the catalog yet.",
  "browse.retry": "Try again",
  "browse.install": "Install",
  "browse.installing": "Installing…",
  "browse.installed": "Installed",

  "net.title": "Network & privacy",
  "net.intro":
    "Islet works fully offline. Online features (like the AI companion) only reach the hosts listed here, and every request is logged below.",
  "net.airplane": "Airplane mode (block all network)",
  "net.airplaneOn":
    "Airplane mode is on. Islet will not make any network request until you turn it off.",
  "net.hostsTitle": "Allowed hosts",
  "net.hostsEmpty":
    "No hosts allowed yet. They appear here when you turn on an online feature.",
  "net.feature": "Feature",
  "net.remove": "Remove host",
  "net.ledgerTitle": "What left this PC",
  "net.ledgerEmpty": "Nothing has left this PC.",
  "net.ledgerClear": "Clear log",
  "net.result.ok": "Sent",
  "net.result.rejected": "Blocked",
  "net.result.error": "Failed",
  "net.bytes": "{out} sent · {in} received",

  "ai.notConfigured": "Your companion is resting.",
  "ai.notConfiguredHint":
    "Add an AI key in Settings → AI companion to let Pip chat and coach. Islet never sends anything until you turn it on.",
  "ai.greeting": "Hi! I'm Pip. Ask me anything, or tell me what you're working on.",
  "ai.placeholder": "Message your companion…",
  "ai.send": "Send",
  "ai.thinking": "Thinking",
  "ai.error": "Couldn't reach the AI. Check your key and network settings.",
  "ai.consent.title": "Let the companion go online?",
  "ai.consent.body":
    "Islet will send your messages to {host}. Nothing else leaves your PC. You can turn this off any time in Network settings.",
  "ai.consent.declined": "No problem — the companion stays offline.",
  "ai.coach.focus25": "Start a 25-min focus",
  "ai.coach.plan": "Help me plan",
  "ai.coach.stuck": "I'm stuck",
  "ai.coach.planPrompt":
    "Help me plan my next hour. Ask me what I'm working on, then suggest 2-3 short steps.",
  "ai.coach.stuckPrompt":
    "I feel stuck and can't start. Give me one tiny first step and a short pep talk.",
  "ai.coach.startedPrompt":
    "I just started a {minutes}-minute focus round. Give me a short, upbeat send-off.",

  "settings.ai": "AI companion",
  "settings.ai.intro":
    "Bring your own API key for an OpenAI-compatible provider (Groq, OpenAI, OpenRouter…). The key is stored only on this PC and is sent only to the provider you choose.",
  "settings.ai.enabled": "Enable AI companion",
  "settings.ai.baseUrl": "Provider base URL",
  "settings.ai.model": "Model",
  "settings.ai.key": "API key",
  "settings.ai.keySet": "A key is saved. Type to replace it.",
  "settings.ai.keyPlaceholder": "Paste your API key",
  "settings.ai.shareContext": "Share my tasks & focus with the companion",
  "settings.ai.shareContextHint":
    "When on, Islet adds a short summary of your own open tasks and focus rounds to the prompt. Never your files or other apps.",
  "settings.ai.save": "Save",
  "settings.ai.saved": "Saved.",
  "settings.ai.saveFailed": "Could not save. Check the base URL is https.",

  "agents.intro":
    "See what a supported local coding agent is doing and approve its requests here. Islet only watches and records your decision — it never runs anything itself.",
  "agents.empty": "No agent activity.",
  "agents.emptyHint":
    "When a supported agent writes to Islet's inbox, its actions and approval requests show up here.",
  "agents.clear": "Clear",
  "agents.approve": "Approve",
  "agents.decline": "Decline",
  "agents.approved": "Approved",
  "agents.declined": "Declined",
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
