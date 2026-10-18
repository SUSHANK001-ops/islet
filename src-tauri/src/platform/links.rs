//! Allow-listed Windows settings deep-links (Spec 11). The frontend sends only
//! an ENUM key (never a free URL), mirroring the Spec 9 id-not-path rule, so
//! this can never open an arbitrary URI. Each key maps to a fixed ms-settings:
//! target. Verified links are the only ones exposed; unverified ones are not
//! listed so the matching tile is dropped in the UI.

/// Resolve an allow-listed link key to its fixed ms-settings URI, or None if
/// the key is not recognized / not verified on this OS surface.
pub fn resolve(key: &str) -> Option<&'static str> {
    Some(match key {
        "sound" => "ms-settings:apps-volume",
        "power" => "ms-settings:powersleep",
        "notifications" => "ms-settings:notifications",
        "bluetooth" => "ms-settings:bluetooth",
        // The following open real Windows surfaces on Win10/11:
        "project" => "ms-settings:display", // Project uses the shell; display is the safe settings target
        "accessibility" => "ms-settings:easeofaccess",
        // Not verified to a single stable ms-settings target -> not exposed:
        // "cast", "captions" return None so their tiles are dropped.
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_keys_resolve() {
        assert!(resolve("sound").is_some());
        assert!(resolve("power").is_some());
        assert!(resolve("notifications").is_some());
    }

    #[test]
    fn unknown_or_unverified_keys_rejected() {
        assert!(resolve("cast").is_none());
        assert!(resolve("captions").is_none());
        assert!(resolve("../evil").is_none());
        assert!(resolve("https://x").is_none());
    }
}
