import { createEffect, onCleanup } from "solid-js"
import { tokens } from "@tock/tokens"

/**
 * Dot-matrix status grid: 9×9 LEDs drawn on one canvas, every pattern a pure function of time so all
 * instances share one clock, one rAF loop, and a reduced-motion still frame is just one sample.
 * Patterns and timings are traced frame by frame from the "Thinking, 8 ways" reference video.
 */
export type GridPattern = "embers" | "ring" | "diamond" | "arc" | "spiral" | "arrow" | "comet" | "glider" | "check" | "cross"
export type GridHue = keyof typeof tokens.color.grid
export type GridState = "thinking" | "working" | "needs" | "failed" | "done" | "queued"

export const GRID_STATE: Record<GridState, { pattern: GridPattern; hue: GridHue }> = {
  thinking: { pattern: "arc", hue: "violet" },
  working: { pattern: "spiral", hue: "blue" },
  needs: { pattern: "diamond", hue: "amber" },
  failed: { pattern: "cross", hue: "red" },
  done: { pattern: "check", hue: "green" },
  queued: { pattern: "glider", hue: "pink" },
}

const N = 9
const g = tokens.motion.grid
const sec = (ms: number) => ms / 1000
const clamp = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
const ease = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(x))
const mod = (a: number, b: number) => ((a % b) + b) % b
const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}
const at = (x: number, y: number) => y * N + x
const cells = (list: readonly (readonly [number, number])[]) => list.map(([x, y]) => at(x, y))

/** Clockwise spiral from the top-left corner into the centre. */
const SPIRAL = (() => {
  const out: number[] = []
  let [x0, y0, x1, y1] = [0, 0, N - 1, N - 1]
  while (x0 <= x1 && y0 <= y1) {
    for (let x = x0; x <= x1; x++) out.push(at(x, y0))
    for (let y = y0 + 1; y <= y1; y++) out.push(at(x1, y))
    if (y0 < y1) for (let x = x1 - 1; x >= x0; x--) out.push(at(x, y1))
    if (x0 < x1) for (let y = y1 - 1; y > y0; y--) out.push(at(x0, y))
    x0++, y0++, x1--, y1--
  }
  return out
})()

/** The comet's ribbon: up the left diagonal, over the top loop, down to the far corner (crossing itself). */
const RIBBON = cells([
  [0, 8], [1, 7], [2, 7], [3, 6], [4, 6], [5, 5], [6, 5], [7, 4], [8, 3], [8, 2], [7, 1], [6, 0], [5, 0], [4, 0],
  [3, 0], [2, 1], [1, 1], [0, 2], [0, 3], [1, 4], [2, 4], [3, 5], [4, 6], [5, 6], [6, 7], [7, 7], [8, 8],
])

/** Conway's life on a 9×9 torus seeded with one glider: it comes home after 36 generations. */
const GLIDER = (() => {
  let board = new Uint8Array(N * N)
  for (const k of cells([[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]])) board[k] = 1
  const gens: Uint8Array[] = []
  for (let i = 0; i < 4 * N; i++) {
    gens.push(board)
    const next = new Uint8Array(N * N)
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        let n = 0
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) n += board[at(mod(x + dx, N), mod(y + dy, N))]!
        next[at(x, y)] = n === 3 || (n === 2 && board[at(x, y)]) ? 1 : 0
      }
    board = next
  }
  return gens
})()

const CHECK = cells([[1, 4], [2, 5], [3, 6], [4, 5], [5, 4], [6, 3], [7, 2]])
const CROSS = cells([[2, 2], [3, 3], [4, 4], [5, 5], [6, 6], [6, 2], [5, 3], [3, 5], [2, 6]])
const PLUS = Array.from({ length: N * N }, (_, k) => {
  const dx = Math.abs((k % N) - 4)
  const dy = Math.abs(Math.floor(k / N) - 4)
  return dx === 0 || dy === 0 || (dx <= 1 && dy <= 3) || (dy <= 1 && dx <= 3)
})

type Frame = Float32Array
const each = (out: Frame, fn: (dx: number, dy: number, k: number) => number) => {
  for (let k = 0; k < N * N; k++) out[k] = fn((k % N) - 4, Math.floor(k / N) - 4, k)
}
const lift = (out: Frame, k: number, v: number) => {
  if (k >= 0 && k < N * N && v > out[k]!) out[k] = v
}

