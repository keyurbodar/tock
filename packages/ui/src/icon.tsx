import { sprite, type IconName } from "./icons.gen"
import { tokens } from "@tock/tokens"

export type { IconName }
export type IconSize = keyof typeof tokens.icon

let injected = false
export function injectIconSprite() {
  if (injected || typeof document === "undefined") return
  injected = true
  document.body.insertAdjacentHTML("afterbegin", sprite)
}

export function Icon(props: { name: IconName; size?: Exclude<IconSize, "weight-boost">; class?: string; label?: string }) {
  const size = () => `var(--tds-icon-${props.size ?? "row"})`
  return (
    <svg
      class={`tds-icon ${props.class ?? ""}`}
      style={{ width: size(), height: size() }}
      aria-hidden={props.label ? undefined : "true"}
      aria-label={props.label}
      role={props.label ? "img" : undefined}
    >
      <use href={`#i-${props.name}`} />
    </svg>
  )
}
