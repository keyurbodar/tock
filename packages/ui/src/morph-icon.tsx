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
  pause: { lines: [[4.5, 3, 4.5, 11], [9.5, 3, 9.5, 11], C] },
  play: { lines: [[4, 2.5, 4, 11.5], [4, 2.5, 11.5, 7], [4, 11.5, 11.5, 7]] },
} satisfies Record<string, Shape>

export type MorphIconName = keyof typeof shapes

export function MorphIcon(props: { name: MorphIconName; size?: "chip" | "toast" | "menu" | "composer" | "row" | "rail"; class?: string; weight?: number }) {
  const shape = (): Shape => shapes[props.name]
  const size = () => `var(--tds-icon-${props.size ?? "composer"})`
  return (
    <svg
      class={`tds-morph ${props.class ?? ""}`}
      viewBox="0 0 14 14"
      style={{ width: size(), height: size(), rotate: `${shape().rotate ?? 0}deg`, "stroke-width": props.weight ?? 1.6 }}
      aria-hidden="true"
    >
      {[0, 1, 2].map((i) => {
        const l = () => shape().lines[i as 0 | 1 | 2]
        const collapsed = () => l()[0] === l()[2] && l()[1] === l()[3]
        return (
          <line
            x1={l()[0]}
            y1={l()[1]}
            x2={l()[2]}
            y2={l()[3]}
            style={{ opacity: collapsed() ? 0 : 1 }}
          />
        )
      })}
    </svg>
  )
}
