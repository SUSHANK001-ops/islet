// validate-character: check a character pack against the JSON Schema and the
// limits in CHARACTERS.md. The real validator (with image/limit checks) is
// built in Spec 6; Rust is the source of truth for untrusted packs. This CLI
// is a convenience for pack authors and CI.
//
// Usage: npm run validate-character -- <id>
//
// Spec 0 status: schema-only placeholder so the command exists. It fails loudly
// rather than pretending a pack is valid.

const id = process.argv[2];
if (!id) {
  console.error("Usage: npm run validate-character -- <id>");
  process.exit(2);
}

console.error(
  `validate-character: not implemented until Spec 6 (character engine). ` +
    `Requested pack: "${id}". The JSON Schema lives at ` +
    `shared/schemas/character.schema.json; image + limit + safety checks are ` +
    `enforced in Rust (src-tauri/src/characters/). See CHARACTERS.md.`
);
process.exit(1);
