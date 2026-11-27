import { tokens } from "@tock/tokens"
import { rubber } from "./core"

/**
 * Gesture progress: drag (pointer) or wheel/trackpad scrubs a 0..1 progress along one axis, with a rubber band past
 * the ends and a velocity commit on release. The caller renders progress (usually by setting a CSS variable) and
 * decides what commit means; the gesture owns intent locking, the band and the release decision.
 */
export interface ScrubOptions {
  readonly axis: "x" | "y"
  /** Pixels of travel that make progress 1. */
  readonly distance: number
  /** +1 when moving along the positive axis opens, -1 when the negative direction opens. */
  readonly direction?: 1 | -1
  readonly from?: () => number
  readonly onProgress: (progress: number) => void
  readonly onRelease: (open: boolean, velocity: number) => void
  readonly wheel?: boolean
}

export function scrub(el: HTMLElement, opts: ScrubOptions) {
  const dir = opts.direction ?? 1
  const along = (e: { clientX: number; clientY: number }) => (opts.axis === "x" ? e.clientX : e.clientY) * dir
  const across = (e: { clientX: number; clientY: number }) => (opts.axis === "x" ? e.clientY : e.clientX)
  let start: { a: number; c: number; p: number } | undefined
  let locked: boolean | undefined
  let last = { a: 0, t: 0, v: 0 }
  let wheelTimer: ReturnType<typeof setTimeout> | undefined
  let wheelP: number | undefined
  const g = tokens.motion.gesture
  const progress = (raw: number) => {
    const p = raw < 0 || raw > 1 ? Math.min(1, Math.max(0, raw)) + rubber(raw - Math.min(1, Math.max(0, raw)), 0, g.rubber) : raw
    opts.onProgress(p)
    return p
  }
  const release = (p: number, v: number) => {
    const projected = p + (v * g.project) / opts.distance
    opts.onRelease(projected > g.commit, v)
  }
  const down = (e: PointerEvent) => {
    if (e.button !== 0) return
    start = { a: along(e), c: across(e), p: opts.from?.() ?? 0 }
    locked = undefined
    last = { a: along(e), t: e.timeStamp, v: 0 }
  }
  const move = (e: PointerEvent) => {
    if (!start) return
    const da = along(e) - start.a
    const dc = across(e) - start.c
    if (locked === undefined) {
      if (Math.hypot(da, dc) < g.slop) return
      locked = Math.abs(da) > Math.abs(dc)
      if (locked) el.setPointerCapture(e.pointerId)
    }
    if (!locked) return
    const dt = Math.max(1, e.timeStamp - last.t)
    last = { a: along(e), t: e.timeStamp, v: (along(e) - last.a) / dt }
    progress(start.p + da / opts.distance)
  }
  const up = (e: PointerEvent) => {
    if (!start) return
    const was = start
    start = undefined
    if (!locked) return
    release(was.p + (along(e) - was.a) / opts.distance, e.timeStamp - last.t > tokens.motion.duration.press ? 0 : last.v)
  }
  const wheel = (e: WheelEvent) => {
    const delta = (opts.axis === "x" ? e.deltaX : e.deltaY) * -dir
    const other = opts.axis === "x" ? e.deltaY : e.deltaX
    if (wheelP === undefined && Math.abs(delta) <= Math.abs(other)) return
    e.preventDefault()
    wheelP = progress((wheelP ?? opts.from?.() ?? 0) + delta / opts.distance)
    last = { a: 0, t: e.timeStamp, v: delta / g.frame }
    clearTimeout(wheelTimer)
    wheelTimer = setTimeout(() => {
      const p = wheelP ?? 0
      wheelP = undefined
      release(p, last.v)
    }, tokens.motion.duration["wheel-idle"])
  }
  el.addEventListener("pointerdown", down)
  el.addEventListener("pointermove", move)
  el.addEventListener("pointerup", up)
  el.addEventListener("pointercancel", up)
  if (opts.wheel !== false) el.addEventListener("wheel", wheel, { passive: false })
  return () => {
    el.removeEventListener("pointerdown", down)
    el.removeEventListener("pointermove", move)
    el.removeEventListener("pointerup", up)
    el.removeEventListener("pointercancel", up)
    el.removeEventListener("wheel", wheel)
  }
}
