import type { ThreadStatus } from "@tock/protocol"
import { tokens } from "@tock/tokens"

export type OrbStatus = Exclude<ThreadStatus, "idle">
export type OrbSurface = "main" | "side" | "sel"

const file: Record<OrbStatus, string> = { working: "working", needs: "needs", failed: "failed", done: "done" }

export function Orb(props: { status: OrbStatus; surface?: OrbSurface; size?: "orb" | "orb-sm" | "orb-act" | "orb-row" | "orb-header"; class?: string }) {
  return (
    <img
      class={`tds-orb ${props.class ?? ""}`}
      data-status={props.status}
      src={`/brand/orbs/${file[props.status]}-on-${props.surface ?? "side"}.png`}
      alt=""
      width={tokens.size.orb}
      height={tokens.size.orb}
      style={{ width: `var(--tds-size-${props.size ?? "orb"})`, height: `var(--tds-size-${props.size ?? "orb"})` }}
      decoding="async"
      draggable={false}
    />
  )
}
