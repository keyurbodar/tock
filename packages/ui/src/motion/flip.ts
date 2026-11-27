import { tokens } from "@tock/tokens"

/**
 * Layout morph for a container: whenever its children are added, removed or reflowed (resize, column change), every
 * item that moved glides from where it was drawn to its new slot. Interruptible: a move mid-flight starts from the
 * item's current animated position, so a second change retargets instead of jumping.
 */
export function watchLayout(box: HTMLElement, item: string, key: (el: HTMLElement) => string = (el) => el.dataset.id ?? "") {
  const at = new Map<string, { x: number; y: number }>()
  const items = () => [...box.querySelectorAll<HTMLElement>(item)]
  const shift = (el: HTMLElement) => {
    const [x = "0", y = "0"] = getComputedStyle(el).translate.split(" ")
    return { x: parseFloat(x) || 0, y: parseFloat(y) || 0 }
  }
  const read = () => {
    at.clear()
    for (const el of items()) at.set(key(el), { x: el.offsetLeft, y: el.offsetTop })
  }
  const move = () => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches
    for (const el of items()) {
      const was = at.get(key(el))
      if (!was || reduce) continue
      const now = shift(el)
      const dx = was.x + now.x - el.offsetLeft
      const dy = was.y + now.y - el.offsetTop
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue
      for (const running of el.getAnimations()) if ((running as CSSAnimation).animationName === undefined && "translate" in ((running.effect as KeyframeEffect).getKeyframes()[0] ?? {})) running.cancel()
      el.animate([{ translate: `${dx}px ${dy}px` }, { translate: "0 0" }], { duration: tokens.motion.duration.layout, easing: tokens.motion.curve.sheet })
    }
    read()
  }
  const added = new MutationObserver(move)
  const resized = new ResizeObserver(() => (box.isConnected ? move() : stop()))
  const stop = () => (added.disconnect(), resized.disconnect())
  read()
  added.observe(box, { childList: true, subtree: true })
  resized.observe(box)
  return { move, stop }
}
