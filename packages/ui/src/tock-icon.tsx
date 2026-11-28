import { createEffect } from "solid-js"
import TockIcons, { type TockVariant } from "../vendor/tock-icons/index.js"

export type { TockVariant }

const TARGET = "button,a,[role=button],[role=option],[data-tock-target]"
const icons = (target: Element) => target.querySelectorAll<HTMLElement>("tock-icon[data-motion]")
let wired = false

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

export function TockIcon(props: { name: string; size: number; variant?: TockVariant; color?: string; class?: string; selected?: boolean }) {
  wire()
  const el = document.createElement("tock-icon") as HTMLElement & { _quiet?: boolean; render?: () => void }
  el.setAttribute("aria-hidden", "true")
  el.setAttribute("data-motion", "")
  el.setAttribute("weight", "light")
  let was: boolean | undefined
  createEffect(
    () => [props.name, props.variant ?? "duet", props.size, props.color ?? "auto", props.class ?? ""] as const,
    ([name, variant, size, color, cls]) => {
      el._quiet = true
      el.className = cls
      el.setAttribute("variant", variant)
      el.setAttribute("size", String(size))
      el.setAttribute("color", color)
      el.setAttribute("name", name)
      el._quiet = false
      if (el.isConnected && typeof el.render === "function") el.render()
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
