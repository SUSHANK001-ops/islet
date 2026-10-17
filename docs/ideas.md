# Ideas (parking lot)

Anything not in `AGENTS.md` v1 scope lands here instead of being built.
Each entry: what it is, why it is out of scope now, what it would need.

## Accept VS Code / Kiro permission prompts from the notch

- **Idea:** When another app (VS Code, Kiro, etc.) raises a permission or
  approval prompt, surface it on the Islet notch and let the user accept or
  decline there, instead of in that app's own dialog.
- **Why it is out of v1 scope:** Requires inter-process communication with and
  control over other applications. That collides with the privacy/security
  rules ("Nothing leaves the PC", "no raw shell, no raw file access from the
  frontend", untrusted-input validation) and is not in the v1 "Build" list.
- **What it would need (future spec):**
  - A trusted local channel per integrated app (named pipe / local socket),
    with an explicit allow-list and user consent per app.
  - A defined, validated message schema (untrusted input).
  - A security review: an app that can click "Allow" on prompts is high-impact.
  - Clear UX so the user always knows which app is asking.
- **Shipped in v1 instead:** an on-notch permission surface for **Islet's own**
  OS permission requests (notifications, run-at-startup, hide-from-capture),
  shown only when the feature that needs it is first used. See
  `src/app/permission-store.ts` and `src/app/permission-prompt.tsx`.

## Embedded YouTube Music player + in-app search

- **Idea:** Play YouTube Music directly inside Islet, with an in-app search box,
  instead of only controlling whatever is already playing.
- **Why it is out of v1 scope:** It conflicts with several AGENTS.md hard rules:
  the Media feature is defined as "through the Windows media controls" (control,
  not embed); "No remote code, no remote images"; "One webview window"; and the
  performance budgets (embedding YouTube pulls in a heavy second webview +
  network, well over the 80/130 MB memory targets). It also changes the privacy
  posture ("Nothing leaves the PC").
- **What ships in v1 instead (Option A):** a one-click "Open YouTube Music"
  button that launches `music.youtube.com` in the user's default browser via the
  opener plugin (fixed URL, allow-listed). The user plays/searches there, and
  Islet controls playback through the existing Windows media controls. See
  `src/modules/media/panel.tsx` and the `open_youtube_music` command.
- **What a real embedded player would need (future spec):** a dedicated,
  measured second webview with a strict CSP exception, a decision to relax the
  "one webview" and "no remote content" rules, and a fresh performance budget.
