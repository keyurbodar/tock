import { Empty } from "../chat/empty"
import { animate, lockAxis, Skeleton } from "@tock/ui/motion"
import { createEffect, createMemo, createSignal, For, Show, untrack } from "solid-js"
import { useNavigate, useParams } from "@solidjs/router"
import { MenuTrigger } from "@ui-sdk/solid/menu"
import { Icon } from "@tock/ui/icon"
import { MorphIcon } from "@tock/ui/morph-icon"
import { Orb } from "@tock/ui/orb"
import { TockIcon } from "@tock/ui/tock-icon"
import { tokens } from "@tock/tokens"
import { TextMorph } from "@tock/ui/text-morph"
import { glyphFor } from "../lib/glyph"
import { statusOf } from "../lib/status"
import { pressable } from "../lib/keys"
import { app, newThreadId, titleOf, updateThread, type Session } from "../state/app"
import { dirOf } from "../lib/dir"
import { minute } from "../lib/clock"
import { archive, doomed, markRead, pin, remove, renaming, selected, setRenaming, setSelected, takeEntering, threadMenu, ThreadMenu } from "./thread-menu"
import { dropping, Pins, setDropping } from "./pins"
import { hidePeek, Peek, peekEnter, peekLeave, peekToggle } from "./peek"
import { ToastRow } from "./session-stack"
import { MoveDialog } from "./move-dialog"
import { createHotkey } from "@tanstack/solid-hotkeys"
import { appHotkeys, typing } from "./hotkeys"
import { setPaletteOpen } from "./palette"
import { narrow } from "./narrow"
import { setShortcutsOpen } from "./shortcuts"
import { centreOpen, setCentreOpen } from "./centre"
import { unreadNotes } from "../state/notes"

type Entry = { kind: "row"; session: Session } | { kind: "archive"; count: number } | { kind: "archive-empty" }
type ChannelFilter = "all" | "unread" | "active"

const rowEntries = new WeakMap<Session, Entry>()
const rowEntry = (session: Session): Entry => {
  let entry = rowEntries.get(session)
  if (!entry) rowEntries.set(session, (entry = { kind: "row", session }))
  return entry
}
const ARCHIVE_EMPTY: Entry = { kind: "archive-empty" }
const archiveEntries = new Map<number, Entry>()
const archiveEntry = (count: number): Entry => {
  let entry = archiveEntries.get(count)
  if (!entry) archiveEntries.set(count, (entry = { kind: "archive", count }))
  return entry
}

const OPEN_KEY = "tock.sidebar.open"
const [sidebarOpen, setOpen] = createSignal(localStorage.getItem(OPEN_KEY) !== "0")

export const toggleSidebar = (next = !untrack(sidebarOpen)) => {
  setOpen(next)
  localStorage.setItem(OPEN_KEY, next ? "1" : "0")
  requestAnimationFrame(() => document.querySelector<HTMLElement>(next ? ".tds-sbt > .tds-ib" : ".tds-header-start > .tds-ib")?.focus({ preventScroll: true }))
}
export { sidebarOpen }

function RenameField(props: { session: Session }) {
  let done = false
  const commit = (value: string) => {
    if (done) return
    done = true
    setRenaming(undefined)
    const title = value.trim()
    if (title && title !== titleOf(props.session)) void updateThread(props.session.id, { title })
  }
  return (
    <input
      ref={(el) => queueMicrotask(() => (el.focus(), el.select()))}
      class="tds-row-rename"
      value={titleOf(props.session)}
      aria-label="Channel name"
      onKeyDown={(e) => {
        if (e.key === "Enter") commit(e.currentTarget.value)
        if (e.key === "Escape") ((done = true), setRenaming(undefined))
      }}
      onBlur={(e) => commit(e.currentTarget.value)}
    />
  )
}

const D = tokens.motion.duration
const curve = tokens.motion.curve
let suppressClick = false
const swallowClick = () => ((suppressClick = true), requestAnimationFrame(() => requestAnimationFrame(() => (suppressClick = false))))

