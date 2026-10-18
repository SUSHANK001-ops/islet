# Spec 11 — System flyouts & status-bar pill — Requirements

> Review gate: this is the requirements document. Please review and approve
> before I write `design.md`. Nothing is implemented yet.

## Context

Islet currently shows a "Notch" pill that opens a tabbed panel (focus, tasks,
notes, media, launcher, progress, settings). Specs 0–10 are built. This spec
adds, without rewriting any existing spec:

- a second pill **style** ("Status bar") that shows small live system items on
  the closed pill, and
- five **system flyouts** (clock/calendar, sound, battery/power, quick settings,
  notifications) that control Windows basics from the island.

Each flyout is built once as a shared component and is reachable two ways: from
the status-bar pill items, and as tabs in a new **System** group inside the
existing Notch panel.

Non-negotiables carried from `AGENTS.md` / this prompt: event-driven (no
background polling), Islet's own design tokens only (no reference-app pixels),
no faked/dead controls, keyboard + a11y + empty/loading/error/unsupported
states everywhere, all strings translatable, and a dev-only `/dev/gallery`
route that renders every panel/state and is absent from release builds.

## Glossary

- **Pill style** — "Notch" (current) or "Status bar" (new). A user setting.
- **Flyout** — a system panel (clock, sound, battery/power, quick settings,
  notifications) that grows downward from the pill.
- **System group** — a set of tabs in the existing Notch panel that host the
  same flyout components.
- **Unsupported state** — a designed state shown when a control cannot work on
  this PC; it either disappears or becomes "Open Windows settings". Never a dead
  switch.

---

## Requirement 1 — Status-bar pill style

**User story:** As a user, I want a status-bar style pill that shows small live
system items, so the island works like a compact system strip.

### Acceptance criteria
1. WHEN the pill style is "Status bar" THEN the closed pill SHALL show, in order:
   launcher chevron, Quick settings, Sound, Battery, date-and-time, Notifications,
   collapse chevron.
2. WHEN an item does not apply to this PC (e.g. no battery) THEN the system SHALL
   hide that item automatically rather than show a dead control.
3. WHEN the user disables an item in Settings THEN that item SHALL not appear on
   the pill; order of remaining items is preserved.
4. WHEN the screen is 1366 px wide (or narrower) THEN the status-bar pill SHALL
   NOT overflow; it SHALL fit within the active monitor work area.
5. WHEN the closed clock is shown THEN it SHALL update only on minute boundaries
   via the single Rust scheduler (no new timer).
6. WHEN the pill style is changed in Settings THEN the change SHALL apply without
   restart and persist across launches; the default style SHALL remain "Notch".
7. WHEN the user first runs a build that has this feature THEN the app SHALL
   offer the "Status bar" style once (a dismissible choice), defaulting to Notch
   if dismissed.

## Requirement 2 — Shared flyout surface with two entry points

**User story:** As a user, I want the same system panels whether I click a
status-bar item or open a System tab, so behavior is consistent.

### Acceptance criteria
1. WHEN a status-bar item is activated THEN the system SHALL open the matching
   flyout component.
2. WHEN the pill style is "Notch" THEN the same flyout components SHALL be
   available as tabs in a new "System" group in the existing panel.
3. The flyout components SHALL be implemented once and shared by both entry
   points (no duplicated panel logic).
4. WHEN a status-bar item is activated by click (default) THEN the flyout opens;
   WHEN the "open on hover" setting is on THEN hovering the item opens it.
5. WHEN a flyout is open and the user presses Esc or clicks away THEN the flyout
   SHALL close.
6. Each flyout's code SHALL be lazy-loaded on first open (no cost before use).

## Requirement 3 — Clock & calendar flyout + local events

**User story:** As a user, I want a clock, a month calendar, and simple local
events, so I can check the date and note things without leaving the island.

### Acceptance criteria
1. The flyout SHALL show a large local clock; seconds SHALL tick only while the
   flyout is open (via the scheduler), never while closed.
2. The flyout SHALL show a month grid with today highlighted, and previous/next
   month navigation; a setting SHALL choose the week start day.
3. Date and time formatting SHALL follow the Windows regional settings.
4. The user SHALL be able to add a local event (title, date, optional time) via
   an inline "New event" form; events SHALL be stored in a versioned JSON file
   (atomic write, schemaVersion) with no network and no account.
5. The next upcoming event SHALL be published to the shared hub as "next event".
6. The flyout SHALL present designed empty ("No events"), loading, and error
   states.

## Requirement 4 — Sound flyout

**User story:** As a user, I want to see and change the system volume and output
device from the island.

### Acceptance criteria
1. The flyout SHALL show the current default-output volume and mute state and a
   slider to change volume; changes SHALL use Core Audio
   (`IAudioEndpointVolume`) and reflect external changes via its change callback
   (event-driven, no polling).
2. The flyout SHALL show the default output device name and a "Mixer" action
   that opens the Windows sound settings via an `ms-settings:` link.
3. WHEN no audio endpoint is available THEN the flyout SHALL show the unsupported
   state rather than a dead slider.
4. The volume level and mute SHALL be among the only subscriptions kept while the
   pill is closed (status-bar style), so the Sound item stays live cheaply.

## Requirement 5 — Battery & power-mode flyout

**User story:** As a user, I want battery status and a power-mode switch from the
island.

### Acceptance criteria
1. The flyout SHALL show battery percentage and charging/on-battery state using
   `GetSystemPowerStatus`, updated via the existing Spec 3 power-broadcast window
   (event-driven).
2. WHEN the PC has no battery (desktop) THEN the battery item and card SHALL be
   hidden.
