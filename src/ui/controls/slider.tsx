import { useRef } from "preact/hooks";
import { MOTION, prefersReducedMotion } from "../motion";

// Animated slider (Spec 11). The filled track + thumb ease to a NEW value on
// external change, but track the pointer 1:1 while dragging (no laggy easing
// under the finger). Keyboard: arrows/Home/End. Tokens-only styling in CSS.
export function Slider({
  value,
  min = 0,
  max = 100,
  step = 1,
  label,
  onInput,
  onChange,
}: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  label: string;
  onInput: (v: number) => void;
  onChange?: (v: number) => void;
}) {
  const dragging = useRef(false);
  const pct = ((value - min) / (max - min)) * 100;
  // Ease only when NOT dragging and motion is allowed.
  const ease =
    dragging.current || prefersReducedMotion()
      ? "none"
      : `${MOTION.durFast}ms ${MOTION.easeOut}`;

  return (
    <div class="islet-slider">
      <input
        type="range"
        class="islet-slider-input"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onPointerDown={() => (dragging.current = true)}
        onPointerUp={() => {
          dragging.current = false;
          onChange?.(value);
        }}
        onInput={(e) => onInput(Number(e.currentTarget.value))}
      />
      <div class="islet-slider-track" aria-hidden="true">
        <div
          class="islet-slider-fill"
          style={{ width: `${pct}%`, transition: `width ${ease}` }}
        />
        <div
          class="islet-slider-thumb"
          style={{ left: `${pct}%`, transition: `left ${ease}` }}
        />
      </div>
    </div>
  );
}
