//! Windows "now playing" via the System Media Transport Controls (SMTC).
//!
//! Reads the current session's title/artist/playback status and can send
//! play/pause/next/previous to whatever app currently owns media (Spotify,
//! browsers, etc.). Uses the WinRT `GlobalSystemMediaTransportControlsSession`
//! API through the `windows` crate. The async WinRT operations are resolved
//! with a blocking `.get()`; callers run these on a background/command thread,
//! never the UI thread.
//!
//! No session (nothing playing) is a normal `None`, not an error.

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NowPlaying {
    pub title: String,
    pub artist: String,
    /// True if currently playing (vs paused/stopped).
    pub playing: bool,
}

/// Which transport action to send to the current session.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum MediaAction {
    PlayPause,
    Next,
    Previous,
}

#[cfg(windows)]
mod imp {
    use super::{MediaAction, NowPlaying};
    use windows::Media::Control::{
        GlobalSystemMediaTransportControlsSession as Session,
        GlobalSystemMediaTransportControlsSessionManager as Manager,
        GlobalSystemMediaTransportControlsSessionPlaybackStatus as Status,
    };

    /// Resolve the current session, if any app owns media right now.
    fn current_session() -> Option<Session> {
        // RequestAsync -> IAsyncOperation; block for the manager, then the
        // current session. Any failure (no manager, no session) -> None.
        let manager = Manager::RequestAsync().ok()?.get().ok()?;
        manager.GetCurrentSession().ok()
    }

    pub fn now_playing() -> Option<NowPlaying> {
        let session = current_session()?;
        let props = session.TryGetMediaPropertiesAsync().ok()?.get().ok()?;
        let title = props.Title().map(|s| s.to_string()).unwrap_or_default();
        let artist = props.Artist().map(|s| s.to_string()).unwrap_or_default();

        let playing = session
            .GetPlaybackInfo()
            .and_then(|info| info.PlaybackStatus())
            .map(|st| st == Status::Playing)
            .unwrap_or(false);

        // If there is a session but no title at all, treat as nothing playing.
        if title.is_empty() && artist.is_empty() {
            return None;
        }
        Some(NowPlaying {
            title,
            artist,
            playing,
        })
    }

    pub fn control(action: MediaAction) -> bool {
        let Some(session) = current_session() else {
            return false;
        };
        let result = match action {
            MediaAction::PlayPause => session.TryTogglePlayPauseAsync().and_then(|op| op.get()),
            MediaAction::Next => session.TrySkipNextAsync().and_then(|op| op.get()),
            MediaAction::Previous => session.TrySkipPreviousAsync().and_then(|op| op.get()),
        };
        result.unwrap_or(false)
    }
}

/// Current now-playing info, or `None` if nothing is playing / not Windows.
#[cfg(windows)]
pub fn now_playing() -> Option<NowPlaying> {
    imp::now_playing()
}

/// Send a transport action. Returns whether it was accepted.
#[cfg(windows)]
pub fn control(action: MediaAction) -> bool {
    imp::control(action)
}

#[cfg(not(windows))]
pub fn now_playing() -> Option<NowPlaying> {
    None
}

#[cfg(not(windows))]
pub fn control(_action: MediaAction) -> bool {
    false
}