/** Each pattern writes 0..1 intensities for time t (seconds). */
const PATTERNS: Record<GridPattern, (t: number, out: Frame) => void> = {
  // Ring breathes from the centre to the rim (white-hot at full size), holds, collapses, rests.
  ring(t, out) {
    const p = sec(g.ring)
    const u = mod(t, p) / p
    const r = u < 0.38 ? 4 * ease(u / 0.38) : u < 0.55 ? 4 : u < 0.88 ? 4 * (1 - ease((u - 0.55) / 0.33)) : 0
    const amp = 0.6 + 0.4 * (r / 4)
    each(out, (dx, dy) => amp * Math.exp(-(((Math.hypot(dx, dy) - r) / 0.55) ** 2)))
  },
  // Centre spark, filled diamond bursts out, holds with hot tips, rounds into a circle, implodes.
  diamond(t, out) {
    const p = sec(g.diamond)
    const u = mod(t, p) / p
    out.fill(0)
    if (u < 0.1) return lift(out, at(4, 4), 1)
    if (u < 0.335) {
      const m = 3 * ((u - 0.1) / 0.235)
      return each(out, (dx, dy) => {
        const d = Math.abs(dx) + Math.abs(dy)
        return d > m + 0.5 ? 0 : 0.95 * Math.exp(-(m - d) * 0.9)
      })
    }
    if (u < 0.8) {
      const s = ease((u - 0.535) / 0.265)
      const amp = u < 0.535 ? 0.92 - 0.25 * ((u - 0.335) / 0.2) : 0.67 - 0.17 * s
      return each(out, (dx, dy) => {
        const d = (1 - s) * (Math.abs(dx) + Math.abs(dy)) + s * Math.hypot(dx, dy) * 0.94
        const tip = (dx === 0 || dy === 0) && u < 0.535 ? 0.08 + 0.25 * (1 - (u - 0.335) / 0.2) : 0
        return (amp + tip) * Math.exp(-(((d - 3) / 0.45) ** 2))
      })
    }
    const r = u < 0.935 ? 3 - 1.6 * ((u - 0.8) / 0.135) : 1.4 * (1 - (u - 0.935) / 0.065)
    const amp = u < 0.935 ? 0.5 + 0.4 * ((u - 0.8) / 0.135) : 0.9
    each(out, (dx, dy) => (Math.abs(dx) === Math.abs(dy) || !dx || !dy ? amp * Math.exp(-(((Math.hypot(dx, dy) - r) / 0.4) ** 2)) : 0))
  },
  // A lit band slides up and down the rim: a smile, brackets around the centre, a frown, and back.
  arc(t, out) {
    const yc = 4.6 * Math.cos((2 * Math.PI * t) / sec(g.arc))
    each(out, (dx, dy) => {
      const d = Math.hypot(dx, dy)
      if (d > 0.5 && Math.abs(d - 4) > 0.75) return 0
      return clamp(1 - (Math.abs(dy - yc) - 1.7)) ** 1.2
    })
  },
  // A snake with a cooling tail spirals from the corner into the centre, which flashes as it lands.
  spiral(t, out) {
    const step = sec(g["spiral-step"])
    const lap = SPIRAL.length + g["spiral-rest"]
    const h = mod(t / step, lap)
    const tail = g["spiral-tail"]
    out.fill(0)
    SPIRAL.forEach((k, i) => {
      for (const a of [h - i, h + lap - i]) if (a >= 0 && a < tail) lift(out, k, (1 - a / tail) ** 1.5)
    })
    const flash = h < g["spiral-rest"] + 2 ? 1 - h / (g["spiral-rest"] + 2) : 0
    if (flash > 0) each(out, (dx, dy, k) => Math.max(out[k]!, Math.abs(dx) <= 1 && Math.abs(dy) <= 1 ? 0.6 * flash : 0))
  },
  // A dash runs in from the left, hits the centre, flares into a bar and sweeps right into an arrowhead.
  arrow(t, out) {
    const p = sec(g.arrow)
    const u = mod(t, p) / p
    each(out, (_dx, _dy, k) => (PLUS[k] ? 0.3 : 0))
    if (u < 0.17) {
      const f = 1 - u / 0.17
      lift(out, at(8, 4), f), lift(out, at(7, 3), 0.7 * f), lift(out, at(7, 5), 0.7 * f), lift(out, at(7, 4), 0.7 * f)
    } else if (u < 0.48) {
      const x = Math.floor(3 * ((u - 0.17) / 0.31))
      lift(out, at(x, 4), 1), lift(out, at(x - 1, 4), 0.75)
    } else if (u < 0.8) {
      const s = (u - 0.48) / 0.32
      const col = 4 + Math.round(4 * s)
      const half = Math.round(3 * (1 - s) * Math.min(1, s * 6 + 0.34))
      for (let dy = -half; dy <= half; dy++) {
        lift(out, at(col, 4 + dy), 1 - 0.3 * s)
        lift(out, at(col - 1, 4 + dy), 0.62 - 0.2 * s)
      }
      lift(out, at(3, 4), 0.5 * (1 - s))
    } else {
      lift(out, at(8, 4), 1), lift(out, at(7, 3), 0.75), lift(out, at(7, 5), 0.75), lift(out, at(7, 4), 0.75)
    }
  },
  // A comet with a long violet tail rides the ribbon end to end, easing at each end; it never goes white.
  comet(t, out) {
    const p = sec(g.comet)
    const pos = (time: number) => {
      const w = mod(time, p) / p
      return RIBBON[Math.round(ease(w < 0.5 ? 2 * w : 2 - 2 * w) * (RIBBON.length - 1))]!
    }
    out.fill(0)
    const tail = g["comet-tail"]
    for (let j = tail - 1; j >= 0; j--) lift(out, pos(t - j * sec(g["comet-sample"])), 0.84 * (1 - j / tail) ** 1.3)
  },
  // Life: live cells burn white, the newly dead glow hue then cool; generations step, never tween.
  glider(t, out) {
    const gen = Math.floor(t / sec(g["glider-step"]))
    const [now, one, two] = [0, 1, 2].map((back) => GLIDER[mod(gen - back, GLIDER.length)]!)
    each(out, (_dx, _dy, k) => (now![k] ? 1 : one![k] ? 0.5 : two![k] ? 0.22 : 0))
  },
  // Embers: a slow red noise field; sparks strike white and bleed into their neighbours.
  embers(t, out) {
    const tick = t * 1.4
    const f = Math.floor(tick)
    const s = ease(tick - f)
    each(out, (_dx, _dy, k) => {
      const n = hash(k * 13.1 + f) * (1 - s) + hash(k * 13.1 + f + 1) * s
      return 0.06 + 0.4 * n * n
    })
    const slot = sec(g["embers-spark"])
    const j0 = Math.floor(t / slot)
    for (let j = j0 - 3; j <= j0; j++) {
      const a = t - j * slot
      const k = Math.floor(hash(j * 7.3) * N * N)
      const v = a < 0.15 ? 1 : clamp(1 - (a - 0.15) / 0.75)
      lift(out, k, v)
      const [x, y] = [k % N, Math.floor(k / N)]
      if (a > 0.1)
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && x + dx >= 0 && x + dx < N && y + dy >= 0 && y + dy < N) lift(out, at(x + dx, y + dy), 0.62 * v)
    }
  },
  check(_t, out) {
    out.fill(0)
    for (const k of CHECK) out[k] = 0.85
  },
  // A steady X that breathes slowly, never flashes.
  cross(t, out) {
    out.fill(0)
    const v = 0.72 + 0.14 * Math.cos((2 * Math.PI * t) / sec(g.cross))
    for (const k of CROSS) out[k] = v
  },
}

