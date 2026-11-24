import { parseFragment } from "parse5"

export type Node = readonly [path: string, kind: string, value: string]

const DROP = new Set(["data-track-owner", "data-track-action", "data-base-ui-tooltip-trigger", "data-kiki", "data-md-new", "data-md-base", "data-sharkid", "data-cds-sl", "data-cds-st", "data-dsx-sec", "xmlns", "id", "aria-controls"])
const VOLATILE = new Set(["animation-delay", "animation-name"])

const rgb = (hex: string) => `rgb(${[1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16)).join(", ")})`

const linear = (_: string, base: string, inset: string, factor: string) => {
  const percent = 100 * Number(factor)
  const pixels = Number(base) - Number(inset) * Number(factor)
  if (percent === 0) return `${pixels}px`
  return pixels === 0 ? `${percent}%` : `calc(${percent}% ${pixels < 0 ? "-" : "+"} ${Math.abs(pixels)}px)`
}

const style = (value: string) =>
  value
    .replace(/calc\(([\d.]+)px \+ \(100% - ([\d.]+)px\) \* ([\d.]+)\)/g, linear)
    .replace(/#[0-9a-f]{6}\b/gi, rgb)
    .replace(/(^|[\s:(,])0px\b/g, "$10")
    .split(";")
    .map((d) => d.trim())
    .filter((d) => d && !VOLATILE.has(d.slice(0, d.indexOf(":")).trim()))
    .map((d) => d.replace(/\s*:\s*/, ":").replace(/\s+/g, " "))
    .sort()
    .join(";")

interface Parsed {
  readonly nodeName: string
  readonly value?: string
  readonly attrs?: ReadonlyArray<{ name: string; value: string }>
  readonly childNodes?: ReadonlyArray<Parsed>
  readonly content?: Parsed
}

const walk = (node: Parsed, path: string, out: Node[]) => {
  if (node.nodeName === "#comment") return
  if (node.nodeName === "#text") {
    const text = node.value ?? ""
    if (text.trim()) out.push([path, "text", text.replace(/\s+/g, " ").trim()])
    return
  }
  if (!node.nodeName.startsWith("#")) {
    const attrs = (node.attrs ?? [])
      .map(({ name, value }) => [name.toLowerCase(), name === "style" ? style(value) : value.replace(/\s+/g, " ").trim()] as const)
      .filter(([name, value]) => !DROP.has(name) && !(name === "style" && value === ""))
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([name, value]) => `${name}="${value}"`)
      .join(" ")
    out.push([path, node.nodeName.toLowerCase(), attrs])
  }
  let index = 0
  for (const child of node.childNodes ?? []) {
    if (child.nodeName === "#comment" || (child.nodeName === "#text" && !(child.value ?? "").trim())) continue
    walk(child, `${path}/${index}`, out)
    index += 1
  }
}

export const canon = (html: string): Node[] => {
  const out: Node[] = []
  walk(parseFragment(html) as unknown as Parsed, "", out)
  return out
}

export interface Mismatch {
  readonly path: string
  readonly expected: string
  readonly actual: string
}

export const compare = (expected: string, actual: string): { nodes: number; mismatches: Mismatch[] } => {
  const a = canon(expected)
  const b = canon(actual)
  const mismatches: Mismatch[] = []
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const x = a[i]
    const y = b[i]
    if (x && y && x[0] === y[0] && x[1] === y[1] && x[2] === y[2]) continue
    mismatches.push({ path: x?.[0] ?? y?.[0] ?? "", expected: x ? `${x[1]} ${x[2]}` : "(none)", actual: y ? `${y[1]} ${y[2]}` : "(none)" })
  }
  return { nodes: a.length, mismatches }
}
