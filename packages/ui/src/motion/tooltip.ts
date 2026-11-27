import { tokens } from "@tock/tokens"

/**
 * Tooltip: one shared bubble names icon-only controls. Mark a control with `data-tip` (its text, or empty to reuse the
 * aria-label) and `data-tip-side` ("top" | "bottom" | "left" | "right"). It opens after `duration.tooltip-delay` on mouse
 * hover and at once on :focus-visible; while one is open, or within `duration.tooltip-skip` of closing, the next opens
 * at once with no animation, so sweeping a toolbar reads names instead of replaying the enter.
 */
type Side = "top" | "bottom" | "left" | "right"

const d = tokens.motion.duration
const gap = tokens.size["tip-gap"]
let tip: HTMLElement | undefined
let owner: HTMLElement | undefined
let timer: ReturnType<typeof setTimeout> | undefined
let closedAt = -Infinity

const target = (node: EventTarget | null) => (node instanceof Element ? node.closest<HTMLElement>("[data-tip]") : null)

function show(el: HTMLElement, instant: boolean) {
  clearTimeout(timer)
  const text = el.dataset.tip || el.getAttribute("aria-label")
  if (!text || !el.isConnected) return
  const box = el.getBoundingClientRect()
  const side = (el.dataset.tipSide ?? "top") as Side
  const x = side === "left" ? box.left - gap : side === "right" ? box.right + gap : box.left + box.width / 2
  const y = side === "top" ? box.top - gap : side === "bottom" ? box.bottom + gap : box.top + box.height / 2
  if (!tip) {
    tip = document.createElement("div")
    tip.className = "tds-tip tds-glass"
    tip.setAttribute("aria-hidden", "true")
    document.body.append(tip)
  }
  owner = el
  tip.textContent = text
  tip.dataset.side = side
  tip.style.setProperty("--x", `${x}px`)
  tip.style.setProperty("--y", `${y}px`)
  tip.toggleAttribute("data-instant", instant)
  tip.toggleAttribute("data-open", true)
}

function hide(skip = true) {
  clearTimeout(timer)
  if (!owner) return
  owner = undefined
  closedAt = skip ? performance.now() : -Infinity
  tip?.toggleAttribute("data-instant", false)
  tip?.toggleAttribute("data-open", false)
}

const warm = () => owner !== undefined || performance.now() - closedAt < d["tooltip-skip"]

export function installTooltips() {
  const opts = { capture: true, passive: true }
  document.addEventListener("pointerover", (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return
    const el = target(e.target)
    if (!el || el === owner) return
    if (warm()) return show(el, true)
    clearTimeout(timer)
    timer = setTimeout(() => show(el, false), d["tooltip-delay"])
  }, opts)
  document.addEventListener("pointerout", (e: PointerEvent) => {
    const el = target(e.target)
    if (!el || (e.relatedTarget instanceof Node && el.contains(e.relatedTarget))) return
    if (el === owner) hide()
    else clearTimeout(timer)
  }, opts)
  document.addEventListener("focusin", (e: FocusEvent) => {
    const el = target(e.target)
    if (el && el === e.target && el.matches(":focus-visible")) show(el, warm())
  }, opts)
  document.addEventListener("focusout", (e: FocusEvent) => target(e.target) === owner && hide(), opts)
  document.addEventListener("pointerdown", () => hide(false), opts)
  document.addEventListener("keydown", (e: KeyboardEvent) => e.key !== "Tab" && e.key !== "Shift" && hide(false), opts)
  document.addEventListener("scroll", () => hide(false), opts)
}
