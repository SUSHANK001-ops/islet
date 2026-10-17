# Ideas (parking lot)

Anything not in `AGENTS.md` v2 scope lands here instead of being built.
Each entry: what it is, why it is out of scope now, what it would need.

## Promoted into v2 scope (no longer parked)

These were parked under v1 and are now first-class v2 features. Kept here as a
short record of the decision; the real spec is in `AGENTS.md`.

- **Living notch character** - the character animates inside the closed pill.
  Moved in by raising the closed-CPU/memory budgets in a reviewed edit, with
  hard-stop conditions (lock/sleep/fullscreen/battery saver).
- **Place the notch anywhere** - drag to any position on any monitor, with
  persistence, on-screen clamping, and snap presets. Replaces the old
  left/center/right-only placement (those stay as presets).
- **Safe app launcher** - open apps the user themselves added via an OS file
  picker. Made safe by construction: the frontend never passes a path or command
  (see `AGENTS.md` Security rules). This is NOT a general "run anything" feature.

## Accept VS Code / Kiro permission prompts from the notch

- **Idea:** When another app (VS Code, Kiro, etc.) raises a permission or
  approval prompt, surface it on the Islet notch and accept/decline there.
- **Why out of v2 scope:** Requires IPC with and control over other apps. An app
  that can click "Allow" in another app is high-impact and collides with the
  privacy/security posture. Not in the v2 Build list.
- **What it would need (future spec):** a trusted local channel per integrated
  app with an explicit allow-list and per-app consent, a validated message
  schema (untrusted input), and a security review. The on-notch surface for
  Islet's OWN OS permissions already ships (`src/app/permission-*`).

## Embedded YouTube Music player + in-app search

- **Idea:** Play YouTube Music directly inside Islet with in-app search.
- **Why out of v2 scope:** Conflicts with "Media is through Windows media
  controls", "no remote code/images", "one webview window", and the memory
  budgets (a second heavy webview). Changes the privacy posture.
- **What ships instead:** a one-click "Open YouTube Music" button (fixed,
  allow-listed URL) via the opener plugin; control happens through the existing
  Windows media controls.
- **What a real embedded player would need (future spec):** a dedicated, measured
  second webview with a strict CSP exception, a decision to relax "one webview"
  and "no remote content", and a fresh performance budget.

## General "run any command" launcher

- **Idea:** let the user (or a tab) run arbitrary shell commands / scripts.
- **Why out of scope:** direct violation of the sandbox rule - the frontend must
  never run arbitrary processes. The v2 launcher is deliberately limited to apps
  the user added through a picker, launched by id, re-validated in Rust.
- **What it would need:** a very different trust model and a dedicated security
  review. Not planned.