const orbOf = (session: Session) => {
  const status = statusOf(session)
  return status === "working" || status === "needs" ? status : undefined
}

function Row(props: { session: Session; selected: boolean; multi: boolean; current: string | undefined; navigate: (to: string) => void }) {
  const glyph = () => glyphFor(props.session.id)
  let row!: HTMLAnchorElement
  let icon!: HTMLSpanElement
  let start: { x: number; y: number; id: number; mouse: boolean } | undefined
  let dragging = false
  let ghost: HTMLElement | undefined

  const dragStart = (e: PointerEvent) => {
    const box = row.getBoundingClientRect()
    ghost = row.cloneNode(true) as HTMLElement
    ghost.classList.add("tds-row-lift")
    Object.assign(ghost.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px` })
    ghost.dataset.y = String(box.top - e.clientY)
    document.body.append(ghost)
    row.style.opacity = ".3"
    setDropping("near")
    hidePeek()
  }
  const dragMove = (e: PointerEvent) => {
    if (!ghost) return
    ghost.style.top = `${e.clientY + Number(ghost.dataset.y)}px`
    const pins = document.querySelector(".tds-pins")?.getBoundingClientRect()
    setDropping(pins && e.clientY < pins.bottom ? "over" : "near")
  }
  const dragEnd = () => {
    const over = dropping() === "over"
    setDropping("")
    row.style.opacity = ""
    const g = ghost
    ghost = undefined
    if (!g) return
    if (over) {
      g.remove()
      const session = untrack(() => props.session)
      const from = { rect: icon.getBoundingClientRect(), glyph: icon.innerHTML }
      return pin(session, from)
    }
    animate(g, [{ translate: "0 0" }, { translate: `0 ${row.getBoundingClientRect().top - parseFloat(g.style.top)}px` }], { duration: D.layout, easing: curve.sheet, fill: "forwards" }).onfinish = () => g.remove()
  }

  return (
    <div
      ref={(el) => {
        if (takeEntering(props.session.id)) el.setAttribute("data-entering", "")
      }}
      class="tds-row-wrap"
      data-id={props.session.id}
      data-archived={props.session.meta.archived ? "" : undefined}
      onContextMenu={(e) => {
        e.preventDefault()
        hidePeek()
        e.currentTarget.querySelector<HTMLElement>(".tds-row-more")?.click()
      }}
    >
      <a
        ref={row}
        href={`/t/${props.session.id}`}
        class="tds-row"
        draggable={false}
        data-selected={props.selected ? "" : undefined}
        data-multi={props.multi ? "" : undefined}
        data-status={statusOf(props.session) === "idle" ? undefined : statusOf(props.session)}
        data-unread={props.session.meta.unread ? "" : undefined}
        aria-current={props.selected ? "page" : undefined}
        onPointerEnter={(e) => peekEnter(untrack(() => props.session), e.currentTarget)}
        onPointerLeave={() => peekLeave()}
        onPointerDown={(e) => {
          hidePeek()
          if (e.button !== 0 || renaming() === untrack(() => props.session.id)) return
          if (e.pointerType !== "mouse" || untrack(() => props.session.meta.archived)) return
          start = { x: e.clientX, y: e.clientY, id: e.pointerId, mouse: true }
          dragging = false
        }}
        onPointerMove={(e) => {
          if (!start) return
          if (!dragging) {
            const axis = lockAxis(e.clientX - start.x, e.clientY - start.y)
            if (!axis) return
            if (axis === "y") {
              dragging = true
              dragStart(e)
              try {
                e.currentTarget.setPointerCapture(start.id)
              } catch {}
            } else {
              start = undefined
              return
            }
          }
          dragMove(e)
        }}
        onPointerUp={() => {
          if (dragging) {
            swallowClick()
            dragEnd()
          }
          start = undefined
          dragging = false
        }}
        onPointerCancel={() => {
          if (dragging) dragEnd()
          start = undefined
          dragging = false
        }}
        onClick={(e) => {
          if (suppressClick) return e.preventDefault()
          const id = untrack(() => props.session.id)
          if (e.metaKey || e.ctrlKey || e.shiftKey) {
            e.preventDefault()
            setSelected((list) => {
              const base = list.length === 0 && props.current && props.current !== id ? [props.current] : list
              return base.includes(id) ? base.filter((item) => item !== id) : [...base, id]
            })
            return
          }
          if (selected().length) setSelected([])
        }}
        onDblClick={(e) => (e.target as HTMLElement).closest(".tds-row-title") && setRenaming(untrack(() => props.session.id))}
      >
        <span class={`tds-row-icon ${glyph().hue}`} ref={icon}>
          <TockIcon name={glyph().icon} color={glyph().tone} size={tokens.icon.channel} selected={props.selected} />
        </span>
        <span class="tds-row-title" dir={dirOf(titleOf(props.session))}>
          <Show when={renaming() === props.session.id} fallback={<TextMorph value={titleOf(props.session)} mode="calm" />}>
            <RenameField session={props.session} />
          </Show>
        </span>
        <span class="tds-row-mark" skullet-ignore="">
          <Show when={orbOf(props.session)} fallback={<Show when={props.session.meta.unread && !props.selected}><i class="tds-unread" role="img" aria-label="Unread" /></Show>}>
            {(status) => <Orb status={status()} />}
          </Show>
        </span>
      </a>
      <MenuTrigger controller={threadMenu} payload={props.session} onPointerDown={() => hidePeek()} class="tds-row-more" aria-label={`Actions for ${titleOf(props.session)}`}>
        <Icon name="dots-three" size="channel" />
      </MenuTrigger>
    </div>
  )
}

export function Sidebar() {
  const params = useParams<{ id?: string }>()
  const navigate = useNavigate()
  let roster!: HTMLDivElement
  let filterInput: HTMLInputElement | undefined
  const [archiveOpen, setArchiveOpen] = createSignal(false)
  const [filterOpen, setFilterOpen] = createSignal(false)
  const [filterMode, setFilterMode] = createSignal<ChannelFilter>("all")
  const [filterQuery, setFilterQuery] = createSignal("")

  const filterActive = () => filterMode() !== "all" || filterQuery().trim().length > 0

  const toggleFilter = () => {
    const next = !untrack(filterOpen)
    setFilterOpen(next)
    if (next) requestAnimationFrame(() => filterInput?.focus())
    else {
      setFilterMode("all")
      setFilterQuery("")
    }
  }

  const visible = createMemo(() => app.sessions.filter((s) => !doomed().includes(s.id) && !((s.meta.snoozedUntil ?? 0) > minute())))
  const entries = createMemo<Entry[]>(() => {
    const q = filterQuery().trim().toLowerCase()
    const mode = filterMode()
    const matches = (s: Session) => {
      if (mode === "unread" && !s.meta.unread) return false
      if (mode === "active") {
        const st = statusOf(s)
        if (st !== "working" && st !== "needs") return false
      }
      if (q && !`${titleOf(s)} ${s.preview}`.toLowerCase().includes(q)) return false
      return true
    }
    const list = visible().filter((s) => (!s.meta.pinned || s.meta.archived) && matches(s))
    const rows = list.filter((s) => !s.meta.archived).map(rowEntry)
    const archived = list.filter((s) => s.meta.archived)
    if (archived.length === 0) return archiveOpen() && !filterActive() ? [...rows, archiveEntry(0), ARCHIVE_EMPTY] : rows
    return [...rows, archiveEntry(archived.length), ...(archiveOpen() || q ? archived.map(rowEntry) : [])]
  })

  let shownFor: string | undefined
  createEffect(
    () => ({ id: params.id, index: entries().findIndex((entry) => entry.kind === "row" && entry.session.id === params.id) }),
    ({ id, index }) => {
      if (id === shownFor || index < 0) return
      shownFor = id
      requestAnimationFrame(() => roster?.querySelector(`[data-id="${CSS.escape(id ?? "")}"]`)?.scrollIntoView({ block: "nearest" }))
    },
  )

  const chosen = () => app.sessions.filter((s) => selected().includes(s.id))
  const startChat = () => navigate(`/t/${newThreadId()}`)

  createHotkey(appHotkeys["chat.peek"], (e) => {
    if (typing(e.target) || pressable(e.target) || e.repeat) return
    const row = document.querySelector<HTMLElement>(".tds-row:hover") ?? document.querySelector<HTMLElement>(".tds-row[aria-current=page]")
    const session = app.sessions.find((item) => row && row.getAttribute("href") === `/t/${item.id}`)
    if (!row || !session) return
    e.preventDefault()
    peekToggle({ session, row })
  })
  createHotkey(appHotkeys["sidebar.toggle"], () => toggleSidebar())

  return (
    <aside class="tds-sidebar" data-backdrop-layer data-collapsed={sidebarOpen() || narrow() ? undefined : ""} aria-label="Channels" inert={!sidebarOpen() && !narrow()}>
      <div class="tds-sidebar-inner">
        <div class="tds-sbt">
          <button type="button" class="tds-ib" aria-label="Close sidebar" aria-expanded="true" data-tip="" data-tip-side="right" onClick={() => toggleSidebar(false)}>
            <Icon name="sidebar-simple" size="bar" />
          </button>
          <span class="tds-sbt-end">
            <BellButton />
            <button type="button" class="tds-ib tds-search" aria-label="Search" data-tip="" data-tip-side="bottom" onClick={() => setPaletteOpen(true)}>
              <Icon name="magnifying-glass" size="bar" />
            </button>
          </span>
        </div>

        <ToastRow show />
        <Pins show />

        <div class="tds-sec">
          <span>Channels</span>
          <button type="button" class="tds-ib" data-size="sec" aria-label="New channel" data-tip="" data-tip-side="bottom" onClick={startChat}>
            <Icon name="plus" size="bar" />
          </button>
          <button
            type="button"
            class="tds-ib"
            data-size="sec"
            data-filter-active={filterActive() ? "" : undefined}
            aria-label={filterOpen() ? "Close channel filter" : "Filter channels"}
            aria-expanded={filterOpen() ? "true" : "false"}
            aria-pressed={filterOpen() || filterActive() ? "true" : "false"}
            data-tip=""
            data-tip-side="bottom"
            onClick={toggleFilter}
          >
            <Icon name="funnel-simple" size="bar" />
          </button>
        </div>

        <Show when={filterOpen()}>
          <div class="tds-ch-filter" role="search" aria-label="Filter channels">
            <div class="tds-ch-filter-input">
              <Icon name="magnifying-glass" size="chip" />
              <input
                ref={(el) => (filterInput = el)}
                type="text"
                value={filterQuery()}
                placeholder="Filter channels…"
                aria-label="Filter channels by name"
                onInput={(e) => setFilterQuery(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault()
                    toggleFilter()
                  }
                }}
              />
              <Show when={filterQuery()}>
                <button type="button" class="tds-ch-filter-clear" aria-label="Clear filter" onClick={() => (setFilterQuery(""), filterInput?.focus())}>
                  <Icon name="x" size="chip" />
                </button>
              </Show>
            </div>
            <div class="tds-ch-filter-pills" role="group" aria-label="Channel status filter">
              {(["all", "unread", "active"] as const).map((mode) => (
                <button
                  type="button"
                  class="tds-ch-filter-pill"
                  aria-pressed={filterMode() === mode ? "true" : "false"}
                  onClick={() => setFilterMode(mode)}
                >
                  {mode === "all" ? "All" : mode === "unread" ? "Unread" : "Active"}
                </button>
              ))}
            </div>
          </div>
        </Show>

        <div class="tds-chs" onPointerLeave={() => peekLeave()}>
          <Skeleton fill label="Loading channels" loading={!app.sessionsLoaded && entries().length === 0} sample={() => <SampleRows />}>
            <div class="h-full">
              <Show
                when={entries().length > 0}
                fallback={
                  <div class="px-12 py-36">
                    <Empty art={filterActive() ? "search" : "hi"} small />
                  </div>
                }
              >
                <div ref={roster} class="tds-roster tds-scroll h-full" tabindex="-1" data-edge-fade="y">
                  <For each={entries()}>
                    {(entry) => {
                      if (entry.kind === "archive-empty")
                        return (
                          <div class="tds-archive-empty">
                            <Empty art="archive" small />
                          </div>
                        )
                      if (entry.kind === "archive")
                        return (
                          <button type="button" class="tds-archive-head" aria-expanded={archiveOpen() ? "true" : "false"} onClick={() => setArchiveOpen((open) => !open)}>
                            <Icon name="archive" size="chip" class="tds-archive-icon" />
                            <span>Archived</span>
                            <span class="tds-archive-count num">{entry.count}</span>
                            <MorphIcon name={archiveOpen() ? "chevron-down" : "chevron-right"} size="chip" class="tds-archive-caret" />
                          </button>
                        )
                      return <Row session={entry.session} selected={params.id === entry.session.id} multi={selected().includes(entry.session.id)} current={params.id} navigate={navigate} />
                    }}
                  </For>
                </div>
              </Show>
            </div>
          </Skeleton>
        </div>

        <div class="tds-bulk tds-over" data-open={selected().length > 1 ? "" : undefined} role="toolbar" aria-label="Selected channels" inert={selected().length > 1 ? undefined : true}>
          <b class="num">
            <TextMorph value={`${selected().length} selected`} mode="roll" />
          </b>
          <button type="button" class="tds-press" onClick={() => (markRead(chosen()), setSelected([]))}>
            <Icon name="circle" size="menu" />
            Read
          </button>
          <button type="button" class="tds-press" onClick={() => (archive(chosen(), params.id, navigate), setSelected([]))}>
            <Icon name="archive" size="menu" />
            Archive
          </button>
          <button type="button" class="tds-press" data-danger="" onClick={() => (remove(chosen(), params.id, navigate), setSelected([]))}>
            <Icon name="trash" size="menu" />
            Delete
          </button>
        </div>

        <footer class="tds-me">
          <span class="tds-me-initial" aria-hidden="true">Y</span>
          <b>You</b>
          <span class="flex-1" />
          <button type="button" class="tds-ib" data-size="me" aria-label="Keyboard shortcuts" data-tip="" data-tip-side="top" onClick={() => setShortcutsOpen(true)}>
            <Icon name="keyboard" size="bar" />
          </button>
          <button type="button" class="tds-ib" data-size="me" aria-label="Settings" data-tip="" data-tip-side="top">
            <Icon name="gear-six" size="bar" />
          </button>
        </footer>
      </div>
      <ThreadMenu />
      <MoveDialog />
      <Peek />
    </aside>
  )
}

function BellButton() {
  return (
    <button
      type="button"
      class="tds-ib"
      data-bell=""
      aria-label={unreadNotes() ? `Notifications, ${unreadNotes()} new` : "Notifications"}
      aria-pressed={centreOpen() ? "true" : "false"}
      data-tip="Notifications"
      data-tip-side="bottom"
      onClick={() => setCentreOpen((open) => !open)}
    >
      <Icon name="bell" size="bar" />
      <Show when={unreadNotes() > 0}>
        <i class="tds-bd" aria-hidden="true" />
      </Show>
    </button>
  )
}

function SampleRows() {
  return (
    <div class="h-full">
      <For each={Array.from({ length: tokens.limit["skeleton-rows"] })} keyed={false}>
        {() => (
          <div class="tds-row">
            <span class="tds-row-icon">
              <Icon name="hash" size="channel" />
            </span>
            <span class="tds-row-title">Planning the week</span>
          </div>
        )}
      </For>
    </div>
  )
}
