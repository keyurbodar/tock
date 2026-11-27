import type { JSX } from "@solidjs/web"

export function Swap(props: { on: boolean; a: JSX.Element; b: JSX.Element; class?: string }) {
  return (
    <span class={`tds-swap ${props.class ?? ""}`} data-on={props.on ? "" : undefined}>
      <span class="tds-swap-a" aria-hidden={props.on ? "true" : undefined}>{props.a}</span>
      <span class="tds-swap-b" aria-hidden={props.on ? undefined : "true"}>{props.b}</span>
    </span>
  )
}
