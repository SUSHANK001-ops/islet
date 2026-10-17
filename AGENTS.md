# Islet v2 - guide for Kiro and contributors

"Islet" is a working name. Keep the name in ONE config value so it can change
later (`src/app.config.ts` and `src-tauri/src/app_config.rs`).

> This is the **v2** spec. It supersedes the original v1 guide. v1 shipped the
> shell, storage, focus, tasks, notes and media (specs 0-5). v2 is where the
> product gets its soul: a living character in the notch, a notch you can place
> anywhere, a panel that stretches to fit, a safe user-curated app launcher,
> and a hand-built animated UI that feels nothing like a generic template.
> Changes to the rules below are deliberate and reviewed - never edited away
> silently.

## What we are building

A Windows app. A small black pill (the "notch") sits at the top of the screen.
A character lives inside it. Hover or click and it opens into a panel of tabs.
It is a focus and study companion with a character that has moods and grows
over time, and a few power-user conveniences around it.

- Windows 10 (version 2004 or later) and Windows 11.
- No AI in v2. No account. No analytics. No telemetry. No servers.
- The character is DATA (images + JSON), never code. See `CHARACTERS.md`.

## Hard rules (read these first)

1. **Performance is a feature.** The app must feel like it is not running. See
   "Performance budgets". A feature that breaks a budget is not done. When a new
   feature needs more budget, change the budget table in a reviewed edit and say
   why - never ignore it silently.
2. **Event-driven first, polling only with a written reason.** Prefer Windows
   events. If no event exists, poll at the slowest safe rate, only while needed,
   and write why in `docs/windows-notes.md`.
3. **Scope is this file.** Build what v2 scope lists. A new idea that is not in
   scope goes to `docs/ideas.md` with what it would need, not into the code.
4. **Privacy by default.** Nothing leaves the PC. Ask for a permission only when
   the feature that needs it is first used, on the notch surface.
5. **Small steps.** One spec = 5 to 8 requirements. One task = one small, tested
   change.
6. **Do not guess Windows behavior.** Test it, measure it, and write the result
   in `docs/windows-notes.md`.
7. **No new dependency without a reason** written in the PR or task: what it
   does, its size, why we cannot write it in under ~100 lines.
8. **The frontend is sandboxed.** It may call ONLY the commands in
   `commands.rs`. No raw shell, no raw file access, no arbitrary process launch
   from the frontend. See "Security rules" for how the app launcher stays safe.

## Tech stack (fixed)

- **Shell:** Tauri v2 (Rust backend + WebView2). Not Electron.
- **Frontend:** TypeScript + Preact + Vite. Plain CSS with design tokens. No UI
  kit, no CSS framework. The look is hand-built (see "UI and motion").
- **Characters:** Canvas 2D drawing from sprite sheets.
- **Storage:** versioned JSON files in the app data folder. No database in v2.
- **Tests:** `cargo test` (Rust), `vitest` (frontend), JSON Schema validation
  for all data files.
- Check the current Tauri v2 docs before using any window API. Do not rely on
  memory.

## Performance budgets

These are TARGETS. Spec 0 (the spike) measures real numbers. If a target is
wrong, change this table in a reviewed edit. Never ignore it silently.

| Item | Target |
|---|---|
| Installer size | 15 MB or less |
| Start to usable pill | 1 second or less |
| CPU, pill closed, character idle in notch | under 0.8% average over 5 minutes |
| CPU, pill closed, notch animation OFF | under 0.3% average over 5 minutes |
| CPU, panel open, character animating | under 2.5% average |
| Memory, pill closed (whole process tree incl. WebView2) | 90 MB or less |
| Memory, panel open | 140 MB or less |
| Disk writes | at most 1 per 5 seconds, always debounced |
| Battery saver / on battery | notch animation stops; panel animation slows |

### What changed from v1 and why

The closed-CPU and memory budgets were raised **deliberately** to pay for the
living notch. v1 said "closed means fully asleep". v2 keeps a *small* animation
budget for the notch so the character can breathe/blink while closed - but only
within the new budget, and it must stop instantly on lock, battery saver, or a
fullscreen app. The "fully asleep" number is still tracked (the 0.3% row) so we
know the cost of the notch animation and can turn it off.

### Rules that make the budgets true

- **One webview window** for the island. A second window only with a written
  reason and a measured cost.
- **Closed is cheap, not necessarily asleep.** When the panel is closed, the
  character may run a LOW-RATE notch animation (see "Character in the notch").
  The focus timer keeps running in Rust. Everything else (tab code, panel work,
  module UI) is idle.
- **Hard stop conditions.** The notch animation and all `requestAnimationFrame`
  loops stop immediately when: the screen is locked, the system is sleeping, a
  fullscreen app is foreground, battery saver is on, or the machine is on
  battery (configurable). These are event-driven, not polled.
- **One timer engine in Rust** (`scheduler/`). Modules do not create their own
  timers or threads. The frontend gets ticks only while it is actually drawing.
- **Animation rates:** notch (closed) at most 6 fps and only when idle-breathing
  is on; panel idle 8 fps; panel active at most 24 fps. Draw with canvas. No DOM
  or CSS animation for the character. No `backdrop-filter`, no big blur, no large
  shadows anywhere.
