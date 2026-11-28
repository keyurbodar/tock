import { createEffect, createSignal, For, onCleanup, untrack } from "solid-js"
import { animate } from "./motion/core"
import { tokens } from "@tock/tokens"
import { Icon, type DuetName, type IconName, type IconSize } from "./icon"

type Line = readonly [number, number, number, number]
type Shape = { readonly lines: readonly [Line, Line, Line, Line]; readonly rotate?: number; readonly weight?: number; readonly spin?: boolean }

const C: Line = [7, 7, 7, 7]
// Tock regular strokes 16/256 of the box, so line shapes match the weight of sprite icons.
const regular = (16 / 256) * 14
const arrow: Shape["lines"] = [[7, 12, 7, 2.5], [2.8, 6.5, 7, 2.3], [11.2, 6.5, 7, 2.3], C]
const chevron: Shape["lines"] = [[3, 5, 7, 9], [11, 5, 7, 9], C, C]
const shapes = {
  plus: { lines: [[7, 2, 7, 12], [2, 7, 12, 7], C, C], rotate: 0 },
  x: { lines: [[7, 2, 7, 12], [2, 7, 12, 7], C, C], rotate: 45 },
  minus: { lines: [[2, 7, 12, 7], C, C, C] },
  menu: { lines: [[2, 3.5, 12, 3.5], [2, 7, 12, 7], [2, 10.5, 12, 10.5], C] },
  check: { lines: [[2.5, 7.5, 5.5, 10.5], [5.5, 10.5, 11.5, 3.5], C, C] },
  "arrow-up": { lines: arrow, rotate: 0 },
  "arrow-right": { lines: arrow, rotate: 90 },
  "arrow-down": { lines: arrow, rotate: 180 },
  stop: { lines: [[5, 5, 9, 5], [9, 5, 9, 9], [9, 9, 5, 9], [5, 9, 5, 5]], rotate: 0, weight: 4 },
  "chevron-down": { lines: chevron, rotate: 0 },
  "chevron-right": { lines: chevron, rotate: -90 },
  "chevron-up": { lines: chevron, rotate: 180 },
  pause: { lines: [[4.5, 3, 4.5, 11], [9.5, 3, 9.5, 11], C, C] },
  play: { lines: [[4, 2.5, 4, 11.5], [4, 2.5, 11.5, 7], [4, 11.5, 11.5, 7], C] },
  /** Funnel as three tapering bars (Claude's filter glyph); morphs from and to `menu` and `x`. */
  filter: { lines: [[2, 3.5, 12, 3.5], [4, 7, 10, 7], [5.75, 10.5, 8.25, 10.5], C] },
  /** Return key (↵), Duet's send: a stem down the right, a foot to the left and the arrowhead. Morphs into `stop` while a reply runs. */
  return: { lines: [[11, 2.5, 11, 8.5], [11, 8.5, 3, 8.5], [3, 8.5, 5.75, 5.75], [3, 8.5, 5.75, 11.25]], rotate: 0 },
  spinner: { lines: [[7, 1.5, 7, 4], [12.5, 7, 10, 7], [7, 12.5, 7, 10], [1.5, 7, 4, 7]], rotate: 0, spin: true },
} satisfies Record<string, Shape>

export type MorphIconName = keyof typeof shapes
export type GlyphName = MorphIconName | IconName

const isLine = (name: string): name is MorphIconName => Object.hasOwn(shapes, name)
const reduce = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches

/**
 * Stroke morph: every line tweens its end points (and the stroke weight) to the next shape's. SVG line coordinates
 * are not CSS properties, so the tween runs in JS, eased by a Web Animation on the same curve as everything else.
 */
