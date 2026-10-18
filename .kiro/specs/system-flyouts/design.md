# Spec 11 — System flyouts & status-bar pill — Design

> Review gate: this is the design document. Please review and approve before I
> write `tasks.md`. Nothing is implemented yet.

Grounded in the real codebase: Preact + signals, plain CSS tokens in
`src/ui/tokens.css`, the roving-tabindex `TabBar`, the shared `EmptyState`, the
single Rust `scheduler`, the Spec 3 power-broadcast message window, the Spec 5
`platform/media.rs` WinRT pattern, the asset-protocol model, and the documented
whole-window click-through limitation.

Design priority from the user: **premium, hand-built, animated UI — no generic
"AI slop".** Section 7 (Motion & craft) is therefore a first-class part of this
design, not an afterthought, and every component references it.

---

## 1. Architecture overview

```
src-tauri/src/
  platform/
    audio.rs        NEW  Core Audio volume/mute/device + change callback
    power.rs        NEW  GetSystemPowerStatus + overlay scheme get/set
    radios.rs       NEW  Windows.Devices.Radios wifi/bt state + toggle
    links.rs        NEW  verified ms-settings:/shell links (allow-listed)
    mod.rs          extend: re-export, reuse power-broadcast window (Spec 3)
  store/
    events.rs       NEW  local calendar events (versioned JSON, atomic)
    notifications.rs NEW bounded notification history (ring buffer)
  system/           NEW  module group wiring (clock/sound/power/quick/notif)
    mod.rs
  commands.rs       extend: system_* commands (allow-list)
src/
  app/
    status-bar.tsx  NEW  the status-bar pill (items + layout)
    pill-style.ts   NEW  signal + setting glue for Notch vs Status bar
  system/           NEW  shared flyout components (one each), used by BOTH
    clock/flyout.tsx
    sound/flyout.tsx
    power/flyout.tsx
    quick/flyout.tsx
    notifications/{flyout.tsx, toast.tsx, store.ts}
    bridge.ts       thin wrappers over the allow-listed system_* commands
    flyout-shell.tsx the shared chrome: chip label + card + motion
  ui/
    controls/       NEW shared primitives (tokens-only, animated)
      slider.tsx, segmented.tsx, tile.tsx, switch.tsx, icon.tsx
    motion.ts       NEW  motion token helpers (durations/curves/reduced)
  dev/
    gallery.tsx     NEW  dev-only route rendering every panel + state
```

Rust owns all system state and is the only place that calls Win32/WinRT. The
frontend calls a small, auditable `system_*` command set and subscribes to
`islet://system/*` events. No new webview window.

## 2. Pill styles

A single setting `pillStyle: "notch" | "statusBar"` (persisted; default
`notch`). `src/app/pill-style.ts` exposes it as a signal; the shell renders
either the existing Notch pill or the new `StatusBar` component. The open panel
is unchanged for Notch; in both styles the flyout components are the same.

**First-run offer:** a one-time dismissible card (reusing the on-notch card
surface) that lets the user pick "Status bar" once; dismiss keeps Notch.

### Status-bar closed window
- The closed window is sized exactly to the rendered pill width (measured after
  layout, clamped to the monitor work area so a 1366px screen never overflows).
- Honors the documented whole-window click-through limit: the closed status-bar
  window is interactive (it has clickable items by design), so no per-region
  hit-testing is attempted.
- Clock text updates on the minute via a scheduler subscription that the shell
  owns; seconds never tick while closed.

### Items (order fixed, each toggle-able in Settings)
launcher chevron · quick settings · sound · battery · date-time · notifications ·
collapse chevron. Inapplicable items (e.g. battery on a desktop) are filtered
out by reading the backing capability signal before render.

### Character in status-bar style
The Spec 6 living character stays available as a small "wing" to the LEFT of the
launcher chevron (its own fixed-width slot, same decoded bitmap, same ≤6fps
notch loop + hard-stops). Exact px layout is in §6; it is width-budgeted so the
strip still fits 1366px with all items on.

## 3. Shared flyout surface

`flyout-shell.tsx` renders the common chrome seen in every screenshot: a small
**chip label** floating above a **card**. Each concrete flyout
(`clock`, `sound`, `power`, `quick`, `notifications`) composes `flyout-shell`
with its own body. The SAME component is mounted:
- from a status-bar item (anchored under that item), and
- as a tab in the new **System** tab group in the Notch panel (no chip, full
  width — the chip is a pill-anchored affordance only).

Opening: click by default; `openOnHover` setting switches to hover. Esc / click
-away closes. Each flyout body is a dynamic `import()` (lazy) so closed cost is
zero.

