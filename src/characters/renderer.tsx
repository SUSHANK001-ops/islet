import { useEffect, useRef } from "preact/hooks";
import { assetUrl, type LoadedCharacter } from "./bridge";
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
} from "./character-store";
import { notchState, resolveState, type CharacterSignals } from "./state-machine";

// Shared rendering hook. Decodes the active character's sheet ONCE and keeps a
// SpriteEngine bound to a canvas. The notch and panel each call this with their
// surface; because both read the SAME activeCharacter signal and we cache the
// decoded bitmap per character, we never decode a sheet twice.
//
// A module-level cache keyed by character id holds the one ImageBitmap so the
// notch and the panel share it. It is freed when the character changes.
let cachedId: string | null = null;
let cachedBitmap: ImageBitmap | null = null;
let cachedPromise: Promise<ImageBitmap> | null = null;

async function bitmapFor(char: LoadedCharacter): Promise<ImageBitmap> {
  if (cachedId === char.manifest.id && cachedBitmap) return cachedBitmap;
  // Character changed: free the old bitmap before decoding the new one.
  if (cachedId !== char.manifest.id) {
    freeBitmap(cachedBitmap);
    cachedBitmap = null;
    cachedPromise = null;
  }
  if (!cachedPromise) {
    cachedPromise = decodeSheet(assetUrl(char.sheetPath)).then((bm) => {
      cachedBitmap = bm;
      cachedId = char.manifest.id;
      return bm;
    });
  }
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

    bitmapFor(char)
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
  }, [char?.manifest.id, surface]);

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
  cachedId = null;
  cachedPromise = null;
}
