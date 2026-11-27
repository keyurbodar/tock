import { tokens } from "@tock/tokens"

const m = tokens.motion
export const ease = m.curve
export const dur = m.duration
export const PRESS = m.press
export const STAGGER = m.stagger

export const prefersReducedMotion = () =>
  typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches

/** The behavior for a programmatic scroll: smooth, or an instant jump under reduced motion (the CSS reset never reaches scrollTo). */
export const scrollBehavior = (): ScrollBehavior => (prefersReducedMotion() ? "instant" : "smooth")

export function springEasing(name: keyof typeof m.spring = "snappy"): { easing: string; duration: number } {
  const { stiffness, damping, mass } = m.spring[name]
  const w0 = Math.sqrt(stiffness / mass)
  const zeta = damping / (2 * Math.sqrt(stiffness * mass))
  const wd = w0 * Math.sqrt(Math.max(0, 1 - zeta * zeta))
  const at = (t: number) =>
    zeta < 1
      ? 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t))
      : 1 - Math.exp(-w0 * t) * (1 + w0 * t)
  let settle = 0
  for (let t = 0; t < 3; t += 1 / 120) if (Math.abs(1 - at(t)) > 0.001) settle = t
  const duration = Math.round(Math.max(0.12, settle) * 1000)
  const steps = 40
  const points = Array.from({ length: steps + 1 }, (_, i) => +at((settle * i) / steps).toFixed(4))
  points[steps] = 1
  return { easing: `linear(${points.join(", ")})`, duration }
}

/**
 * Run fn once, right after the next layout and before that frame paints: the first ResizeObserver delivery for a newly
 * observed element. Geometry read there is already computed, so a FLIP "last" read never forces a layout, and an
 * animation started there is in the very frame that paints the change.
 */
export function afterLayout(el: Element, fn: () => void) {
  const once = new ResizeObserver(() => (once.disconnect(), fn()))
  once.observe(el)
  return () => once.disconnect()
}

type Options = KeyframeAnimationOptions & { /** Not decoration (a timer bar, a measured height): keep it under reduced motion. */ essential?: boolean }

/** Presence: the one WAAPI entry point. Defaults to the out-curve and, under reduced motion, keeps only the opacity. */
export function animate(el: Element, frames: Keyframe[], opts: number | Options): Animation
export function animate(el: Element | null | undefined, frames: Keyframe[], opts: number | Options): Animation | undefined
export function animate(el: Element | null | undefined, frames: Keyframe[], opts: number | Options): Animation | undefined {
  if (!el) return
  const { essential, ...o }: Options = typeof opts === "number" ? { duration: opts } : { ...opts }
  o.easing ??= ease.out
  if (prefersReducedMotion() && !essential) {
    const from = frames[0]?.opacity ?? 1
    const to = frames.at(-1)?.opacity ?? 1
    return el.animate([{ opacity: from }, { opacity: to }], { duration: dur.tooltip, fill: o.fill ?? "auto", pseudoElement: o.pseudoElement })
  }
  return el.animate(frames, o)
}

const blur = (v: string) => `blur(${v})`
const clear = "blur(0)"

export const enter = {
  menu: (el: Element) => animate(el, [{ opacity: 0, scale: PRESS }, { opacity: 1, scale: 1 }], dur.menu),
  submenu: (el: Element, dir: 1 | -1 = 1) =>
    animate(el, [{ opacity: 0, translate: `${-4 * dir}px 0` }, { opacity: 1, translate: "0 0" }], dur.submenu),
  hoverCard: (el: Element, fromAbove: boolean) =>
    animate(el, [{ opacity: 0, scale: PRESS, translate: `0 ${fromAbove ? 4 : -4}px` }, { opacity: 1, scale: 1, translate: "0 0" }], dur.menu),
  peek: (el: Element) =>
    animate(el, [{ opacity: 0, translate: "-8px 0", scale: 0.97, filter: blur(m.blur.exit) }, { opacity: 1, translate: "0 0", scale: 1, filter: clear }], dur.layout),
  toast: (el: Element) =>
    animate(el, [{ opacity: 0, translate: "0 -14px", scale: PRESS, filter: blur(m.blur.enter) }, { opacity: 1, translate: "0 0", scale: 1, filter: clear }], { duration: dur.toast, easing: ease.sheet }),
  message: (el: Element) =>
    animate(el, [{ opacity: 0, translate: "0 10px", scale: 0.97, filter: blur(m.blur.exit) }, { opacity: 1, translate: "0 0", scale: 1, filter: clear }], { duration: dur.swap, easing: ease.out }),
  dialog: (el: Element) => animate(el, [{ opacity: 0, scale: PRESS }, { opacity: 1, scale: 1 }], dur.layout),
  attachment: (el: Element) =>
    animate(el, [{ opacity: 0, scale: 0.8, filter: blur(m.blur.enter) }, { opacity: 1, scale: 1, filter: clear }], { ...springEasing("soft") }),
  pane: (el: Element) =>
    animate(el, [{ opacity: 0, translate: "0 6px", filter: blur(m.blur.word) }, { opacity: 1, translate: "0 0", filter: clear }], dur.swap),
}

