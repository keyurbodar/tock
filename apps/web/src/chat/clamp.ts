import { tokens } from "@tock/tokens"
import { animate } from "@tock/ui/motion"

const limit = tokens.size["bubble-clamp"] + tokens.size["bubble-clamp-fade"]

/** One observer for every bubble; a removed bubble reports a last resize and is let go then. */
const observer = new ResizeObserver((entries) => {
  for (const { target } of entries) {
    const el = target as HTMLElement
    if (!el.isConnected) {
      observer.unobserve(el)
      continue
    }
    if (el.dataset.expanded !== undefined) continue
    if (el.scrollHeight > limit) el.dataset.clamped = ""
    else delete el.dataset.clamped
  }
})

function expand(this: HTMLElement, event: MouseEvent) {
  if (this.dataset.clamped === undefined || this.dataset.expanded !== undefined) return
  if ((event.target as HTMLElement).closest("a, button")) return
  const from = this.getBoundingClientRect().height
  this.dataset.expanded = ""
  animate(this, [{ height: `${from}px` }, { height: `${this.scrollHeight}px` }], { duration: tokens.motion.duration.panel, easing: tokens.motion.curve.sheet, essential: true })
}

/**
 * Long bubbles stop at size.bubble-clamp with a soft fade; a click grows them in place to their full height. Growth
 * only happens below the bubble's top, so the reader's scroll position holds.
 */
export function clamp(el: HTMLElement) {
  observer.observe(el)
  el.addEventListener("click", expand)
}
