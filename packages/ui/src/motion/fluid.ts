import { animate, springEasing } from "./core"
/**
 * Fluid hover, after fluid-functionalism: one highlight per list that glides to the hovered item and takes its size,
 * on a critically damped spring. Lists opt in by being listed in `lanes`; nothing else has to render anything.
 * Menus and listboxes follow [data-highlighted], so the keyboard drives the same highlight as the pointer.
 */
interface Lane {
  readonly item: string
  readonly scope: "parent" | "grandparent" | string
  readonly follow: "pointer" | "highlighted"
}

export const lanes: readonly Lane[] = [
  { item: ".tds-menu-item", scope: ".tds-menu", follow: "highlighted" },
  { item: ".tds-palette-item", scope: ".tds-palette-list", follow: "highlighted" },
  { item: ".tds-row-wrap", scope: "grandparent", follow: "pointer" },
  { item: ".tds-rail-button", scope: "parent", follow: "pointer" },
  { item: ".tds-header-button", scope: "parent", follow: "pointer" },
  { item: ".tds-pin", scope: ".tds-pins", follow: "pointer" },
]

const glows = new WeakMap<Element, HTMLElement>()
const live = new Set<HTMLElement>()

function laneOf(el: Element): { lane: Lane; item: HTMLElement } | undefined {
  for (const lane of lanes) {
    const item = el.closest<HTMLElement>(lane.item)
    if (item) return { lane, item }
  }
}

function scopeOf(lane: Lane, item: HTMLElement): HTMLElement | null {
  if (lane.scope === "parent") return item.parentElement
  if (lane.scope === "grandparent") return item.parentElement?.parentElement ?? null
  return item.closest<HTMLElement>(lane.scope)
}

function glowFor(scope: HTMLElement) {
  const known = glows.get(scope)
  if (known?.isConnected) return known
  const glow = document.createElement("i")
  glow.className = "tds-fluid"
  glow.setAttribute("aria-hidden", "true")
  if (getComputedStyle(scope).position === "static") scope.style.position = "relative"
  scope.dataset.fluid = ""
  scope.prepend(glow)
  glows.set(scope, glow)
  return glow
}

/** Offset in layout pixels, so a surface still scaling in (menus open from .96) does not skew the highlight. */
function layoutOffset(item: HTMLElement, scope: HTMLElement) {
  let x = 0
  let y = 0
  for (let el: HTMLElement | null = item; el && el !== scope; el = el.offsetParent as HTMLElement | null) {
    if (!scope.contains(el.offsetParent)) {
      const s = scope.getBoundingClientRect()
      const r = item.getBoundingClientRect()
      return { x: r.left - s.left - scope.clientLeft + scope.scrollLeft, y: r.top - s.top - scope.clientTop + scope.scrollTop }
    }
    x += el.offsetLeft
    y += el.offsetTop
  }
  return { x, y }
}

/** Where the glow is drawn right now (mid-glide included), in the same layout space as translate. */
function drawn(glow: HTMLElement) {
  const style = getComputedStyle(glow)
  const [x = "0", y = "0"] = style.translate === "none" ? [] : style.translate.split(" ")
  const [sx = "1", sy = sx] = style.scale === "none" ? [] : style.scale.split(" ")
  return { x: parseFloat(x) || 0, y: parseFloat(y) || 0, w: glow.offsetWidth * parseFloat(sx), h: glow.offsetHeight * parseFloat(sy) }
}

function show(scope: HTMLElement, item: HTMLElement) {
  const glow = glowFor(scope)
  const at = layoutOffset(item, scope)
  const fresh = !glow.hasAttribute("data-on")
  if (fresh) glow.setAttribute("data-instant", "")
  const was = fresh ? undefined : drawn(glow)
  const w = item.offsetWidth
  const h = item.offsetHeight
  glow.getAnimations().forEach((a) => a.id === "tds-glide" && a.cancel())
  glow.style.width = `${w}px`
  glow.style.height = `${h}px`
  glow.style.translate = `${at.x}px ${at.y}px`
  if (was && (was.x !== at.x || was.y !== at.y || was.w !== w || was.h !== h)) {
    animate(glow, [{ translate: `${was.x}px ${was.y}px`, scale: `${was.w / w} ${was.h / h}` }, { translate: `${at.x}px ${at.y}px`, scale: "1 1" }], { ...springEasing("glide"), id: "tds-glide" })
  }
  glow.style.borderRadius = getComputedStyle(item).borderRadius
  if (fresh) {
    void glow.offsetWidth
    glow.removeAttribute("data-instant")
  }
  glow.setAttribute("data-on", "")
  live.add(scope)
}

function hide(scope: HTMLElement) {
  glows.get(scope)?.removeAttribute("data-on")
  live.delete(scope)
}

/** Install once at startup. Returns a disposer. */
export function installFluidHover(root: Document = document) {
  let pending = 0
  const over = (e: PointerEvent) => {
    if (e.pointerType === "touch") return
    const hit = laneOf(e.target as Element)
    if (!hit || hit.lane.follow !== "pointer") return
    const scope = scopeOf(hit.lane, hit.item)
    if (!scope) return
    cancelAnimationFrame(pending)
    show(scope, hit.item)
  }
  const out = (e: PointerEvent) => {
    const hit = laneOf(e.target as Element)
    if (!hit || hit.lane.follow !== "pointer") return
    const next = e.relatedTarget instanceof Element ? laneOf(e.relatedTarget) : undefined
    const scope = scopeOf(hit.lane, hit.item)
    if (!scope || (next && scopeOf(next.lane, next.item) === scope)) return
    pending = requestAnimationFrame(() => hide(scope))
  }
  const watch = new MutationObserver((records) => {
    for (const record of records) {
      const el = record.target as HTMLElement
      const hit = laneOf(el)
      if (!hit || hit.lane.follow !== "highlighted" || hit.item !== el) continue
      const scope = scopeOf(hit.lane, el)
      if (!scope) continue
      if (el.hasAttribute("data-highlighted")) show(scope, el)
      else if (!scope.querySelector("[data-highlighted]")) hide(scope)
    }
  })
  watch.observe(root.body, { subtree: true, attributes: true, attributeFilter: ["data-highlighted"] })
  root.addEventListener("pointerover", over)
  root.addEventListener("pointerout", out)
  return () => {
    watch.disconnect()
    root.removeEventListener("pointerover", over)
    root.removeEventListener("pointerout", out)
  }
}
