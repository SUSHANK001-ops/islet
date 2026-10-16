# Islet

A focus and study companion that lives in a small pill at the top-center of
your screen. Windows 10 (2004+) and 11. See `AGENTS.md` for the full spec and
hard rules, and `CHARACTERS.md` for the character pack format.

> Status: **Spec 0 — the spike (gate).** This proves the hard window behavior
> on real Windows hardware before any feature is built. Nothing is "done" until
> it passes its checks and `scripts/perf-check`.

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

## Run the spike

```powershell
npm.cmd run tauri dev
```

A black pill should appear at the top-center of your primary monitor. Hover it
to open the spike panel (monitor count, DPI scale, fullscreen state). A sample
"Allow notifications?" prompt appears on the notch to exercise the on-notch
permission surface.

## Verify (Spec 0 checklist — must be done on real hardware)

Work through the table in `docs/windows-notes.md`: transparency, always-on-top,
click-through when closed, no focus steal, hover-to-open, fullscreen hide, two
monitors, mixed DPI. Note the known **click-through vs hover** open question
there.

Then measure performance:

```powershell
# Start the app, then in another terminal:
powershell -ExecutionPolicy Bypass -File scripts/perf-check.ps1 -Minutes 5
```

Record results in `docs/perf-results.md`. The spike is the gate: if a plan
fails here, stop and change the plan (AGENTS.md build order, step 0).

## Tests

```powershell
npm.cmd test          # frontend (vitest)
cargo test --manifest-path src-tauri/Cargo.toml   # Rust
```

## Layout

See the "Architecture" section in `AGENTS.md`. The spike currently implements
`src-tauri/src/{window,platform,commands}` and `src/app/*` only.
