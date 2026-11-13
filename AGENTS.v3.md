# Islet v3 — draft guide (supersedes v2 where noted)

> STATUS: **DRAFT for review.** This is a proposal, not an approved spec. v3 is a
> deliberate pivot: v2's defining promise was "no AI, no account, no analytics,
> no telemetry, no servers — nothing leaves the PC". v3 relaxes some of that **on
> purpose**, for named features, behind explicit opt-in. Every hard rule that
> changes is called out below with the reason. Nothing here is edited silently —
> that is itself a v2 hard rule we are keeping.
>
> Do not start v3 until v2's gate is green: `scripts/perf-check` recorded in
> `docs/perf-results.md` for all three conditions, and the Windows hardware
> checklists in `docs/windows-notes.md` passed. Stacking AI on unverified perf
> numbers is not allowed.

## Why v3 exists

v2 shipped the product's soul (living character, notch UX, launcher, catalog) as
a fully local, private app. Users now want the things v2 deliberately parked in
`docs/ideas.md`:

1. **An AI study companion** — the character can actually talk, answer questions
   about your own notes/tasks, and coach a focus session. v3 ships this as
   **bring-your-own-key (BYOK)**: the user pastes an API key for an
   OpenAI-compatible provider (Groq, OpenAI, OpenRouter, etc.). A later,
   optional "download your own local model" path can be added without changing
   this contract (same chat interface, a different backend).
2. **A coding-agent session companion** — see what local coding agents (Claude
   Code, Codex, Cursor, Gemini CLI, Antigravity) are reading/editing/running and
   surface their approval requests on the notch.
3. **Optional account + cloud** — opt-in sync of settings/characters/progress
   across the user's own machines. (AI itself is BYOK and needs no account.)

These were blocked in v2 for good reasons (privacy posture, one-webview budget,
sandbox rule, no accounts/servers). v3 does not throw those reasons away — it
replaces "never" with "off by default, named, consented, measured".

## What changes from v2 (the honest diff)

These v2 hard rules are **amended** for v3. Each amendment is scoped and opt-in.

| v2 rule | v3 amendment | Guard rails |
|---|---|---|
| "No AI in v2." | AI allowed, **BYOK (bring-your-own-key)**. The user pastes a key for an OpenAI-compatible provider (Groq etc.). | No key = no AI; the app is fully usable without it. Only the prompts the user sends go out, only to the one provider host they chose. |
| "No account." | Optional account for sync only. | App is 100% usable with NO account, exactly like v2. Account is a settings toggle, never required. The AI key is NOT an account — it is stored locally. |
| "Nothing leaves the PC" (one catalog-host exception). | Narrow, named network egress: (a) the AI provider host the user picked, (b) the user's own sync endpoint, (c) the v2 catalog host. | Each endpoint is allow-listed, shown on the notch before first use, and listed in `docs/network.md`. Still no telemetry, no analytics, no ads, no third-party trackers. |
| "No reading the active app's content / no IPC with other apps." | Coding-agent companion may read a **structured event stream** from supported agents over a trusted local channel. | Per-agent opt-in, validated message schema, read-only by default, approvals require a human click on the notch. Never scrapes terminals or injects clicks. |
| "One webview window." | Unchanged — the AI chat lives in the existing webview (DOM, not canvas). A local-model runtime, if ever added, runs in Rust, not a second webview. | Still one webview. |

These v2 rules are **unchanged and still hard**:

- No telemetry. No analytics. No ads. No selling data. No background upload.
- The frontend is sandboxed: it calls only `commands.rs`. No raw shell, no raw
  file access, no arbitrary process launch. The launcher stays picker-only.
- No remote code. No remote images outside signed, hash-checked, validated packs.
- Character is DATA, never code.
- Performance is a feature (budgets below, revised for AI).
- Event-driven first; polling needs a written reason.
- Small steps: one spec = 5–8 requirements; one task = one tested change.
- Do not guess Windows behavior; measure and write it down.

