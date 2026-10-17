import { invoke } from "@tauri-apps/api/core";

// Media bridge. Reads Windows SMTC "now playing" and sends transport actions.

export interface NowPlaying {
  title: string;
  artist: string;
  playing: boolean;
}

export type MediaAction = "playPause" | "next" | "previous";

export function mediaNowPlaying(): Promise<NowPlaying | null> {
  return invoke("media_now_playing");
}

export function mediaControl(action: MediaAction): Promise<boolean> {
  return invoke("media_control", { action });
}

/** Open YouTube Music in the default browser (fixed URL, set in Rust). */
export function openYoutubeMusic(): Promise<void> {
  return invoke("open_youtube_music");
}
