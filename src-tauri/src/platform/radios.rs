//! Wi-Fi / Bluetooth radios (Spec 11) via WinRT Windows.Devices.Radios.
//! RequestAccessAsync once before SetStateAsync; GetRadiosAsync lists only
//! radios present at launch; hardware/policy can override a request so the UI
//! always re-reads the REAL state after a change. Network NAME is intentionally
//! not read (would need the location setting). HARDWARE VERIFICATION PENDING.

use serde::Serialize;

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RadioState {
    pub wifi_supported: bool,
    pub wifi_on: bool,
    /// Always null in v1: we never request the location permission needed to
    /// read the SSID on 24H2 (privacy). The UI shows "Connected".
    pub wifi_name: Option<String>,
    pub bt_supported: bool,
    pub bt_on: bool,
}

#[cfg(windows)]
mod imp {
    use super::RadioState;
    use windows::Devices::Radios::{Radio, RadioAccessStatus, RadioKind, RadioState as WinRadioState};

    fn snapshot() -> RadioState {
        let mut st = RadioState {
            wifi_supported: false,
            wifi_on: false,
            wifi_name: None,
            bt_supported: false,
            bt_on: false,
        };
        // GetRadiosAsync -> list; .join() to resolve (same pattern as media.rs).
        let Ok(op) = Radio::GetRadiosAsync() else { return st };
        let Ok(list) = op.join() else { return st };
        let Ok(iter) = list.First() else { return st };
        while iter.HasCurrent().unwrap_or(false) {
            if let Ok(radio) = iter.Current() {
                let kind = radio.Kind().unwrap_or(RadioKind::Other);
                let on = radio.State().map(|s| s == WinRadioState::On).unwrap_or(false);
                match kind {
                    RadioKind::WiFi => {
                        st.wifi_supported = true;
                        st.wifi_on = on;
                    }
                    RadioKind::Bluetooth => {
                        st.bt_supported = true;
                        st.bt_on = on;
                    }
                    _ => {}
                }
            }
            if iter.MoveNext().is_err() {
                break;
            }
        }
        st
    }

    pub fn get() -> RadioState {
        snapshot()
    }

    pub fn request_access() -> bool {
        match Radio::RequestAccessAsync().and_then(|op| op.join()) {
            Ok(status) => status == RadioAccessStatus::Allowed,
            Err(_) => false,
        }
    }

    pub fn set(kind: &str, on: bool) -> RadioState {
        let target = match kind {
            "wifi" => RadioKind::WiFi,
            "bluetooth" => RadioKind::Bluetooth,
            _ => return snapshot(),
        };
        let want = if on { WinRadioState::On } else { WinRadioState::Off };
        if let Ok(op) = Radio::GetRadiosAsync() {
            if let Ok(list) = op.join() {
                if let Ok(iter) = list.First() {
                    while iter.HasCurrent().unwrap_or(false) {
                        if let Ok(radio) = iter.Current() {
                            if radio.Kind().unwrap_or(RadioKind::Other) == target {
                                if let Ok(setop) = radio.SetStateAsync(want) {
                                    let _ = setop.join();
                                }
                            }
                        }
                        if iter.MoveNext().is_err() {
                            break;
                        }
                    }
                }
            }
        }
        // Re-read: hardware/policy may have overridden the request.
        snapshot()
    }
}

#[cfg(windows)]
pub fn get() -> RadioState {
    imp::get()
}
#[cfg(windows)]
pub fn request_access() -> bool {
    imp::request_access()
}
#[cfg(windows)]
pub fn set(kind: &str, on: bool) -> RadioState {
    imp::set(kind, on)
}

#[cfg(not(windows))]
pub fn get() -> RadioState {
    RadioState {
        wifi_supported: false,
        wifi_on: false,
        wifi_name: None,
        bt_supported: false,
        bt_on: false,
    }
}
#[cfg(not(windows))]
pub fn request_access() -> bool {
    false
}
#[cfg(not(windows))]
pub fn set(_kind: &str, _on: bool) -> RadioState {
    get()
}
