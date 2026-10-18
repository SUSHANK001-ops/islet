import { useState } from "preact/hooks";
import type { FlyoutKey } from "../app/status-bar";

// Host for the system flyouts opened from the status bar (Spec 11). Task 2
// provides the open/close state + anchor tracking; Task 3 mounts the real
// shared flyout components here (lazy-loaded) keyed by `open`. Kept as its own
// component so the shell stays simple and the flyouts can grow independently.

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
      setOpen(key);
    },
    close: () => setOpen(null),
  };
}

// Placeholder host. Task 3 replaces the body with the real flyout registry +
// lazy components anchored to `ctrl.anchorRect`. For now it renders nothing so
// the status bar compiles and ships behind the pill-style setting.
export function SystemFlyouts({ ctrl: _ctrl }: { ctrl: FlyoutController }) {
  return null;
}
