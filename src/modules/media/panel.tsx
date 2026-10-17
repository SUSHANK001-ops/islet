import { useEffect, useState } from "preact/hooks";
import { t } from "../../ui/i18n";
import {
  mediaNowPlaying,
  mediaControl,
  openYoutubeMusic,
  type NowPlaying,
} from "./bridge";

/**
 * Media tab: Windows "now playing" + transport controls, plus a one-click
 * "Open YouTube Music" launcher (opens the default browser; Islet then controls
 * playback via the Windows media controls — no embedding, per AGENTS.md).
 *
 * SMTC change events are awkward to subscribe to from Rust, so while the panel
 * is OPEN we poll at a slow 2s rate (only while visible -> closed == asleep).
 * Documented exception to the no-polling rule; see docs/windows-notes.md.
 */
export default function MediaPanel() {
  const [np, setNp] = useState<NowPlaying | null | undefined>(undefined);

  async function refresh() {
    try {
      setNp(await mediaNowPlaying());
    } catch {
      setNp(null);
    }
  }

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (!alive) return;
      await refresh();
    };
    void tick();
    const timer = window.setInterval(tick, 2000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  async function act(action: "playPause" | "next" | "previous") {
    await mediaControl(action);
    window.setTimeout(refresh, 250);
  }

  const openButton = (
    <div class="islet-media-open">
      <button class="islet-btn primary" onClick={() => void openYoutubeMusic()}>
        ♪ {t("media.openYtMusic")}
      </button>
    </div>
  );

  if (np === undefined) {
    return <div class="islet-empty">{t("common.loading")}</div>;
  }

  // Nothing playing: still offer the launcher + a hint.
  if (np === null) {
    return (
      <div class="islet-media">
        <div class="islet-media-art" aria-hidden="true">
          ♪
        </div>
        <div class="islet-media-meta">
          <div class="islet-media-title">{t("media.nothing")}</div>
          <div class="islet-media-artist">{t("media.openHint")}</div>
        </div>
        {openButton}
      </div>
    );
  }

  return (
    <div class="islet-media">
      <div class="islet-media-art" aria-hidden="true">
        {np.playing ? "♫" : "♪"}
      </div>
      <div class="islet-media-meta">
        <div class="islet-media-title" title={np.title}>
          {np.title}
        </div>
        <div class="islet-media-artist" title={np.artist}>
          {np.artist || t("media.unknownArtist")}
        </div>
      </div>
      <div class="islet-media-controls">
        <button
          class="islet-media-btn"
          aria-label={t("media.previous")}
          onClick={() => void act("previous")}
        >
          ⏮
        </button>
        <button
          class="islet-media-btn big"
          aria-label={t("media.playPause")}
          onClick={() => void act("playPause")}
        >
          {np.playing ? "⏸" : "▶"}
        </button>
        <button
          class="islet-media-btn"
          aria-label={t("media.next")}
          onClick={() => void act("next")}
        >
          ⏭
        </button>
      </div>
      {openButton}
    </div>
  );
}
