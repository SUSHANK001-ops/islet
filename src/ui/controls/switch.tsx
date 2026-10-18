// A compact animated on/off switch (Spec 11). The knob slides (transform) and
// the track cross-fades to the accent. Reuses the existing .islet-switch CSS.
// For label+switch rows elsewhere the app uses .islet-toggle; this is the
// iOS-style sliding switch used inside flyouts (e.g. "Show network name").
export function Switch({
  on,
  label,
  disabled = false,
  onToggle,
}: {
  on: boolean;
  label: string;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      class={`islet-switch${on ? " on" : ""}`}
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
    >
      <span class="islet-switch-knob" aria-hidden="true" />
    </button>
  );
}
