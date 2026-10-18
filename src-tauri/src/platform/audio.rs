//! Default-output volume/mute/device (Spec 11) via Core Audio
//! (IMMDeviceEnumerator -> IMMDevice -> IAudioEndpointVolume). get/set/mute.
//! A change callback (IAudioEndpointVolumeCallback) is the event-driven ideal;
//! where that is awkward the Sound flyout re-reads on open + after each action
//! (Media-class exception, documented). HARDWARE VERIFICATION PENDING.

use serde::Serialize;

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AudioState {
    pub supported: bool,
    pub volume: u8, // 0..100
    pub muted: bool,
    pub device: String,
}

#[cfg(windows)]
mod imp {
    use super::AudioState;
    use windows::core::PCWSTR;
    use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
    use windows::Win32::Media::Audio::{
        eConsole, eRender, IMMDeviceEnumerator, MMDeviceEnumerator, DEVICE_STATE_ACTIVE,
    };
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::Devices::FunctionDiscovery::PKEY_Device_FriendlyName;
    use windows::Win32::System::Com::StructuredStorage::PropVariantToStringAlloc;
    use windows::Win32::UI::Shell::PropertiesSystem::STGM_READ;

    // Resolve the default render endpoint + its volume interface. Returns None
    // if COM/endpoint is unavailable (headless, no device).
    unsafe fn endpoint() -> Option<(IAudioEndpointVolume, String)> {
        // Best-effort COM init on this thread; ignore "already initialized".
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let enumerator: IMMDeviceEnumerator =
            CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).ok()?;
        let device = enumerator.GetDefaultAudioEndpoint(eRender, eConsole).ok()?;
        let vol: IAudioEndpointVolume = device.Activate(CLSCTX_ALL, None).ok()?;

        // Friendly name via the property store (best-effort).
        let name = (|| {
            let store = device.OpenPropertyStore(STGM_READ).ok()?;
            let pv = store.GetValue(&PKEY_Device_FriendlyName).ok()?;
            let p = PropVariantToStringAlloc(&pv).ok()?;
            let s = p.to_string().ok();
            let _ = windows::Win32::System::Com::CoTaskMemFree(Some(p.0 as *const _));
            s
        })()
        .unwrap_or_else(|| "Default device".into());

        Some((vol, name))
    }

    pub fn get() -> AudioState {
        unsafe {
            match endpoint() {
                Some((vol, device)) => {
                    let scalar = vol.GetMasterVolumeLevelScalar().unwrap_or(0.0);
                    let muted = vol.GetMute().map(|b| b.as_bool()).unwrap_or(false);
                    AudioState {
                        supported: true,
                        volume: (scalar * 100.0).round() as u8,
                        muted,
                        device,
                    }
                }
                None => AudioState {
                    supported: false,
                    volume: 0,
                    muted: false,
                    device: String::new(),
                },
            }
        }
    }

    pub fn set_volume(v: u8) {
        unsafe {
            if let Some((vol, _)) = endpoint() {
                let scalar = (v.min(100) as f32) / 100.0;
                let _ = vol.SetMasterVolumeLevelScalar(scalar, std::ptr::null());
            }
        }
    }

    pub fn set_mute(m: bool) {
        unsafe {
            if let Some((vol, _)) = endpoint() {
                let _ = vol.SetMute(m, std::ptr::null());
            }
        }
    }

    // Silence unused import warning when the friendly-name path optimizes out.
    #[allow(unused)]
    fn _pcwstr(_p: PCWSTR) {}
}

#[cfg(windows)]
pub fn get() -> AudioState {
    imp::get()
}
#[cfg(windows)]
pub fn set_volume(v: u8) {
    imp::set_volume(v)
}
#[cfg(windows)]
pub fn set_mute(m: bool) {
    imp::set_mute(m)
}

#[cfg(not(windows))]
pub fn get() -> AudioState {
    AudioState {
        supported: false,
        volume: 0,
        muted: false,
        device: String::new(),
    }
}
#[cfg(not(windows))]
pub fn set_volume(_v: u8) {}
#[cfg(not(windows))]
pub fn set_mute(_m: bool) {}
