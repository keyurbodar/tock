import { SidebarLeftIcon } from "@hugeicons/core-free-icons"
import { Button } from "@tock/ui/button"
import { Icon } from "@tock/ui/icon"
import type { ReactNode } from "react"
import { useShell } from "./context"

export function ListPage({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  const { sidebar, toggleSidebar } = useShell()
  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-panel">
      <header className="sticky top-0 z-(--z-top-bar) flex min-h-11 shrink-0 items-center border-b-[0.5px] border-border-1 bg-panel px-2">
        <span
          inert={sidebar === "open"}
          className={`flex shrink-0 items-center overflow-hidden transition-[width,margin,opacity] duration-base ease-out-quint motion-reduce:transition-none ${sidebar === "open" ? "mr-0 w-0 opacity-0" : "mr-1 w-(--h-control-sm) opacity-100"}`}
        >
          <Button variant="ghost" size="icon-sm" aria-label="Open sidebar" onClick={toggleSidebar}>
            <Icon icon={SidebarLeftIcon} />
          </Button>
        </span>
        <h1 className="ml-2.5 min-w-0 truncate text-sm font-medium text-foreground">{title}</h1>
        <div className="ml-auto flex items-center gap-1.5 pl-2">{actions}</div>
      </header>
      <div className="relative min-h-0 flex-1 overflow-y-auto">
        <div className="@container/list flex flex-col px-2 pt-1 pb-16">{children}</div>
      </div>
    </div>
  )
}

export function ListGroup({ label, count, children }: { label: string; count?: number; children: ReactNode }) {
  return (
    <div className="flex flex-col pt-1">
      <div className="flex h-7 items-center gap-1.5 px-2 text-xs font-medium text-muted-foreground-1 select-none">
        <span>{label}</span>
        {count === undefined ? null : <span className="font-normal text-muted-foreground-2 tabular-nums">{count}</span>}
      </div>
      <ul className="flex flex-col pt-1">{children}</ul>
    </div>
  )
}

export function ListItem({
  icon,
  title,
  meta,
  time,
  trailing,
  onClick,
  href,
}: {
  icon?: ReactNode
  title: ReactNode
  meta?: ReactNode
  time?: string
  trailing?: ReactNode
  onClick?: () => void
  href?: string
}) {
  const content = (
    <>
      {icon ? <span className="flex w-4 shrink-0 items-center justify-center [&_svg]:size-(--icon-sm) [&_svg]:shrink-0">{icon}</span> : null}
      <span className="mask-fade-r min-w-0 flex-1 overflow-hidden text-sm font-medium whitespace-nowrap text-foreground">{title}</span>
      {meta ? <span className="shrink-0 text-xs font-normal text-muted-foreground-2 @max-lg/list:hidden">{meta}</span> : null}
      {time ? <span className="w-10 shrink-0 text-right text-xs font-normal text-muted-foreground-2 tabular-nums">{time}</span> : null}
    </>
  )
  const row =
    "flex h-11 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded px-2 text-left outline-none select-none transition-colors duration-100 group-hover/row:bg-secondary focus-visible:outline-ring-inset"
  return (
    <li className="-m-0.5 p-0.5">
      <div className="group/row relative flex items-center">
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" className={row}>
            {content}
          </a>
        ) : (
          <button type="button" onClick={onClick} className={row}>
            {content}
          </button>
        )}
        {trailing ? <span className="absolute right-12 flex items-center gap-1 opacity-0 transition-opacity duration-100 group-hover/row:opacity-100 has-focus-visible:opacity-100 pointer-coarse:opacity-100">{trailing}</span> : null}
      </div>
    </li>
  )
}