/** Where a still frame (reduced motion) samples each pattern: its most legible pose. */
const STILL: Record<GridPattern, number> = {
  ring: sec(g.ring) * 0.45, diamond: sec(g.diamond) * 0.4, arc: 0, spiral: sec(g["spiral-step"]) * 20, arrow: sec(g.arrow) * 0.9,
  comet: sec(g.comet) * 0.3, glider: 0, embers: 2.1, check: 0, cross: 0,
}

/** 64-step colour ramp per hue: dim deep base → deep → hue → tint → white-hot core. */
type Ramp = { fill: string[]; alpha: number[] }
const ramps = new Map<GridHue, Ramp>()
const channels = (code: string) => [1, 3, 5].map((i) => parseInt(code.slice(i, i + 2), 16))
const hex = (c: number[]) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")
function ramp(hue: GridHue): Ramp {
  const cached = ramps.get(hue)
  if (cached) return cached
  const c = tokens.color.grid[hue]
  const stops: [number, number[]][] = [[0, channels(c.deep)], [0.35, channels(c.deep)], [0.6, channels(c.hue)], [0.85, channels(c.tint)], [1, channels(c.core)]]
  const fill: string[] = []
  const alpha: number[] = []
  for (let i = 0; i < 64; i++) {
    const v = i / 63
    const n = stops.findIndex(([s]) => s >= v)
    const [s0, c0] = stops[Math.max(0, n - 1)]!
    const [s1, c1] = stops[n]!
    const f = s1 === s0 ? 0 : (v - s0) / (s1 - s0)
    fill.push(hex(c0.map((x, j) => x + (c1[j]! - x) * f)))
    alpha.push(g["base-alpha"] + (1 - g["base-alpha"]) * clamp(v / 0.35))
  }
  const made = { fill, alpha }
  ramps.set(hue, made)
  return made
}

