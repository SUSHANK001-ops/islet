import { useRef } from "preact/hooks";
import { MOTION, prefersReducedMotion } from "../motion";

// Segmented control (Spec 11). The signature "crafted" detail: ONE shared
// highlight element SLIDES between segments (translateX) instead of two boxes
// cross-fading. Keyboard: arrows move + select; roving tabindex. Tokens-only.
export interface Segment<T extends string> {
  value: T;
  label: string;
}

export function Segmented<T extends string>({
  segments,
  value,
  label,
  onSelect,
}: {
  segments: Segment<T>[];
  value: T;
  label: string;
  onSelect: (v: T) => void;
}) {
  const idx = Math.max(0, segments.findIndex((s) => s.value === value));
  const n = segments.length;
  const groupRef = useRef<HTMLDivElement | null>(null);

  const ease = prefersReducedMotion()
    ? "none"
    : `${MOTION.dur}ms ${MOTION.easeOut}`;

  function onKey(e: KeyboardEvent, i: number) {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const dir = e.key === "ArrowRight" ? 1 : -1;
      const next = (i + dir + n) % n;
      onSelect(segments[next].value);
      // Move focus to the newly-active segment button.
      const btns = groupRef.current?.querySelectorAll<HTMLButtonElement>(
        ".islet-seg-btn"
      );
      btns?.[next]?.focus();
    }
  }

  return (
    <div
      class="islet-segmented"
      role="radiogroup"
      aria-label={label}
      ref={groupRef}
    >
      {/* The sliding highlight: one element positioned by transform. */}
      <div
        class="islet-seg-highlight"
        aria-hidden="true"
        style={{
          width: `calc((100% - 8px) / ${n})`,
          transform: `translateX(calc(${idx} * 100%))`,
          transition: `transform ${ease}`,
        }}
      />
      {segments.map((s, i) => (
        <button
          key={s.value}
          role="radio"
          aria-checked={s.value === value}
          tabIndex={s.value === value ? 0 : -1}
          class={`islet-seg-btn${s.value === value ? " active" : ""}`}
          onClick={() => onSelect(s.value)}
          onKeyDown={(e) => onKey(e, i)}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
