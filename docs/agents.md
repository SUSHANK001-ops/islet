# Coding-agent companion (Spec 17)

Islet can show what a supported local coding agent is doing and surface its
command-approval requests on the notch. It is **read-only by design**: Islet
watches, validates, and records your decision. It never runs a command, opens a
file, scrapes a terminal, or injects a click.

The feature is OFF by default. Turn on the **Agents** tab in Settings → Tabs.

## How an agent integrates (the channel)

The channel is a watched folder — no socket, no live IPC. An agent (or a thin
adapter you run next to it) drops one JSON file per event into:

```
<app-data>/agents/inbox/<anything>.json
```

Islet drains that folder on a slow interval while the Agents panel is open:
it validates each file, stores the event (assigning its own id + time), and
deletes the file. Malformed, oversize (> 64 KB), or unknown-kind files are
discarded.

### Event file format

```json
{
  "agent": "claude-code",
  "kind": "file_edit",
  "title": "Edit src/main.rs",
  "detail": "optional longer text (shown verbatim for command_proposed)",
  "path": "src/main.rs"
}
```

- `agent` (required): short name of the agent. Sanitized, capped at 60 chars.
- `kind` (required): one of `file_read`, `file_edit`, `command_proposed`,
  `status`. Any other value is rejected.
- `title` (required): one-line summary. Capped at 200 chars.
- `detail` (optional): longer text. For `command_proposed` this is the exact
  command, shown verbatim so the human sees what would run. Capped at 2000.
- `path` (optional): a file path for display only. Never opened. Capped at 400.

All strings are stripped of control characters and collapsed whitespace before
storage, so nothing from an untrusted file can break the UI.

## Approvals (the only action)

An event with `kind: "command_proposed"` shows **Approve** / **Decline** buttons.
A click records the decision and writes:

```
<app-data>/agents/decisions/<event-id>.json
```

```json
{ "id": "evt-...", "decision": "approved", "time": "2026-11-12T19:41:10" }
```

The agent polls that folder to learn the verdict and acts (or not) on its own
side. **Islet executes nothing** — the decision file is the entire action. This
is what keeps the feature safe: approving in Islet can never, by construction,
run a program.

## What is explicitly NOT built

Terminal scraping, click injection into the agent's UI, auto-approval, reading
other apps' content, or any outbound network. See AGENTS.v3.md non-goals.
