import { motion } from "@tock/theme/motion"
import type { PointerEvent } from "react"
import { cn } from "./cn"
import { Dither } from "./dither"

const THUMB = motion.slider.thumb

export function StepSlider<T extends string>({
  steps,
  value,
  label,
  valueText,
  onChange,
  onCommit,
  touch = false,
}: {
  steps: readonly T[]
  value: T | undefined
  label: string
  valueText: (step: T) => string
  onChange: (step: T) => void
  onCommit?: () => void
  touch?: boolean
}) {
  const index = Math.max(0, value === undefined ? 0 : steps.indexOf(value))
  const last = Math.max(1, steps.length - 1)
  const current = steps[index]

  const pick = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (event.clientX - box.left - THUMB / 2) / (box.width - THUMB)))
    const next = steps[Math.round(ratio * (steps.length - 1))]
    if (next !== undefined && next !== value) onChange(next)
  }

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={steps.length - 1}
      aria-valuenow={index}
      aria-valuetext={current === undefined ? undefined : valueText(current)}
      className={cn("group/slider w-full cursor-pointer touch-none rounded focus-visible:outline-ring-inset", touch && "-my-3 py-3")}
      onMouseDown={(event) => event.preventDefault()}
      onPointerDown={(event) => {
        event.stopPropagation()
        event.currentTarget.setPointerCapture(event.pointerId)
        pick(event)
      }}
      onPointerMove={(event) => {
        if (event.buttons === 1) pick(event)
      }}
      onLostPointerCapture={onCommit}
    >
      <div className={cn("relative w-full overflow-hidden rounded bg-secondary", touch ? "h-10" : "h-(--h-control-sm)")}>
        {steps.map((step, at) =>
          at <= index ? null : (
            <span
              key={step}
              className="absolute top-1/2 h-2 w-px -translate-1/2 bg-border-3"
              style={{ left: `calc(${THUMB / 2}px + (100% - ${THUMB}px) * ${at / last})` }}
            />
          ),
        )}
        <div
          className="absolute inset-y-0 left-0 overflow-hidden rounded bg-primary transition-[width] duration-base ease-out motion-reduce:transition-none"
          style={{ width: `calc(${THUMB}px + (100% - ${THUMB}px) * ${index / last})` }}
        >
          <span className="absolute inset-0 bg-linear-to-r from-overlay-media/30 to-transparent" />
          <Dither from={0} to={0.5} className="inset-y-0 left-0 h-full w-[calc(100%-22px)] text-primary-foreground opacity-45" />
          <span className="absolute inset-y-0.5 right-0.5 w-4 rounded-sm bg-primary-foreground shadow-plate transition-[scale] duration-fast ease-out group-active/slider:scale-95 motion-reduce:transition-none" />
        </div>
      </div>
    </div>
  )
}
