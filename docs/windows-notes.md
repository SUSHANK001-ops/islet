# Windows notes

Record every Windows quirk found here (AGENTS.md Definition of Done).
Do not guess Windows behavior. Test it, measure it, write it down.

## Spec 0 (spike) — to verify on real hardware

These are the questions the spike exists to answer. Fill in results after
running on a real Windows 10 (2004+) / 11 machine. "Status" starts as UNVERIFIED
because the build machine cannot visually confirm overlay behavior.

| Behavior | How to check | Status | Notes |
|---|---|---|---|
| Transparent window | Pill shows, no window chrome, desktop visible around it | PASS | Verified on real hardware: panel floats over desktop, no chrome. |
| Always on top | Pill stays above maximized apps | PASS | Verified on real hardware: stays above other windows. |
| Click-through when closed | Click the pill area, click lands on app behind it | DEFERRED | Moved to Spec 1 (see finding below): mutually exclusive with hover on one window. Closed pill is interactive for now. |
| No focus steal | Opening the panel does not pull focus from the active app | TBD | `focus: false` in config |
| Hover to open | Mouse over the pill grows it into the panel | PASS | Verified on real hardware: hover opens the panel. |
| Fullscreen detection | Start a fullscreen app/game, island hides | PASS | Verified on real hardware: report row flips to "yes" when a fullscreen app is foreground. |
| Two monitors | Pill sits top-center of the chosen monitor | TBD | Single monitor confirmed (\\.\DISPLAY1). Needs a 2nd monitor to verify choice. |
| Mixed DPI | Pill stays centered and correctly sized at 100% / 150% / 200% | PASS (partial) | Verified at 125%: DPI read as 1.25x, work area 1536×960 logical (1920×1200 physical). Other scales still to try. |

Verified on: single-monitor laptop display `\\.\DISPLAY1` at 125% scaling,
1920×1200 physical / 1536×960 logical. Monitor count correctly reported as 1.

On-notch permission surface also verified: the "Allow notifications?" card
appears on the notch and Allow / Not now dismiss it correctly.

### Still open (not blockers for the Spec 0 gate)

- Two monitors: only a single display was available. Monitor choice must be
  re-verified once a second monitor is connected (becomes a setting in Spec 1).
- Other DPI scales: verified at 125%; try 100% / 150% / 200% when possible.
- No-focus-steal: `focus: false` is set but was not explicitly stress-tested.

### Open question to resolve during the spike

**Click-through vs hover detection.** When `ignore_cursor_events(true)` is set,
the window does not receive mouse events, so a web `mouseenter` cannot fire.
Two documented approaches to evaluate on real hardware:

1. Keep a 1px-tall always-clickable strip (cursor events ON) and only make the
   rest click-through. Hover over the strip opens the panel.
2. Poll cursor position from Rust at a slow, display-driven rate and open when
   it enters the pill rectangle, then hand interaction to the webview.

Record which approach wins and why. If polling is used, record the rate and the
reason here (AGENTS.md: no polling unless no event exists; write why).

### FINDING (spike, 2026): click-through and hover cannot share one window

Confirmed: with `set_ignore_cursor_events(true)` the window gets no mouse
events, so the web `mouseenter` never fires and the panel cannot open on hover.
Click-through-when-closed and hover-to-open are mutually exclusive on a single
undecorated window.

**Decision for the spike:** keep the closed pill INTERACTIVE (cursor events ON)
so hover-to-open works and can be verified. The idle click-through requirement
moves to Spec 1 using approach 1 above (a thin always-on 1px hover strip over an
otherwise pass-through window). The pill is only a few px tall at the very top
edge, so being interactive while closed is low-impact in the meantime.

### FINDING (spike, 2026): Vite must not auto-open a browser

`npm run tauri dev` was also opening `http://localhost:1420` in the system
browser, showing the raw HTML (a black bar on white) which is NOT the app and
is misleading. Fixed with `server.open = false` in vite.config.ts. Always test
in the Tauri window, never a browser.

## CPU / memory

See `docs/perf-results.md` for measured numbers.

## Spec 1 (Shell) notes

### Click-through is whole-window only in Tauri

`WebviewWindow::set_ignore_cursor_events` applies to the ENTIRE window; there is
no built-in per-region (hit-test) click-through. So a "thin always-interactive
hover strip over an otherwise pass-through window" cannot be done with one
simple call. Options for a future refinement, in order of preference:

1. Keep the closed window physically small (just the pill) and interactive.
   Because it is a few px tall at the very top edge, it rarely intercepts a
   click the user wanted elsewhere. This is what Spec 1 ships.
2. Win32 `WM_NCHITTEST` / layered-window region to make only the pill rectangle
   hit-testable while the rest passes through. Needs raw Win32 and a measured
   cost; defer until there is evidence option 1 is not good enough.

Decision for Spec 1: option 1. Revisit with real usage feedback. (No guessing:
this is a measured API limitation, not an assumption.)

### Tray left-click vs menu

`show_menu_on_left_click(false)` so a left click toggles the island and the menu
only opens on right click. Verify on Windows that left-click still fires
`TrayIconEvent::Click` (it should; recorded here to confirm during manual test).

### Runtime generics

The tray and global-shortcut builders require the concrete `Wry` runtime bound.
Rather than thread `<R: Runtime>` everywhere, `tray.rs` and `shortcut.rs` take
`&AppHandle` (defaults to `Wry`). Islet only ever uses `Wry`.

### To verify on hardware (Spec 1 manual checklist)

- Tray icon appears; left-click toggles; right-click shows Show/Hide, Settings,
  Quit; each menu item works.
- Global hotkey Ctrl+Shift+Space toggles the island from another focused app.
  If another app owns it, the friendly conflict notice shows (no crash).
- Settings: theme switches light/dark; monitor dropdown lists monitors and the
  pill re-centers; "Launch at startup" toggles the real Windows startup entry
  (check Task Manager > Startup) and is OFF by default.
- Tabs: switch with click and arrow keys; disabling a tab hides it; reordering
  changes the tab bar order; each tab shows the "Coming soon" empty state.

## Spec 2 (Storage) notes

### Data location

All data lives under Tauri's `app_data_dir()`, which on Windows resolves to
`%APPDATA%\dev.islet.app\` (the bundle identifier). Never a hardcoded path.
Files so far: `settings.json`, `activity/YYYY-MM-DD.json`, and, if a settings
file is ever unreadable, a timestamped `settings.corrupt.*.json` backup.

### Atomic writes

Writes go to a `.tmp` sibling, `sync_all()` (fsync), then `fs::rename` over the
target. The temp file is in the same directory so the rename stays on one
volume (cross-volume rename is a copy and not atomic). A crash mid-write leaves
the previous good file intact.

### Debounce + shutdown flush

Saves are debounced to at most one disk write per 5 s per file (disk budget).
Because a change inside the window would otherwise wait, the frontend calls
`flush_settings` on `beforeunload`, which bypasses the debounce. To verify on
hardware: change a setting, immediately quit, relaunch -> the change persists.

### Local date caveat

`time::OffsetDateTime::now_local()` can fail to read the local UTC offset on
some systems; we fall back to UTC for the activity filename/date in that case.
If daily files ever appear a few hours off near midnight, this is why. Verify
the date rolls over correctly on the target machine.

### To verify on hardware (Spec 2)

- Change theme / toggle a tab / pick a monitor, quit, relaunch: settings stick.
- Delete `settings.json` while closed: next launch recreates defaults, no crash.
- Corrupt `settings.json` (write garbage): next launch backs it up as
  `settings.corrupt.*.json` and resets to defaults, no crash.
