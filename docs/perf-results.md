# Performance results

Measured numbers from `scripts/perf-check`. Compare against the budgets in
`AGENTS.md`. Fill in after each run; never leave a budget "assumed".

## Budgets (copied from AGENTS.md for quick reference)

| Item | Target |
|---|---|
| Installer size | ≤ 15 MB |
| Start to usable pill | ≤ 1 s |
| CPU, pill closed, idle | < 0.3% avg over 5 min |
| CPU, panel open, animating | < 2% avg |
| Memory, pill closed (whole tree incl. WebView2) | ≤ 80 MB |
| Memory, panel open | ≤ 130 MB |
| Disk writes | ≤ 1 per 5 s, debounced |

## Spec 0 (spike) results

> STATUS: **perf measurement intentionally deferred.** All Spec 0 window
> behaviors are verified on real hardware (see docs/windows-notes.md), but
> CPU/memory numbers have not been captured yet. This must be filled in before
> Spec 1 is closed. Note: measure against a RELEASE build, not `tauri dev`
> (dev is unoptimized and will report worse numbers).

Run `scripts/perf-check.ps1` on the target machine and paste results here.

| Metric | Target | Measured | Pass? |
|---|---|---|---|
| Installer size | ≤ 15 MB | _TBD_ | _TBD_ |
| Start to usable pill | ≤ 1 s | _TBD_ | _TBD_ |
| CPU closed (5 min avg) | < 0.3% | _TBD_ | _TBD_ |
| CPU open (5 min avg) | < 2% | _TBD_ | _TBD_ |
| Mem closed | ≤ 80 MB | _TBD_ | _TBD_ |
| Mem open | ≤ 130 MB | _TBD_ | _TBD_ |

Date run: _TBD_
Machine (OS version, CPU, monitors, DPI): _TBD_
