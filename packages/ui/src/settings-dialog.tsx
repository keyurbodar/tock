import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { ArrowLeft01Icon, ArrowRight01Icon, Search01Icon } from "@hugeicons/core-free-icons"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { buttonVariants } from "./button"
import { PageEmbedded } from "./card"
import { cn } from "./cn"
import { DIALOG_MOTION, DIALOG_OVERLAY } from "./dialog"
import { useGlide } from "./glide"
import { glyphs } from "./glyph"
import { Icon, type IconData } from "./icon"
import { Input } from "./input"

export interface SettingsEntry {
  readonly id: string
  readonly label: string
  readonly icon: IconData
  readonly group: string
}

export type SettingsHealth = "running" | "waiting" | "unreachable"

const NARROW = "(width < 768px)"
const CURRENT = '[data-slot="settings-nav-row"][aria-current="page"]'
const WATCHED = ["aria-current"] as const

const POPUP = `relative flex h-[min(760px,calc(100dvh-48px))] w-[min(1080px,calc(100vw-48px))] overflow-hidden rounded-(--radius-panel) border-[0.5px] border-border-2 bg-panel text-left text-foreground shadow-overlay max-md:h-dvh max-md:w-screen max-md:rounded-none max-md:border-0 ${DIALOG_MOTION}`
const NAV =
  "relative flex w-[220px] shrink-0 flex-col overflow-y-auto overscroll-contain border-r-[0.5px] border-border-1 bg-background px-2 pb-3 max-md:w-auto max-md:flex-1 max-md:border-r-0 max-md:bg-panel max-md:px-4 max-md:pt-12 max-md:pb-4 max-md:group-data-[view=page]/settings:hidden"
const ROW =
  "relative z-1 flex h-7 shrink-0 cursor-pointer items-center gap-2 rounded px-2 text-sm font-medium text-muted-foreground-1 outline-none select-none transition-[color,background-color,scale] duration-100 hover:text-foreground focus-visible:outline-ring-inset active:scale-[0.98] aria-[current=page]:text-foreground max-md:h-11 max-md:gap-3.5 max-md:px-3 max-md:text-foreground max-md:active:bg-secondary max-md:aria-[current=page]:bg-secondary md:[@media(hover:hover)_and_(pointer:fine)]:hover:bg-secondary [&_svg]:size-(--icon-sm) [&_svg]:shrink-0"
const GLIDE =
  "pointer-events-none absolute top-0 left-0 z-0 rounded bg-secondary data-[hidden]:opacity-0 max-md:hidden motion-safe:[&:not([data-jump])]:transition-[transform,width,height,opacity] motion-safe:[&:not([data-jump])]:duration-fast motion-safe:[&:not([data-jump])]:ease-out-quint"
const DOT: Readonly<Record<SettingsHealth, string>> = {
  running: "bg-success",
  waiting: "bg-muted-foreground-3 motion-safe:animate-pulse",
  unreachable: "bg-destructive",
}

function useNarrow() {
  const [narrow, setNarrow] = useState(() => matchMedia(NARROW).matches)
  useEffect(() => {
    const query = matchMedia(NARROW)
    const update = () => setNarrow(query.matches)
    query.addEventListener("change", update)
    return () => query.removeEventListener("change", update)
  }, [])
  return narrow
}