export const exit = {
  menu: (el: Element) => animate(el, [{ opacity: 1 }, { opacity: 0 }], { duration: dur["exit-small"], easing: ease.in, fill: "forwards" }),
  toast: (el: Element, swiped = false) =>
    animate(el, [{ opacity: 1 }, { opacity: 0, translate: swiped ? "120% 0" : "0 -6px", filter: swiped ? "none" : blur(m.blur.exit) }], { duration: swiped ? 220 : dur.exit, easing: ease.in, fill: "forwards" }),
  dialog: (el: Element) => animate(el, [{ opacity: 1 }, { opacity: 0, scale: 0.98 }], { duration: dur.tooltip, easing: ease.in, fill: "forwards" }),
  pane: (el: Element) => animate(el, [{ opacity: 1 }, { opacity: 0, filter: blur(m.blur.word) }], { duration: 110, easing: ease.in, fill: "forwards" }),
}

export function flip(els: HTMLElement[], change: () => void, duration: number = dur.swap, easing: string = ease.sheet) {
  const before = els.map((e) => e.getBoundingClientRect())
  change()
  els.forEach((e, i) => {
    const a = before[i]
    if (!a) return
    const b = e.getBoundingClientRect()
    const dx = a.left - b.left
    const dy = a.top - b.top
    if (dx || dy) animate(e, [{ translate: `${dx}px ${dy}px` }, { translate: "0 0" }], { duration, easing })
  })
}

export function collapse(el: HTMLElement): Promise<void> {
  el.style.overflow = "hidden"
  animate(el, [{ opacity: 1 }, { opacity: 0 }], { duration: dur.tooltip, fill: "forwards" })
  return animate(el, [{ height: `${el.offsetHeight}px` }, { height: "0px" }], { duration: dur.layout, delay: 60, easing: ease.std, fill: "forwards" }).finished.then(() => undefined)
}

export function expandTo(el: HTMLElement, from: number, to: number) {
  return animate(el, [{ height: `${from}px` }, { height: `${to}px` }], { duration: dur.layout, easing: ease.std })
}

export function zoomFrom(target: HTMLElement, source: Element, back = false) {
  const a = source.getBoundingClientRect()
  const b = target.getBoundingClientRect()
  const from = { translate: `${a.left - b.left}px ${a.top - b.top}px`, scale: `${a.width / b.width} ${a.height / b.height}`, transformOrigin: "0 0" }
  const to = { translate: "0 0", scale: "1 1", transformOrigin: "0 0" }
  return animate(target, back ? [to, from] : [from, to], { duration: back ? dur.swap : dur.word, easing: ease.sheet, fill: back ? "forwards" : "none" })
}

export const rubber = (x: number, limit: number, k = 0.55) =>
  Math.abs(x) <= limit ? x : Math.sign(x) * (limit + (Math.abs(x) - limit) * k)

export function swipeState(dx: number, rowWidth: number) {
  const x = Math.max(-rowWidth + 20, Math.min(rowWidth - 20, rubber(dx, 132)))
  return { x, side: x > 0 ? ("leading" as const) : ("trailing" as const), commit: Math.abs(x) > rowWidth * 0.62, open: Math.abs(x) > 60 }
}

export const isSideways = (dx: number, dy: number) => Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.4

export function hoverIntent(opts: { delay?: number; leave?: number; show: (el: Element) => void; hide: () => void }) {
  let openTimer: ReturnType<typeof setTimeout> | undefined
  let closeTimer: ReturnType<typeof setTimeout> | undefined
  let warm = false
  return {
    enter(el: Element) {
      clearTimeout(openTimer)
      clearTimeout(closeTimer)
      openTimer = setTimeout(() => {
        opts.show(el)
        warm = true
      }, warm ? 0 : (opts.delay ?? m["hover-intent"].open))
    },
    leave() {
      clearTimeout(openTimer)
      closeTimer = setTimeout(() => {
        opts.hide()
        setTimeout(() => (warm = false), 400)
      }, opts.leave ?? m["hover-intent"].leave)
    },
    cancel() {
      clearTimeout(openTimer)
      clearTimeout(closeTimer)
      warm = false
    },
  }
}

export function flyDot(layer: HTMLElement, from: { x: number; y: number }, to: { x: number; y: number }, lift = 120): Promise<void> {
  const d = document.createElement("i")
  d.className = "tds-flight-dot"
  layer.appendChild(d)
  const frames: Keyframe[] = []
  for (let k = 0; k <= 20; k++) {
    const e = 1 - Math.pow(1 - k / 20, 3)
    frames.push({ left: `${from.x + (to.x - from.x) * e}px`, top: `${from.y + (to.y - from.y) * e - Math.sin(Math.PI * e) * lift}px`, scale: 1.2 - 0.3 * e })
  }
  return d.animate(frames, { duration: dur.flight, easing: "linear", fill: "forwards" }).finished.then(() => d.remove())
}

export const land = (dot: Element) => animate(dot, [{ scale: 0.4 }, { scale: 1.4 }, { scale: 1 }], dur.word)

export function stackLayout(heights: number[], fanned: boolean) {
  let y = 0
  return heights.map((h, i) => {
    if (fanned) {
      const r = { y, scale: 1, opacity: 1, contentVisible: true }
      y += h + 8
      return r
    }
    return { y: i * 10, scale: 1 - i * 0.05, opacity: i > 2 ? 0 : 1, contentVisible: i === 0 }
  })
}

/** Spring: animate along a spring preset from tokens.motion.spring, as a linear() easing the compositor runs. */
export const spring = (el: Element, frames: Keyframe[], preset: keyof typeof m.spring = "snappy", extra: KeyframeAnimationOptions = {}) =>
  animate(el, frames, { ...springEasing(preset), ...extra })
