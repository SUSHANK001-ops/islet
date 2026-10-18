import { FlyoutShell } from "../system/flyout-shell";
import { Slider } from "../ui/controls/slider";
import { Segmented } from "../ui/controls/segmented";
import { Tile, TileMini } from "../ui/controls/tile";
import { Switch } from "../ui/controls/switch";
import { Icon } from "../ui/controls/icon";
import { EmptyState } from "../ui/empty-state";
import { useState } from "preact/hooks";

// DEV-ONLY gallery (Spec 11, design §9). Renders every shared control + flyout
// chrome and every state so the UI can be screenshotted at 100% / 150%. It is
// mounted ONLY under import.meta.env.DEV and a #/dev/gallery hash, and a CI
// check (scripts/check-no-dev.mjs) fails the build if its marker reaches dist/.
//
// Marker string the CI check greps for in the production bundle:
export const DEV_GALLERY_MARKER = "__ISLET_DEV_GALLERY__";

function Frame({ title, children }: { title: string; children: preact.ComponentChildren }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ fontSize: "11px", color: "var(--islet-fg-dim)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {title}
      </div>
      <div>{children}</div>
    </div>
  );
}

export function DevGallery() {
  const [vol, setVol] = useState(60);
  const [seg, setSeg] = useState<"efficiency" | "balanced" | "performance">("balanced");
  const [sw, setSw] = useState(true);

  return (
    <div
      data-marker={DEV_GALLERY_MARKER}
      style={{
        minHeight: "100vh",
        background: "var(--islet-bg)",
        color: "var(--islet-fg)",
        padding: "24px",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
        gap: "24px",
        alignItems: "start",
      }}
    >
      <Frame title="Controls">
        <div style={{ display: "flex", flexDirection: "column", gap: "14px", background: "var(--islet-bg-panel)", padding: "16px", borderRadius: "var(--islet-radius)" }}>
          <Slider value={vol} label="Volume" onInput={setVol} />
          <Segmented
            segments={[
              { value: "efficiency", label: "Efficiency" },
              { value: "balanced", label: "Balanced" },
              { value: "performance", label: "Performance" },
            ]}
            value={seg}
            label="Power mode"
            onSelect={setSeg}
          />
          <div style={{ display: "flex", gap: "8px" }}>
            <Tile icon="wifi" title="Wi-Fi" sub="Connected" on onClick={() => {}} />
            <Tile icon="bluetooth" title="Bluetooth" sub="On" on={sw} onClick={() => setSw((v) => !v)} />
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <TileMini icon="project" title="Project" onClick={() => {}} />
            <TileMini icon="cast" title="Cast" onClick={() => {}} />
            <TileMini icon="captions" title="Captions" onClick={() => {}} />
            <TileMini icon="accessibility" title="A11y" onClick={() => {}} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "13px" }}>Show network name</span>
            <Switch on={sw} label="Show network name" onToggle={() => setSw((v) => !v)} />
          </div>
        </div>
      </Frame>

      <Frame title="Flyout chrome">
        <FlyoutShell chip="Battery 98%" label="Battery">
          <div class="islet-card islet-card-row">
            <span class="islet-batt-badge"><Icon name="battery" size={22} /></span>
            <span class="islet-batt-text">
              <span class="islet-batt-pct islet-num">98%</span>
              <span class="islet-dim">On battery</span>
            </span>
          </div>
        </FlyoutShell>
      </Frame>

      <Frame title="States">
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div class="islet-flyout-card"><EmptyState label="No events" /></div>
          <div class="islet-flyout-card"><div class="islet-empty">Loading…</div></div>
          <div class="islet-flyout-card"><div class="islet-empty">Something went wrong</div></div>
          <div class="islet-flyout-card"><div class="islet-empty">Not available on this PC</div></div>
        </div>
      </Frame>
    </div>
  );
}
