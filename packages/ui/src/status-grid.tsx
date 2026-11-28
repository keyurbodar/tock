import { createEffect, onCleanup } from "solid-js"
import { tokens } from "@tock/tokens"

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

const RIBBON = cells([
  [0, 8], [1, 7], [2, 7], [3, 6], [4, 6], [5, 5], [6, 5], [7, 4], [8, 3], [8, 2], [7, 1], [6, 0], [5, 0], [4, 0],
  [3, 0], [2, 1], [1, 1], [0, 2], [0, 3], [1, 4], [2, 4], [3, 5], [4, 6], [5, 6], [6, 7], [7, 7], [8, 8],
])

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

const PATTERNS: Record<GridPattern, (t: number, out: Frame) => void> = {
  ring(t, out) {
    const p = sec(g.ring)
    const u = mod(t, p) / p
    const r = u < 0.38 ? 4 * ease(u / 0.38) : u < 0.55 ? 4 : u < 0.88 ? 4 * (1 - ease((u - 0.55) / 0.33)) : 0
    const amp = 0.65 + 0.35 * (r / 4)
    each(out, (dx, dy) => {
      const d = Math.hypot(dx, dy)
      return Math.max(amp * Math.exp(-(((d - r) / 0.68) ** 2)), d < r ? 0.3 * (r / 4) : 0)
    })
  },
  diamond(t, out) {
    const p = sec(g.diamond)
    const u = mod(t, p) / p
    out.fill(0)
    if (u < 0.1) return lift(out, at(4, 4), 1)
    if (u < 0.335) {
      const m = 4 * ((u - 0.1) / 0.235)
      return each(out, (dx, dy) => {
        const d = Math.abs(dx) + Math.abs(dy)
        return d > m + 0.5 ? 0 : 0.98 * Math.exp(-(m - d) * 0.68)
      })
    }
    if (u < 0.8) {
      const s = ease((u - 0.535) / 0.265)
      const amp = u < 0.535 ? 0.95 - 0.24 * ((u - 0.335) / 0.2) : 0.71 - 0.12 * s
      return each(out, (dx, dy) => {
        const d = (1 - s) * (Math.abs(dx) + Math.abs(dy)) + s * Math.hypot(dx, dy) * 1.12
        const tip = (dx === 0 || dy === 0) && u < 0.535 ? 0.1 + 0.24 * (1 - (u - 0.335) / 0.2) : 0
        return (amp + tip) * Math.exp(-(((d - 4) / 0.5) ** 2))
      })
    }
    const r = u < 0.935 ? 3.6 - 2.2 * ((u - 0.8) / 0.135) : 1.4 * (1 - (u - 0.935) / 0.065)
    const amp = u < 0.935 ? 0.55 + 0.4 * ((u - 0.8) / 0.135) : 0.95
    each(out, (dx, dy) => (Math.abs(dx) === Math.abs(dy) || !dx || !dy ? amp * Math.exp(-(((Math.hypot(dx, dy) - r) / 0.4) ** 2)) : 0))
  },
  arc(t, out) {
    const yc = 4.6 * Math.cos((2 * Math.PI * t) / sec(g.arc))
    each(out, (dx, dy) => {
      const d = Math.hypot(dx, dy)
      const band = clamp(1 - (Math.abs(dy - yc) - 1.2) / 1.8)
      if (d < 0.5) return Math.max(0.35, band)
      return band * clamp(1 - (Math.abs(d - 3.8) - 0.5) / 0.6)
    })
  },
  spiral(t, out) {
    const step = sec(g["spiral-step"])
    const lap = SPIRAL.length + g["spiral-rest"]
    const h = mod(t / step, lap)
    const tail = g["spiral-tail"]
    out.fill(0)
    SPIRAL.forEach((k, i) => {
      for (const a of [h - i, h + lap - i]) if (a >= 0 && a < tail) lift(out, k, (1 - a / tail) ** 1.4)
    })
    const flash = h < g["spiral-rest"] + 2 ? 1 - h / (g["spiral-rest"] + 2) : 0
    if (flash > 0) each(out, (dx, dy, k) => Math.max(out[k]!, Math.abs(dx) <= 1 && Math.abs(dy) <= 1 ? 0.7 * flash : 0))
  },
  arrow(t, out) {
    const p = sec(g.arrow)
    const u = mod(t, p) / p
    each(out, (_dx, _dy, k) => (PLUS[k] ? 0.4 : 0))
    if (u < 0.12) {
      const f = 1 - u / 0.12
      lift(out, at(8, 4), f), lift(out, at(7, 3), 0.7 * f), lift(out, at(7, 5), 0.7 * f), lift(out, at(7, 4), 0.7 * f)
    } else if (u < 0.45) {
      const x = Math.floor(4 * ((u - 0.12) / 0.33))
      lift(out, at(x, 4), 1), lift(out, at(x - 1, 4), 0.78)
    } else if (u < 0.84) {
      const s = (u - 0.45) / 0.39
      const col = 4 + Math.round(3 * s)
      const half = Math.round(3 * (1 - s) * Math.min(1, s * 8 + 0.34))
      for (let dy = -half; dy <= half; dy++) {
        lift(out, at(col, 4 + dy), 1 - 0.25 * s)
        lift(out, at(col + 1, 4 + dy), 0.96 - 0.28 * s)
        lift(out, at(col - 1, 4 + dy), 0.68 - 0.2 * s)
      }
      lift(out, at(3, 4), 0.7 * (1 - s)), lift(out, at(2, 4), 0.5 * (1 - s))
    } else {
      lift(out, at(8, 4), 1), lift(out, at(7, 3), 0.78), lift(out, at(7, 5), 0.78), lift(out, at(7, 4), 0.78)
    }
  },
  comet(t, out) {
    const p = sec(g.comet)
    const w = mod(t, p) / p
    const head = ease(w < 0.5 ? 2 * w : 2 - 2 * w) * (RIBBON.length - 1)
    const back = w < 0.5 ? -1 : 1
    const tail = g["comet-tail"]
    out.fill(0)
    for (let j = 0; j < tail; j++) {
      const i = Math.round(head + back * j)
      if (i >= 0 && i < RIBBON.length) lift(out, RIBBON[i]!, (j ? 0.82 : 0.96) * (1 - j / tail) ** 1.1)
    }
  },
  glider(t, out) {
    const gen = Math.floor(t / sec(g["glider-step"]))
    const [now, one, two] = [0, 1, 2].map((back) => GLIDER[mod(gen - back, GLIDER.length)]!)
    each(out, (_dx, _dy, k) => (now![k] ? 1 : one![k] ? 0.55 : two![k] ? 0.24 : 0))
  },
  embers(t, out) {
    const tick = t * 1.8
    const f = Math.floor(tick)
    const s = ease(tick - f)
    each(out, (_dx, _dy, k) => {
      const n = hash(k * 13.1 + f) * (1 - s) + hash(k * 13.1 + f + 1) * s
      return 0.08 + 0.42 * n * n
    })
    const slot = sec(g["embers-spark"])
    const j0 = Math.floor(t / slot)
    for (let j = j0 - 4; j <= j0; j++) {
      const a = t - j * slot
      const k = Math.floor(hash(j * 7.3) * N * N)
      const v = a < 0.28 ? 1 : clamp(1 - (a - 0.28) / 0.85)
      lift(out, k, v)
      const [x, y] = [k % N, Math.floor(k / N)]
      const heat = clamp((a - 0.1) / 0.16) * (a < 0.28 ? 0.85 : 0.85 * v)
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && x + dx >= 0 && x + dx < N && y + dy >= 0 && y + dy < N) lift(out, at(x + dx, y + dy), heat * (dx && dy ? 0.85 : 1))
    }
  },
  check(_t, out) {
    out.fill(0)
    for (const k of CHECK) out[k] = 0.92
  },
  cross(t, out) {
    out.fill(0)
    const v = 0.78 + 0.16 * Math.cos((2 * Math.PI * t) / sec(g.cross))
    for (const k of CROSS) out[k] = v
  },
}

