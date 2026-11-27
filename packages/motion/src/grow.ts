import { tokens } from "@tock/tokens"

/**
 * Surfaces grow out of whatever opened them: a shared-element move from the trigger's box to the surface's.
 * One registry, so a new overlay only adds a line here.
 */
interface Source {
  readonly surface: string
  readonly trigger: (surface: HTMLElement) => Element | null
}

const opener = (surface: HTMLElement) =>
  (surface.id && document.querySelector(`[aria-controls="${CSS.escape(surface.id)}"]`)) || document.querySelector('[aria-haspopup][aria-expanded="true"], [aria-haspopup][data-popup-open]')

export const sources: readonly Source[] = [
  { surface: ".tds-plus-menu", trigger: () => document.querySelector(".tds-composer-plus") },
  { surface: ".tds-menu", trigger: opener },
  { surface: ".tds-palette", trigger: () => document.querySelector(".tds-search") },
  { surface: ".tds-peek", trigger: () => document.querySelector(".tds-row-wrap:hover") },
  { surface: ".tds-worklog", trigger: () => document.querySelector('.tds-act-button[aria-expanded="true"]') },
  { surface: ".tds-centre", trigger: () => document.querySelector(".tds-rail-button[data-bell]") },
  { surface: ".tds-keys", trigger: () => document.querySelector('.tds-rail-button[aria-label="Keyboard shortcuts"]') },
]

const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches

/** Grow a surface out of a trigger: it starts at the trigger's centre and size, blurred, and settles into place. */
export function growFrom(surface: HTMLElement, trigger: Element) {
  if (reduce()) return
  const a = trigger.getBoundingClientRect()
  const b = surface.getBoundingClientRect()
  if (!a.width || !b.width) return
  const scale = Math.min(1, Math.max(a.width / b.width, a.height / b.height))
  const dx = a.left + a.width / 2 - (b.left + b.width / 2)
  const dy = a.top + a.height / 2 - (b.top + b.height / 2)
  const m = tokens.motion
  surface.animate(
    [
      { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0, filter: `blur(${m.blur.enter})`, offset: 0 },
      { opacity: 1, offset: 0.35 },
      { transform: "none", opacity: 1, filter: "blur(0)" },
    ],
    { duration: m.duration.panel, easing: m.curve.sheet },
  )
}

export function installGrow(root: Document = document) {
  const pending = new Set<HTMLElement>()
  const take = (el: HTMLElement) => {
    const source = sources.find((s) => el.matches(s.surface))
    if (!source || pending.has(el)) return
    const trigger = source.trigger(el)
    if (!trigger) return
    pending.add(el)
    requestAnimationFrame(() => {
      pending.delete(el)
      if (el.isConnected) growFrom(el, trigger)
    })
  }
  const selector = sources.map((s) => s.surface).join(", ")
  const watch = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "attributes") {
        const el = record.target as HTMLElement
        if (el.hasAttribute("data-open") && record.oldValue === null && el.matches(selector)) take(el)
        continue
      }
      for (const node of record.addedNodes) {
        if (!(node instanceof HTMLElement)) continue
        if (node.matches(selector)) take(node)
        node.querySelectorAll<HTMLElement>(selector).forEach(take)
      }
    }
  })
  watch.observe(root.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-open"], attributeOldValue: true })
  return () => watch.disconnect()
}
