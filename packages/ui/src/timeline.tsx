import { ArrowDown01Icon, ArrowDown02Icon } from "@hugeicons/core-free-icons"
import type { ReactNode } from "react"
import { cn } from "./cn"
import { Icon } from "./icon"

export const ROW = "mx-auto w-full max-w-4xl min-w-0 px-4 pt-(--row-gap) max-md:pt-(--row-gap-narrow)"

const HAIRLINE =
  "w-[clamp(0px,calc((100%-24px)*9999),100%)] border-t-[0.5px] border-border-2 motion-safe:transition-[scale] motion-safe:ease-out-quint"

const PANEL = "grid ease-out-quint motion-safe:transition-[grid-template-rows,opacity]"
const PANEL_OPEN = "grid-rows-[1fr] opacity-100 duration-fast"
const PANEL_CLOSED = "grid-rows-[0fr] opacity-0 duration-[120ms]"

export function Collapse({ open, children, slot }: { open: boolean; children: ReactNode; slot?: string }) {
  return (
    <div data-slot={slot} aria-hidden={!open} inert={!open} className={cn(PANEL, open ? PANEL_OPEN : PANEL_CLOSED)}>
      <div className="focus-gutter min-h-0 min-w-0 overflow-clip [overflow-clip-margin:2px]">{children}</div>
    </div>
  )
}

export function ActivityLine({
  label,
  open,
  onToggle,
  children,
}: {
  label: ReactNode
  open: boolean
  onToggle: () => void
  children?: ReactNode
}) {
  const rule = open ? "motion-safe:duration-base" : "scale-x-0 motion-safe:duration-[120ms]"
  return (
    <div data-slot="activity-line" className="flex flex-col items-center text-muted-foreground-2">
      <div className="flex w-full items-center justify-center gap-3">
        <span aria-hidden="true" className="flex min-w-0 flex-1 justify-end">
          <span className={cn(HAIRLINE, "origin-right", rule)} />
        </span>
        <button
          type="button"
          aria-expanded={open}
          data-panel-open={open ? "" : undefined}
          onClick={onToggle}
          className="flex min-h-7 w-fit max-w-[86%] min-w-0 cursor-pointer items-center gap-1.5 rounded py-1 text-xs font-normal outline-none select-none transition-colors duration-100 hover:text-foreground focus-visible:outline-ring-inset md:max-w-[80%] [&:hover>svg:last-child]:opacity-100 [&>svg]:size-(--icon-xs) [&>svg:last-child]:opacity-0 [&>svg:last-child]:transition-[opacity,rotate] [&>svg:last-child]:duration-fast [&>svg:last-child]:ease-out-quint data-[panel-open]:[&>svg:last-child]:rotate-180 data-[panel-open]:[&>svg:last-child]:opacity-100"
        >
          <span className="flex min-w-0 items-baseline tabular-nums">{label}</span>
          <Icon icon={ArrowDown01Icon} />
        </button>
        <span aria-hidden="true" className="flex min-w-0 flex-1">
          <span className={cn(HAIRLINE, "origin-left", rule)} />
        </span>
      </div>
      <div className="flex w-full flex-col text-left">
        <Collapse open={open} slot="activity-line-member">
          <div className="pt-1 motion-safe:transition-[padding,translate,opacity] motion-safe:duration-fast motion-safe:ease-out-quint motion-safe:starting:-translate-y-2 motion-safe:starting:opacity-0">
            {children}
          </div>
        </Collapse>
      </div>
    </div>
  )
}

export function TimelineRow({
  icon,
  children,
  trailing,
  open,
  onToggle,
  detail,
}: {
  icon?: ReactNode
  children: ReactNode
  trailing?: ReactNode
  open?: boolean
  onToggle?: () => void
  detail?: ReactNode
}) {
  const body = (
    <>
      {icon ? <span className="flex size-4 shrink-0 items-center justify-center">{icon}</span> : null}
      <span className="mask-fade-r min-w-0 flex-1 overflow-hidden pe-1 whitespace-nowrap">{children}</span>
      {trailing ? <span className="shrink-0 tabular-nums">{trailing}</span> : null}
    </>
  )
  if (!onToggle) {
    return (
      <div className="flex min-h-7 min-w-0 items-center gap-1.5 py-1 text-sm font-medium text-muted-foreground-1">
        {body}
      </div>
    )
  }
  return (
    <div data-slot="collapsible" data-closed={open ? undefined : ""}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        data-panel-open={open ? "true" : undefined}
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return
          event.preventDefault()
          onToggle()
        }}
        className="group/collapsible flex min-h-7 min-w-0 cursor-pointer items-center gap-1.5 rounded py-1 text-left text-sm font-medium text-muted-foreground-1 outline-none select-none hover:text-foreground focus-visible:outline-ring-inset [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-(--icon-sm)"
      >
        {body}
        <span className="flex -rotate-90 text-muted-foreground-3 transition-[rotate] duration-fast ease-out-quint group-data-[panel-open]/collapsible:rotate-0 motion-reduce:transition-none">
          <Icon icon={ArrowDown01Icon} />
        </span>
      </div>
      <Collapse open={open === true}>{detail}</Collapse>
    </div>
  )
}

export function ChatStamp({ children }: { children: ReactNode }) {
  return (
    <div
      data-slot="chat-stamp"
      className="mb-3 flex min-h-7 items-center justify-center text-xs text-muted-foreground-2 tabular-nums select-none max-md:mb-2.5"
    >
      {children}
    </div>
  )
}

export function Alert({ title, children, tone }: { title: string; children?: ReactNode; tone?: "destructive" }) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className="relative w-full rounded-(--radius-card) border-[0.5px] border-border-1 bg-card p-4 text-sm text-foreground shadow-card"
    >
      <h5
        data-slot="alert-title"
        className={cn("text-sm leading-4 font-medium break-words", children ? "mb-1" : "", tone === "destructive" && "text-destructive")}
      >
        {title}
      </h5>
      {children ? (
        <div data-slot="alert-description" className="text-sm font-normal break-words text-muted-foreground-1">
          {children}
        </div>
      ) : null}
    </div>
  )
}

export function ScrollToEnd({ visible, onClick }: { visible: boolean; onClick: () => void }) {
  return (
    <div
      inert={!visible}
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-3 z-(--z-top-bar) flex justify-center transition-[opacity,translate] duration-fast ease-out-quint motion-reduce:transition-none",
        visible ? "opacity-100" : "translate-y-1 opacity-0",
      )}
    >
      <div className="pointer-events-auto flex flex-col rounded-(--radius-card) border-[0.5px] border-(--card-hairline) bg-card shadow-card">
        <button
          type="button"
          aria-label="Scroll to end"
          onClick={onClick}
          className="relative flex h-7 cursor-pointer items-center justify-center gap-1 rounded-(--radius-card) px-2.5 text-xs whitespace-nowrap text-muted-foreground outline-none hover:text-foreground focus-visible:outline-ring-inset [&_svg]:size-(--icon-sm) [&_svg]:shrink-0"
        >
          <Icon icon={ArrowDown02Icon} />
          <span>Scroll to end</span>
        </button>
      </div>
    </div>
  )
}

export function ProgressEdge({ active }: { active: boolean }) {
  return (
    <div
      aria-hidden="true"
      data-active={active}
      data-sweeping={active}
      data-slot="progress-edge"
      className={cn(
        "progress-edge pointer-events-none absolute inset-x-0 top-0 z-(--z-top-bar) h-px bg-(--primary-soft) transition-opacity duration-fast ease-out",
        active ? "opacity-100" : "opacity-0",
      )}
    />
  )
}
