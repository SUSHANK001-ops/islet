//! Battery status + power-mode overlay (Spec 11). Battery via GetSystemPower
//! status (read on the Spec 3 power-broadcast signal). Overlay via the
//! UNDOCUMENTED powrprof PowerGetActualOverlayScheme / PowerSetActiveOverlayScheme.
//! Known GUIDs: Efficiency / Performance; Balanced is confirmed on hardware.
//! HARDWARE VERIFICATION PENDING (docs/windows-notes.md).

use serde::Serialize;

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PowerState {
    pub has_battery: bool,
    pub percent: u8,
    pub charging: bool,
    /// "efficiency" | "balanced" | "performance" | "unknown".
    pub overlay: String,
    pub overlay_supported: bool,
}

#[cfg(windows)]
mod imp {
    use super::PowerState;
    use windows::core::GUID;
    use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};

    // Overlay scheme GUIDs (undocumented). Balanced is the zero GUID in practice
    // on many systems but MUST be confirmed on hardware.
    const EFFICIENCY: GUID = GUID::from_u128(0x961cc777_2547_4f9d_8174_7d86181b8a7a);
    const PERFORMANCE: GUID = GUID::from_u128(0xded574b5_45a0_4f42_8737_46345c09c238);
    const BALANCED: GUID = GUID::from_u128(0x00000000_0000_0000_0000_000000000000);

    // powrprof entry points are UNDOCUMENTED and not present in powrprof.lib's
    // import table, so a normal `#[link]` leaves them unresolved. `raw-dylib`
    // makes the linker generate the import directly from the DLL by name, which
    // resolves them at runtime against powrprof.dll. Both return a Win32 error
    // code (0 == success).
    #[link(name = "powrprof", kind = "raw-dylib")]
    extern "system" {
        fn PowerGetActualOverlayScheme(overlay_scheme_guid: *mut GUID) -> u32;
        fn PowerSetActiveOverlayScheme(overlay_scheme_guid: GUID) -> u32;
    }

    fn overlay_name(g: &GUID) -> &'static str {
        if *g == EFFICIENCY {
            "efficiency"
        } else if *g == PERFORMANCE {
            "performance"
        } else if *g == BALANCED {
            "balanced"
        } else {
            "unknown"
        }
    }

    fn read_overlay() -> (String, bool) {
        let mut g = GUID::zeroed();
        // SAFETY: valid out-pointer; the call fills it or returns an error.
        let rc = unsafe { PowerGetActualOverlayScheme(&mut g) };
        if rc == 0 {
            (overlay_name(&g).to_string(), true)
        } else {
            ("unknown".into(), false)
        }
    }

    pub fn get() -> PowerState {
        let mut s = SYSTEM_POWER_STATUS::default();
        // SAFETY: valid out-pointer to a zeroed struct.
        let ok = unsafe { GetSystemPowerStatus(&mut s).is_ok() };
        // BatteryFlag 128 = "no system battery".
        let has_battery = ok && (s.BatteryFlag & 128) == 0;
        let percent = if s.BatteryLifePercent == 255 { 0 } else { s.BatteryLifePercent };
        let charging = s.ACLineStatus == 1;
        let (overlay, overlay_supported) = read_overlay();
        PowerState {
            has_battery,
            percent,
            charging,
            overlay,
            overlay_supported,
        }
    }

    pub fn set_overlay(which: &str) -> PowerState {
        let g = match which {
            "efficiency" => EFFICIENCY,
            "performance" => PERFORMANCE,
            _ => BALANCED,
        };
        // SAFETY: passing a by-value GUID; returns an error code we ignore here
        // because we re-read the actual state below (read-back is the truth).
        unsafe {
            let _ = PowerSetActiveOverlayScheme(g);
        }
        get()
    }
}

#[cfg(windows)]
pub fn get() -> PowerState {
    imp::get()
}

#[cfg(windows)]
pub fn set_overlay(which: &str) -> PowerState {
    imp::set_overlay(which)
}

// Non-Windows fallback so the project compiles for tests/CI elsewhere.
#[cfg(not(windows))]
pub fn get() -> PowerState {
    PowerState {
        has_battery: false,
        percent: 0,
        charging: true,
        overlay: "unknown".into(),
        overlay_supported: false,
    }
}

#[cfg(not(windows))]
pub fn set_overlay(_which: &str) -> PowerState {
    get()
}
