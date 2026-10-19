# Islet

A focus and study companion with a living character that sits in a small pill
(the "notch") on your screen. Windows 10 (2004+) and 11. See `AGENTS.md` for the
full spec and hard rules, and `CHARACTERS.md` for the character pack format.

> Status: **feature-complete (pending hardware verification).** On top of v1
> (shell, storage, focus, tasks, notes, media) the app now has: the living notch
> character + engine, moods/growth/personality, place-anywhere drag + on-notch
> controls + stretch, a safe user-curated app launcher, Windows extras (game
> mode, taskbar progress, hide-from-capture), progress (streaks + heatmap) and
> character export/import, a **status-bar pill style with system flyouts**
> (clock/calendar, sound, battery/power mode, quick settings, notifications),
> an **auto-hide handle**, and a **safe signed character catalog** for
> downloads — all behind a hand-built, animated, tokens-only UI. Everything
> builds clean with `cargo test` (55) + `vitest` (40) green; a DEV-only
> `/dev/gallery` renders every panel/state.
>
> STILL REQUIRED before release (real Windows hardware only): run
> `scripts/perf-check` and record budgets; verify the Windows-native features
> (audio, power-overlay — confirm the Balanced GUID, Wi-Fi/Bluetooth radios,
> capture hide, taskbar progress, game mode, auto-hide handle); check
> multi-monitor + 100/125/150/200% DPI; configure the catalog host + signing key
> if you want downloads (see `docs/catalog.md`); and code-sign the installer.
> See `docs/windows-notes.md`. The built-in character "Pip" (`pixel-pal`) is
> original CC0 art; swap in your own to customize.

## Prerequisites

- **Node** (v20+; v24 tested) and npm.
- **Rust** (stable) via rustup: https://rustup.rs
- **Microsoft C++ Build Tools** + Windows 10/11 SDK (the MSVC `windows-msvc`
  target). Install via the Visual Studio Installer ("Desktop development with
  C++").
- **WebView2 runtime** (preinstalled on Windows 11; on Windows 10 it usually is
  too, otherwise install Evergreen WebView2).

## First-time setup

PowerShell note: if `npm` is blocked by the execution policy, call `npm.cmd`
(the `.cmd` shim bypasses the `.ps1` script policy), or allow scripts for your
user:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Install Rust (you do this yourself):

```powershell
# Download and run the installer from https://rustup.rs, then verify:
rustc --version
cargo --version
```

Install frontend deps:

```powershell
npm.cmd install
```

## Run

```powershell
npm.cmd run tauri dev
```

A black pill (the notch) appears at the top of your primary monitor. Hover or
click it to open the panel of tabs (focus, tasks, notes, media, settings). In
v2 the active character also renders inside the notch itself.

## Verify (must be done on real hardware)

Work through the checklists in `docs/windows-notes.md` (window behavior per
spec: transparency, always-on-top, no focus steal, fullscreen hide, placement,
multi-monitor, mixed DPI, and the v2 additions - notch animation, drag-anywhere,
launcher, capture exclusion, taskbar progress).

Then measure performance:

```powershell
# Start the app, then in another terminal:
powershell -ExecutionPolicy Bypass -File scripts/perf-check.ps1 -Minutes 5
```

Record results in `docs/perf-results.md`. Perf is a gate after every spec:
measure closed with the notch character ON, closed with it OFF, and open. If a
plan breaks a budget, stop and change the plan (AGENTS.md build order).

## Tests

```powershell
npm.cmd test          # frontend (vitest)
cargo test --manifest-path src-tauri/Cargo.toml   # Rust
```

## Layout

See the "Architecture" section in `AGENTS.md`. v1 implemented the shell,
storage/settings/modules, focus, tasks, notes and media
(`src-tauri/src/{window,platform,scheduler,store,modules,characters}` and
`src/{app,modules,ui}`). v2 adds `src/characters/` (renderer), the notch UX,
`src-tauri/src/launcher/`, and the Windows extras under `platform/`.
