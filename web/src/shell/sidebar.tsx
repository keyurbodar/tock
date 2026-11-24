import {
  Add01Icon,
  BrainIcon,
  Clock01Icon,
  Folder01Icon,
  Message01Icon,
  PencilEdit02Icon,
  Search01Icon,
  Settings01Icon,
  SidebarLeftIcon,
} from "@hugeicons/core-free-icons"
import { Link } from "@tanstack/react-router"
import { buttonVariants, Button } from "@tock/ui/button"
import { DotGrid } from "@tock/ui/dot-grid"
import { Icon, type IconData } from "@tock/ui/icon"
import { useState } from "react"
import { AGENT } from "../agent"
import type { SessionSummary } from "../api/types"
import { relativeTime } from "../lib/format"

const ICON_LINK = buttonVariants({ variant: "ghost", size: "icon-sm" })
const ITEM = "flow-root p-0.5 [@media(min-width:768px),(hover:hover)_and_(pointer:fine)]:py-0"
const PAGES: readonly { to: "/" | "/routines" | "/memory" | "/files"; label: string; icon: IconData }[] = [
  { to: "/", label: "Chats", icon: Message01Icon },
  { to: "/routines", label: "Routines", icon: Clock01Icon },
  { to: "/memory", label: "Memory", icon: BrainIcon },
  { to: "/files", label: "Files", icon: Folder01Icon },
]

function ThreadRow({ session }: { session: SessionSummary }) {
  return (
    <div role="listitem" className={ITEM}>
      <div className="group/thread relative block">
        <Link
          to="/c/$sessionId"
          params={{ sessionId: session.id }}
          data-slot="sidebar-thread-row"
          className="group/row flex h-13 items-start gap-2.5 rounded px-2 py-1.5 outline-none select-none transition-colors duration-100 group-hover/thread:bg-secondary focus-visible:outline-ring-inset data-[status=active]:bg-secondary"
        >
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="flex h-5 min-w-0 items-center gap-2">
              <span className="mask-fade-r min-w-0 flex-1 overflow-hidden text-base leading-5 font-normal whitespace-nowrap text-foreground/75 group-data-[status=active]/row:text-foreground">
                {session.title}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{relativeTime(session.updatedAt)}</span>
            </span>
            <span className="@container flex h-4 min-w-0 items-center gap-1.5 text-xs text-muted-foreground-3">
              {session.busy ? <DotGrid state="working" label="Working" className="size-3" /> : null}
              <span className="mask-fade-r min-w-0 flex-1 overflow-hidden whitespace-nowrap text-muted-foreground-2">
                {session.preview}
              </span>
            </span>
          </span>
        </Link>
      </div>
    </div>
  )
}

function Threads({ sessions }: { sessions: readonly SessionSummary[] }) {
  return (
    <div role="list" className="px-1.5">
      <div role="listitem" className={ITEM}>
        <div className="flex h-8 shrink-0 items-center gap-1 pb-1">
          <span className="px-2 text-sm font-medium text-foreground select-none">Chats</span>
          <div className="ml-auto flex items-center">
            <Link to="/" aria-label="New chat" className={ICON_LINK}>
              <Icon icon={Add01Icon} />
            </Link>
          </div>
        </div>
      </div>
      {sessions.map((session) => (
        <ThreadRow key={session.id} session={session} />
      ))}
    </div>
  )
}

export function Sidebar({
  sessions,
  owner,
  onSearch,
  onToggle,
}: {
  sessions: readonly SessionSummary[]
  owner: string
  onSearch: () => void
  onToggle: () => void
}) {
  return (
    <div
      data-slot="sidebar-container"
      className="fixed top-(--shell-top) bottom-0 left-0 z-(--z-sidebar) flex w-(--sidebar-width) transition-[translate] duration-base ease-out-quint group-data-[sidebar=closed]/shell:-translate-x-full max-md:w-[min(88vw,320px)] max-md:border-r-[0.5px] max-md:border-border-1 max-md:bg-background max-md:shadow-sheet motion-reduce:transition-none"
    >
      <div
        data-slot="sidebar-content"
        className="flex h-full min-w-0 flex-1 flex-col transition-[opacity,translate] delay-[40ms] duration-base ease-out-quint group-data-[sidebar=closed]/shell:opacity-0 motion-reduce:transition-[opacity] motion-reduce:delay-0 motion-reduce:duration-[110ms]"
      >
        <div className="flex h-full min-h-0 w-full flex-col pt-2">
          <header className="flex h-11 shrink-0 items-center gap-1 px-2 pl-4">
            <Link to="/" aria-label="Home" className={`${ICON_LINK} -ml-1`}>
              <img src={AGENT.character} alt="" className="h-5 w-auto" />
            </Link>
            <div className="ml-auto flex items-center">
              <Button variant="ghost" size="icon-sm" aria-label="Search" onClick={onSearch}>
                <Icon icon={Search01Icon} />
              </Button>
              <Link to="/" aria-label="New chat" className={ICON_LINK}>
                <Icon icon={PencilEdit02Icon} />
              </Link>
              <Button variant="ghost" size="icon-sm" aria-label="Toggle sidebar" onClick={onToggle}>
                <Icon icon={SidebarLeftIcon} />
              </Button>
            </div>
          </header>
          <nav className="scroll-fade-y min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
            <Threads sessions={sessions} />
          </nav>
          <footer className="flex shrink-0 items-center gap-1 border-t-[0.5px] border-border-1 p-2">
            <span
              aria-label={owner}
              className="relative flex size-6 shrink-0 items-center justify-center overflow-hidden rounded bg-secondary text-[10px] font-medium uppercase"
            >
              {owner.slice(0, 1)}
            </span>
            <nav aria-label="Main" className="ml-auto flex h-7 min-w-0 flex-1 justify-end overflow-hidden">
              {PAGES.map((page) => (
                <Link key={page.to} to={page.to} aria-label={page.label} className={ICON_LINK}>
                  <Icon icon={page.icon} />
                </Link>
              ))}
              <Link to="." search={(previous) => ({ ...previous, settings: "general" as const })} aria-label="Settings" className={ICON_LINK}>
                <Icon icon={Settings01Icon} />
              </Link>
            </nav>
          </footer>
        </div>
      </div>
    </div>
  )
}