3. The flyout SHALL offer a power-mode segmented control (Efficiency / Balanced /
   Performance) using `PowerSetActiveOverlayScheme` /
   `PowerGetActualOverlayScheme`; the active segment SHALL reflect the real
   current overlay, read back after any change, for both AC and battery.
4. WHEN a power-mode call fails or the API is unavailable THEN the control SHALL
   become "Open Windows settings" (labelled "Power mode"), never a dead control.
5. A "Plan" row SHALL open the Windows power settings via an `ms-settings:` link.

## Requirement 6 — Quick settings flyout

**User story:** As a user, I want common toggles (Wi-Fi, Bluetooth, and others
that are actually controllable) in one flyout.

### Acceptance criteria
1. The flyout SHALL offer Wi-Fi and Bluetooth toggles via
   `Windows.Devices.Radios`, calling `RequestAccessAsync` once before changing
   state and showing the REAL state read back after a change (hardware/policy may
   override).
2. WHEN radio access is needed THEN the request SHALL surface through the
   existing on-notch permission card.
3. The Wi-Fi network name SHALL default to "Connected" with no name; an optional
   "Show network name" switch (default off, one-line explanation) MAY reveal it
   where available. The app SHALL NEVER request the location permission.
4. "Do not disturb" SHALL be a link that opens the Windows Notifications settings
   page (no open API to toggle it); if Spec 3 already handles Focus Assist, that
   SHALL be reused and documented.
5. Night light SHALL NOT be built (no public API).
6. Project / Cast / Captions / Accessibility tiles SHALL appear ONLY if a
   verified `ms-settings:`/shell link opens the correct page on Windows 10 and
   11; otherwise the tile SHALL be dropped.
7. Every tile SHALL have normal/hover/pressed/focus/disabled and an unsupported
   state; no tile SHALL show a switch that does nothing.

## Requirement 7 — Notifications (Islet's own only)

**User story:** As a user, I want Islet's own notifications collected in one
place with a small toast, so I don't miss a finished timer or download.

### Acceptance criteria
1. The system SHALL show a small toast card (app mark, title, one body line,
   expand + close actions) for Islet's own events (timer finished, download
   finished, errors); it SHALL auto-dismiss after ~4 s.
2. The notifications flyout SHALL keep a bounded history with an unread
   indicator; the bell SHALL show an unread dot and the pill MAY show a count
   badge.
3. Reading OTHER apps' notifications SHALL be out of scope; the requirement to
   do so (package identity for the Windows notification-listener API) SHALL be
   documented in `docs/windows-notes.md` and not attempted.
4. The flyout SHALL present empty, loading, and error states.

## Requirement 8 — Performance, states, and proof

**User story:** As the maintainer, I need this to stay within budget, be fully
stated, keyboard-accessible, and screenshot-able.

### Acceptance criteria
1. WHEN the pill is closed in status-bar style THEN only three tiny
   subscriptions SHALL be active (volume+mute, battery, minute tick); all other
   data sources SHALL subscribe only while their flyout is open.
2. WHERE a control has no event, the system SHALL poll no faster than every 2 s
   and only while that flyout is open, with the reason recorded in
   `docs/windows-notes.md` (same exception class as Media in Spec 5).
3. Closed-pill CPU in status-bar style SHALL be < 0.5% average over 5 min;
   memory SHALL be ≤ 10 MB over the Spec 10 closed-pill number; the installer
   SHALL grow ≤ 1 MB. These SHALL be measured with `scripts/perf-check` and
   recorded in `docs/perf-results.md`.
4. Every control SHALL support normal/hover/pressed/keyboard-focus/disabled and
   full keyboard operation (Tab, arrows, Enter, Esc closes).
5. Every panel SHALL have designed empty, loading, error, and
   "not supported on this PC" states.
6. Flyouts SHALL open/size correctly at 100% / 125% / 150% / 200% scale and on a
   second monitor; the closed status-bar window SHALL be exactly the pill size
   (no wider), honoring the documented whole-window click-through limitation.
7. A dev-only `/dev/gallery` route SHALL render every panel and every state with
   sample data at 100% and 150%, and SHALL be excluded from release builds (CI
   enforced).
8. All user-facing text SHALL go through the translation system; colors, radii,
   spacing, type, and motion SHALL come only from `src/ui/` tokens (one new token
   allowed only with a written reason).

---

## Out of scope (explicit)

- Tray-icon mirroring (no public API; the left chevron reuses the Spec 9
  launcher).
- Reading other apps' notifications.
- Night light.
- Brightness.
- Any registry-blob editing or synthetic keystrokes to control Windows.
- Location permission.

## Windows API facts this spec relies on (to re-verify on hardware)

- Core Audio `IAudioEndpointVolume` + change callback — event-driven volume.
- `GetSystemPowerStatus` + existing power-broadcast window — battery.
- `PowerSetActiveOverlayScheme` / `PowerGetActualOverlayScheme` (powrprof) —
  **undocumented**; GUIDs for Efficiency/Performance known, Balanced to confirm;
  overlay can differ AC vs battery.
- `Windows.Devices.Radios` — Wi-Fi/Bluetooth; `RequestAccessAsync` once;
  `GetRadiosAsync` lists only radios present at launch.
- Wi-Fi name needs the Windows location setting on (24H2) — default to hiding it.
- DND / Focus — no open toggle API; link to settings.
- Notification-listener API needs package identity (unpackaged installer lacks
  it) — out of scope, documented.

All of the above will be entered into `docs/windows-notes.md` as UNVERIFIED with
manual check steps, per the Definition of Done.