- **Images:** decode each sprite sheet ONCE into an `ImageBitmap`. Keep only the
  active character in memory. Free it when switching. The notch and the panel
  share the one decoded bitmap.
- **Lazy loading:** load a tab's code only when it opens (dynamic import). Start
  a Rust module only when its switch is on.
- **Windows signals, not polling:** power state, session lock/unlock, media
  changes, display changes, fullscreen changes. Document any unavoidable poll.
- **Memory:** no unbounded lists. Logs and history use ring buffers or daily
  files.
- **Disk:** write to a temp file, then rename (atomic). Debounce writes.
- **Startup:** show the pill first. Load everything else after the first paint.
- **Bundle:** no source maps in release, tree-shake, CI prints a size report
  that fails if the installer is over budget.
- **Perf check:** `scripts/perf-check` runs the app closed (notch on AND off)
  and open, records CPU and memory, and fails if a budget is broken. Run it
  before every release and after every spec.

## UI and motion (the "best of the best" bar)

The UI is a product surface, not a wrapper. Hold it to this bar:

- **Hand-built, not generic.** No stock component kit, no default-looking
  cards/toggles. Every control is ours and matches the Islet identity (a calm,
  tactile, slightly playful "little desk companion").
- **Everything moves, cheaply.** Opening the panel is a spring, not a cut. Tabs
  cross-fade and slide. Toggles, buttons and list rows have state-driven
  micro-interactions. Motion is driven by transforms and opacity only (GPU
  friendly), never layout thrash, never `backdrop-filter`.
- **The character is the hero.** It reacts to what you do: starts "working" when
  a focus round starts, "celebrates" on completion, droops when you skip breaks,
  sleeps late at night. The notch is alive even when closed.
- **Respects reduced motion.** Honor `prefers-reduced-motion`; fall back to
  instant or minimal transitions. Honor battery saver by slowing/stopping.
- **One coherent design system.** Tokens in `src/ui/tokens.css` (color, space,
  radius, motion curves, durations). Light and dark themes. Nothing hardcoded.
- **Accessible.** Keyboard reachable, focus-visible rings, ARIA roles on
  dialogs/tabs, sufficient contrast in both themes. No color-only signals.
- **Empty, loading, error states everywhere.** Never a blank panel or a raw
  error string.

## Architecture

```
src-tauri/src/
  main.rs
  window/        island window: position (incl. free-placement), monitors, DPI,
                 click-through, fullscreen detect, stretch sizing
  platform/      Windows-only: power, session lock, media (SMTC), battery,
                 taskbar progress, capture exclusion, fullscreen/game detect
  scheduler/     the single timer engine
  store/         versioned JSON + atomic writes + migrations
  launcher/      user-curated app launcher: saved entries + validated launch
  modules/<name>/  one folder per feature (focus, tasks, notes, media, ...)
  characters/    pack loader + validator (Rust side is the source of truth)
  commands.rs    the only functions the frontend may call
src/
  app/           shell, notch, tab bar, routing, placement/drag, motion
  modules/<name>/  one folder per feature panel (lazy loaded)
  characters/    renderer (notch + panel), state machine, mood logic
  ui/            shared components, design tokens, motion primitives
packs/characters/<id>/   built-in characters (data only)
shared/schemas/          JSON Schemas (character, settings, launcher, ...)
docs/                    windows-notes.md, ideas.md, perf-results.md
scripts/                 perf-check, validate-character, size-report
```

### Module rules

- A module = its own folder (Rust + frontend). Adding a module = its own files +
  one line in the module list. It must not edit other modules.
- Modules never call each other. They publish data to a shared **hub** (tasks,
  next event, focus clock, tally, mood signals) and write events to the
  **activity log** (`focus.completed`, `task.completed`, `break.taken`, ...).
  Other parts read the hub and the log. The character reads the hub to pick a
  mood; it never reaches into a module.
- Every module has `start()` and `stop()`. The lifecycle follows its switch.
- Design empty, loading and error states. Never show a blank panel.

### Data rules

- Every saved file has `schemaVersion`. Changes are new migration steps. Never
  edit a migration that has shipped. Test every migration.
- Data lives in the app data folder, not a hardcoded path.
- Activity log: one small JSON file per day.

### Security rules

- The frontend can call only the commands listed in `commands.rs`. No raw shell,
  no raw file access from the frontend.
- Character packs and imported files are untrusted. Validate in Rust. See
  `CHARACTERS.md`.
- No remote code, no remote images.
- **App launcher (v2, safe by construction).** The launcher lets the user open
  apps they themselves added. It does NOT give the frontend the ability to run
  arbitrary programs. The contract:
  - The user adds an app explicitly through an OS file picker (the picker is the
    consent). Rust records a launcher entry: a stable id, a display name, and
    the validated executable/shortcut path.
  - Rust validates each path on add AND on launch: it must point to an existing
    file with an allowed extension (`.exe`, `.lnk`, `.url`, `.bat` is rejected),
    no UNC/remote paths, path canonicalized, no injection of extra arguments
    from the frontend.
  - The frontend can only call `launcher_list`, `launcher_add` (opens the
    picker), `launcher_remove`, and `launcher_launch(id)`. It can NEVER pass a
    path or command string to launch. `launcher_launch` takes an id and Rust
    looks up the saved, re-validated entry.
  - This is the ONLY way to open apps. The old allow-listed "Open YouTube Music"
    button stays as a fixed URL open.

