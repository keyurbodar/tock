import { tokens } from "@tock/tokens"
import { StatusGrid, type GridState } from "./status-grid"

export type OrbStatus = Exclude<GridState, "queued">
export type OrbSize = "row" | "corner"

/** A chat's status as a dot-matrix grid; `corner` sits on a small tile. Decorative unless `label` names it. */
export function Orb(props: { status: OrbStatus; size?: OrbSize; label?: string; class?: string }) {
  return (
    <span class={props.class ? `tds-orb ${props.class}` : "tds-orb"} data-status={props.status} data-size={props.size ?? "row"}>
      <StatusGrid state={props.status} size={props.size === "corner" ? tokens.size["grid-corner"] : tokens.size["grid-row"]} label={props.label} />
    </span>
  )
}
