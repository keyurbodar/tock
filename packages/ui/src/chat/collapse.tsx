import { motion } from "@tock/theme/motion"
import { type ReactNode, useEffectEvent, useLayoutEffect, useRef } from "react"
import { cn } from "../cn"

export const CLIP = "min-h-0 min-w-0 overflow-clip focus-gutter [overflow-clip-margin:2px]"
const OPEN = "grid-rows-[1fr] opacity-100 duration-fast ease-out-quint"
const CLOSED = "grid-rows-[0fr] opacity-0 duration-[120ms] ease-out-quint"

const viewport = (node: HTMLElement) => {
  for (let parent = node.parentElement; parent !== null; parent = parent.parentElement) {
    const overflow = getComputedStyle(parent).overflowY
    if (overflow === "auto" || overflow === "scroll") return parent
  }
  return null
}

const visibleHeight = (node: HTMLElement) => {
  const scroller = viewport(node)
  if (scroller === null) return undefined
  const own = node.getBoundingClientRect()
  const outer = scroller.getBoundingClientRect()
  if (own.top < outer.top || own.bottom <= outer.bottom + 1) return undefined
  return Math.max(0, Math.round(outer.bottom - own.top))
}

const innerHeight = (panel: Element) => {
  const inner = panel.firstElementChild?.firstElementChild
  return inner instanceof HTMLElement ? inner.offsetHeight : 0
}

export interface CollapseProps {
  readonly open: boolean
  readonly appear?: boolean
  readonly slot?: string
  readonly onClosed?: () => void
  readonly children?: ReactNode
}

export function Collapse({ open, appear = false, slot, onClosed, children }: CollapseProps) {
  const outer = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const mounted = useRef(false)
  const closed = useEffectEvent(() => {
    inner.current?.style.removeProperty("height")
    onClosed?.()
  })

  useLayoutEffect(() => {
    const content = inner.current
    const panel = outer.current
    if (content === null || panel === null || (!mounted.current && !(appear && open))) return
    const clamp = open ? undefined : visibleHeight(content)
    if (open) content.style.removeProperty("height")
    else if (clamp !== undefined) content.style.height = `${clamp}px`
    const total = [...(panel.parentElement?.children ?? [])]
      .filter((sibling) => sibling instanceof HTMLElement && sibling !== panel && sibling.dataset.slot === slot)
      .reduce((sum, sibling) => sum + innerHeight(sibling), clamp ?? content.offsetHeight)
    const { min, max, perPixel, closeRatio, closeMin } = motion.collapse
    const opening = Math.min(max, Math.max(min, min + total * perPixel))
    const duration = Math.round(open ? opening : Math.max(closeMin, opening * closeRatio))
    for (const animation of panel.getAnimations()) animation.effect?.updateTiming({ duration })
  }, [open, slot, appear])

  useLayoutEffect(() => {
    const first = !mounted.current
    mounted.current = true
    if (open || first || outer.current === null) return
    const animations = outer.current.getAnimations()
    if (animations.length === 0) {
      closed()
      return
    }
    let cancelled = false
    void Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
      if (!cancelled) closed()
    })
    return () => {
      cancelled = true
    }
  }, [open])

  return (
    <div
      ref={outer}
      aria-hidden={!open}
      inert={!open || undefined}
      data-slot={slot}
      className={cn(
        "grid motion-safe:transition-[grid-template-rows,opacity]",
        open ? OPEN : CLOSED,
        appear && open && "starting:grid-rows-[0fr] starting:opacity-0",
      )}
    >
      <div className={CLIP}>
        <div ref={inner}>{children}</div>
      </div>
    </div>
  )
}
