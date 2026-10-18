# Spec 11 — System flyouts & status-bar pill — Tasks

Build order. Each top task is one logical feature → one commit/push. Verify
`cargo check`/`vitest`/`tsc` green before each commit. Hardware perf-check and
Windows-behavior verification happen at the end (user), recorded UNVERIFIED.

- [ ] 1. UI foundation: motion helpers + shared animated controls + icon set
  - `src/ui/motion.ts` (durations/curves/prefersReducedMotion)
  - `src/ui/controls/{icon,slider,segmented,tile,switch}.tsx` (tokens-only)
  - `src/system/flyout-shell.tsx` (chip + card + spring)
  - CSS for all of the above in a dedicated stylesheet
  - _Req: 8.4, 8.8; Design §7_

- [ ] 2. Pill style setting + status-bar pill shell
  - settings field `pillStyle` (+ `openOnHover`, per-item enable, first-run offer)
  - `src/app/pill-style.ts`, `src/app/status-bar.tsx` (item slots, clock chip)
  - shell renders Notch vs StatusBar; minute clock via scheduler
  - closed window sized to pill; 1366px no-overflow budget
  - _Req: 1.1–1.7, 2.4_

- [ ] 3. Shared flyout plumbing + System tab group + lazy loading
  - `src/system/bridge.ts`, flyout registry, open/close/esc/click-away
  - add System tab group to the Notch panel (reuse TabBar)
  - lazy `import()` per flyout
  - _Req: 2.1–2.3, 2.5, 2.6_

- [ ] 4. Clock & calendar flyout + local events
  - `store/events.rs` + commands; month-grid pure builder (tested)
  - big clock (open-only seconds), regional format, week-start setting
  - inline New event form; next-event → hub; empty/loading/error
  - _Req: 3.1–3.6_

- [ ] 5. Sound flyout (`platform/audio.rs`)
  - IAudioEndpointVolume get/set/mute + callback → `islet://system/volume`
  - device name; Mixer via allow-listed ms-settings; unsupported state
  - closed always-on subscription (volume+mute)
  - _Req: 4.1–4.4, 8.1_

- [ ] 6. Battery & power mode flyout (`platform/power.rs`)
  - GetSystemPowerStatus via Spec 3 power-broadcast; no-battery hide
  - overlay scheme get/set (GUIDs), read-back; failure → Open settings
  - segmented control (sliding highlight); Plan row link
  - _Req: 5.1–5.5_

- [ ] 7. Quick settings flyout (`platform/radios.rs` + `links.rs`)
  - wifi/bt via Radios (RequestAccess once, read-back, on-notch consent)
  - network name hidden default + optional switch (no location)
  - DND link; no Night light; conditional Project/Cast/Captions/Accessibility
  - embed shared Sound/Battery/Power cards; Edit (reorder/toggle) persisted
  - _Req: 6.1–6.7_

- [ ] 8. Notifications: store + toast + flyout + badge
  - `store/notifications.rs` ring buffer + commands + `islet://system/notification`
  - toast.tsx (auto-dismiss ~4s, reduced-motion safe), history flyout
  - bell unread dot + pill count badge; empty/loading/error
  - document other-apps'-notifications out-of-scope in windows-notes.md
  - _Req: 7.1–7.4_

- [ ] 9. Dev gallery + release exclusion
  - `src/dev/gallery.tsx` (every flyout × every state, 100%/150%), DEV-only
  - `scripts/check-no-dev.mjs` + wire into build; i18n all strings
  - _Req: 8.5, 8.7, 8.8_

- [ ] 10. Docs + AGENTS.md + perf/windows notes
  - AGENTS.md network note (unchanged for 11), module list, scope additions
  - windows-notes.md UNVERIFIED checklist for every new Windows behavior
  - perf-results.md placeholders for status-bar closed/open
  - _Req: 8.2, 8.3, 8.6_
