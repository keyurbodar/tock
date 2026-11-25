import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible"
import type { ComponentProps, KeyboardEvent, ReactNode } from "react"
import { cn } from "./cn"
import { ChevronDown, ChevronLeft } from "./glyph"

export function FormCard({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        "overflow-clip bg-card rounded-(--radius-card) border-[0.5px] border-(--card-hairline) shadow-card flex flex-col p-4",
        className ?? "gap-4",
      )}
      {...props}
    />
  )
}

const RULE = "border-t-[0.5px] border-border-1 pt-4"

export function FormLabel({ label, ruled, children }: { label: string; ruled?: boolean; children: ReactNode }) {
  return (
    <label className={cn("flex flex-col gap-1.5 text-sm font-medium text-foreground", ruled && RULE)}>
      {label}
      {children}
    </label>
  )
}

export function FormRow({
  title,
  description,
  ruled,
  children,
}: {
  title: string
  description?: string
  ruled?: boolean
  children: ReactNode
}) {
  return (
    <div className={cn("grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3", ruled && RULE)}>
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-foreground">{title}</span>
        {description ? <span className="text-xs font-normal text-muted-foreground-2">{description}</span> : null}
      </span>
      {children}
    </div>
  )
}

const RADIO_CARD =
  "flex overflow-clip bg-card rounded-(--radius-card) border-[0.5px] border-(--card-hairline) shadow-card cursor-pointer select-none transition-colors duration-100 hover:bg-card-hover focus-visible:outline-ring-inset text-left disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-55 w-full flex-row items-center gap-3 px-4 py-3"
const RADIO_DOT = "flex size-4 shrink-0 items-center justify-center rounded-full border-[0.5px]"

export function RadioCards<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: readonly { value: T; title: string; description: string; disabled?: boolean }[]
  onChange: (value: T) => void
}) {
  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 0
    if (step === 0) return
    event.preventDefault()
    const enabled = options.filter((option) => !option.disabled)
    const next = enabled[(enabled.findIndex((option) => option.value === value) + step + enabled.length) % enabled.length]
    if (next === undefined) return
    onChange(next.value)
    event.currentTarget.querySelectorAll<HTMLElement>("[role=radio]")[options.indexOf(next)]?.focus()
  }
  const first = options.find((option) => !option.disabled)?.value
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-col gap-2" onKeyDown={move}>
      {options.map((option) => {
        const checked = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked || option.value === first ? 0 : -1}
            className={RADIO_CARD}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
          >
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                <span className="truncate">{option.title}</span>
              </span>
              <span className="text-xs font-normal text-muted-foreground-1 sm:truncate">{option.description}</span>
            </span>
            {checked ? (
              <span className={cn(RADIO_DOT, "transition-colors duration-100 border-transparent bg-primary")}>
                <span className="size-1.5 rounded-full bg-primary-foreground" />
              </span>
            ) : (
              <span
                className={cn(RADIO_DOT, "border-[light-dark(var(--border-3),var(--muted-foreground-3))] bg-input transition-colors duration-100")}
              />
            )}
          </button>
        )
      })}
    </div>
  )
}

const TRIGGER =
  "group/collapsible flex cursor-pointer items-center gap-1.5 rounded text-left font-medium outline-none select-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-(--icon-sm) focus-visible:outline-ring-inset focus-gutter w-fit text-base text-foreground"
const PANEL_BASE =
  "h-(--collapsible-panel-height) overflow-hidden transition-[height,opacity] duration-[150ms,150ms] ease-out-quint motion-reduce:transition-none data-[starting-style]:h-0 data-[starting-style]:opacity-0 data-[ending-style]:h-0 data-[ending-style]:opacity-0 data-[ending-style]:duration-[120ms,120ms]"
const PANEL = `${PANEL_BASE} -mx-5 -my-1 px-5 py-1`

export function CollapsePanel({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <CollapsiblePrimitive.Root open={open}>
      <CollapsiblePrimitive.Panel data-slot="collapsible-panel" className={PANEL_BASE}>
        {children}
      </CollapsiblePrimitive.Panel>
    </CollapsiblePrimitive.Root>
  )
}

export function Collapsible({
  title,
  hint,
  open,
  onOpenChange,
  defaultOpen,
  children,
}: {
  title: string
  hint?: ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  defaultOpen?: boolean
  children: ReactNode
}) {
  return (
    <CollapsiblePrimitive.Root
      data-slot="collapsible"
      className="flex flex-col gap-10"
      open={open}
      onOpenChange={onOpenChange}
      defaultOpen={defaultOpen}
    >
      <CollapsiblePrimitive.Trigger data-slot="collapsible-trigger" className={TRIGGER}>
        {title}
        {hint ? <span className="text-sm font-normal text-muted-foreground-2">{hint}</span> : null}
        <ChevronDown className="-rotate-90 text-muted-foreground-3 group-data-[panel-open]/collapsible:rotate-0" />
      </CollapsiblePrimitive.Trigger>
      <CollapsiblePrimitive.Panel data-slot="collapsible-panel" className={PANEL}>
        <div className="flex flex-col gap-10">{children}</div>
      </CollapsiblePrimitive.Panel>
    </CollapsiblePrimitive.Root>
  )
}

export function BackLink({ className, children, ...props }: ComponentProps<"a">) {
  return (
    <a
      className={cn(
        "-ml-2 flex h-(--h-control-sm) w-fit items-center gap-1.5 rounded px-2 text-sm font-medium text-muted-foreground-1 select-none transition-colors duration-100 hover:bg-secondary outline-none focus-visible:outline-ring-inset",
        className,
      )}
      {...props}
    >
      <ChevronLeft className="size-(--icon-sm) shrink-0" />
      {children}
    </a>
  )
}
