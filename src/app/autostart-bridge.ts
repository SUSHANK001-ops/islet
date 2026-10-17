import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";

// Thin wrapper over the autostart plugin so the settings UI has one place to
// call and errors are handled consistently. Launch-at-startup is OFF by
// default (privacy rule); the user opts in.

export async function getAutostart(): Promise<boolean> {
  try {
    return await isEnabled();
  } catch {
    return false;
  }
}

/** Apply the desired state. Returns the actual state after the attempt. */
export async function setAutostart(on: boolean): Promise<boolean> {
  try {
    if (on) {
      await enable();
    } else {
      await disable();
    }
  } catch {
    // Non-fatal: report the real state so the toggle reflects reality.
  }
  return getAutostart();
}
