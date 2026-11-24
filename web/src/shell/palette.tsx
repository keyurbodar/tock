import {
  BrainIcon,
  Clock01Icon,
  Folder01Icon,
  Message01Icon,
  PaintBoardIcon,
  ComputerIcon,
  Moon02Icon,
  PencilEdit02Icon,
  Sun03Icon,
} from "@hugeicons/core-free-icons"
import { useAtomValue } from "@effect/atom-react"
import { useNavigate } from "@tanstack/react-router"
import { withTheme, type Mode } from "@tock/theme/apply"
import { WALLPAPER_THEMES } from "@tock/theme/themes"
import { Button } from "@tock/ui/button"
import { Icon, type IconData } from "@tock/ui/icon"
import { Kbd } from "@tock/ui/input"
import { Dialog, DialogBackdrop, DialogContent, DialogTitle } from "@ui-sdk/react/dialog"
import { useEffect, useMemo, useRef, useState } from "react"
import { AGENT } from "../agent"
import { relativeTime } from "../lib/format"
import { SECTIONS } from "../settings/sections"
import { setAppearance } from "../state/appearance"
import { paletteAtom, useSessions } from "../state/data"
import { registry } from "../state/registry"

interface Command {
  readonly id: string
  readonly group: string
  readonly label: string
  readonly icon: IconData
  readonly trailing?: string
  readonly run: () => unknown
}

const BACKDROP =
  "fixed inset-0 z-(--z-dialog) bg-overlay transition-opacity duration-base ease-out data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 data-[ending-style]:duration-fast"
const CONTENT =
  "fixed top-[15dvh] left-1/2 z-(--z-dialog) flex max-h-[calc(85dvh-1rem-var(--safe-bottom))] min-h-0 w-[calc(100%-2rem)] max-w-[720px] -translate-x-1/2 flex-col overflow-hidden rounded-(--radius-panel) border-[0.5px] border-border-2 bg-popover shadow-overlay outline-none transition-[opacity,scale] duration-base ease-out-quint data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[ending-style]:duration-fast"
const INPUT =
  "h-11 w-full min-w-0 bg-transparent px-4 text-sm font-normal text-foreground outline-none placeholder:text-muted-foreground-3"
const LIST = "max-h-[min(400px,60vh)] min-h-0 flex-1 scroll-py-1.5 overflow-y-auto p-1.5 md:scroll-fade-y"
const GROUP_LABEL = "flex min-h-7 items-center px-2.5 text-xs font-medium text-muted-foreground-2"
const ITEM =
  "relative flex h-(--h-palette-row) w-full min-w-0 cursor-pointer items-center gap-2.5 rounded-(--radius-overlay) px-2.5 text-left text-sm font-normal text-foreground outline-none select-none data-[highlighted]:bg-[var(--menu-row-highlight,var(--popover-hover))] [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-(--icon-base)"

const FILTER =
  "inline-flex h-(--h-control-sm) shrink-0 cursor-pointer items-center rounded px-2.5 text-xs font-medium whitespace-nowrap text-muted-foreground-2 outline-none select-none transition-colors duration-100 hover:text-foreground aria-selected:bg-secondary aria-selected:text-foreground"
const HINT = "flex items-center gap-1.5 text-xs font-normal text-muted-foreground-2"
const ALL = "All"

const MODES: readonly { mode: Mode; label: string; icon: IconData }[] = [
  { mode: "light", label: "Switch to light mode", icon: Sun03Icon },
  { mode: "dark", label: "Switch to dark mode", icon: Moon02Icon },
  { mode: "system", label: "Switch to system mode", icon: ComputerIcon },
]

const matches = (command: Command, terms: readonly string[]) => {
  const haystack = `${command.label} ${command.group}`.toLowerCase()
  return terms.every((term) => haystack.includes(term))
}

