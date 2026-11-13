# Spec 14 — Network choke point & egress ledger — Requirements

> Review gate: this is the requirements document for the FIRST v3 spec. Please
> review and approve before I write `design.md`. Nothing is implemented yet.
> This spec assumes `AGENTS.v3.md` (the v3 guide draft) is approved.

## Context

v2 shipped a fully local app: "nothing leaves the PC" with one user-triggered
exception (the signed character catalog). v3 (see `AGENTS.v3.md`) will add
features that can make outbound requests: on-device AI with an optional cloud
provider, a coding-agent companion, and optional account sync.

Before ANY of those ship, v3 needs a single safe floor so that network access
can never be silent, unbounded, or scattered across modules. This spec builds
that floor and nothing user-facing beyond a settings/ledger screen:

- a **single `net/` choke point** in Rust — the only place that opens a socket;
- an **allow-list** of hosts, each tied to a named feature;
- a persistent, user-readable **egress ledger** (one line per outbound request);
- a **network settings** screen that lists every allowed host and lets the user
  see the ledger and hard-disable all egress ("airplane mode").

Non-negotiables carried from `AGENTS.md` / `AGENTS.v3.md`: event-driven, no
telemetry/analytics, design tokens only, keyboard + a11y + empty/loading/error
states, translatable strings, and the dev-only `/dev/gallery` route renders
every new panel/state and is absent from release builds. Tier 0 (fully local)
must remain a complete product with egress disabled.

## Glossary

- **Egress** — any outbound network request leaving the PC.
- **Choke point** — `src-tauri/src/net/`, the ONLY module allowed to open a
  socket. All other code requests egress through it.
- **Allow-list entry** — `{ host, feature, enabled }`. A request to a host not on
  the list, or whose feature is disabled, is rejected before any socket opens.
- **Egress ledger** — append-only local JSON (daily file or ring buffer): one
  line per request with time, host, feature, method, bytes out/in, result.
- **Airplane mode** — a single master switch that blocks all egress; Tier 0 still
  fully works.

---

## Requirement 1 — Single choke point

**User story:** As a privacy-conscious user, I want all network access to go
through one audited place, so no module can quietly phone home.

### Acceptance criteria
1. WHEN any module needs an outbound request THEN it SHALL call a `net/` function
   and SHALL NOT open a socket or HTTP client itself.
2. WHEN code outside `net/` attempts a direct outbound request THEN the build or
   review process SHALL flag it (a check script, like `check-no-dev`).
3. WHEN `net/` receives a request THEN it SHALL resolve the target against the
   allow-list BEFORE opening any connection.
4. WHEN the frontend needs network THEN it SHALL only reach it via `commands.rs`
   (`net_*`); the frontend SHALL never be given a raw URL fetch capability.

## Requirement 2 — Allow-list, closed by default

**User story:** As a user, I want the app to reach only hosts I have enabled, so
nothing talks to the internet without my say-so.

### Acceptance criteria
1. WHEN the app first runs THEN the allow-list SHALL contain only the v2 catalog
   host entry, and it SHALL be disabled until the user triggers a catalog action.
2. WHEN a request targets a host not on the allow-list THEN `net/` SHALL reject it
   and write a rejected-entry to the ledger (no socket opened).
3. WHEN a request targets an allow-listed host whose feature is disabled THEN
   `net/` SHALL reject it the same way.
4. WHEN a host is allow-listed THEN only HTTPS SHALL be permitted; plain HTTP and
   redirects to other hosts SHALL be refused.

## Requirement 3 — Egress ledger

**User story:** As a user, I want to see exactly what left my PC, so I can trust
the app's privacy claims.

### Acceptance criteria
1. WHEN any outbound request is attempted (allowed OR rejected) THEN `net/` SHALL
   append one ledger line: ISO time, host, feature, method, bytes out, bytes in,
   result (ok / rejected / error).
2. WHEN the ledger grows THEN it SHALL be bounded (daily files or a ring buffer),
   consistent with the v2 disk-write budget (≤ 1 write / 5 s, debounced).
3. WHEN the user opens network settings THEN the ledger SHALL be viewable newest-
   first with empty, loading, and error states.
4. WHEN a request is rejected THEN the ledger SHALL record it WITHOUT having
   opened a socket.

## Requirement 4 — Airplane mode (master off)

**User story:** As a user, I want a single switch to block all network, so I can
guarantee a fully local session.

### Acceptance criteria
1. WHEN airplane mode is ON THEN `net/` SHALL reject every request regardless of
   the allow-list, and the whole app SHALL remain fully usable in Tier 0.
2. WHEN airplane mode is ON THEN the setting SHALL persist across launches.
3. WHEN airplane mode is the default-first-run state THEN the app SHALL behave
   exactly like v2 at rest (no egress without an explicit user action later).

## Requirement 5 — Network settings surface

**User story:** As a user, I want one screen that shows every host the app may
reach and why, so the privacy model is legible.

### Acceptance criteria
1. WHEN the user opens network settings THEN each allow-list entry SHALL show its
   host, the feature that uses it, and an enable/disable toggle.
2. WHEN the user disables an entry THEN future requests to that host SHALL be
   rejected and logged, without restart.
3. WHEN there are no entries beyond the catalog THEN the screen SHALL show a
   designed empty state (not a blank panel).
4. WHEN a setting changes THEN it SHALL persist via the versioned store with a
   `schemaVersion` and a tested migration.

## Requirement 6 — On-notch consent before first egress

**User story:** As a user, I want to approve a host on the notch the first time a
feature tries to use it, so nothing connects behind my back.

### Acceptance criteria
1. WHEN a feature triggers egress to an allow-listed host for the first time THEN
   the app SHALL show an on-notch consent card naming the host, feature, and data
   kind before the request proceeds.
2. WHEN the user declines THEN the request SHALL be rejected and logged, and the
   feature SHALL degrade gracefully (no crash, designed error state).
3. WHEN the user accepts THEN the choice SHALL persist and the consent SHALL not
   repeat for that host/feature unless revoked.

## Requirement 7 — Tier 0 stays complete

**User story:** As a user who never turns on any online feature, I want the whole
app to keep working exactly like v2.

### Acceptance criteria
1. WHEN no online feature is enabled THEN the app SHALL function fully offline
   with zero outbound requests (verified with egress blocked in a test).
2. WHEN `scripts/perf-check` runs with network floor added THEN the closed/open
   budgets SHALL remain within the v2 targets (the floor adds no at-rest cost).
3. WHEN the build is a release build THEN the dev-only gallery route for the new
   panels SHALL be absent.
