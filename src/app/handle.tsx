// Auto-hide handle. The full hit target is painted dark so an opaque WebView2
// backing can never show around a tiny transparent bar on Windows.
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
      data-islet-hit="0"
      onMouseEnter={onEnter}
      onFocus={onEnter}
    >
      <span class="islet-handle-grip" aria-hidden="true" />
      {dot ? <span class="islet-handle-dot" aria-hidden="true" /> : null}
    </button>
  );
}