const STILL: Record<GridPattern, number> = {
  ring: sec(g.ring) * 0.45, diamond: sec(g.diamond) * 0.4, arc: 0, spiral: sec(g["spiral-step"]) * 20, arrow: sec(g.arrow) * 0.9,
  comet: sec(g.comet) * 0.3, glider: 0, embers: 2.1, check: 0, cross: 0,
}

type Ramp = { fill: string[]; alpha: number[]; glow: string }
const ramps = new Map<GridHue, Ramp>()
const channels = (code: string) => [1, 3, 5].map((i) => parseInt(code.slice(i, i + 2), 16))
const hex = (c: number[]) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")
function ramp(hue: GridHue): Ramp {
  const cached = ramps.get(hue)
  if (cached) return cached
  const c = tokens.color.grid[hue]
  const stops: [number, number[]][] = [[0, channels(c.deep)], [0.28, channels(c.deep)], [0.58, channels(c.hue)], [0.84, channels(c.tint)], [1, channels(c.core)]]
  const fill: string[] = []
  const alpha: number[] = []
  for (let i = 0; i < 64; i++) {
    const v = i / 63
    const n = stops.findIndex(([s]) => s >= v)
    const [s0, c0] = stops[Math.max(0, n - 1)]!
    const [s1, c1] = stops[n]!
    const f = s1 === s0 ? 0 : (v - s0) / (s1 - s0)
    fill.push(hex(c0.map((x, j) => x + (c1[j]! - x) * f)))
    alpha.push(g["base-alpha"] + (1 - g["base-alpha"]) * clamp(v / 0.28))
  }
  const made = { fill, alpha, glow: c.hue }
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

export function StatusGrid(props: { state?: GridState; pattern?: GridPattern; hue?: GridHue; size?: number; still?: boolean; label?: string; class?: string }) {
  let canvas!: HTMLCanvasElement
  const pattern = () => props.pattern ?? GRID_STATE[props.state ?? "thinking"].pattern
  const hue = () => props.hue ?? GRID_STATE[props.state ?? "thinking"].hue
  const size = () => props.size ?? tokens.size["grid-row"]
  const out: Frame = new Float32Array(N * N)
  let ctx: CanvasRenderingContext2D | null = null
  let pitch = 10
  let kind: GridPattern = "check"
  const painter: Painter = { live: false, seen: false, paint: () => {} }

  const draw = (t: number, kind: GridPattern, colours: Ramp) => {
    if (!ctx) return
    PATTERNS[kind](t, out)
    const side = pitch * N
    ctx.clearRect(0, 0, side, side)
    const radius = (pitch * g.dot) / 2
    const glowRadius = pitch * 0.92
    for (let k = 0; k < N * N; k++) {
      const v = out[k]!
      const i = Math.min(63, Math.round(v * 63))
      const cx = (k % N) * pitch + pitch / 2
      const cy = Math.floor(k / N) * pitch + pitch / 2
      if (v > g.bloom) {
        const strength = (v - g.bloom) / (1 - g.bloom)
        const grad = ctx.createRadialGradient(cx, cy, radius * 0.4, cx, cy, glowRadius)
        grad.addColorStop(0, colours.glow)
        grad.addColorStop(1, "transparent")
        ctx.globalAlpha = strength * g["bloom-alpha"]
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.arc(cx, cy, glowRadius, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = colours.alpha[i]!
      ctx.fillStyle = colours.fill[i]!
      ctx.beginPath()
      ctx.arc(cx, cy, radius, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  createEffect(
    () => [pattern(), hue(), size(), !!props.still] as const,
    ([next, tone, px, still]) => {
      kind = next
      const dpr = Math.max(window.devicePixelRatio || 1, 2)
      pitch = Math.max(8, Math.round((px * dpr * 2) / N))
      canvas.width = canvas.height = pitch * N
      canvas.style.width = canvas.style.height = `${px}px`
      ctx = canvas.getContext("2d")
      const colours = ramp(tone)
      const fixed = still || kind === "check" || reduced?.matches
      painter.paint = (t) => draw(t, kind, colours)
      draw(fixed ? STILL[kind] : clock(), kind, colours)
      painter.live = !fixed
      if (painter.live) wake()
    },
  )
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

export const gridTint = (state: GridState) => tokens.color.grid[GRID_STATE[state].hue].tint
