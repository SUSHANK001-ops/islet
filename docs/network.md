# Network hosts (v3)

Islet is offline-first. This file lists EVERY host the app may contact, which
feature uses it, and what data is sent. If a host is not here, the app does not
talk to it. The `net/` choke point (`src-tauri/src/net/`) enforces this: it is
the only place that opens a socket, it rejects any host not on the runtime
allow-list, and it writes one line per attempt to the egress ledger.

See the user-facing view in Settings → Network & privacy (airplane mode, the
allow-list, and the "what left this PC" ledger).

## Rules (enforced in Rust)

- HTTPS only. Plain HTTP is refused.
- No redirects (a redirect could leave the allow-listed host).
- Closed by default: a request is rejected unless its host is on the allow-list
  AND that entry is enabled AND airplane mode is off.
- Size + timeout caps on every response.
- The egress ledger records metadata only — host, feature, method, byte counts,
  result. Never headers (e.g. Authorization) or request bodies (e.g. prompts).

## Hosts

| Host | Feature | Enabled by | Data sent | Added in |
|---|---|---|---|---|
| `catalog.baseUrl` (if configured) | `catalog` | user opens Browse (v2 consent) | nothing outbound beyond the request line; downloads are signed + hash-checked | v2 (Spec 13) |
| _AI provider host (BYOK)_ e.g. `api.groq.com` | `ai` | user pastes a key + consents on the notch | the user's chat messages + any context they attach, plus the Authorization header | v3 (Spec 15) |
| _user's sync endpoint_ | `sync` | user signs in (optional) | end-to-end-encrypted blobs only (server sees ciphertext) | v3 (Spec 18) |

Only the catalog row ships configured today (and only if the catalog host +
signing key are set in `app_config.rs`). The `ai` and `sync` rows are added by
their specs; the host is not contacted until the user turns the feature on.

## How to verify "nothing leaves the PC" (Tier 0)

1. Settings → Network & privacy → turn on **Airplane mode**.
2. Use the app normally. The egress ledger shows every attempt as **Blocked**
   (result `rejected`) with `0 B sent`, proving no socket was opened.
3. The focus timer, tasks, notes, character, and all local features keep working.
