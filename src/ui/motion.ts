// Motion helpers (Spec 11). Single source of truth for durations/curves so
// every system surface animates consistently. Values mirror the motion tokens
// in tokens.css; keeping them here too lets JS-driven animations (e.g. the
// segmented highlight, toasts) read the same numbers as CSS.
//
// Rule (AGENTS.md + prompt §4): transform/opacity only, 120-200ms, no bounce
// loops, respect reduced motion. Nothing here introduces a new visual.

export const MOTION = {
  durFast: 120,
  dur: 200,
  durSlow: 320,
  easeSpring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  easeOut: "cubic-bezier(0.16, 1, 0.3, 1)",
} as const;

/** True when the user asked the OS to reduce motion. Checked at call time so a
 *  change applies without reload (the media query is live). */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** A transition string honoring reduced motion (returns "none" when reduced).
 *  `props` is one or more CSS properties (transform/opacity only by rule). */
export function transition(
  props: string | string[],
  ms: number = MOTION.dur,
  ease: string = MOTION.easeOut
): string {
  if (prefersReducedMotion()) return "none";
  const list = Array.isArray(props) ? props : [props];
  return list.map((p) => `${p} ${ms}ms ${ease}`).join(", ");
}
