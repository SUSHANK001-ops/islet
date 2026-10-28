import { invoke } from "@tauri-apps/api/core";

// Thin wrappers over the allow-listed system_* commands (Spec 11). Each returns
// a typed result; where a backend command is not wired yet (later task) the
// wrapper still type-checks and the UI shows its loading/unsupported state.

export interface AudioState {
  supported: boolean;
  volume: number; // 0..100
  muted: boolean;
  device: string;
}
export interface PowerState {
  hasBattery: boolean;
  percent: number; // 0..100
  charging: boolean;
  /** Windows "Energy Saver" is active. Distinct from simply being unplugged. */
  saver: boolean;
  overlay: "efficiency" | "balanced" | "performance" | "unknown";
  overlaySupported: boolean;
}
export interface RadioState {
  wifiSupported: boolean;
  wifiOn: boolean;
  wifiName: string | null;
  btSupported: boolean;
  btOn: boolean;
}

// Allow-listed Windows settings deep-links (enum, never a free URL).
export type SettingsLink =
  | "sound"
  | "power"
  | "notifications"
  | "bluetooth"
  | "project"
  | "cast"
  | "captions"
  | "accessibility";

export function openMsSettings(link: SettingsLink): Promise<void> {
  return invoke("open_ms_settings", { link });
}

export function audioGet(): Promise<AudioState> {
  return invoke("audio_get");
}
export function audioSetVolume(volume: number): Promise<void> {
  return invoke("audio_set_volume", { volume });
}
export function audioSetMute(muted: boolean): Promise<void> {
  return invoke("audio_set_mute", { muted });
}

export function powerGet(): Promise<PowerState> {
  return invoke("power_get");
}
export function powerSetOverlay(
  overlay: "efficiency" | "balanced" | "performance"
): Promise<PowerState> {
  return invoke("power_set_overlay", { overlay });
}

export function radiosGet(): Promise<RadioState> {
  return invoke("radios_get");
}
export function radiosRequestAccess(): Promise<boolean> {
  return invoke("radios_request_access");
}
export function radiosSet(
  kind: "wifi" | "bluetooth",
  on: boolean
): Promise<RadioState> {
  return invoke("radios_set", { kind, on });
}
