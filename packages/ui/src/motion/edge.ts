export type EdgeAxis = "y" | "x" | "both"

const attached = new WeakMap<HTMLElement, () => void>()

/**
 * Scroll-edge fade: masks the edges of a scrolling box only where content continues past them. Writes the scrolled
 * distance on each side as --edge-t/--edge-b/--edge-l/--edge-r; motion.css clamps each to --tds-size-edge-fade in one
 * mask rule, so a fade grows in as you leave an edge instead of popping. data-edge is set only while some side
 * overflows, so a box that fits keeps its shadow and glass unmasked. One passive scroll listener, rAF-throttled;
 * a ResizeObserver on the box and its children catches content changes. Returns a stop function.
 */
export function edgeFade(el: HTMLElement, { axis = "y" }: { axis?: EdgeAxis } = {}) {
  attached.get(el)?.()
  if (!el.hasAttribute("data-edge-fade")) el.setAttribute("data-edge-fade", axis)
  const y = axis !== "x"
  const x = axis !== "y"
  let frame = 0
  const write = () => {
    frame = 0
    const top = y ? Math.max(0, el.scrollTop) : 0
    const bottom = y ? Math.max(0, el.scrollHeight - el.clientHeight - el.scrollTop) : 0
    const left = x ? Math.abs(el.scrollLeft) : 0
    const right = x ? Math.max(0, el.scrollWidth - el.clientWidth - left) : 0
    const s = el.style
    s.setProperty("--edge-t", `${top}px`)
    s.setProperty("--edge-b", `${bottom}px`)
    s.setProperty("--edge-l", `${left}px`)
    s.setProperty("--edge-r", `${right}px`)
    el.toggleAttribute("data-edge", top + bottom + left + right >= 1)
  }
  const schedule = () => (frame ||= requestAnimationFrame(write))
  const sized = new ResizeObserver(schedule)
  const watch = () => {
    sized.disconnect()
    sized.observe(el)
    for (const child of el.children) sized.observe(child)
    schedule()
  }
  const added = new MutationObserver(watch)
  el.addEventListener("scroll", schedule, { passive: true })
  added.observe(el, { childList: true })
  watch()
  const stop = () => {
    cancelAnimationFrame(frame)
    el.removeEventListener("scroll", schedule)
    sized.disconnect()
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
