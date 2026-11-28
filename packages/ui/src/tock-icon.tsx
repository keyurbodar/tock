import { createEffect } from "solid-js"
import TockIcons, { type TockVariant } from "../vendor/tock-icons/index.js"

export type { TockVariant }

const TARGET = "button,a,[role=button],[data-tock-target]"
const icons = (target: Element) => target.querySelectorAll<HTMLElement>("tock-icon[data-motion]")
let wired = false

/**
 * One delegated listener drives every animated icon: hovering or pressing its closest control plays the icon's
 * built-in Tock motion (and parts glass layers via the engine's `data-h` CSS), so rows need no per-icon handlers.
 */
function wire() {
  if (wired || typeof document === "undefined") return
  wired = true
  const cross = (event: PointerEvent, on: boolean) => {
    if (event.pointerType !== "mouse") return
    const target = (event.target as Element).closest?.(TARGET)
    if (!target || target.contains(event.relatedTarget as Node | null)) return
    for (const icon of icons(target)) {
      icon.toggleAttribute("data-h", on)
      if (on) TockIcons.play(icon, "hover")
    }
  }
  document.addEventListener("pointerover", (event) => cross(event, true), { passive: true })
  document.addEventListener("pointerout", (event) => cross(event, false), { passive: true })
  document.addEventListener(
    "pointerdown",
    (event) => {
      const target = (event.target as Element).closest?.(TARGET)
      if (target) for (const icon of icons(target)) TockIcons.play(icon, "press")
    },
    { passive: true },
  )
}

/**
 * A Tock icon rendered by its own engine: `duet` (line plus a tinted region) or `glass` (frosted layers), in the
 * icon's own palette pick unless `color` names one. Its enclosing button or link animates it on hover and press,
 * and turning `selected` on plays the select motion (duet floods its region, glass glows).
 */
export function TockIcon(props: { name: string; size: number; variant?: TockVariant; color?: string; class?: string; selected?: boolean }) {
  wire()
  const el = document.createElement("tock-icon")
  el.setAttribute("aria-hidden", "true")
  el.setAttribute("data-motion", "")
  el.setAttribute("weight", "light")
  let was: boolean | undefined
  createEffect(
    () => [props.name, props.variant ?? "duet", props.size, props.color ?? "auto", props.class ?? ""] as const,
    ([name, variant, size, color, cls]) => {
      el.className = cls
      el.setAttribute("variant", variant)
      el.setAttribute("size", String(size))
      el.setAttribute("color", color)
      el.setAttribute("name", name)
    },
  )
  createEffect(
    () => !!props.selected,
    (on) => {
      if (on && was === false) TockIcons.play(el, "select")
      was = on
    },
  )
  return el
}
