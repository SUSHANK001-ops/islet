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