## Privacy model (v3)

Three trust tiers. The app always boots in Tier 0 and never leaves it without an
explicit, per-feature click.

- **Tier 0 — Fully local (default, = v2 promise).** No AI, no account, no network
  except the user-triggered catalog. The whole app works here; AI is simply off
  until a key is added.
- **Tier 1 — BYOK cloud AI.** The user pastes an API key for one OpenAI-compatible
  provider (Groq by default suggestion, but any compatible base URL). Only the
  prompts the user sends are transmitted, only to that host. Shown on the notch,
  logged in a visible "what left the PC" ledger. The key is stored locally and
  can be removed any time.
- **Tier 2 — Account + sync.** Optional. Syncs settings/characters/progress to
  the user's own endpoint. End-to-end encrypted; the server sees ciphertext.

A persistent, user-readable **egress ledger** (local JSON, one line per outbound
request: host, feature, bytes, time) is mandatory for Tiers 1–2. No silent calls.

## Performance budgets (v3 additions)

v2 budgets still hold for the whole app. AI is a network call (BYOK), so it costs
almost nothing at rest — the budget is about not blocking the UI and not leaking.

| Item | Target |
|---|---|
| Installer size | ≤ 16 MB (BYOK adds no model; just HTTP + UI) |
| Memory, pill closed, AI idle | unchanged v2 budgets (no model loaded, ever) |
| CPU, pill closed, no request in flight | unchanged v2 budgets (AI fully asleep) |
| First token latency | network-bound; stream tokens, never freeze the UI; cancelable |
| In-flight request | off the UI thread (spawn_blocking in Rust); timeout + cap |
| Egress per prompt | only the user's messages + chosen context; shown in the ledger |
| Coding-agent companion idle CPU | < 0.3% (event-driven; no polling of agent logs) |
| Disk writes | unchanged: ≤ 1 per 5 s, debounced; chat history in daily files/ring buffer |

Hard rule: no request is ever sent while the pill is closed unless the user
explicitly started a background task. An optional local-model path (future) would
get its own load/unload + memory budget in a reviewed edit before it is built.

## Architecture (v3 additions)

New folders only; existing modules untouched (module rule: never edit another
module).

```
src-tauri/src/
  net/           single choke point for ALL outbound requests + egress ledger
  ai/            BYOK provider client (OpenAI-compatible), key storage,
                 context builder (reads ONLY the user's own hub/log/notes)
  agents/        coding-agent companion: per-agent adapters, trusted local
                 channel, validated event schema, read-only event store
  account/       optional: auth, E2E-encrypted sync client (Tier 2)
  commands.rs    + ai_*, agents_*, account_*, net_* commands (the only surface)
src/
  modules/ai/        chat/coach panel (DOM, lazy loaded); character speaks
  modules/agents/    coding-agent companion panel + on-notch approval surface
  modules/account/   sign-in + sync status + the egress ledger view
packs/characters/      unchanged (data only)
shared/schemas/        + ai-config, agent-event, sync-envelope, egress-ledger
docs/                  + network.md (every host, why, what data), ai.md
```

### New module rules (v3)

- **`net/` is the only place that opens a socket.** Every other module asks
  `net/` to make a request; `net/` enforces the allow-list and writes the egress
  ledger. A direct network call anywhere else is a review failure.
- **AI context is least-privilege.** The AI context builder may read the hub, the
  activity log, and the user's notes/tasks. It may NOT read other apps, the file
  system at large, or anything the coding-agent companion ingests, unless the
  user explicitly attaches it.
- **The coding-agent companion is read-only by default** and never auto-approves.
  Approving an agent's request is always a distinct human click on the notch, with
  the request text shown verbatim. No click injection into the other app.
- **The character stays data.** AI gives the character words and timing; it does
  not give it code. Moods still come from the hub, now optionally nuanced by AI.

