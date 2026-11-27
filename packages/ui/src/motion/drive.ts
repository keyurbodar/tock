import { tokens } from "@tock/tokens"
import { prefersReducedMotion } from "./core"
import { backdropTo, scrim } from "./grow"

type Preset = keyof typeof tokens.motion.spring
type Spring = (typeof tokens.motion.spring)[Preset]

/** Another element moving in step with the progress. at(p) must be linear in p (translate, scale, opacity, blur), since a leg interpolates between at(from) and at(to). */
export interface Track {
  readonly el: () => Element | readonly Element[] | null | undefined
  readonly at: (p: number) => Keyframe
  /** The progress at which the track carries no inline style (default 0): resting there clears it instead of writing at(p). */
  readonly idle?: number
  /** An attribute the track's elements carry while away from idle, so CSS and journeys can see the state. */
  readonly mark?: string
}

/** Closed-form damped spring from x0 with velocity v0 (per second) toward target: position and velocity t seconds later. */
function solve({ stiffness, damping, mass }: Spring, x0: number, v0: number, target: number) {
  const w0 = Math.sqrt(stiffness / mass)
  const zeta = damping / (2 * Math.sqrt(stiffness * mass))
  const a = x0 - target
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta)
    const b = (v0 + zeta * w0 * a) / wd
    return (t: number) => {
      const e = Math.exp(-zeta * w0 * t)
      const c = Math.cos(wd * t)
      const s = Math.sin(wd * t)
      return { x: target + e * (a * c + b * s), v: e * ((b * wd - zeta * w0 * a) * c - (a * wd + zeta * w0 * b) * s) }
    }
  }
  const root = w0 * Math.sqrt(zeta * zeta - 1)
  if (root < 1e-6) {
    const b = v0 + w0 * a
    return (t: number) => {
      const e = Math.exp(-w0 * t)
      return { x: target + (a + b * t) * e, v: (b - w0 * (a + b * t)) * e }
    }
  }
  const r1 = -zeta * w0 + root
  const r2 = -zeta * w0 - root
  const c2 = (v0 - r1 * a) / (r2 - r1)
  const c1 = a - c2
  return (t: number) => ({ x: target + c1 * Math.exp(r1 * t) + c2 * Math.exp(r2 * t), v: c1 * r1 * Math.exp(r1 * t) + c2 * r2 * Math.exp(r2 * t) })
}

const registered = new Set<string>()
function register(name: string) {
  if (registered.has(name) || typeof CSS === "undefined" || !("registerProperty" in CSS)) return
  registered.add(name)
  try {
    CSS.registerProperty({ name, syntax: "<number>", inherits: true, initialValue: "0" })
  } catch {}
}

const cssName = (key: string) => (key.startsWith("--") ? key : key.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase()))
const nodes = (track: Track) => {
  const found = track.el()
  return (found instanceof Element ? [found] : (found ?? [])).filter((el): el is HTMLElement | SVGElement => el instanceof HTMLElement || el instanceof SVGElement)
}

/**
 * Drive: one 0..1 progress on a real spring that keeps its velocity. Each leg is solved in closed form and played as a
 * WAAPI animation with the spring sampled into a linear() easing, so no script runs per frame. The progress is a
 * registered <number> property (default --p) that CSS keys off; tracks move other elements on the same curve, on the
 * compositor when they animate transform, opacity or filter. Retarget at any time (a tap mid-flight, a gesture
 * release) and the next leg starts from the current position and velocity.
 */