export function Palette() {
  const open = useAtomValue(paletteAtom)
  const navigate = useNavigate()
  const sessions = useSessions()
  const [query, setQuery] = useState("")
  const [cursor, setCursor] = useState(0)
  const [filter, setFilter] = useState(ALL)
  const list = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k" || !(event.metaKey || event.ctrlKey)) return
      event.preventDefault()
      registry.set(paletteAtom, !registry.get(paletteAtom))
    }
    addEventListener("keydown", onKey)
    return () => removeEventListener("keydown", onKey)
  }, [])

  const commands = useMemo<readonly Command[]>(
    () => [
      ...sessions
        .filter((session) => session.messageCount > 0)
        .map((session) => ({
          id: `chat-${session.id}`,
          group: "Chats",
          label: session.title,
          icon: Message01Icon,
          trailing: relativeTime(session.updatedAt),
          run: () => navigate({ to: "/c/$sessionId", params: { sessionId: session.id } }),
        })),
      { id: "new", group: "Actions", label: "New chat", icon: PencilEdit02Icon, run: () => navigate({ to: "/" }) },
      { id: "routines", group: "Navigation", label: "Routines", icon: Clock01Icon, run: () => navigate({ to: "/routines" }) },
      { id: "memory", group: "Navigation", label: "Memory", icon: BrainIcon, run: () => navigate({ to: "/memory" }) },
      { id: "files", group: "Navigation", label: "Files", icon: Folder01Icon, run: () => navigate({ to: "/files" }) },
      ...SECTIONS.map((section) => ({
        id: `settings-${section.id}`,
        group: "Settings",
        label: section.label,
        icon: section.icon,
        run: () => navigate({ to: "/settings/$section", params: { section: section.id } }),
      })),
      ...MODES.map(({ mode, label, icon }) => ({
        id: `mode-${mode}`,
        group: "Appearance",
        label,
        icon,
        run: () => setAppearance((current) => ({ ...current, mode })),
      })),
      ...WALLPAPER_THEMES.map((theme) => ({
        id: `theme-${theme.id}`,
        group: "Appearance",
        label: `${theme.name} theme`,
        icon: PaintBoardIcon,
        run: () => setAppearance((current) => withTheme(current, theme.id)),
      })),
    ],
    [sessions, navigate],
  )

  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  const filters = [ALL, ...new Set(commands.map((command) => command.group))]
  const visible = commands.filter((command) => (filter === ALL || command.group === filter) && matches(command, terms))

  const run = (command: Command | undefined) => {
    if (!command) return
    registry.set(paletteAtom, false)
    void command.run()
  }

  const move = (delta: number) => {
    const next = Math.min(visible.length - 1, Math.max(0, cursor + delta))
    setCursor(next)
    list.current?.querySelector(`[data-index="${next}"]`)?.scrollIntoView({ block: "nearest" })
  }

  const shift = (delta: number) => {
    const next = filters[(filters.indexOf(filter) + delta + filters.length) % filters.length]
    setFilter(next ?? ALL)
    setCursor(0)
  }

  const newChat = () => {
    registry.set(paletteAtom, false)
    void navigate({ to: "/" })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        registry.set(paletteAtom, next)
        setQuery("")
        setCursor(0)
        setFilter(ALL)
      }}
    >
      <DialogBackdrop className={BACKDROP} />
      <DialogContent data-slot="command-menu-content" aria-label="Command menu" className={CONTENT}>
        <DialogTitle className="sr-only">Command menu</DialogTitle>
        <div data-slot="command-menu" className="flex min-h-0 flex-col">
          <div className="flex min-h-0 flex-col">
            <div className="flex shrink-0 items-center">
              <input
                autoFocus
                role="combobox"
                aria-expanded="true"
                aria-haspopup="listbox"
                aria-autocomplete="none"
                data-slot="command-menu-input"
                placeholder="Search chats, actions, settings…"
                value={query}
                onChange={(event) => {
                  setQuery(event.currentTarget.value)
                  setCursor(0)
                }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault()
                    move(1)
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault()
                    move(-1)
                  } else if (event.key === "Enter") {
                    event.preventDefault()
                    run(visible[cursor])
                  } else if (event.key === "Tab") {
                    event.preventDefault()
                    newChat()
                  } else if (query === "" && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
                    event.preventDefault()
                    shift(event.key === "ArrowLeft" ? -1 : 1)
                  }
                }}
                className={`${INPUT} flex-1`}
              />
              <div className="flex shrink-0 items-center pr-2">
                <Button variant="ghost" size="sm" tabIndex={-1} onClick={newChat} className="pointer-coarse:hidden">
                  New chat
                  <Kbd>⇥</Kbd>
                </Button>
              </div>
            </div>
            <div className="mx-0 my-0 h-px shrink-0 bg-border-1" />
            <div
              role="tablist"
              data-slot="command-menu-filters"
              className="flex shrink-0 scroll-fade-x items-center gap-0.5 overflow-x-auto px-1.5 pt-1.5 [scrollbar-width:none]"
            >
              {filters.map((name) => (
                <button
                  key={name}
                  type="button"
                  role="tab"
                  tabIndex={-1}
                  aria-selected={name === filter}
                  data-slot="command-menu-filter"
                  onClick={() => {
                    setFilter(name)
                    setCursor(0)
                  }}
                  className={FILTER}
                >
                  {name}
                </button>
              ))}
            </div>
            <div ref={list} role="listbox" aria-orientation="vertical" data-slot="command-menu-list" className={LIST}>
              <div data-slot="command-menu-empty" className="hidden px-2 py-10 text-center text-sm text-muted-foreground-2 only:block">
                No results
              </div>
              {visible.map((command, index) => {
                const heading = index === 0 || visible[index - 1]?.group !== command.group
                return (
                  <div key={command.id} role="group" data-slot="command-menu-group" className="flex flex-col gap-px">
                    {heading ? (
                      <div data-slot="command-menu-group-label" className={GROUP_LABEL}>
                        {command.group}
                      </div>
                    ) : null}
                    <div
                      role="option"
                      aria-selected={index === cursor}
                      data-slot="command-menu-item"
                      data-index={index}
                      data-highlighted={index === cursor ? "" : undefined}
                      onPointerMove={() => setCursor(index)}
                      onClick={() => run(command)}
                      className={ITEM}
                    >
                      <span className="flex size-(--icon-base) shrink-0 items-center justify-center text-icon-muted">
                        <Icon icon={command.icon} />
                      </span>
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="min-w-0 truncate">{command.label}</span>
                      </span>
                      {command.trailing ? (
                        <span className="ml-auto flex shrink-0 items-center gap-1.5 text-xs font-normal text-muted-foreground-2">
                          <span className="min-w-8 text-right tabular-nums">{command.trailing}</span>
                        </span>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
            <div
              data-slot="command-menu-footer"
              className="flex h-10 shrink-0 items-center gap-4 border-t-[0.5px] border-border-1 px-4 max-md:hidden"
            >
              <span role="img" aria-hidden="true" className="inline-flex h-4 items-center text-muted-foreground-3">
                <img src={AGENT.character} alt="" className="h-full w-auto opacity-60 grayscale" />
              </span>
              <span className="ml-auto flex items-center gap-4">
                <span className={HINT}>
                  <span className="flex items-center gap-0.5">
                    <Kbd>↵</Kbd>
                  </span>
                  Open
                </span>
                <span className={HINT}>
                  <span className="flex items-center gap-0.5">
                    <Kbd>←</Kbd>
                    <Kbd>→</Kbd>
                  </span>
                  Category
                </span>
              </span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
