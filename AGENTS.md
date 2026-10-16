# Islet - guide for Kiro and contributors

"Islet" is a working name. Keep the name in ONE config value so it can change later.

## What we are building

A Windows app. A small black pill sits at the top-center of the screen. Hover or click and it opens into a small panel of tabs. It is a focus and study companion with a character that has moods and grows over time.

- Windows 10 (version 2004 or later) and Windows 11.
- No AI in v1. No account. No analytics. No telemetry. No servers.
- The character is DATA (images + JSON), never code. See `CHARACTERS.md`.

## Hard rules (read these first)

1. **Performance is a feature.** The app must feel like it is not running. See "Performance budgets". A feature that breaks a budget is not done.
2. **Event-driven, not polling.** Wait for events from Windows. Do not loop and ask.
3. **Only build what this file lists.** If an idea is not in "v1 scope", do not build it. Add it to `docs/ideas.md` instead.
4. **Privacy by default.** Nothing leaves the PC. Ask for a permission only when the feature that needs it is first used.
5. **Small steps.** One spec = 5 to 8 requirements. One task = one small, tested change.
6. **Do not guess Windows behavior.** Windows window behavior differs by version, DPI and monitor setup. Test it, measure it, and write the result in `docs/windows-notes.md`.
7. **No new dependency without a reason** written in the PR or task: what it does, its size, why we cannot write it in under 100 lines.

## Tech stack (fixed)

- **Shell:** Tauri v2 (Rust backend + WebView2). Not Electron.
- **Frontend:** TypeScript + Preact + Vite. Plain CSS with design tokens. No UI kit, no CSS framework.
- **Characters:** Canvas 2D drawing from sprite sheets.
- **Storage:** versioned JSON files in the app data folder. No database in v1.
- **Tests:** `cargo test` (Rust), `vitest` (frontend), JSON Schema validation for all data files.
- Check the current Tauri v2 docs before using any window API. Do not rely on memory.

## Performance budgets

These are TARGETS. Spec 0 (the spike) measures real numbers. If a target is wrong, change this table in a reviewed edit. Never ignore it silently.

| Item | Target |
|---|---|
| Installer size | 15 MB or less |
| Start to usable pill | 1 second or less |
| CPU, pill closed, idle | under 0.3% average over 5 minutes |
| CPU, panel open, character animating | under 2% average |
| Memory, pill closed (whole process tree incl. WebView2) | 80 MB or less |
| Memory, panel open | 130 MB or less |
| Disk writes | at most 1 per 5 seconds, always debounced |
| Battery saver | animation slows or stops automatically |

### Rules that make the budgets true

- **One webview window** for the island. A second window only with a written reason and a measured cost.
- **Closed means asleep.** When the panel is closed or the screen is locked, the frontend stops `requestAnimationFrame`, stops UI timers, and modules stop UI work. The Rust side keeps only what must keep running (the focus timer).
- **One timer engine in Rust** (`scheduler/`). Modules do not create their own timers or threads. The frontend gets ticks only while the panel is visible.
- **Animation:** idle 8 fps, active at most 24 fps. Draw with canvas. No DOM or CSS animation for characters. No `backdrop-filter`, no big blur, no large shadows.
- **Images:** decode each sprite sheet ONCE into an `ImageBitmap`. Keep only the active character in memory. Free it when switching.
- **Lazy loading:** load a tab's code only when it opens (dynamic import). Start a Rust module only when its switch is on.
- **Windows signals, not polling:** use events for power state, session lock/unlock, media changes, display changes, and fullscreen changes. If an event does not exist, poll at the slowest safe rate, only while needed, and write why in `docs/windows-notes.md`.
- **Memory:** no unbounded lists. Logs and history use ring buffers or daily files.
- **Disk:** write to a temp file, then rename (atomic). Debounce writes.
- **Startup:** show the pill first. Load everything else after the first paint.
- **Bundle:** no source maps in release, tree-shake, and CI prints a size report that fails if the installer is over budget.
- **Perf check:** `scripts/perf-check` runs the app for 5 minutes closed and 5 minutes open, records CPU and memory, and fails if a budget is broken. Run it before every release and after every spec.

## Architecture

