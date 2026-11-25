export function Slider({
  value,
  min = 0,
  max = 100,
  step = 1,
  label,
  valueText,
  disabled,
  onChange,
}: {
  value: number
  min?: number
  max?: number
  step?: number
  label: string
  valueText: string
  disabled?: boolean
  onChange: (value: number) => void
}) {
  const ratio = max === min ? 0 : (value - min) / (max - min)
  const inset = (0.5 - ratio) * 0.75
  return (
    <div data-disabled={disabled ? "" : undefined} className="flex w-36 max-w-full items-center gap-3 data-disabled:opacity-55 sm:w-52">
      <span className="relative flex h-5 min-w-0 items-center rounded-full has-[:focus-visible]:outline-ring-inset pointer-coarse:h-11 flex-1">
        <span className="relative h-1 w-full overflow-hidden rounded-full bg-secondary">
          <span className="absolute inset-y-0 left-0 bg-foreground" style={{ width: `${ratio * 100}%` }} />
        </span>
        <input
          type="range"
          aria-label={label}
          aria-valuetext={valueText}
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(Number(event.currentTarget.value))}
          className="absolute inset-0 w-full cursor-pointer opacity-0 disabled:cursor-default focus-visible:outline-none"
        />
        <span
          className="pointer-events-none absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground shadow-plate"
          style={{ left: `calc(${ratio * 100}% ${inset < 0 ? "-" : "+"} ${Math.abs(inset)}rem)` }}
        />
      </span>
      <output className="w-12 text-right text-xs text-muted-foreground-2 tabular-nums">{valueText}</output>
    </div>
  )
}
