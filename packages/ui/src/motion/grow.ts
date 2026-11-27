import { tokens } from "@tock/tokens"
import { afterLayout } from "./core"

/**
 * Surfaces grow out of whatever opened them: a shared-element move from the trigger's box to the surface's.
 * One registry, so a new overlay only adds a line here.
 */
interface Source {
  readonly surface: string
  readonly trigger: (surface: HTMLElement) => Element | null
  /** The surface unmounts at once when it closes, so a ghost of it shrinks back into the trigger. Leave unset when the surface animates its own exit. */
  readonly ghost?: boolean
  /** The rest of the app dims behind the surface while it is open (Backdrop). */
  readonly backdrop?: boolean
  /**
   * Enter/exit class, timed by motion.enter/motion.exit. popover (peek, palette, tooltips): a crisp .96 → 1 scale and
   * fade in place, no blur, faster out than in. menu and dialog: grow out of the trigger and shrink back into it.
   */
  readonly kind?: Kind
}

export type Kind = "popover" | "menu" | "dialog"

const opener = (surface: HTMLElement) =>
  (surface.id && document.querySelector(`[aria-controls="${CSS.escape(surface.id)}"]`)) || document.querySelector('[aria-haspopup][aria-expanded="true"], [aria-haspopup][data-popup-open]')

export const sources: readonly Source[] = [
  { surface: ".tds-plus-menu", trigger: () => document.querySelector(".tds-composer-plus") },
  { surface: ".tds-menu", trigger: opener },
  { surface: ".tds-palette", trigger: () => document.querySelector(".tds-search"), ghost: true, backdrop: true, kind: "popover" },
  { surface: ".tds-peek", trigger: () => document.querySelector(".tds-row-wrap:hover, .tds-pin:hover"), ghost: true, kind: "popover" },
  { surface: ".tds-react-bar", trigger: () => document.querySelector('.tds-msg-action[aria-expanded="true"]'), kind: "popover" },
  { surface: ".tds-attach-preview", trigger: () => document.querySelector(".tds-attach:hover"), kind: "popover" },
  { surface: ".tds-worklog", trigger: () => document.querySelector('.tds-act-button[aria-expanded="true"]'), ghost: true },
  { surface: ".tds-keys", trigger: () => document.querySelector('.tds-rail-button[aria-label="Keyboard shortcuts"]'), ghost: true, backdrop: true, kind: "dialog" },
]

const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches

/** The point of the surface nearest the trigger's centre: a popover scales out of the side it came from. */
const origin = (a: DOMRect, b: DOMRect) => {
  const x = Math.min(b.width, Math.max(0, a.left + a.width / 2 - b.left))
  const y = Math.min(b.height, Math.max(0, a.top + a.height / 2 - b.top))
  return x + "px " + y + "px"
}

const toward = (a: DOMRect, b: DOMRect) => {
  const scale = Math.min(1, Math.max(a.width / b.width, a.height / b.height))
  const dx = a.left + a.width / 2 - (b.left + b.width / 2)
  const dy = a.top + a.height / 2 - (b.top + b.height / 2)
  return `translate(${dx}px, ${dy}px) scale(${scale})`
}

/** Grow a surface out of a trigger: it starts at the trigger's centre and size, blurred, and settles into place. */
export function growFrom(surface: HTMLElement, trigger: Element | DOMRect, kind: Kind = "menu") {
  if (reduce()) return
  const a = trigger instanceof DOMRect ? trigger : trigger.getBoundingClientRect()
  const b = surface.getBoundingClientRect()
  if (!a.width || !b.width) return
  const m = tokens.motion
  const running = surface.getAnimations().find((x) => x.id === "tds-grow")
  const now = running ? getComputedStyle(surface) : undefined
  running?.cancel()
  const enter = m.enter[kind]
  const grow =
    kind === "popover"
      ? surface.animate(
          [
            now ? { transform: now.transform, opacity: Number(now.opacity) } : { transform: "scale(" + m.enter.popover.scale + ")", opacity: 0, transformOrigin: origin(a, b) },
            { transform: "none", opacity: 1, transformOrigin: origin(a, b) },
          ],
          { duration: enter.duration, easing: m.curve.out },
        )
      : surface.animate(
          [
            now ? { transform: now.transform, opacity: Number(now.opacity), filter: now.filter, offset: 0 } : { transform: toward(a, b), opacity: 0, filter: "blur(" + m.blur.enter + ")", offset: 0 },
            { opacity: 1, offset: 0.35 },
            { transform: "none", opacity: 1, filter: "blur(0)" },
          ],
          { duration: enter.duration, easing: m.curve.sheet },
        )
  grow.id = "tds-grow"
  surface.setAttribute("data-moving", "")
  for (const end of ["finish", "cancel"]) grow.addEventListener(end, () => surface.removeAttribute("data-moving"))
  return grow
}

