import { sprite, type DuetName, type FillName, type IconName } from "./icons.gen"
import { tokens } from "@tock/tokens"

export type { DuetName, FillName, IconName }
export type IconSize = Exclude<keyof typeof tokens.icon, "weight-boost" | `stroke-${string}`>
/** line: chrome, regular weight. duet: light line over a currentColor region (channels, featured). fill: solid. */
export type IconVariant = "line" | "duet" | "fill"
export type IconProps = { size?: IconSize; class?: string; label?: string } & (
  | { name: IconName; variant?: "line" }
  | { name: DuetName; variant: "duet" }
  | { name: FillName; variant: "fill" }
)

let injected = false
export function injectIconSprite() {
  if (injected || typeof document === "undefined") return
  injected = true
  document.body.insertAdjacentHTML("afterbegin", sprite)
}

const suffix = { line: "", duet: ":duotone", fill: ":fill" } as const satisfies Record<IconVariant, string>

export function Icon(props: IconProps) {
  const size = () => `var(--tds-icon-${props.size ?? "row"})`
  return (
    <svg
      class={`tds-icon ${props.class ?? ""}`}
      style={{ width: size(), height: size() }}
      aria-hidden={props.label ? undefined : "true"}
      aria-label={props.label}
      role={props.label ? "img" : undefined}
    >
      <use href={`#i-${props.name}${suffix[props.variant ?? "line"]}`} />
    </svg>
  )
}
