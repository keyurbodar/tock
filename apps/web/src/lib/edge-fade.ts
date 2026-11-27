/**
 * Fades a scroller's top or bottom edge only while there is more content past it. Put the class tds-edge-fade on
 * `el`; `scroller` is the element that actually scrolls when it is a descendant created later (a virtual list).
 */
export function edgeFade(el: HTMLElement, scroller: () => HTMLElement | null = () => el) {
  const update = () => {
    const s = scroller()
    if (!s) return
    el.toggleAttribute("data-fade-top", s.scrollTop > 1)
    el.toggleAttribute("data-fade-bottom", s.scrollTop + s.clientHeight < s.scrollHeight - 1)
  }
  el.addEventListener("scroll", update, { capture: true, passive: true })
  const sizes = new ResizeObserver(update)
  sizes.observe(el)
  const content = new MutationObserver(update)
  content.observe(el, { childList: true, subtree: true })
  queueMicrotask(update)
  return { update, stop: () => (el.removeEventListener("scroll", update, { capture: true }), sizes.disconnect(), content.disconnect()) }
}