## v3 scope

### Carried from v2 (keep working, do not regress)
Everything in v2 scope, fully local, with no account and no network — Tier 0 must
remain a complete product.

### New in v3 (build these)
- **BYOK AI companion.** The user pastes an API key + picks a provider (an
  OpenAI-compatible base URL; Groq suggested). The character can chat, answer
  questions about the user's own notes/tasks/focus history, and run a guided
  focus/coaching session. Streaming output, cancelable. No key = feature off.
- **Coding-agent session companion.** Per-agent opt-in adapters that ingest a
  structured, validated event stream (files read/edited, commands proposed) and
  surface approval requests on the notch for a human click. Read-only default.
- **Egress ledger + network settings.** A visible "what left this PC" log and a
  settings screen listing every allow-listed host and the data each may send.
- **Optional account + E2E-encrypted sync (Tier 2).** Sync settings, characters,
  and progress across the user's machines. Server sees ciphertext only. Fully
  optional; never blocks offline use.

### Do NOT build in v3
Telemetry, analytics, ads, data sales. Click/keystroke injection into other apps.
Terminal scraping. Auto-approving any agent request. A general "run any command"
launcher (still a sandbox violation — stays parked). Reading other apps' content
beyond the opted-in, schema-validated agent event stream. Uploading anything in
Tier 0. Remote code or remote images outside signed packs.

## Build order (one spec each; perf-check gate between each)

> Prereq spec: **v2 verification.** Record perf + hardware checklists. Not a new
> feature — a gate. v3 features do not start until this is green.

14. **`net/` choke point + egress ledger + network settings.** No new user
    feature yet; this is the safety floor every later spec builds on. One place
    for outbound requests, the allow-list, and the visible ledger.
15. **BYOK AI runtime (Tier 1).** Provider client (OpenAI-compatible), key
    storage (local), context builder (hub/log/notes only), streaming chat,
    cancel, on-notch consent before first request, per-request ledger entries.
16. **AI companion UX + coaching.** Chat/coach panel (DOM, lazy), character mood
    nuance, guided focus session, empty/loading/error states, reduced-motion.
17. **Coding-agent companion.** Trusted local channel, per-agent adapter + schema,
    read-only event store, on-notch approval surface (human click only).
18. **Optional account + E2E sync (Tier 2).** Auth, encrypted sync of
    settings/characters/progress, conflict handling, offline-first, revoke.
19. **(Optional, future) local-model backend.** Only if wanted: add a local
    inference backend behind the same chat interface, with its own reviewed
    load/unload + memory budget. Not required for v3 to ship.
20. **UI polish + packaging.** Motion/identity pass across new surfaces; installer;
    size report; code signing; update check.

## Definition of done (every v3 spec)
Everything in the v2 definition of done, plus:
- Tier 0 still works with the network fully blocked (test with egress disabled).
- Every outbound host appears in `docs/network.md` and in the egress ledger.
- The AI model is proven to unload on lock/sleep/battery-saver/idle (measured).
- No feature auto-sends data; first use of any Tier 1/2 feature shows on-notch
  consent.
- `scripts/perf-check` within the v3 budget table (AI idle AND AI loaded).

## Open questions for review (decide before Spec 16)
1. **Default suggested provider + model?** Groq (`https://api.groq.com/openai/v1`)
   is fast and free-tier friendly; the base URL is user-editable so any
   OpenAI-compatible host works. Which model id to pre-fill?
2. **Key storage:** plain in the versioned settings file is simplest but readable
   on disk. Options: OS credential store (Windows Credential Manager) vs. a note
   that the key lives locally in app data. Decide the bar for v3.
3. **Which coding agents first?** Pick 1–2 with a real, documented local event
   source. If an agent has no safe read API, it waits.
4. **Sync endpoint:** self-host spec vs. a provided host. Tier 2 can ship after
   Tier 1 if it slips.
