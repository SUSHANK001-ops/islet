import type { JSX } from "preact";

// One inline-SVG icon set (Spec 11). Single stroke weight (1.75), 24px grid,
// currentColor, round caps/joins. Drawn by us — never copied from any reference
// app, no icon font, no CDN, no emoji (prompt §4). Add glyphs here only.

export type IconName =
  | "chevron-left"
  | "chevron-right"
  | "chevron-down"
  | "sliders"
  | "speaker"
  | "speaker-mute"
  | "battery"
  | "bell"
  | "wifi"
  | "bluetooth"
  | "moon"
  | "gear"
  | "calendar"
  | "plus"
  | "close"
  | "expand"
  | "cast"
  | "captions"
  | "project"
  | "accessibility";

// Each glyph is the INNER markup of a 24x24 viewBox using stroke=currentColor.
const PATHS: Record<IconName, JSX.Element> = {
  "chevron-left": <polyline points="15 6 9 12 15 18" />,
  "chevron-right": <polyline points="9 6 15 12 9 18" />,
  "chevron-down": <polyline points="6 9 12 15 18 9" />,
  sliders: (
    <g>
      <line x1="4" y1="8" x2="20" y2="8" />
      <line x1="4" y1="16" x2="20" y2="16" />
      <circle cx="9" cy="8" r="2.2" fill="var(--islet-bg-panel)" />
      <circle cx="15" cy="16" r="2.2" fill="var(--islet-bg-panel)" />
    </g>
  ),
  speaker: (
    <g>
      <path d="M4 9 H8 L13 5 V19 L8 15 H4 Z" />
      <path d="M16 9 Q18 12 16 15" />
      <path d="M18 7 Q21 12 18 17" />
    </g>
  ),
  "speaker-mute": (
    <g>
      <path d="M4 9 H8 L13 5 V19 L8 15 H4 Z" />
      <line x1="16" y1="9" x2="21" y2="15" />
      <line x1="21" y1="9" x2="16" y2="15" />
    </g>
  ),
  battery: (
    <g>
      <rect x="3" y="8" width="16" height="8" rx="2" />
      <line x1="21" y1="11" x2="21" y2="13" />
    </g>
  ),
  bell: (
    <g>
      <path d="M7 17 V11 a5 5 0 0 1 10 0 V17 L19 19 H5 Z" />
      <path d="M10 19 a2 2 0 0 0 4 0" />
    </g>
  ),
  wifi: (
    <g>
      <path d="M4 9 Q12 3 20 9" />
      <path d="M7 12 Q12 8 17 12" />
      <path d="M10 15 Q12 13.5 14 15" />
      <circle cx="12" cy="18" r="0.9" fill="currentColor" stroke="none" />
    </g>
  ),
  bluetooth: <path d="M8 7 L16 17 L12 20 V4 L16 7 L8 17" />,
  moon: <path d="M19 14 A8 8 0 1 1 10 5 a6 6 0 0 0 9 9 Z" />,
  gear: (
    <g>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3 v2 M12 19 v2 M3 12 h2 M19 12 h2 M5.6 5.6 l1.4 1.4 M17 17 l1.4 1.4 M18.4 5.6 l-1.4 1.4 M7 17 l-1.4 1.4" />
    </g>
  ),
  calendar: (
    <g>
      <rect x="4" y="5" width="16" height="16" rx="2" />
      <line x1="4" y1="9" x2="20" y2="9" />
      <line x1="8" y1="3" x2="8" y2="6" />
      <line x1="16" y1="3" x2="16" y2="6" />
    </g>
  ),
  plus: (
    <g>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </g>
  ),
  close: (
    <g>
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </g>
  ),
  expand: <polyline points="7 10 12 15 17 10" />,
  cast: (
    <g>
      <path d="M3 7 h18 v10 h-6" />
      <path d="M3 13 a4 4 0 0 1 4 4" />
      <path d="M3 10 a7 7 0 0 1 7 7" />
      <circle cx="3.5" cy="17.5" r="0.9" fill="currentColor" stroke="none" />
    </g>
  ),
  captions: (
    <g>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M10 10.5 a2 2 0 0 0-3 1.5 a2 2 0 0 0 3 1.5" />
      <path d="M17 10.5 a2 2 0 0 0-3 1.5 a2 2 0 0 0 3 1.5" />
    </g>
  ),
  project: (
    <g>
      <rect x="3" y="5" width="18" height="11" rx="2" />
      <line x1="8" y1="20" x2="16" y2="20" />
    </g>
  ),
  accessibility: (
    <g>
      <circle cx="12" cy="5" r="1.6" fill="currentColor" stroke="none" />
      <path d="M5 9 h14 M12 9 v6 M12 15 l-3 5 M12 15 l3 5" />
    </g>
  ),
};

export function Icon({
  name,
  size = 20,
  class: className,
}: {
  name: IconName;
  size?: number;
  class?: string;
}) {
  return (
    <svg
      class={`islet-icon${className ? " " + className : ""}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
