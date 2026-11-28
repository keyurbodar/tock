export type TockVariant = "duet" | "line" | "glass"
export type TockKind = "hover" | "press" | "select" | "deselect"
declare const TockIcons: {
  svg(name: string, options?: { variant?: TockVariant; size?: number; weight?: string; color?: string; mirrored?: boolean; label?: string }): string
  play(el: Element, kind: TockKind, motion?: string): void
  motionOf(name: string): string
  data: Record<string, unknown>
}
export default TockIcons
