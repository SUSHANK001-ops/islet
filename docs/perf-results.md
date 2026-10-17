# Performance results

Measured numbers from `scripts/perf-check`. Compare against the budgets in
`AGENTS.md`. Fill in after each run; never leave a budget "assumed".

## Budgets (v2, copied from AGENTS.md for quick reference)

| Item | Target |
|---|---|
| Installer size | ≤ 15 MB |
| Start to usable pill | ≤ 1 s |
| CPU, pill closed, character idle in notch | < 0.8% avg over 5 min |
| CPU, pill closed, notch animation OFF | < 0.3% avg over 5 min |
| CPU, panel open, animating | < 2.5% avg |
| Memory, pill closed (whole tree incl. WebView2) | ≤ 90 MB |
| Memory, panel open | ≤ 140 MB |
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
| CPU closed, notch ON (5 min avg) | < 0.8% | _TBD_ | _TBD_ |
| CPU closed, notch OFF (5 min avg) | < 0.3% | _TBD_ | _TBD_ |
| CPU open (5 min avg) | < 2.5% | _TBD_ | _TBD_ |
| Mem closed | ≤ 90 MB | _TBD_ | _TBD_ |
| Mem open | ≤ 140 MB | _TBD_ | _TBD_ |

Date run: _TBD_
Machine (OS version, CPU, monitors, DPI): _TBD_

> v2 note: perf-check must capture THREE closed/open conditions (notch
> animation ON, notch OFF, panel open). The notch-ON number is the one that pays
> for the living character; the notch-OFF number proves the cost of that
> feature so it can be disabled cleanly.
