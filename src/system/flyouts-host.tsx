import { useEffect, useRef, useState } from "preact/hooks";
import type { ComponentType } from "preact";
import type { FlyoutKey } from "../app/status-bar";
import { FLYOUT_LOADERS, FLYOUT_LABEL } from "./registry";
import { FlyoutShell } from "./flyout-shell";
import { t } from "../ui/i18n";

// Host for the system flyouts opened from the status bar (Spec 11). Owns the
// open/close state + anchor, lazy-loads the flyout body, positions the card
// under the item (clamped on-screen), and closes on Esc / click-away.

export interface FlyoutController {
  open: FlyoutKey | null;
  openAt: (key: FlyoutKey, anchor: HTMLElement) => void;
  close: () => void;
  anchorRect: DOMRect | null;
}

export function useFlyoutController(): FlyoutController {
  const [open, setOpen] = useState<FlyoutKey | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  return {
    open,
    anchorRect,
    openAt: (key, anchor) => {
      setAnchorRect(anchor.getBoundingClientRect());
      setOpen((cur) => (cur === key ? null : key)); // toggle if same item
    },
    close: () => setOpen(null),
  };
}

export function SystemFlyouts({ ctrl }: { ctrl: FlyoutController }) {
  const { open, anchorRect, close } = ctrl;
  const [Body, setBody] = useState<ComponentType<{ chip?: boolean }> | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  // Lazy-load the flyout body whenever `open` changes.
  useEffect(() => {
    let alive = true;
    setBody(null);
    if (!open) return;
    FLYOUT_LOADERS[open]()
      .then((m) => alive && setBody(() => m.default))
      .catch(() => alive && setBody(null));
    return () => {
      alive = false;
    };
  }, [open]);

  // Esc closes; click outside the card closes.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    function onDown(e: PointerEvent) {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) close();
    }
    window.addEventListener("keydown", onKey);
    // Defer so the opening click does not immediately close it.
    const id = setTimeout(
      () => window.addEventListener("pointerdown", onDown),
      0
    );
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(id);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open, close]);

  if (!open) return null;

  // Position: centered under the anchor, clamped to the viewport. Card width is
  // a fixed token width (~288+padding); clamp with a margin so it never leaves
  // the screen (DPI-correct because these are CSS px in the webview).
  const CARD_W = 300;
  const margin = 8;
  const cx = anchorRect ? anchorRect.left + anchorRect.width / 2 : window.innerWidth / 2;
  let left = cx - CARD_W / 2;
  left = Math.max(margin, Math.min(left, window.innerWidth - CARD_W - margin));
  const top = anchorRect ? anchorRect.bottom + 8 : 40;

  return (
    <div
      class="islet-flyout-host"
      style={{ position: "fixed", left: `${left}px`, top: `${top}px` }}
      data-islet-hit="20"
      ref={cardRef}
    >
      <FlyoutShell chip={t(FLYOUT_LABEL[open])} label={t(FLYOUT_LABEL[open])}>
        {Body ? <Body /> : <div class="islet-empty">{t("common.loading")}</div>}
      </FlyoutShell>
    </div>
  );
}
