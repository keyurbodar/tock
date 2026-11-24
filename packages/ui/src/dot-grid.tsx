import { useEffect, useRef } from "react"
import { cn } from "./cn"

export type DotGridState = "working" | "waiting" | "needs-you" | "failed"

const RING = [
  [3, 3],
  [7, 3],
  [11, 3],
  [11, 7],
  [11, 11],
  [7, 11],
  [3, 11],
  [3, 7],
] as const
const CENTER = [7, 7] as const
const MIDDLE = new Set([3, 7])

type Frames = readonly (readonly [offset: number, opacity: number])[]
interface DotMotion {
  readonly frames: Frames
  readonly duration: number
  readonly delay: number
}

const SWEEP: Frames = [[0, 1], [0.125, 0.7], [0.25, 0.45], [0.375, 0.25], [0.875, 0.25], [1, 1]]
const BREATHE: Frames = [[0, 0.35], [0.5, 1], [1, 0.35]]
const PULSE_CENTER: Frames = [[0, 0.25], [0.18, 1], [0.7, 1], [1, 0.25]]
const PULSE_EDGE: Frames = [[0, 0.25], [0.12, 0.25], [0.34, 1], [0.56, 1], [0.82, 0.25], [1, 0.25]]
const PULSE_CORNER: Frames = [[0, 0.25], [0.24, 0.25], [0.46, 1], [0.5, 1], [0.72, 0.25], [1, 0.25]]

const SWEEP_MS = 800
const SWEEP_STEP_MS = 100
const BREATHE_MS = 1600
const BREATHE_STEP_MS = 200
const PULSE_MS = 1400

const pulse = (ring: number | null): DotMotion => ({
  frames: ring === null ? PULSE_CENTER : ring % 2 === 1 ? PULSE_EDGE : PULSE_CORNER,
  duration: PULSE_MS,
  delay: 0,
})

const MOTION: Record<DotGridState, (ring: number | null) => DotMotion | null> = {
  working: (ring) => (ring === null ? null : { frames: SWEEP, duration: SWEEP_MS, delay: ring * SWEEP_STEP_MS - SWEEP_MS }),
  waiting: (ring) => {
    const column = ring === null ? 1 : ring === 7 ? 0 : ring === 3 ? 2 : null
    return column === null ? null : { frames: BREATHE, duration: BREATHE_MS, delay: column * BREATHE_STEP_MS - BREATHE_MS }
  },
  "needs-you": pulse,
  failed: pulse,
}

const LABEL: Record<DotGridState, string> = {
  working: "Working",
  waiting: "Waiting",
  "needs-you": "Needs you",
  failed: "Failed",
}

const TONE: Record<DotGridState, string> = {
  working: "text-muted-foreground dark:text-progress",
  waiting: "text-muted-foreground",
  "needs-you": "text-primary-ink",
  failed: "text-destructive",
}

export function DotGrid({
  state = "working",
  label,
  tone = true,
  className,
}: {
  state?: DotGridState
  label?: string
  tone?: boolean
  className?: string
}) {
  const ref = useRef<SVGSVGElement>(null)

  useEffect(() => {
    const svg = ref.current
    if (!svg || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const animations = [...svg.querySelectorAll<SVGCircleElement>("[data-dot]")].flatMap((dot) => {
      const ring = dot.dataset.ring === undefined ? null : Number(dot.dataset.ring)
      const motion = MOTION[state](ring)
      if (!motion) return []
      return dot.animate(
        motion.frames.map(([offset, opacity]) => ({ offset, opacity, easing: "ease-in-out" })),
        { duration: motion.duration, delay: motion.delay, iterations: Infinity },
      )
    })
    return () => animations.forEach((animation) => animation.cancel())
  }, [state])

  return (
    <svg
      ref={ref}
      viewBox="0 0 14 14"
      role="img"
      aria-label={label ?? LABEL[state]}
      data-state={state}
      className={cn("dot-grid size-(--icon-sm) shrink-0", tone && TONE[state], className)}
    >
      {RING.map(([cx, cy], ring) => (
        <circle
          key={ring}
          data-dot=""
          data-ring={ring}
          data-row={MIDDLE.has(ring) ? "middle" : undefined}
          data-tier={ring % 2 === 1 ? 1 : 2}
          cx={cx}
          cy={cy}
          r="1"
          fill="currentColor"
        />
      ))}
      <circle data-dot="" data-row="middle" data-tier="0" cx={CENTER[0]} cy={CENTER[1]} r="1" fill="currentColor" />
    </svg>
  )
}
