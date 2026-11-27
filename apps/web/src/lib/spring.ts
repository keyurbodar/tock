import { tokens } from "@tock/tokens"

type Spring = (typeof tokens.motion.spring)[keyof typeof tokens.motion.spring]

const cache = new Map<Spring, { easing: string; duration: number }>()

/**
 * A damped spring baked into a CSS linear() curve, so a transition settles with the overshoot of a real
 * spring (fluid-functionalism style) instead of a fixed bezier. Velocity is not carried; the curve starts at rest.
 */
export function spring(config: Spring = tokens.motion.spring.snappy) {
  const known = cache.get(config)
  if (known) return known
  const step = 1 / 120
  const points: number[] = []
  let x = 0
  let v = 0
  let t = 0
  while (t < 2) {
    const a = (-config.stiffness * (x - 1) - config.damping * v) / config.mass
    v += a * step
    x += v * step
    t += step
    points.push(x)
    if (Math.abs(1 - x) < 0.001 && Math.abs(v) < 0.01) break
  }
  const stride = Math.max(1, Math.round(points.length / 48))
  const samples = points.filter((_, index) => index % stride === 0)
  const value = { easing: `linear(0, ${samples.map((p) => p.toFixed(4)).join(", ")}, 1)`, duration: Math.round(t * 1000) }
  cache.set(config, value)
  return value
}