## v2 scope

### Carried over from v1 (already built, keep working)
- Island shell, focus timer, tasks and notes, media (SMTC now-playing +
  transport), versioned storage/settings, tray, hotkey, launch-at-startup,
  themes, tabs on/off + order, on-notch permission surface, translatable text.

### New in v2 (build these)
- **Living notch character.** The active character renders INSIDE the closed
  pill and animates at a low rate (idle breathing/blink), within the closed-CPU
  budget, stopping on lock/sleep/fullscreen/battery-saver. Opening the panel
  promotes it to full animation; the panel and notch share one decoded bitmap.
- **Character engine v1 (was spec 6).** Loader, validator, renderer (notch +
  panel), state machine, import, switch, delete, validation. A **SpongeBob-style
  cartoon sample pack** ships built-in as the default (data only; art is dropped
  into the pack - never code, never redrawn by the agent).
- **Moods, growth, personality (was spec 7).** App decides mood from real habits
  (finished rounds, skipped breaks, idle, late hours); growth stage from total
  focus minutes; personality nudges small timings. Pack stays pure data.
- **Notch controls.** A small on-notch switch to show/hide the character and to
  quick-switch the active character. Reachable by keyboard.
- **Place anywhere.** The notch can be dragged to any position on any monitor,
  not just top left/center/right. Position persists, is DPI-correct, and is
  clamped to stay on-screen. Presets (top-left / top-center / top-right) remain
  as one-click snaps. A "reset position" action exists.
- **Horizontal stretch.** The pill and panel size to their content horizontally
  where it helps (e.g. a long now-playing title, the notch controls), within a
  max width, without breaking centering or placement.
- **Safe app launcher.** A tab/section where the user adds their own apps
  (picker-based) and launches them from the panel. Governed by the Security
  rules above.
- **Windows extras.** Game mode (hide + pause the timer when a fullscreen game
  runs), taskbar progress for the timer, hide the island from screen share and
  recordings (toggle, `WDA_EXCLUDEFROMCAPTURE`).
- **Progress and sharing.** Streaks and a focus heatmap. Export and import a
  character as one `.islet-char` file (re-validated on import).

### Do not build in v2
AI of any kind, voice, accounts, servers, sync, study parties, inbox reading,
calendar login, Anki, typing/keystroke tracking, reading the active app's
content, keyboard hooks, running arbitrary commands the user did not explicitly
add through the launcher picker.

## Build order (one Kiro spec each)

Do not start a spec until the previous one passes its checks and
`scripts/perf-check`. Specs 0-5 are done (v1). v2 continues from here.

6. **Character engine + living notch.** Expose character commands; build the
   canvas renderer for BOTH the notch (low-rate) and the panel (full); ship the
   SpongeBob-style sample pack; wire active-character selection into settings;
   honor all hard-stop conditions. Decode-once, free-on-switch.
7. **Moods, growth, personality.** Mood from the activity log + hub; growth
   stages from total focus minutes; personality timing nudges.
8. **Notch UX: controls, place-anywhere, stretch.** On-notch show/hide + switch
   control; drag-to-any-position with persistence, clamping and snap presets;
   horizontal content stretch.
9. **Safe app launcher.** `launcher/` in Rust (entries, path validation,
   picker-based add, id-based launch) + panel UI + schema.
10. **Windows extras.** Game mode, taskbar progress (`ITaskbarList3` via the
    `windows` crate - Tauri has no built-in API), hide-from-capture
    (`SetWindowDisplayAffinity` + `WDA_EXCLUDEFROMCAPTURE`, DWM-only; toggle).
11. **Progress and sharing.** Streaks, heatmap, character export/import.
12. **UI polish pass + packaging.** Finish the motion/identity pass to the "UI
    and motion" bar across every surface; then installer, code signing, update
    check, size report.

## Definition of done (every spec)

- `cargo test`, `vitest`, schema checks pass. Build has no warnings.
- `scripts/perf-check` is within budget (closed notch-on, closed notch-off, and
  open). Results are saved in `docs/perf-results.md`.
- Tested on Windows 11. For window behavior, also tested on a second monitor and
  at a different DPI scale.
- Empty, loading and error states exist. Motion honors reduced-motion and
  battery saver.
- All user text is translatable. No hardcoded strings.
- Any Windows quirk found is written in `docs/windows-notes.md`.

## Code style

- Public functions and non-obvious logic get a short comment saying WHY.
- Rust: no `unwrap()` in app code. Return errors and show a friendly message.
- Frontend: no state libraries. Use small stores and signals.
- Keep files short. Split a file that grows past about 300 lines.

## Adding a character

Follow the steps in `CHARACTERS.md`, section "Workflow: adding a character". A
character must never need a code change.
