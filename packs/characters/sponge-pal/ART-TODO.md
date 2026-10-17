# Drop the Sponge Pal artwork here

This pack is wired up and valid EXCEPT for the images. Add the art and the
character comes alive - no code change needed (CHARACTERS.md hard rule).

## Required

- `sheet.png` - the main sprite sheet.
  - Frame grid: **48 x 48 px** per frame, **8 columns** (see `manifest.json`).
  - The manifest references these frame indices, so the sheet must have at
    least 5 rows (indices 0..42 are used):
    - row 0 (frames 0-3):   idle
    - row 1 (frames 8-11):  working
    - row 2 (frames 16-19): celebrating
    - row 3 (frames 24-25): sleeping
    - row 4 (frames 32-34): sad
    - row 5 (frames 40-42): curious
  - PNG only. Whole sheet <= 1024 x 1024 px and <= 1 MB. Pixel art looks best
    (manifest sets `pixelArt: true`, so smoothing is off and it scales x3).

## Optional (remove the matching manifest entries if you don't ship these)

- `stages/bubbly.png`, `stages/mighty.png` - growth-stage sheets (same grid).
- `outfits/hard-hat.png` - a transparent overlay on the same frame grid.
- `preview.png` - up to 128 x 128, shown in the character picker.

## After adding art

```powershell
npm run validate-character -- sponge-pal
npm run character-preview -- sponge-pal
```

Fix every error/warning, then check the limits table in `CHARACTERS.md`.

> Until `sheet.png` exists, the app reports this pack as incomplete (missing
> sheet) and simply shows no character - it never crashes or shows a broken
> image.