```
src-tauri/src/
  main.rs
  window/        island window: position, monitors, DPI, click-through, fullscreen detect
  platform/      Windows-only code: power, session lock, media (SMTC), Focus Assist, capture exclusion
  scheduler/     the single timer engine
  store/         versioned JSON + atomic writes + migrations
  modules/<name>/  one folder per feature (focus, tasks, notes, media, ...)
  characters/    pack loader + validator (Rust side is the source of truth)
  commands.rs    the only functions the frontend may call
src/
  app/           shell, tab bar, routing
  modules/<name>/  one folder per feature panel (lazy loaded)
  characters/    renderer, state machine, mood logic
  ui/            shared components and design tokens
packs/characters/<id>/   built-in characters (data only)
shared/schemas/          JSON Schemas (character, settings, kit, ...)
docs/                    windows-notes.md, ideas.md, perf-results.md
scripts/                 perf-check, validate-character, size-report
```

### Module rules

- A module = its own folder (Rust + frontend). Adding a module = its own files + one line in the module list. It must not edit other modules.
- Modules never call each other. They publish data to a shared **hub** (tasks, next event, focus clock, tally) and write events to the **activity log** (`focus.completed`, `task.completed`, `break.taken`). Other parts read the hub and the log.
- Every module has `start()` and `stop()`. The lifecycle follows its on/off switch.
- Design empty, loading and error states. Never show a blank panel or a raw error.

### Data rules

- Every saved file has `schemaVersion`. Changes are new migration steps. Never edit a migration that has shipped. Test every migration.
- Data lives in the app data folder, not in a hardcoded path.
- Activity log: one small JSON file per day.

### Security rules

- The frontend can call only the commands listed in `commands.rs`. No raw shell, no raw file access from the frontend.
- Character packs and imported files are untrusted. Validate in Rust. See `CHARACTERS.md`.
- No remote code, no remote images.

## v1 scope

### Build
- **Island shell:** top-center pill, hover or click to open, always on top, click-through when closed, never steals focus, multi-monitor choice, hides in full-screen apps (setting), hotkey.
- **Focus timer:** 5/10/25 minute presets, Pomodoro, break reminder, Windows notification when a round ends, pauses on lock or sleep.
- **Tasks and notes:** to-do list, quick notes.
- **Media:** now playing, play/pause/skip, artwork, through the Windows media controls.
- **Character engine:** states, import, switch, delete, validation. Moods, growth stages, personality (from the pack file).
- **Windows extras:** game mode (hide and pause when a full-screen game runs), taskbar progress for the timer, hide the island from screen share and recordings (toggle), tray icon, launch at startup.
- **Progress:** streaks and a focus heatmap. Export and import a character as one file.
- **Basics:** light and dark themes, tabs on/off and order, settings, versioned storage, translatable text from day one.

### Do not build in v1
AI of any kind, voice, accounts, servers, study parties, sync, inbox reading, calendar login, Anki, walking on windows, typing tracking, reading the active app, keyboard hooks.

## Build order (one Kiro spec each)

Do not start a spec until the previous one passes its checks and `scripts/perf-check`.

0. **Spike (gate).** Prove on a real Windows laptop: transparent window, always on top, click-through when closed, hover detection, full-screen detection, two monitors, mixed DPI. Record idle CPU and memory. Write results in `docs/windows-notes.md` and `docs/perf-results.md`. If a plan fails here, stop and change the plan.
1. **Shell.** Pill, open/close, tabs, monitor choice, hotkey, tray, startup.
2. **Storage, settings, modules.** Versioned JSON, atomic writes, module registry, hub, activity log.
3. **Focus.** Timer engine, presets, notifications, lock/sleep pause.
4. **Tasks and notes.**
5. **Media.** Windows media controls.
6. **Character engine v1.** Loader, validator, renderer, states, import and switch.
7. **Moods, growth, personality.**
8. **Windows extras.** Game mode, taskbar progress, hide from capture.
9. **Progress and sharing.** Streaks, heatmap, character export and import.
10. **Packaging.** Installer, code signing, update check, size report.

## Definition of done (every spec)

- `cargo test`, `vitest`, schema checks pass. Build has no warnings.
- `scripts/perf-check` is within budget. Results are saved.
- Tested on Windows 11. For window behavior, also tested on a second monitor and at a different DPI scale.
- Empty, loading and error states exist.
- All user text is translatable. No hardcoded strings.
- Any Windows quirk found is written in `docs/windows-notes.md`.

## Code style

- Public functions and non-obvious logic get a short comment saying WHY.
- Rust: no `unwrap()` in app code. Return errors and show a friendly message.
- Frontend: no state libraries. Use small stores and signals.
- Keep files short. Split a file that grows past about 300 lines.

## Adding a character

Follow the steps in `CHARACTERS.md`, section "Workflow: adding a character". A character must never need a code change.
