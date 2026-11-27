import { tokens } from "@tock/tokens"
import { prefersReducedMotion } from "./core"

type Preset = keyof typeof tokens.motion.spring

/**
 * Drive: one 0..1 progress value on a real spring that keeps its velocity. Retarget at any time (a tap mid-flight, a
 * gesture release) and it turns around smoothly instead of restarting a tween. The value is written to a CSS variable
 * (default --p) so layout, blur, scale and dim can all key off the same progress.
 */
export function drive(el: HTMLElement, opts: { preset?: Preset; property?: string; value?: number; onFrame?: (p: number) => void; onRest?: (p: number) => void } = {}) {
  const property = opts.property ?? "--p"
  let { stiffness, damping, mass } = tokens.motion.spring[opts.preset ?? "expressive"]
  let x = opts.value ?? 0
  let v = 0
  let target = x
  let frame = 0
  let last = 0
  const write = () => (el.style.setProperty(property, x.toFixed(4)), opts.onFrame?.(x))
  const step = (now: number) => {
    const dt = Math.min(0.064, last ? (now - last) / 1000 : 1 / 60)
    last = now
    for (let t = 0; t < dt; t += 1 / 240) {
      const h = Math.min(1 / 240, dt - t)
      v += ((-stiffness * (x - target) - damping * v) / mass) * h
      x += v * h
    }
    if (Math.abs(x - target) < 0.0005 && Math.abs(v) < 0.0005) {
      x = target
      v = 0
      frame = 0
      write()
      opts.onRest?.(x)
      return
    }
    write()
    frame = requestAnimationFrame(step)
  }
  write()
  return {
    get value() {
      return x
    },
    get velocity() {
      return v
    },
    /** Spring toward a value; keeps the current velocity. Pass a preset to change feel for this leg (open vs close). */
    to(next: number, preset?: Preset, velocity?: number) {
      target = next
      if (preset) ({ stiffness, damping, mass } = tokens.motion.spring[preset])
      if (velocity !== undefined) v = velocity
      if (prefersReducedMotion()) return this.set(next)
      if (!frame) ((last = 0), (frame = requestAnimationFrame(step)))
    },
    /** Follow a gesture directly: no spring, velocity kept for the release. */
    set(next: number, velocity = 0) {
      cancelAnimationFrame(frame)
      frame = 0
      x = target = next
      v = velocity
      write()
    },
    stop: () => cancelAnimationFrame(frame),
  }
}
