// character-preview: render each state of a pack to an image for eyeballing.
// Built in Spec 6. Placeholder so the documented command exists.
//
// Usage: npm run character-preview -- <id>

const id = process.argv[2];
if (!id) {
  console.error("Usage: npm run character-preview -- <id>");
  process.exit(2);
}

console.error(
  `character-preview: not implemented until Spec 6 (character engine). ` +
    `Requested pack: "${id}".`
);
process.exit(1);