export function drive(el: HTMLElement, opts: { preset?: Preset; property?: string; value?: number; tracks?: readonly Track[]; backdrop?: string; onRest?: (p: number) => void } = {}) {
  const property = opts.property ?? "--p"
  register(property)
  let spring: Spring = tokens.motion.spring[opts.preset ?? "expressive"]
  let x = opts.value ?? 0
  let v = 0
  let target = x
  let leg: { at: (t: number) => { x: number; v: number }; start: number; anims: Animation[] } | undefined
  let idle: ReturnType<typeof setTimeout> | undefined
  const shade: Track = { el: scrim, at: (p) => ({ opacity: Math.min(1, Math.max(0, p)) }) }
  const back = 1 - Number(tokens.material.backdrop.scale)
  const layers: Track = { el: () => [...document.querySelectorAll("[data-backdrop-layer]")], at: (p) => ({ scale: String(1 - back * Math.min(1, Math.max(0, p))) }) }
  const tracks = () => (opts.backdrop ? [shade, layers, ...(opts.tracks ?? [])] : (opts.tracks ?? []))
  const moving = (on: boolean) => (clearTimeout(idle), el.toggleAttribute("data-moving", on))
  const now = () => (leg ? leg.at(Math.max(0, (performance.now() - leg.start) / 1000)) : { x, v })
  const halt = () => {
    if (!leg) return
    ;({ x, v } = now())
    for (const a of leg.anims) a.cancel()
    leg = undefined
  }
  const write = (p: number, resting = false) => {
    el.style.setProperty(property, p.toFixed(4))
    for (const track of tracks()) {
      const frame = Object.entries(track.at(p))
      const clear = resting && Math.abs(p - (track.idle ?? 0)) < 0.0005
      for (const node of nodes(track)) {
        for (const [key, value] of frame) clear ? node.style.removeProperty(cssName(key)) : node.style.setProperty(cssName(key), String(value))
        if (track.mark) node.toggleAttribute(track.mark, !clear)
      }
    }
    if (opts.backdrop) backdropTo(opts.backdrop, resting ? Math.min(1, Math.max(0, p)) : 1)
  }
  const rest = () => {
    leg?.anims.forEach((a) => a.cancel())
    leg = undefined
    x = target
    v = 0
    write(x, true)
    moving(false)
    opts.onRest?.(x)
  }
  write(x, true)
  return {
    get value() {
      return now().x
    },
    get velocity() {
      return now().v
    },
    /** Spring toward a value; keeps the current velocity. Pass a preset to change feel for this leg (open vs close). */
    to(next: number, preset?: Preset, velocity?: number) {
      halt()
      clearTimeout(idle)
      target = next
      if (preset) spring = tokens.motion.spring[preset]
      if (velocity !== undefined) v = velocity
      if (prefersReducedMotion() || (Math.abs(target - x) < 0.0005 && Math.abs(v) < 0.01)) return rest()
      const at = solve(spring, x, v, target)
      const span = Math.max(0.05, Math.abs(target - x))
      let settle = 0
      for (let t = 0; t < 3; t += 1 / 240) {
        const s = at(t)
        if (Math.abs(s.x - target) > 0.001 * span || Math.abs(s.v) > 0.02) settle = t
      }
      settle += 1 / 240
      const from = x
      const d = target - from || 1
      const steps = Math.max(24, Math.ceil(settle * 90))
      const points = Array.from({ length: steps + 1 }, (_, i) => +((at((settle * i) / steps).x - from) / d).toFixed(4))
      points[steps] = +((target - from) / d).toFixed(4)
      const timing: KeyframeAnimationOptions = { duration: settle * 1000, easing: "linear(" + points.join(", ") + ")", fill: "forwards" }
      write(from)
      moving(true)
      const anims = [el.animate([{ [property]: from }, { [property]: from + d }], timing)]
      for (const track of tracks()) for (const node of nodes(track)) anims.push(node.animate([track.at(from), track.at(from + d)], timing))
      const mine = { at, start: performance.now(), anims }
      leg = mine
      anims[0]!.finished.then(() => leg === mine && rest(), () => {})
    },
    /** Follow a gesture directly: no spring, velocity kept for the release. */
    set(next: number, velocity = 0) {
      halt()
      x = target = next
      v = velocity
      write(x)
      moving(true)
      idle = setTimeout(() => (moving(false), write(x, true)), tokens.motion.duration["wheel-idle"])
    },
    stop: () => {
      halt()
      target = x
      write(x, true)
      moving(false)
    },
  }
}

/**
 * Recede: one element gives way to whatever expands over it, scaling back, blurring and dimming in step with a drive()
 * (the same --tds-backdrop-* material as backdrop()). It is a track, so it runs on the compositor:
 * drive(field, { tracks: [recede(() => transcript)] }).
 */
export function recede(el: Track["el"]): Track {
  const m = tokens.material.backdrop
  const scale = 1 - Number(m.scale)
  const dim = 1 - Number(m.dim)
  return {
    el,
    mark: "data-recede",
    at: (p) => ({ transformOrigin: "50% 0", scale: String(1 - p * scale), opacity: String(1 - p * dim) }),
  }
}
