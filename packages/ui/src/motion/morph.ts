import { tokens } from "@tock/tokens"
import { prefersReducedMotion } from "./core"
import { drive } from "./drive"

/**
 * Container morph (shared element): a surface opens out of the box that summoned it, so a sidebar row, a pin or a
 * peek card becomes the chat. The surface never moves (no layout jump); one drive() spring on `--p` clips it from
 * the source's band to the full box, and the content fades and unblurs off the same value (motion.css).
 * The source is remembered at the click; the surface claims it once it has rendered.
 */
let source: { box: DOMRect; radius: number; at: number } | undefined
const live = new WeakMap<HTMLElement, { spring: ReturnType<typeof drive>; start: number[] }>()

/** Remember the box a surface is about to open from. Marks it so a ghost exit (installGrow) does not also fly back. */
export function morphFrom(el: Element) {
  el.toggleAttribute("data-handoff", true)
  source = { box: el.getBoundingClientRect(), radius: parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0, at: performance.now() }
}

/** Grow `surface` out of the remembered box, if a click set one a moment ago. A second open mid-flight starts from the new source. */
export function morphInto(surface: HTMLElement) {
  const from = source
  source = undefined
  if (!from || prefersReducedMotion() || performance.now() - from.at > tokens.motion.duration.panel * 2) return
  const b = surface.getBoundingClientRect()
  const a = from.box
  if (!b.width || !a.width) return
  const left = Math.max(0, a.left - b.left)
  const start = [a.top - b.top, Math.max(0, b.width - left - a.width), b.bottom - a.bottom, left, from.radius]
  let state = live.get(surface)
  if (!state) {
    const own = { start } as { spring: ReturnType<typeof drive>; start: number[] }
    own.spring = drive(surface, {
      preset: "glide",
      value: 1,
      onFrame: (p) => {
        const at = own.start.map((v) => (v * (1 - p)).toFixed(2))
        surface.style.clipPath = p >= 1 ? "" : `inset(${at[0]}px ${at[1]}px ${at[2]}px ${at[3]}px round ${at[4]}px)`
        surface.toggleAttribute("data-morphing", p < 1)
      },
    })
    live.set(surface, (state = own))
  }
  state.start = start
  state.spring.set(0)
  state.spring.to(1)
}
