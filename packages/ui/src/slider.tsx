import type { ComponentProps } from "react"
import { cn } from "./cn"

export function Slider({
  value,
  min = 0,
  max = 100,
  step = 1,
  label,
  onChange,
  className,
}: {
  value: number
  min?: number
  max?: number
  step?: number
  label: string
  onChange: (value: number) => void
  className?: string
} & Omit<ComponentProps<"div">, "onChange">) {
  const ratio = max === min ? 0 : (value - min) / (max - min)
  return (
    <div className={cn("group/slider relative flex h-(--h-control-sm) w-40 shrink-0 cursor-pointer touch-none items-center", className)}>
      <div className="relative h-1 w-full overflow-hidden rounded-full bg-muted">
        <div className="absolute inset-y-0 left-0 w-full origin-left bg-primary" style={{ scale: `${ratio} 1` }} />
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-foreground shadow-plate group-has-focus-visible/slider:outline-ring-inset"
        style={{ left: `calc(0.375rem + ${ratio} * (100% - 0.75rem))` }}
      />
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        className="absolute inset-0 w-full cursor-pointer opacity-0 focus-visible:outline-none disabled:cursor-default"
      />
    </div>
  )
}
