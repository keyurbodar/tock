import { motion } from "@tock/theme/motion"
import { type CSSProperties, type ReactNode, createContext, useLayoutEffect, useRef } from "react"
import { cn } from "../cn"

export const InspectContext = createContext<() => void>(() => {})

const TAIL =
  "focus-gutter min-w-0 overflow-clip data-tail:[mask-image:linear-gradient(to_bottom,transparent,black_var(--tail-fade,0px))] data-tail:will-change-[opacity]"

export function Tail({
  clamped,
  signal,
  onInspect,
  children,
}: {
  clamped: boolean
  signal?: unknown
  onInspect?: () => void
  children: ReactNode
}) {
  const frame = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const offset = useRef(0)
  const pinned = useRef<number | null>(null)

  useLayoutEffect(() => {
    const outer = frame.current
    const inner = content.current
    if (outer === null || inner === null) return
    if (!clamped) pinned.current = null
    const shift = (amount: number) => {
      offset.current = amount
      inner.style.transform = amount > motion.tail.threshold ? `translateY(${-amount}px)` : ""
      outer.style.setProperty("--tail-fade", `${Math.min(motion.tail.fade, amount)}px`)
      outer.toggleAttribute("data-tail", amount > motion.tail.threshold)
    }
    const overflow = () => Math.max(0, inner.offsetHeight - outer.clientHeight)
    const observer = new ResizeObserver(() => {
      if (pinned.current === null) {
        outer.style.removeProperty("max-height")
        shift(clamped ? overflow() : 0)
        return
      }
      outer.style.maxHeight = `${Math.max(0, inner.offsetHeight - pinned.current)}px`
      shift(pinned.current)
    })
    observer.observe(inner)
    observer.observe(outer)
    return () => observer.disconnect()
  }, [clamped, signal])

  const inspect = () => {
    onInspect?.()
    if (clamped) pinned.current = pinned.current ?? offset.current
  }

  return (
    <div
      ref={frame}
      className={cn(TAIL, clamped ? "max-h-56" : "max-h-max")}
      style={{ "--tail-fade": "0px" } as CSSProperties}
    >
      <div ref={content} className="min-w-0">
        <InspectContext.Provider value={inspect}>{children}</InspectContext.Provider>
      </div>
    </div>
  )
}