function Lines(props: { name: MorphIconName; size: string; weight?: number }) {
  const lines: SVGLineElement[] = []
  let svg!: SVGSVGElement
  const target = () => {
    const shape: Shape = shapes[props.name]
    return { points: shape.lines.flat(), weight: shape.weight ?? props.weight ?? regular, rotate: shape.rotate ?? 0, spin: shape.spin ?? false }
  }
  let now = untrack(target)
  let frame = 0
  let clock: Animation | undefined
  const paint = (points: readonly number[], weight: number) => {
    lines.forEach((line, i) => {
      const [x1, y1, x2, y2] = points.slice(i * 4, i * 4 + 4) as [number, number, number, number]
      line.setAttribute("x1", String(x1))
      line.setAttribute("y1", String(y1))
      line.setAttribute("x2", String(x2))
      line.setAttribute("y2", String(y2))
      line.style.opacity = x1 === x2 && y1 === y2 ? "0" : "1"
    })
    svg.style.strokeWidth = String(weight)
  }
  createEffect(target, (next) => {
    if (!svg) return
    svg.style.rotate = `${next.rotate}deg`
    if (svg.hasAttribute("data-spin") && !next.spin) {
      const m = new DOMMatrix(getComputedStyle(svg).transform)
      const at = (Math.atan2(m.b, m.a) * 180) / Math.PI
      const from = at < 0 ? at + 360 : at
      svg.removeAttribute("data-spin")
      animate(svg, [{ transform: `rotate(${from}deg)` }, { transform: "rotate(360deg)" }], { duration: tokens.motion.duration.swap, easing: tokens.motion.curve.out })
    }
    if (next.spin) svg.setAttribute("data-spin", "")
    const from = now
    cancelAnimationFrame(frame)
    clock?.cancel()
    if (reduce()) {
      now = next
      paint(next.points, next.weight)
      return
    }
    clock = animate(svg, [{ opacity: 1 }, { opacity: 1 }], { duration: tokens.motion.duration.swap, easing: tokens.motion.curve.sheet, essential: true })
    const step = () => {
      const t = clock?.effect?.getComputedTiming().progress ?? 1
      const k = clock?.playState === "finished" ? 1 : (t ?? 1)
      const points = next.points.map((p, i) => from.points[i]! + (p - from.points[i]!) * k)
      const weight = from.weight + (next.weight - from.weight) * k
      now = { points, weight, rotate: next.rotate, spin: next.spin }
      paint(points, weight)
      if (k < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
  })
  onCleanup(() => (cancelAnimationFrame(frame), clock?.cancel()))
  const first = untrack(target)
  return (
    <svg ref={svg} class="tds-morph" data-spin={first.spin ? "" : undefined} viewBox="0 0 14 14" style={{ width: props.size, height: props.size, rotate: `${first.rotate}deg`, "stroke-width": first.weight }} aria-hidden="true">
      {[0, 1, 2, 3].map((i) => {
        const [x1, y1, x2, y2] = first.points.slice(i * 4, i * 4 + 4) as [number, number, number, number]
        return <line ref={(el) => (lines[i] = el)} x1={x1} y1={y1} x2={x2} y2={y2} style={{ opacity: x1 === x2 && y1 === y2 ? 0 : 1 }} />
      })}
    </svg>
  )
}

interface Layer {
  readonly id: number
  readonly name: GlyphName | DuetName
  readonly phase: "rest" | "in" | "out"
}

/**
 * Every icon that changes state goes through here. Line shapes (plus, x, check, arrows, chevrons, menu)
 * morph their strokes into each other; any other pair swaps per TDS swapIcon: the old one shrinks to .25
 * and blurs 4px while the new one grows out of it.
 */
export function MorphIcon(
  props: { size?: IconSize; class?: string; weight?: number } & ({ name: GlyphName; variant?: "line" } | { name: DuetName; variant: "duet" }),
) {
  let next = 0
  const [layers, setLayers] = createSignal<Layer[]>([{ id: next, name: untrack(() => props.name), phase: "rest" }])
  createEffect(
    () => props.name,
    (name) => {
      const current = untrack(layers).findLast((layer) => layer.phase !== "out")
      if (!current || current.name === name) return
      if (isLine(name) && isLine(current.name)) {
        setLayers((all) => all.map((layer) => (layer.id === current.id ? { ...layer, name } : layer)))
        return
      }
      next += 1
      const id = next
      setLayers((all) => [...all.map((layer) => (layer.phase === "out" ? layer : { ...layer, phase: "out" as const })), { id, name, phase: "in" }])
    },
  )
  const size = () => `var(--tds-icon-${props.size ?? "composer"})`
  const settle = (id: number, phase: Layer["phase"]) =>
    setLayers((all) => (phase === "out" ? all.filter((layer) => layer.id !== id) : all.map((layer) => (layer.id === id ? { ...layer, phase: "rest" as const } : layer))))
  return (
    <span class={`tds-glyph ${props.class ?? ""}`} data-glyph={layers().findLast((layer) => layer.phase !== "out")?.name}>
      <For each={layers()} keyed={(layer) => layer.id}>
        {(layer) => (
          <span class="tds-glyph-layer" data-phase={layer().phase} onAnimationEnd={(e) => e.target === e.currentTarget && settle(layer().id, layer().phase)}>
            {isLine(layer().name) ? <Lines name={layer().name as MorphIconName} size={size()} weight={props.weight} /> : props.variant === "duet" ? (
              <Icon name={layer().name as DuetName} variant="duet" size={props.size ?? "composer"} />
            ) : (
              <Icon name={layer().name as IconName} size={props.size ?? "composer"} />
            )}
          </span>
        )}
      </For>
    </span>
  )
}
