import { useEffect, useState } from "preact/hooks";
import { t } from "../../ui/i18n";
import { Icon } from "../../ui/controls/icon";
import { Slider } from "../../ui/controls/slider";
import { FlyoutSection } from "../flyout-shell";
import {
  audioGet,
  audioSetVolume,
  audioSetMute,
  openMsSettings,
  type AudioState,
} from "../bridge";

// Sound flyout (Spec 11). Volume slider + mute + device + Mixer link. Re-reads
// on open and after each action (Media-class exception; a change callback is
// the event-driven ideal, documented in windows-notes.md).
export default function SoundFlyout() {
  const [state, setState] = useState<AudioState | null>(null);

  useEffect(() => {
    let alive = true;
    audioGet()
      .then((s) => alive && setState(s))
      .catch(() => alive && setState({ supported: false, volume: 0, muted: false, device: "" }));
    return () => {
      alive = false;
    };
  }, []);

  if (!state) return <div class="islet-empty">{t("common.loading")}</div>;
  if (!state.supported) {
    return (
      <div class="islet-empty">
        <span class="islet-empty-icon" aria-hidden="true">·</span>
        <span>{t("sound.unsupported")}</span>
      </div>
    );
  }

  function setVol(v: number) {
    setState((s) => (s ? { ...s, volume: v } : s));
  }
  async function commitVol(v: number) {
    const next = await audioSetVolume(v).catch(() => null);
    if (next) setState(next);
  }
  async function toggleMute() {
    const next = await audioSetMute(!state!.muted).catch(() => null);
    if (next) setState(next);
  }

  return (
    <FlyoutSection title={t("tab.sound")} right={<span class="islet-num">{state.volume}%</span>}>
      <div class="islet-sound-row">
        <button
          class="islet-sb-item"
          aria-label={t(state.muted ? "sound.unmute" : "sound.mute")}
          aria-pressed={state.muted}
          onClick={toggleMute}
        >
          <Icon name={state.muted ? "speaker-mute" : "speaker"} size={20} />
        </button>
        <Slider
          value={state.muted ? 0 : state.volume}
          label={t("tab.sound")}
          onInput={setVol}
          onChange={commitVol}
        />
      </div>
      <div class="islet-card-row">
        <span class="islet-dim islet-sound-device" title={state.device}>
          {state.device || t("sound.defaultDevice")}
        </span>
        <button class="islet-btn" onClick={() => void openMsSettings("sound").catch(() => {})}>
          {t("sound.mixer")}
        </button>
      </div>
    </FlyoutSection>
  );
}