/** Backdrop: the app behind an expanded surface dims, scales and blurs; nested surfaces stack, the last close clears it. */
let depth = 0
export function scrim() {
  return document.querySelector<HTMLElement>(".tds-backdrop-scrim") ?? document.body.appendChild(Object.assign(document.createElement("div"), { className: "tds-backdrop-scrim", ariaHidden: "true" }))
}

export function backdrop(on: boolean) {
  scrim()
  depth = Math.max(0, depth + (on ? 1 : -1))
  if (depth) document.documentElement.dataset.backdrop = ""
  else delete document.documentElement.dataset.backdrop
}

/**
 * Backdrop by amount: a surface that rides a Progress recedes the app in step with it, 0..1, instead of toggling.
 * Holders stack; the deepest one wins, and the boolean backdrop() still overrides at full depth.
 */
const amounts = new Map<string, number>()
export function backdropTo(holder: string, amount: number) {
  if (amount > 0.001) amounts.set(holder, Math.min(1, amount))
  else amounts.delete(holder)
  scrim()
  const root = document.documentElement
  const deepest = Math.max(0, ...amounts.values())
  if (deepest <= 0.001) {
    delete root.dataset.backdropP
    root.style.removeProperty("--backdrop-p")
    return
  }
  root.dataset.backdropP = ""
  root.style.setProperty("--backdrop-p", deepest.toFixed(4))
}

/** The reverse of growFrom for a surface that already left the DOM: a frozen copy at its last box shrinks back into the trigger. */
export function shrinkInto(copy: HTMLElement, box: DOMRect, trigger: DOMRect, display = "block", kind: Kind = "menu") {
  if (reduce() || !box.width) return
  copy.removeAttribute("hidden")
  copy.setAttribute("data-ghost", "")
  copy.setAttribute("data-moving", "")
  Object.assign(copy.style, { inset: "auto", display, animation: "none", transition: "none", position: "fixed", left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px`, margin: "0", translate: "none", pointerEvents: "none", zIndex: `${tokens.z.flight}` })
  copy.setAttribute("aria-hidden", "true")
  copy.inert = true
  document.body.append(copy)
  const m = tokens.motion
  const frames: Keyframe[] =
    kind === "popover"
      ? [
          { transform: "none", opacity: 1, transformOrigin: origin(trigger, box) },
          { transform: "scale(" + m.enter.popover.scale + ")", opacity: 0, transformOrigin: origin(trigger, box) },
        ]
      : [
          { transform: "none", opacity: 1, filter: "blur(0)" },
          { opacity: 1, offset: 0.4 },
          { transform: trigger.width ? toward(trigger, box) : "scale(" + m.enter.popover.scale + ")", opacity: 0, filter: "blur(" + m.blur.enter + ")" },
        ]
  copy.animate(frames, { duration: m.exit[kind], easing: m.curve.in, fill: "forwards" }).onfinish = () => copy.remove()
}

export function installGrow(root: Document = document) {
  const pending = new Set<HTMLElement>()
  const open = new Map<HTMLElement, { trigger: DOMRect; box: DOMRect; display: string; kind: Kind }>()
  const dimmed = new Set<HTMLElement>()
  const undim = (el: HTMLElement) => dimmed.delete(el) && backdrop(false)
  const take = (el: HTMLElement) => {
    const source = sources.find((s) => el.matches(s.surface))
    if (!source || pending.has(el) || el.hasAttribute("data-ghost")) return
    const trigger = source.trigger(el)
    if (!trigger) return
    pending.add(el)
    const kind = source.kind ?? "menu"
    const hold = el.animate([{ opacity: 0 }, { opacity: 0 }], { duration: tokens.motion.enter[kind].duration, fill: "forwards" })
    afterLayout(el, () => {
      pending.delete(el)
      hold.cancel()
      if (!el.isConnected) return
      const from = trigger.getBoundingClientRect()
      const remember = () => el.isConnected && open.set(el, { trigger: from, box: el.getBoundingClientRect(), display: getComputedStyle(el).display, kind })
      if (source.ghost) remember()
      const grow = growFrom(el, from, kind)
      if (source.backdrop && !dimmed.has(el)) (dimmed.add(el), backdrop(true))
      if (source.ghost && grow) grow.addEventListener("finish", remember)
    })
  }
  const leave = (el: HTMLElement) => {
    const last = open.get(el)
    if (!last) return
    open.delete(el)
    if (el.hasAttribute("data-handoff")) return
    shrinkInto(el.cloneNode(true) as HTMLElement, last.box, last.trigger, last.display, last.kind)
  }
  const selector = sources.map((s) => s.surface).join(", ")
  const watch = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "attributes") {
        const el = record.target as HTMLElement
        if (el.hasAttribute("data-open") && record.oldValue === null && el.matches(selector)) take(el)
        if (!el.hasAttribute("data-open") && record.oldValue !== null) undim(el)
        continue
      }
      for (const node of record.removedNodes) {
        if (!(node instanceof HTMLElement)) continue
        for (const el of open.keys()) if (el === node || node.contains(el)) leave(el)
        for (const el of dimmed) if (el === node || node.contains(el)) undim(el)
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
