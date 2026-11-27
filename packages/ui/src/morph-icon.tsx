import { createEffect, createSignal, For, untrack } from "solid-js"
import { Icon, type IconName, type IconSize } from "./icon"

type Line = readonly [number, number, number, number]
type Shape = { readonly lines: readonly [Line, Line, Line]; readonly group?: string; readonly rotate?: number }

const C: Line = [7, 7, 7, 7]
const shapes = {
  plus: { lines: [[7, 2, 7, 12], [2, 7, 12, 7], C], group: "cross", rotate: 0 },
  x: { lines: [[7, 2, 7, 12], [2, 7, 12, 7], C], group: "cross", rotate: 45 },
  minus: { lines: [[2, 7, 12, 7], C, C] },
  menu: { lines: [[2, 3.5, 12, 3.5], [2, 7, 12, 7], [2, 10.5, 12, 10.5]] },
  check: { lines: [[2.5, 7.5, 5.5, 10.5], [5.5, 10.5, 11.5, 3.5], C] },
  "arrow-up": { lines: [[7, 12, 7, 2.5], [2.8, 6.5, 7, 2.3], [11.2, 6.5, 7, 2.3]], group: "arrow", rotate: 0 },
  "arrow-right": { lines: [[7, 12, 7, 2.5], [2.8, 6.5, 7, 2.3], [11.2, 6.5, 7, 2.3]], group: "arrow", rotate: 90 },
  "arrow-down": { lines: [[7, 12, 7, 2.5], [2.8, 6.5, 7, 2.3], [11.2, 6.5, 7, 2.3]], group: "arrow", rotate: 180 },
  "chevron-down": { lines: [[3, 5, 7, 9], [11, 5, 7, 9], C], group: "chev", rotate: 0 },
  "chevron-right": { lines: [[3, 5, 7, 9], [11, 5, 7, 9], C], group: "chev", rotate: -90 },
  "chevron-up": { lines: [[3, 5, 7, 9], [11, 5, 7, 9], C], group: "chev", rotate: 180 },
  pause: { lines: [[4.5, 3, 4.5, 11], [9.5, 3, 9.5, 11], C] },
  play: { lines: [[4, 2.5, 4, 11.5], [4, 2.5, 11.5, 7], [4, 11.5, 11.5, 7]] },
} satisfies Record<string, Shape>

export type MorphIconName = keyof typeof shapes
export type GlyphName = MorphIconName | IconName

const isLine = (name: GlyphName): name is MorphIconName => Object.hasOwn(shapes, name)

function Lines(props: { name: MorphIconName; size: string; weight?: number }) {
  const shape = (): Shape => shapes[props.name]
  return (
    <svg class="tds-morph" viewBox="0 0 14 14" style={{ width: props.size, height: props.size, rotate: `${shape().rotate ?? 0}deg`, "stroke-width": props.weight ?? 1.6 }} aria-hidden="true">
      {[0, 1, 2].map((i) => {
        const l = () => shape().lines[i as 0 | 1 | 2]
        const collapsed = () => l()[0] === l()[2] && l()[1] === l()[3]
        return <line x1={l()[0]} y1={l()[1]} x2={l()[2]} y2={l()[3]} style={{ opacity: collapsed() ? 0 : 1 }} />
      })}
    </svg>
  )
}

interface Layer {
  readonly id: number
  readonly name: GlyphName
  readonly phase: "rest" | "in" | "out"
}

/**
 * Every icon that changes state goes through here. Line shapes (plus, x, check, arrows, chevrons, menu)
 * morph their strokes into each other; any other pair swaps per TDS swapIcon: the old one shrinks to .25
 * and blurs 4px while the new one grows out of it.
 */
export function MorphIcon(props: { name: GlyphName; size?: Exclude<IconSize, "weight-boost">; class?: string; weight?: number }) {
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
            {isLine(layer().name) ? <Lines name={layer().name as MorphIconName} size={size()} weight={props.weight} /> : <Icon name={layer().name as IconName} size={props.size ?? "composer"} />}
          </span>
        )}
      </For>
    </span>
  )
}
