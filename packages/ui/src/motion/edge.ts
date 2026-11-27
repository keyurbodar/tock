import { tokens } from "@tock/tokens"

export type EdgeAxis = "y" | "x" | "both"

const attached = new WeakMap<HTMLElement, () => void>()

interface Box {
  readonly el: HTMLElement
  readonly x: boolean
  readonly y: boolean
  last: string
  watched: Element[]
}

const fade = tokens.size["edge-fade"]
const owners = new Map<Element, Set<Box>>()
const dirty = new Set<Box>()
let frame = 0

/** Every box is read first, then every box is written, so one box's write never forces the next box's read to lay out. */
function flush() {
  frame = 0
  const jobs = [...dirty]
  dirty.clear()
  const reads = jobs.map(({ el, x, y }) => {
    const top = y ? Math.max(0, el.scrollTop) : 0
    const bottom = y ? Math.max(0, el.scrollHeight - el.clientHeight - el.scrollTop) : 0
    const left = x ? Math.abs(el.scrollLeft) : 0
    const right = x ? Math.max(0, el.scrollWidth - el.clientWidth - left) : 0
    return [top, bottom, left, right]
  })
  jobs.forEach((box, i) => {
    const sides = reads[i]!
    const edges = sides.map((d) => Math.round(Math.min(fade, d)))
    const key = edges.join(" ")
    if (key === box.last) return
    box.last = key
    const s = box.el.style
    s.setProperty("--edge-t", edges[0] + "px")
    s.setProperty("--edge-b", edges[1] + "px")
    s.setProperty("--edge-l", edges[2] + "px")
    s.setProperty("--edge-r", edges[3] + "px")
    box.el.toggleAttribute("data-edge", sides.reduce((a, b) => a + b, 0) >= 1)
  })
}

/** Scroll: after the frame has painted, when layout is clean. Size changes: in the ResizeObserver callback, which runs after layout. */
const schedule = (box: Box) => (dirty.add(box), (frame ||= requestAnimationFrame(() => setTimeout(flush))))
let sized: ResizeObserver | undefined
const observer = () =>
  (sized ??= new ResizeObserver((entries) => {
    for (const entry of entries) owners.get(entry.target)?.forEach((box) => dirty.add(box))
    flush()
  }))

/**
 * Scroll-edge fade: masks the edges of a scrolling box only where content continues past them. Writes the scrolled
 * distance on each side (clamped to --tds-size-edge-fade, so scrolling past the fade writes nothing) as
 * --edge-t/--edge-b/--edge-l/--edge-r; motion.css turns them into one mask rule, so a fade grows in as you leave an
 * edge instead of popping. data-edge is set only while some side overflows, so a box that fits keeps its shadow and
 * glass unmasked. All boxes share one ResizeObserver and one batched read-then-write pass. Returns a stop function.
 */
export function edgeFade(el: HTMLElement, { axis = "y" }: { axis?: EdgeAxis } = {}) {
  attached.get(el)?.()
  if (!el.hasAttribute("data-edge-fade")) el.setAttribute("data-edge-fade", axis)
  const box: Box = { el, x: axis !== "y", y: axis !== "x", last: "", watched: [] }
  const ro = observer()
  const unwatch = () => {
    for (const node of box.watched) {
      const set = owners.get(node)
      set?.delete(box)
      if (set?.size) continue
      owners.delete(node)
      ro.unobserve(node)
    }
    box.watched = []
  }
  const watch = () => {
    unwatch()
    box.watched = [el, ...el.children]
    for (const node of box.watched) {
      const set = owners.get(node) ?? new Set<Box>()
      if (!set.size) ro.observe(node)
      owners.set(node, set.add(box))
    }
  }
  const onScroll = () => schedule(box)
  const added = new MutationObserver(watch)
  el.addEventListener("scroll", onScroll, { passive: true })
  added.observe(el, { childList: true })
  watch()
  const stop = () => {
    dirty.delete(box)
    el.removeEventListener("scroll", onScroll)
    unwatch()
    added.disconnect()
    attached.delete(el)
  }
  attached.set(el, stop)
  return stop
}

/** Declarative form: every element carrying data-edge-fade="y" | "x" | "both" gets edgeFade() when it mounts. */
export function installEdgeFade(root: Document = document) {
  const take = (node: Node) => {
    if (!(node instanceof HTMLElement)) return
    if (node.matches("[data-edge-fade]") && !attached.has(node)) edgeFade(node, { axis: (node.dataset.edgeFade || "y") as EdgeAxis })
    for (const el of node.querySelectorAll<HTMLElement>("[data-edge-fade]")) if (!attached.has(el)) edgeFade(el, { axis: (el.dataset.edgeFade || "y") as EdgeAxis })
  }
  const drop = (node: Node) => {
    if (!(node instanceof HTMLElement)) return
    attached.get(node)?.()
    for (const el of node.querySelectorAll<HTMLElement>("[data-edge-fade]")) attached.get(el)?.()
  }
  const watcher = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "attributes") {
        drop(record.target)
        take(record.target)
      }
      record.removedNodes.forEach(drop)
      record.addedNodes.forEach(take)
    }
  })
  watcher.observe(root.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-edge-fade"] })
  take(root.documentElement)
  return () => watcher.disconnect()
}