type Painter = { paint: (t: number) => void; live: boolean; seen: boolean }
const painters = new Set<Painter>()
let frame = 0
const clock = () => performance.now() / 1000
function loop() {
  frame = 0
  if (document.hidden) return
  const t = clock()
  let any = false
  for (const p of painters)
    if (p.live && p.seen) {
      p.paint(t)
      any = true
    }
  if (any) frame = requestAnimationFrame(loop)
}
const wake = () => {
  if (!frame && !document.hidden) frame = requestAnimationFrame(loop)
}
let observer: IntersectionObserver | undefined
const watched = new WeakMap<Element, Painter>()
function observe(el: Element, painter: Painter) {
  if (!observer) {
    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const p = watched.get(entry.target)
        if (p) p.seen = entry.isIntersecting
      }
      wake()
    })
    document.addEventListener("visibilitychange", wake)
  }
  watched.set(el, painter)
  observer.observe(el)
}
const reduced = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : undefined

/** A status as a 9×9 LED grid. `state` picks a pattern and hue; `pattern` / `hue` override either. Decorative unless `label` names it. */
export function StatusGrid(props: { state?: GridState; pattern?: GridPattern; hue?: GridHue; size?: number; still?: boolean; label?: string; class?: string }) {
  let canvas!: HTMLCanvasElement
  const pattern = () => props.pattern ?? GRID_STATE[props.state ?? "thinking"].pattern
  const hue = () => props.hue ?? GRID_STATE[props.state ?? "thinking"].hue
  const size = () => props.size ?? tokens.size["grid-row"]
  const out: Frame = new Float32Array(N * N)
  let ctx: CanvasRenderingContext2D | null = null
  let pitch = 2
  const painter: Painter = { live: false, seen: false, paint: () => {} }

  const draw = (t: number, kind: GridPattern, colours: Ramp) => {
    if (!ctx) return
    PATTERNS[kind](t, out)
    const side = pitch * N
    ctx.clearRect(0, 0, side, side)
    const dot = pitch * g.dot
    const square = dot < 3
    const pad = (pitch - (square ? Math.round(dot) : dot)) / 2
    for (let k = 0; k < N * N; k++) {
      const v = out[k]!
      const i = Math.min(63, Math.round(v * 63))
      const x = (k % N) * pitch
      const y = Math.floor(k / N) * pitch
      if (v > g.bloom) {
        ctx.globalAlpha = (v - g.bloom) * g["bloom-alpha"]
        ctx.fillStyle = colours.fill[40]!
        ctx.beginPath()
        ctx.arc(x + pitch / 2, y + pitch / 2, pitch * 0.95, 0, 2 * Math.PI)
        ctx.fill()
      }
      ctx.globalAlpha = colours.alpha[i]!
      ctx.fillStyle = colours.fill[i]!
      if (square) ctx.fillRect(x + pad, y + pad, Math.round(dot), Math.round(dot))
      else {
        ctx.beginPath()
        ctx.arc(x + pitch / 2, y + pitch / 2, dot / 2, 0, 2 * Math.PI)
        ctx.fill()
      }
    }
    ctx.globalAlpha = 1
  }

  createEffect(
    () => [pattern(), hue(), size(), !!props.still] as const,
    ([next, tone, px, still]) => {
      kind = next
      // Snap the LED pitch to whole device pixels so every dot is equally crisp.
      const dpr = window.devicePixelRatio || 1
      pitch = Math.max(2, Math.round((px * dpr) / N))
      canvas.width = canvas.height = pitch * N
      canvas.style.width = canvas.style.height = `${(pitch * N) / dpr}px`
      ctx = canvas.getContext("2d")
      const colours = ramp(tone)
      const fixed = still || kind === "check" || reduced?.matches
      painter.paint = (t) => draw(t, kind, colours)
      draw(fixed ? STILL[kind] : clock(), kind, colours)
      painter.live = !fixed
      if (painter.live) wake()
    },
  )
  let kind: GridPattern = "check"
  const motion = () => {
    painter.live = !props.still && kind !== "check" && !reduced?.matches
    if (!painter.live) painter.paint(STILL[kind])
    wake()
  }
  const mount = (el: HTMLCanvasElement) => {
    canvas = el
    painters.add(painter)
    observe(el, painter)
    reduced?.addEventListener("change", motion)
  }
  onCleanup(() => {
    painters.delete(painter)
    observer?.unobserve(canvas)
    reduced?.removeEventListener("change", motion)
  })

  return (
    <span
      class={props.class ? `tds-grid ${props.class}` : "tds-grid"}
      data-pattern={pattern()}
      style={{ width: `${size()}px`, height: `${size()}px` }}
      role={props.label ? "img" : undefined}
      aria-label={props.label}
      aria-hidden={props.label ? undefined : "true"}
    >
      <canvas ref={mount} />
    </span>
  )
}

/** The hue's tint, for things that sit beside a grid (the shimmering label). */
export const gridTint = (state: GridState) => tokens.color.grid[GRID_STATE[state].hue].tint
