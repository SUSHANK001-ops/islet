import { useEffect, useRef } from "preact/hooks";
import { assetUrl, packFilePath, type LoadedCharacter } from "./bridge";
import {
  SpriteEngine,
  decodeSheet,
  freeBitmap,
  type Surface,
} from "./sprite-engine";
import {
  activeCharacter,
  animationAllowed,
  gateVersion,
  totalFocusMinutes,
} from "./character-store";
import { notchState, resolveState, type CharacterSignals } from "./state-machine";
import { resolveStage } from "./mood";

// Shared rendering hook. Decodes the active character's sheet ONCE and keeps a
// SpriteEngine bound to a canvas. The notch and panel each call this with their
// surface; because both read the SAME activeCharacter signal and we cache the
// decoded bitmap per character, we never decode a sheet twice.
//
// A module-level cache keyed by character id holds the one ImageBitmap so the
// notch and the panel share it. It is freed when the character changes.
// Cache key = character id + the resolved stage sheet, so reaching a new growth
// stage swaps the sheet (and frees the old bitmap), while the notch and panel
// at the same stage still share ONE decoded bitmap.
let cachedKey: string | null = null;
let cachedBitmap: ImageBitmap | null = null;
let cachedPromise: Promise<ImageBitmap> | null = null;

/** Absolute path to the sheet for the character's current growth stage. */
function stageSheetPath(char: LoadedCharacter, minutes: number): string {
  const stage = resolveStage(char.manifest, minutes);
  // No stages, or the stage points at the main sheet file name -> main sheet.
  if (!stage) return char.sheetPath;
  if (stage.sheet === char.manifest.sheet.file) return char.sheetPath;
  return packFilePath(char.sheetPath, stage.sheet);
}

async function bitmapFor(char: LoadedCharacter, minutes: number): Promise<ImageBitmap> {
  const sheetPath = stageSheetPath(char, minutes);
  const key = `${char.manifest.id}::${sheetPath}`;
  if (cachedKey === key && cachedBitmap) return cachedBitmap;
  // Key changed (character or stage): free the old bitmap before decoding.
  freeBitmap(cachedBitmap);
  cachedBitmap = null;
  cachedPromise = decodeSheet(assetUrl(sheetPath))
    .then((bm) => {
      cachedBitmap = bm;
      cachedKey = key;
      return bm;
    })
    .catch((e) => {
      // A missing stage sheet falls back to the main sheet (CHARACTERS.md).
      if (sheetPath !== char.sheetPath) {
        return decodeSheet(assetUrl(char.sheetPath)).then((bm) => {
          cachedBitmap = bm;
          cachedKey = `${char.manifest.id}::${char.sheetPath}`;
          return bm;
        });
      }
      throw e;
    });
  return cachedPromise;
}

interface CharacterCanvasProps {
  surface: Surface;
  /** App signals used to pick the state (focusing, completion, hour). */
  signals: CharacterSignals;
  /** CSS class for sizing the canvas box. */
  class?: string;
}

/**
 * A canvas that renders the active character for one surface. Handles decode,
 * engine lifecycle, state selection, and the animate/static gate. Drawing stops
 * completely when animation is not allowed (it draws one static frame instead).
 */
export function CharacterCanvas({ surface, signals, class: className }: CharacterCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<SpriteEngine | null>(null);
  const char = activeCharacter.value;
  const gate = gateVersion.value; // subscribe to gate changes
  const minutes = totalFocusMinutes.value; // subscribe to growth changes
  // The resolved stage id keys the engine rebuild so a new stage reloads art.
  const stageId = char ? resolveStage(char.manifest, minutes)?.id ?? "" : "";

  // Pick the state name for this surface from the current signals.
  const stateName = char
    ? surface === "notch"
      ? notchState(char.manifest, signals)
      : resolveState(char.manifest, signals)
    : "idle";

  // (Re)create the engine when the character or canvas changes.
  useEffect(() => {
    let alive = true;
    const canvas = canvasRef.current;
    engineRef.current?.stop();
    engineRef.current = null;
    if (!char || !canvas) return;

    bitmapFor(char, minutes)
      .then((bitmap) => {
        if (!alive) return;
        const engine = new SpriteEngine(canvas, char, bitmap, surface);
        engineRef.current = engine;
        engine.setState(stateName);
        if (animationAllowed()) engine.start();
        else engine.drawStatic();
      })
      .catch(() => {
        /* decode failed: leave the canvas blank, no crash */
      });

    return () => {
      alive = false;
      engineRef.current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [char?.manifest.id, surface, stageId]);

  // React to state changes and the animate/static gate without rebuilding.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setState(stateName);
    if (animationAllowed()) {
      engine.start();
    } else {
      engine.stop();
      engine.drawStatic();
    }
  }, [stateName, gate]);

  if (!char) return null;
  return <canvas ref={canvasRef} class={className} aria-hidden="true" />;
}

/** Free the shared bitmap entirely (call when leaving the app / on teardown). */
export function disposeCharacterBitmap() {
  freeBitmap(cachedBitmap);
  cachedBitmap = null;
  cachedKey = null;
  cachedPromise = null;
}
