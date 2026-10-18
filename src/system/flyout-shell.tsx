import type { ComponentChildren } from "preact";

// Shared flyout chrome (Spec 11, design §3): a small chip label floating above
// a card, matching every reference screenshot but drawn with Islet tokens. Used
// by all five system flyouts. The spring-in animation is CSS (.islet-flyout),
// transform/opacity only, reduced-motion safe.
//
// `chip` is the pill-anchored affordance; when a flyout is shown as a System
// TAB (not from the pill) the caller passes chip={undefined} for a plain card.
export function FlyoutShell({
  chip,
  children,
  label,
}: {
  chip?: string;
  label: string;
  children: ComponentChildren;
}) {
  return (
    <div class="islet-flyout" role="dialog" aria-label={label}>
      {chip ? <div class="islet-flyout-chip">{chip}</div> : null}
      <div class="islet-flyout-card">{children}</div>
    </div>
  );
}

/** A titled section inside a flyout card (e.g. "Power", "Sound"). */
export function FlyoutSection({
  title,
  right,
  children,
}: {
  title?: string;
  right?: ComponentChildren;
  children: ComponentChildren;
}) {
  return (
    <section class="islet-flyout-section">
      {title || right ? (
        <header class="islet-flyout-section-head">
          {title ? <span class="islet-flyout-section-title">{title}</span> : null}
          {right ? <span class="islet-flyout-section-right">{right}</span> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}
