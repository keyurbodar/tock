import { type CSSProperties, type MouseEvent, type PointerEvent, type ReactNode, useLayoutEffect, useRef, useState } from "react"
import { Button } from "../button"
import { cn } from "../cn"
import { visibleHeight } from "./collapse"

const DRAG_PX = 6
const INTERACTIVE = "a,button,input,textarea,select,[role='button'],[role='link'],[data-slot='preview-card-trigger']"
const FADE =
  "[--clamp-fade:var(--clamp-fade-rest)] group-hover/clamp:[--clamp-fade:var(--clamp-fade-hover)] [mask-image:linear-gradient(to_bottom,black_calc(100%-var(--clamp-fade)),transparent)]"

export interface ClampFade {
  readonly rest: string
  readonly hover: string
}

const DEFAULT_FADE: ClampFade = { rest: "3.5rem", hover: "5rem" }

export interface ClampProps {
  readonly maxHeight: number
  readonly fade?: ClampFade
  readonly expanded: boolean
  readonly onToggle: () => void
  readonly className?: string
  readonly children: ReactNode
}

export function Clamp({ maxHeight, fade = DEFAULT_FADE, expanded, onToggle, className, children }: ClampProps) {
  const body = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const press = useRef<{ x: number; y: number; selected: boolean } | null>(null)
  const toggled = useRef(false)
  const previous = useRef(expanded)
  const [overflows, setOverflows] = useState(true)
  const [initial] = useState(() => (expanded ? undefined : maxHeight))
  const open = expanded || !overflows

  useLayoutEffect(() => {
    const element = content.current
    if (element === null) return
    const measure = () => setOverflows(element.getBoundingClientRect().height > maxHeight + 1)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [maxHeight])

  useLayoutEffect(() => {
    const outer = body.current
    const inner = content.current
    if (outer === null || inner === null) return
    const settle = () => {
      outer.style.height = ""
      outer.style.maxHeight = open ? "" : `${maxHeight}px`
    }
    if (previous.current === expanded) {
      settle()
      return
    }
    previous.current = expanded
    const from = outer.getBoundingClientRect().height
    outer.style.maxHeight = "none"
    outer.style.height = `${expanded ? from : (visibleHeight(outer) ?? from)}px`
    outer.getBoundingClientRect()
    const full = inner.getBoundingClientRect().height
    outer.style.height = `${expanded ? full : Math.min(maxHeight, full)}px`
    const animations = outer.getAnimations()
    if (animations.length === 0) {
      settle()
      return
    }
    let cancelled = false
    void Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
      if (!cancelled) settle()
    })
    return () => {
      cancelled = true
    }
  }, [expanded, open, maxHeight])

  const down = (event: PointerEvent) => {
    const selection = window.getSelection()
    press.current = {
      x: event.clientX,
      y: event.clientY,
      selected: body.current !== null && selection !== null && !selection.isCollapsed && selection.containsNode(body.current, true),
    }
  }

  const click = (event: MouseEvent) => {
    const start = press.current
    press.current = null
    if (!overflows || event.detail !== 1) return
    toggled.current = false
    if (start?.selected) return
    if (start !== null && Math.abs(event.clientX - start.x) + Math.abs(event.clientY - start.y) > DRAG_PX) return
    if (event.target instanceof Element && event.target.closest(INTERACTIVE) !== null) return
    const selection = window.getSelection()
    if (selection !== null && !selection.isCollapsed) return
    toggled.current = true
    onToggle()
  }

  const undo = () => {
    if (!toggled.current) return
    toggled.current = false
    onToggle()
  }

  return (
    <div className={cn("group/clamp", className, overflows && "cursor-pointer")} onPointerDown={down} onClick={click} onDoubleClick={undo}>
      <div
        ref={body}
        data-slot="clamped-body"
        style={{ "--clamp-fade-rest": fade.rest, "--clamp-fade-hover": fade.hover, maxHeight: initial } as CSSProperties}
        className={cn("overflow-hidden transition-[height,--clamp-fade] ease-out-quint", expanded ? "duration-fast" : "duration-[120ms]", !open && FADE)}
      >
        <div ref={content}>{children}</div>
      </div>
      {overflows ? (
        <span className="sr-only focus-within:not-sr-only">
          <Button variant="ghost" size="xs" aria-expanded={expanded} onClick={onToggle}>
            {expanded ? "Show less" : "Show more"}
          </Button>
        </span>
      ) : null}
    </div>
  )
}
