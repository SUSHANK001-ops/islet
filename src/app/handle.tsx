// Auto-hide handle (Spec 12). When pill visibility is "auto-hide", the pill
// collapses to a thin handle; hovering it expands back to the pill/status bar.
// A single dot shows when a timer is running or there are unread notifications
// (nothing more). Animation is width + opacity only (reduced-motion safe in CSS).

export function Handle({
  dot,
  onEnter,
}: {
  dot: boolean;
  onEnter: () => void;
}) {
  return (
    <button
      class="islet-handle"
      aria-label="Islet"
      // Marks this as a clickable surface for the window hit region.
      data-islet-hit="10"
      onMouseEnter={onEnter}
      onFocus={onEnter}
    >
      {dot ? <span class="islet-handle-dot" aria-hidden="true" /> : null}
    </button>
  );
}
