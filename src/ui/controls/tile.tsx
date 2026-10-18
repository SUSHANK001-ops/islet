import type { IconName } from "./icon";
import { Icon } from "./icon";

// Quick-settings tile (Spec 11). Two variants: a big toggle tile (wifi/bt/dnd)
// and a small action tile (project/cast/...). State change cross-fades the
// accent fill via CSS (.on), never an icon pop. Full keyboard + focus ring.
export function Tile({
  icon,
  title,
  sub,
  on = false,
  disabled = false,
  onClick,
}: {
  icon: IconName;
  title: string;
  sub?: string;
  on?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      class={`islet-tile${on ? " on" : ""}`}
      role="switch"
      aria-checked={on}
      aria-disabled={disabled}
      disabled={disabled}
      onClick={onClick}
    >
      <span class="islet-tile-badge" aria-hidden="true">
        <Icon name={icon} size={20} />
      </span>
      <span class="islet-tile-text">
        <span class="islet-tile-title">{title}</span>
        {sub ? <span class="islet-tile-sub">{sub}</span> : null}
      </span>
    </button>
  );
}

export function TileMini({
  icon,
  title,
  disabled = false,
  onClick,
}: {
  icon: IconName;
  title: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      class="islet-tile-mini"
      aria-disabled={disabled}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon name={icon} size={22} />
      <span>{title}</span>
    </button>
  );
}
