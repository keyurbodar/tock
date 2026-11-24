import { useEffect } from "react"

function offsetIn(target: HTMLElement, host: HTMLElement) {
  let x = 0
  let y = 0
  let node: Element | null = target
  while (node instanceof HTMLElement && node !== host) {
    x += node.offsetLeft
    y += node.offsetTop
    node = node.offsetParent
  }
  return node === host ? { x, y } : null
}

export function useGlide(root: HTMLElement | null, marker: HTMLElement | null, selector: string, attributes: readonly string[]) {
  useEffect(() => {
    if (root === null || marker === null) return
    let shown = false
    let hiding = 0
    const hide = () => {
      hiding = 0
      marker.setAttribute("data-hidden", "")
      shown = false
    }
    const place = () => {
      const target = root.querySelector<HTMLElement>(selector)
      const at = target?.isConnected ? offsetIn(target, root) : null
      if (!target || !at) {
        if (shown && !hiding) hiding = requestAnimationFrame(hide)
        if (!shown) hide()
        return
      }
      cancelAnimationFrame(hiding)
      hiding = 0
      if (!shown) marker.setAttribute("data-jump", "")
      marker.style.transform = `translate(${at.x}px, ${at.y}px)`
      marker.style.width = `${target.offsetWidth}px`
      marker.style.height = `${target.offsetHeight}px`
      marker.removeAttribute("data-hidden")
      if (!shown) {
        shown = true
        requestAnimationFrame(() => marker.removeAttribute("data-jump"))
      }
    }
    place()
    const mutations = new MutationObserver(place)
    mutations.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: [...attributes] })
    const sizes = new ResizeObserver(() => {
      marker.setAttribute("data-jump", "")
      place()
      requestAnimationFrame(() => marker.removeAttribute("data-jump"))
    })
    sizes.observe(root)
    return () => {
      cancelAnimationFrame(hiding)
      mutations.disconnect()
      sizes.disconnect()
    }
  }, [root, marker, selector, attributes])
}
