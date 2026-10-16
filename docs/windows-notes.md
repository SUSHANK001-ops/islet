# Windows notes

Record every Windows quirk found here (AGENTS.md Definition of Done).
Do not guess Windows behavior. Test it, measure it, write it down.

## Spec 0 (spike) — to verify on real hardware

These are the questions the spike exists to answer. Fill in results after
running on a real Windows 10 (2004+) / 11 machine. "Status" starts as UNVERIFIED
because the build machine cannot visually confirm overlay behavior.

| Behavior | How to check | Status | Notes |
|---|---|---|---|
| Transparent window | Pill shows, no window chrome, desktop visible around it | UNVERIFIED | `transparent: true`, `decorations: false` in tauri.conf.json |
| Always on top | Pill stays above maximized apps | UNVERIFIED | `set_always_on_top(true)` on setup + each state change |
| Click-through when closed | Click the pill area, click lands on app behind it | UNVERIFIED | `set_ignore_cursor_events(true)` while closed |
| No focus steal | Opening the panel does not pull focus from the active app | UNVERIFIED | `focus: false` in config |
| Hover to open | Mouse over the pill grows it into the panel | UNVERIFIED | Frontend `mouseenter`; note: with click-through ON, hover may need the window to accept mouse-move. See "Open question" below. |
| Fullscreen detection | Start a fullscreen app/game, island hides | UNVERIFIED | `platform::is_fullscreen_app_active()` compares foreground rect to `rcMonitor` |
| Two monitors | Pill sits top-center of the chosen monitor | UNVERIFIED | Uses `primary_monitor()` for the spike |
| Mixed DPI | Pill stays centered and correctly sized at 100% / 150% / 200% | UNVERIFIED | All geometry done in logical units |

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

## CPU / memory

See `docs/perf-results.md` for measured numbers.