export function SettingsDialog({
  open,
  view,
  entries,
  fallback,
  health,
  status,
  version,
  onView,
  onClose,
  children,
}: {
  open: boolean
  view: string | null
  entries: readonly SettingsEntry[]
  fallback: string
  health: SettingsHealth
  status: string
  version: string
  onView: (view: string | null, replace: boolean) => void
  onClose: () => void
  children: ReactNode
}) {
  const [query, setQuery] = useState("")
  const narrow = useNarrow()
  const [nav, setNav] = useState<HTMLElement | null>(null)
  const [mark, setMark] = useState<HTMLElement | null>(null)
  const body = useRef<HTMLDivElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  const term = query.trim().toLowerCase()
  const rows = entries.filter((entry) => entry.label.toLowerCase().includes(term))
  const groups =
    term === ""
      ? [...new Set(entries.map((entry) => entry.group))].map((name) => ({ name, rows: rows.filter((row) => row.group === name) }))
      : [{ name: null, rows }]

  useGlide(nav, mark, CURRENT, WATCHED)

  useEffect(() => {
    if (open && !narrow && view === null) onView(fallback, true)
  }, [open, narrow, view, fallback, onView])

  useEffect(() => {
    body.current?.scrollTo(0, 0)
    nav?.querySelector(CURRENT)?.scrollIntoView({ block: "nearest", inline: "nearest" })
  }, [view, nav])

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (next) return
        const focused = document.activeElement
        if (focused instanceof HTMLElement && popup.current?.contains(focused)) focused.blur()
        onClose()
      }}
      onOpenChangeComplete={(next) => {
        if (!next) setQuery("")
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop data-slot="dialog-overlay" className={DIALOG_OVERLAY} />
        <div className="fixed inset-0 z-(--z-dialog) flex h-dvh items-center justify-center">
          <DialogPrimitive.Popup data-slot="settings-dialog" className={POPUP} ref={popup} initialFocus={popup}>
            <div data-slot="settings" data-view={view === null ? "list" : "page"} className="group/settings relative flex min-w-0 flex-1 max-md:flex-col">
              <nav ref={setNav} aria-label="Settings sections" className={NAV}>
                <span ref={setMark} data-slot="glide" data-hidden="" aria-hidden="true" className={GLIDE} />
                <DialogPrimitive.Title className="flex h-11 shrink-0 items-center px-2 text-sm font-medium text-foreground max-md:h-auto max-md:px-1 max-md:pb-4 max-md:text-xl">
                  Settings
                </DialogPrimitive.Title>
                <span data-slot="input-group" className="relative mb-1 inline-flex w-full shrink-0 max-md:mb-2">
                  <span aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-icon-muted [&_svg]:size-(--icon-sm)">
                    <Icon icon={Search01Icon} />
                  </span>
                  <Input
                    aria-label="Search settings"
                    placeholder="Search settings"
                    value={query}
                    onChange={(event) => setQuery(event.currentTarget.value)}
                    className="h-(--h-control-sm) w-full px-2 pl-7"
                  />
                </span>
                {rows.length === 0 ? <p className="px-2 py-6 text-center text-xs text-muted-foreground-2">Nothing matches</p> : null}
                <div className="flex flex-col gap-4 py-1 max-md:gap-2">
                  {groups.map((group) =>
                    group.rows.length === 0 ? null : (
                      <div key={group.name ?? "results"} data-group={group.name ?? "results"} className="flex flex-col gap-px max-md:gap-0">
                        {group.name ? (
                          <div className="flex h-7 items-center px-2 text-xs font-medium text-muted-foreground-2 select-none max-md:px-1">{group.name}</div>
                        ) : null}
                        {group.rows.map((entry) => (
                          <button
                            key={entry.id}
                            type="button"
                            data-slot="settings-nav-row"
                            data-section={entry.id}
                            aria-current={entry.id === view ? "page" : undefined}
                            className={ROW}
                            onClick={() => onView(entry.id, false)}
                          >
                            <Icon icon={entry.icon} />
                            <span className="min-w-0 flex-1 truncate text-left">{entry.label}</span>
                            <span aria-hidden="true" className="hidden shrink-0 text-icon-muted max-md:flex">
                              <Icon icon={ArrowRight01Icon} />
                            </span>
                          </button>
                        ))}
                      </div>
                    ),
                  )}
                </div>
                <div data-slot="settings-status" data-health={health} className="mt-auto flex items-center gap-1.5 px-2 pt-3 text-xs text-muted-foreground-2 max-md:px-1 max-md:pt-4">
                  <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full transition-colors duration-fast", DOT[health])} />
                  <span role="status" className="min-w-0 flex-1 truncate">
                    {status}
                  </span>
                  <span className="shrink-0 text-muted-foreground-3">{version}</span>
                </div>
              </nav>
              <div
                ref={body}
                data-slot="settings-body"
                className="@container/settings flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto max-md:group-data-[view=list]/settings:hidden"
              >
                <div
                  key={view}
                  className="mx-auto w-full max-w-[764px] px-6 py-6 pb-16 max-md:pt-14 max-md:motion-safe:animate-[settings-push_var(--duration-slow)_var(--ease-out-quint)_backwards] @min-[560px]/settings:px-12 @min-[560px]/settings:pt-10"
                >
                  <button
                    type="button"
                    data-slot="settings-back"
                    className="group/back mb-1 -ml-1 hidden w-fit cursor-pointer items-center gap-1 rounded px-1 py-0.5 text-sm text-muted-foreground-2 transition-colors duration-100 active:text-foreground max-md:flex [&_svg]:size-(--icon-sm)"
                    onClick={() => onView(null, false)}
                  >
                    <span className="flex transition-transform duration-100 group-hover/back:-translate-x-0.5 group-active/back:-translate-x-0.5">
                      <Icon icon={ArrowLeft01Icon} />
                    </span>
                    Settings
                  </button>
                  <PageEmbedded value={true}>{children}</PageEmbedded>
                </div>
              </div>
              <DialogPrimitive.Close
                data-slot="dialog-close"
                className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "absolute top-2 right-2 cursor-pointer text-icon-muted max-md:top-3 max-md:right-3")}
              >
                {glyphs.close}
                <span className="sr-only">Close</span>
              </DialogPrimitive.Close>
            </div>
          </DialogPrimitive.Popup>
        </div>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