### Flyout positioning
The window grows downward from the pill. Flyout width is a fixed token-based
width; it is clamped so it never leaves the monitor. Anchor x is the item's
center, clamped to keep the card on-screen (DPI-correct, computed in logical px
like Spec 8's placement). Verified targets: 100/125/150/200% + 2nd monitor.

## 4. The five flyouts

### 4.1 Clock & calendar (`system/clock`)
- Big clock: subscribes to the scheduler only while open; seconds shown while
  open, minute-only contribution while closed (status bar).
- Month grid component (pure, testable): builds weeks from a `weekStart` setting;
  today highlighted with the accent token; prev/next month.
- Regional formatting via `Intl.DateTimeFormat` with the OS locale (Tauri
  `os` plugin / navigator locale); 12/24h follows the system.
- Events: `store/events.rs` persists `{schemaVersion, events:[{id,title,date,
  time?}]}` atomically; commands `events_list_month`, `event_add`,
  `event_delete`; "next event" published to the hub. Inline "New event" form.
- States: empty ("No events"), loading, error.

### 4.2 Sound (`system/sound`)
- `platform/audio.rs`: `IAudioEndpointVolume` get/set level + mute, default
  device name via `IMMDeviceEnumerator`/`IMMDevice`. Registers
  `IAudioEndpointVolumeCallback` and forwards changes as `islet://system/volume`
  (event-driven). Volume + mute is one of the 3 always-on closed subscriptions.
- "Mixer" → `links.rs` opens `ms-settings:apps-volume` (allow-listed).
- Unsupported state when no endpoint.

### 4.3 Battery & power mode (`system/power`)
- `platform/power.rs`: `GetSystemPowerStatus` for %, AC/battery, read on the
  Spec 3 power-broadcast `WM_POWERBROADCAST` signal (event-driven). No battery →
  capability signal false → item + card hidden.
- Overlay scheme via `powrprof` `PowerGetActualOverlayScheme` /
  `PowerSetActiveOverlayScheme`. Known GUIDs encoded; Balanced confirmed on
  hardware (documented UNVERIFIED). Active segment always reflects a read-back.
- Any failure → segmented control replaced by an "Open Windows settings" button
  (label "Power mode"). "Plan" row → `ms-settings:powersleep`.

### 4.4 Quick settings (`system/quick`)
- Wi-Fi / Bluetooth tiles via `platform/radios.rs` (`Windows.Devices.Radios`):
  `RequestAccessAsync` once (surfaced through the on-notch permission card),
  `SetStateAsync`, then re-read and show the REAL state. `GetRadiosAsync` only
  sees radios present at launch (documented).
- Network name: hidden by default ("Connected"); optional `showNetworkName`
  switch with a one-line note; location permission is NEVER requested.
- DND tile → opens `ms-settings:notifications` (no toggle API). Night light: not
  built. Project/Cast/Captions/Accessibility: each only rendered if its link is
  verified in `links.rs`, else dropped.
- The quick flyout EMBEDS the shared Sound card, Battery card, and Power
  segmented control (matches screenshot 7), reusing the same components as 4.2–
  4.3 (no duplication).
- Footer: "More Windows controls" + settings gear + "Edit" (reorder/toggle
  tiles; persisted).

### 4.5 Notifications (`system/notifications`)
- Islet's OWN notifications only. `store/notifications.rs` holds a bounded ring
  buffer (versioned). A toast (`toast.tsx`) shows app mark + title + one body
  line + expand/close, auto-dismiss ~4s (respects reduced-motion → no slide).
- Bell shows an unread dot; pill may show a count badge. History flyout lists
  items with unread styling; empty/loading/error states.
- Reading other apps' notifications is OUT; `docs/windows-notes.md` records that
  it needs package identity (unpackaged installer lacks it).

## 5. Rust command surface (allow-listed additions to `commands.rs`)

Read: `audio_get`, `power_get`, `radios_get`, `events_list_month`,
`notifications_list`.
Act: `audio_set_volume`, `audio_set_mute`, `power_set_overlay`,
`radios_request_access`, `radios_set`, `event_add`, `event_delete`,
`notifications_mark_read`, `open_ms_settings` (arg is an ENUM of allow-listed
link keys — never a free string, mirroring the Spec 9 id-not-path rule),
`set_pill_style`, `set_system_item_enabled`.
Events emitted: `islet://system/volume`, `islet://system/power`,
`islet://system/radios`, `islet://system/notification`.

Security: `open_ms_settings` accepts only a fixed enum of known link keys so the
frontend can never open an arbitrary URI. Capability additions are the minimal
`ms-settings` opener scope + nothing else.

## 6. Status-bar layout (for your review — §Requirement 1.4)

Logical px, on the 4px grid, tokens only:
```
[wing 28] [chvL 24] [quick 24] [sound 24] [batt 24] [ · clock ~132 · ] [bell 24] [chvR 24]
gaps 6px; horizontal padding 8px.  All-on width ≈ 28+ (24+6)*5 + 132 + (24+6)*2 + 16 ≈ 402px
```
~402px all-on is far under a 1366px work area. Clock chip uses tabular figures
so it never reshuffles. If the user enables everything AND a long locale date,
the clock chip ellipsizes rather than pushing items off-screen. **I'll wait for
your OK on this layout before building (Requirement 1.4 / 2.x).**

## 7. Motion & craft — the "no AI slop" contract

All motion uses the existing motion tokens (`--islet-ease-spring`,
`--islet-ease-out`, `--islet-dur-fast/dur/dur-slow`) added in Spec 12's polish
pass; `src/ui/motion.ts` centralizes them and a `prefersReducedMotion()` guard.
Rules (every one enforced in `/dev/gallery`):

- **Transform/opacity only.** No layout animation, no `backdrop-filter`, no
  blur, no glow, no new shadows, no gradients beyond the one existing accent
  gradient token. (These are also perf rules.)
- **Flyout open:** card springs down from the pill — `translateY(-8px)→0` +
  `scale(.98)→1` + opacity, `--islet-dur` on `--islet-ease-spring`, transform
  origin top. The chip label fades/rises 20ms after the card (a tiny stagger),
  not a separate bounce.
- **Chip label:** pure fade + 4px rise; never loops.
- **Segmented control:** the active-segment background is ONE shared element
  that SLIDES between segments (`transform: translateX`) on `--islet-ease-out`,
  rather than cross-fading two boxes — this is the detail that reads as
  "crafted" vs "template". Keyboard arrows move it too.
- **Slider:** the filled track and thumb animate to the new value on
  `--islet-dur-fast`; dragging is 1:1 (no easing while dragging, easing only on
  programmatic/external change). Thumb has a subtle pressed scale.
- **Tiles & toggles:** pressed = `scale(.97)`; hover = token control-hover;
  state change (on/off) cross-fades the icon color + animates the accent fill,
  no icon swap pop.
- **Toast:** slides in `translateY(-6px)` + fade, dwell ~4s, slides out; stacked
  toasts shift with a spring; reduced-motion → appear/disappear instantly.
- **Status-bar item hover:** icon lifts `translateY(-1px)`; badge count uses a
  single subtle scale pop on increment only.
- **Numbers never jump:** tabular figures for clock, %, volume.
- **Reduced motion:** every animation above collapses to an instant state
  change; nothing is purely decorative-only such that disabling it loses
  meaning.

### Icons
One inline-SVG set in `ui/controls/icon.tsx`: single stroke weight, 24px grid,
`currentColor`. No icon font, no CDN, no emoji. Each icon is drawn by us (simple
geometric glyphs: speaker, battery, bell, chevrons, wifi, bluetooth, gear,
sliders, calendar) — not copied from any reference app.

## 8. States (designed, in `/dev/gallery`)

Every flyout ships: **loading** (skeleton using control tokens, shimmer via
opacity only), **empty** (reuses `EmptyState` with a tailored label),
**error** (short message + retry where safe), **unsupported** ("Not available on
this PC" + optional "Open Windows settings"). The gallery renders each flyout in
each state at 100% and 150%.

## 9. Dev gallery & release exclusion

`src/dev/gallery.tsx` is mounted only when `import.meta.env.DEV` (Vite dev) AND
a `#/dev/gallery` hash route. A tiny CI check (`scripts/check-no-dev.mjs`, added
in tasks) greps the production `dist/` for the gallery marker and fails the
build if present. Documented in Definition of Done.

## 10. Performance plan

- Closed status-bar subscriptions = exactly {volume+mute, battery, minute tick}.
  Each is an OS event (audio callback, power-broadcast, scheduler minute), not a
  poll.
- Every other data source subscribes on flyout open, unsubscribes on close.
- Any unavoidable poll: ≥2s, only while that flyout is open, reason in
  `docs/windows-notes.md` (Media-class exception). Expected only for power
  overlay read-back if no change event exists (to confirm on hardware).
- Lazy `import()` per flyout body keeps the closed bundle small (installer ≤1MB
  growth target; measured in `scripts/size-report`).
- Budgets re-measured with `scripts/perf-check` (closed status-bar <0.5% CPU,
  ≤10MB over Spec 10 closed, open flyout within the open budget) → recorded in
  `docs/perf-results.md`.

## 11. Testing strategy

- **Rust unit tests:** overlay-scheme GUID mapping; power-status parsing;
  events store add/delete/next-event; notifications ring-buffer bound;
  `open_ms_settings` rejects non-enum input.
- **Frontend (vitest):** month-grid builder (week start, today, prev/next);
  status-bar item filtering + width budget math; notification store
  unread/bound; pill-style signal persistence; link-key allow-list.
- **Manual (hardware, UNVERIFIED in windows-notes.md):** volume callback,
  battery broadcast, overlay scheme AC vs battery + Balanced GUID, radios
  request/override, DPI 100/125/150/200 + 2nd monitor flyout placement, toast
  behavior, 1366px no-overflow.

## 12. AGENTS.md changes (applied with this spec, per prompt §9)
- Network rule: unchanged for Spec 11 (no network here; the catalog host is
  Spec 13). Noted so the two files agree.
- Module list: add the System group (clock, sound, power, quick settings,
  notifications).
- Scope "do not build": add tray-icon mirroring, reading other apps'
  notifications, Night light.

## 13. Open questions for you
1. Status-bar layout in §6 (widths/order/character wing) — approve or adjust?
2. Quick-settings embedding the sound/battery/power cards (screenshot 7) vs
   keeping them link-only inside quick settings — I designed it to embed. OK?
3. Numbering stays 11–14 as in your prompt (folder named by feature). OK?
