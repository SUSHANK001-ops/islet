import type { ComponentType } from "preact";
import type { FlyoutKey } from "../app/status-bar";

// Lazy loaders for each system flyout body (Spec 11). Code for a flyout loads
// only when it first opens (closed cost = zero). Each module default-exports a
// component that renders inside FlyoutShell. "battery" maps to the power flyout.
type Loader = () => Promise<{ default: ComponentType<{ chip?: boolean }> }>;

export const FLYOUT_LOADERS: Record<FlyoutKey, Loader> = {
  clock: () => import("./clock/flyout"),
  sound: () => import("./sound/flyout"),
  battery: () => import("./power/flyout"),
  quick: () => import("./quick/flyout"),
  notifications: () => import("./notifications/flyout"),
};

// Label shown in the chip above the card + used for the dialog aria-label.
export const FLYOUT_LABEL: Record<FlyoutKey, string> = {
  clock: "tab.clock",
  sound: "tab.sound",
  battery: "tab.battery",
  quick: "tab.quick",
  notifications: "tab.notifications",
};
