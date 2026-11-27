export type OrbStatus = "working" | "thinking" | "needs" | "failed" | "done"
export type OrbSize = "row" | "corner"

/** A 3×3 dot grid tinted and animated per status (Capy's status grid). Decorative unless `label` names it. */
export function Orb(props: { status: OrbStatus; size?: OrbSize; label?: string; class?: string }) {
  return (
    <span
      class={props.class ? `tds-orb ${props.class}` : "tds-orb"}
      data-status={props.status}
      data-size={props.size ?? "row"}
      role={props.label ? "img" : undefined}
      aria-label={props.label}
      aria-hidden={props.label ? undefined : "true"}
    >
      <i />
      <i />
      <i />
      <i />
      <i />
      <i />
      <i />
      <i />
      <i />
    </span>
  )
}
