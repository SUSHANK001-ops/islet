# Character catalog — how to publish (Spec 13)

The catalog lets users browse and install characters from ONE online host you
control. It is safe by construction: HTTPS only, one host, user-started, a
signed index, a SHA-256 per pack, strict size/timeout limits, and the normal
Rust validator runs on every download before install. See the hard security
rules in `AGENTS.md` and `src-tauri/src/characters/catalog.rs`.

## One-time setup

1. **Generate an Ed25519 key pair.** Keep the PRIVATE key OFF the repo and off
   any shared machine.
   ```bash
   openssl genpkey -algorithm ed25519 -out islet-catalog.key
   openssl pkey -in islet-catalog.key -pubout -out islet-catalog.pub
   ```
2. **Put the PUBLIC key in the app.** Convert the 32-byte public key to hex and
   set it as `CATALOG_PUBLIC_KEY_HEX` in `src-tauri/src/app_config.rs`. Set
   `CATALOG_BASE_URL` to your HTTPS host (e.g. `https://chars.example.com`).
   Until both are set, the app shows "Catalog not set up" and only local import
   works. The private key is NEVER committed.

## Adding a character

1. Obtain ORIGINAL art (or art properly licensed under CC0-1.0, CC-BY-4.0, or
   MIT). Never use art based on an existing cartoon, game, or brand character.
2. Turn a raw sheet + a frame-map into a pack folder (a human reviews it):
   ```bash
   node scripts/import-sheet.mjs sheet.png framemap.json catalog/packs/<id>
   ```
   Fill `author`, `license`, and `sourceUrl` in the frame-map (required).
3. Review the art + `LICENSE.txt` by hand. Add an optional `preview.png`
   (≤ 64 KB, ≤ 128×128) to the pack folder.

## Building + signing the index

```bash
# ISLET_CATALOG_KEY points at your PRIVATE key (PKCS8 PEM). Never in the repo.
ISLET_CATALOG_KEY=/secure/islet-catalog.key node scripts/catalog-build.mjs
```

This zips each `catalog/packs/<id>/` to `<id>-<version>.islet-char`, computes
hashes + sizes, writes `catalog/index.json`, and signs it to `catalog/index.sig`.

## Publishing

Upload the `catalog/` folder as static files to your HTTPS host, preserving:

```
index.json
index.sig
packs/<id>-<version>.islet-char
previews/<id>.png
```

The app fetches `index.json` + `index.sig`, verifies the signature against the
built-in public key, then shows the Browse grid. Installing a character
re-fetches + re-verifies the index, checks the SHA-256, runs the validator, and
installs via a temp folder + rename. Any failure installs nothing.

## Limits (enforced in the app)

| Item | Limit |
|---|---|
| Index | 256 KB |
| Pack | 3 MB |
| Preview | 64 KB |
| Timeout | 15 s |
| Licenses | CC0-1.0, CC-BY-4.0, MIT only |
| Redirects | none (must stay on the one host) |

## Notes

- The optional "tell me about new characters" check is OFF by default and runs
  at most once per 24 h, at launch only.
- A pack flagged `"placeholder": true` is never shown in Browse or shipped.
- Local file imports (Settings → Characters → Import file) can have any license,
  shown with a note in the UI.
