import { createMemo, createSignal, For, onCleanup, Show } from "solid-js"
import { Dynamic } from "@solidjs/web"
import "skullet/element"
import { useNavigate, useParams } from "@solidjs/router"
import { VList } from "virtua/solid"
import { MenuTrigger } from "@ui-sdk/solid/menu"
import { Icon } from "@tock/ui/icon"
import { Orb } from "@tock/ui/orb"
import { tokens } from "@tock/tokens"
import { TextMorph } from "@tock/ui/text-morph"
import { glyphFor } from "../lib/glyph"
import { app, newThreadId, plainText, titleOf, updateThread, type Session } from "../state/app"
import { shortTime } from "../lib/time"
import { now } from "../lib/clock"
import { renaming, setRenaming, threadMenu, ThreadMenu } from "./thread-menu"

type Entry = { kind: "row"; session: Session } | { kind: "archive"; count: number }

const rowEntries = new WeakMap<Session, Entry>()
const rowEntry = (session: Session): Entry => {
  let entry = rowEntries.get(session)
  if (!entry) rowEntries.set(session, (entry = { kind: "row", session }))
  return entry
}
const archiveEntries = new Map<number, Entry>()
const archiveEntry = (count: number): Entry => {
  let entry = archiveEntries.get(count)
  if (!entry) archiveEntries.set(count, (entry = { kind: "archive", count }))
  return entry
}

const WIDTH_KEY = "tock.sidebar.width"
const clampWidth = (value: number) => Math.min(tokens.size["sidebar-max"], Math.max(tokens.size["sidebar-min"], Math.round(value)))
const savedWidth = () => {
  const saved = Number(localStorage.getItem(WIDTH_KEY))
  return Number.isFinite(saved) && saved > 0 ? clampWidth(saved) : tokens.size["sidebar-panel"]
}

function Highlight(props: { text: string; query: string }) {
  const parts = () => {
    const q = props.query.trim().toLowerCase()
    if (!q) return [{ text: props.text, hit: false }]
    const at = props.text.toLowerCase().indexOf(q)
    if (at < 0) return [{ text: props.text, hit: false }]
    return [
      { text: props.text.slice(0, at), hit: false },
      { text: props.text.slice(at, at + q.length), hit: true },
      { text: props.text.slice(at + q.length), hit: false },
    ]
  }
  return <For each={parts()} keyed={false}>{(part) => <>{part().hit ? <b class="tds-hit">{part().text}</b> : part().text}</>}</For>
}

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
      aria-label="Chat name"
      onKeyDown={(e) => {
        if (e.key === "Enter") commit(e.currentTarget.value)
        if (e.key === "Escape") ((done = true), setRenaming(undefined))
      }}
      onBlur={(e) => commit(e.currentTarget.value)}
    />
  )
}

function Row(props: { session: Session; selected: boolean; query: string }) {
  const glyph = () => glyphFor(props.session.id)
  return (
    <div class="tds-row-wrap" data-archived={props.session.meta.archived ? "" : undefined}>
      <a
        href={`/t/${props.session.id}`}
        class="tds-row"
        data-selected={props.selected ? "" : undefined}
        data-status={props.session.busy ? "working" : undefined}
        data-unread={props.session.meta.unread ? "" : undefined}
        aria-current={props.selected ? "page" : undefined}
      >
        <span class={`tds-row-icon ${glyph().hue}`}>
          <Icon name={glyph().icon} size="row" />
        </span>
        <span class="tds-row-title">
          <Show when={renaming() === props.session.id} fallback={<Highlight text={titleOf(props.session)} query={props.query} />}>
            <RenameField session={props.session} />
          </Show>
        </span>
        <span class="tds-row-time num">{shortTime(props.session.updatedAt, now())}</span>
        <span class="tds-row-preview">{plainText(props.session.preview) || " "}</span>
        <span class="tds-row-mark">
          <Show when={props.session.busy} fallback={<Show when={props.session.meta.unread}><i class="tds-unread" /></Show>}>
            <Orb status="working" surface={props.selected ? "sel" : "side"} />
          </Show>
        </span>
      </a>
      <Show when={props.session.meta.pinned}>
        <span class="tds-row-pin" aria-label="Pinned">
          <Icon name="push-pin" size="chip" />
        </span>
      </Show>
      <MenuTrigger controller={threadMenu} payload={props.session} class="tds-row-more" aria-label={`Actions for ${titleOf(props.session)}`}>
        <Icon name="dots-three" size="row" />
      </MenuTrigger>
    </div>
  )
}

function ResizeHandle(props: { width: number; onWidth: (width: number) => void }) {
  let start = 0
  let from = 0
  let last = 0
  const set = (width: number) => {
    last = clampWidth(width)
    props.onWidth(last)
  }
  const save = () => localStorage.setItem(WIDTH_KEY, String(last))
  const move = (e: PointerEvent) => set(from + e.clientX - start)
  const end = (e: PointerEvent) => {
    const el = e.currentTarget as HTMLElement
    if (!el.hasPointerCapture(e.pointerId)) return
    el.releasePointerCapture(e.pointerId)
    el.removeEventListener("pointermove", move)
    document.documentElement.removeAttribute("data-resizing")
    save()
  }
  return (
    <div
      class="tds-sidebar-handle"
      role="separator"
      tabindex="0"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-valuemin={tokens.size["sidebar-min"]}
      aria-valuemax={tokens.size["sidebar-max"]}
      aria-valuenow={props.width}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.preventDefault()
        start = e.clientX
        from = last = props.width
        e.currentTarget.setPointerCapture(e.pointerId)
        e.currentTarget.addEventListener("pointermove", move)
        document.documentElement.setAttribute("data-resizing", "")
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onDblClick={() => (set(tokens.size["sidebar-panel"]), save())}
      onKeyDown={(e) => {
        const step = tokens.size["sidebar-step"] * (e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0)
        if (!step) return
        e.preventDefault()
        set(props.width + step)
        save()
      }}
    />
  )
}

export function Sidebar() {
  const params = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const [query, setQuery] = createSignal("")
  const [archiveOpen, setArchiveOpen] = createSignal(false)
  const [width, setWidth] = createSignal<number>(savedWidth())
  let search!: HTMLInputElement

  const matches = createMemo(() => {
    const q = query().trim().toLowerCase()
    if (!q) return app.sessions
    return app.sessions.filter((s) => `${titleOf(s)} ${s.preview}`.toLowerCase().includes(q))
  })
  const entries = createMemo<Entry[]>(() => {
    const active = matches().filter((s) => !s.meta.archived)
    const archived = matches().filter((s) => s.meta.archived)
    const rows = active.map(rowEntry)
    if (archived.length === 0) return rows
    const open = archiveOpen() || query().trim() !== ""
    return [...rows, archiveEntry(archived.length), ...(open ? archived.map(rowEntry) : [])]
  })
  const working = createMemo(() => app.sessions.find((s) => s.busy))
  const startChat = () => navigate(`/t/${newThreadId()}`)

  const onKey = (event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault()
      search.focus()
      search.select()
    }
  }
  addEventListener("keydown", onKey)
  onCleanup(() => removeEventListener("keydown", onKey))

  return (
    <aside class="tds-sidebar" style={{ width: `${width()}px` }} aria-label="Chats">
      <div class="flex gap-6">
        <label class="tds-search" data-filled={query() ? "" : undefined}>
          <Icon name="magnifying-glass" size="menu" class="tds-search-glyph" />
          <input ref={search} value={query()} onInput={(e) => setQuery(e.currentTarget.value)} placeholder="Search" aria-label="Search chats" onKeyDown={(e) => e.key === "Escape" && (setQuery(""), e.currentTarget.blur())} />
          <kbd class="tds-search-hint">⌘K</kbd>
        </label>
        <button type="button" class="tds-press grid size-new-chat flex-none place-items-center rounded-pill bg-glass text-tx2 shadow-glass" aria-label="New chat" onClick={startChat}>
          <Icon name="note-pencil" size="menu" />
        </button>
      </div>

      <button type="button" class="tds-toast-row">
        <img src="/brand/toast-mascot-36.svg" alt="" class="size-mascot flex-none rounded-small" draggable={false} />
        <span class="min-w-0 flex-1 pl-6 text-left">
          <b class="block text-name">toast</b>
          <span class="block truncate text-preview text-muted">
            <TextMorph value={working() ? `working on ${titleOf(working()).toLowerCase()}` : "here when you need me"} />
          </span>
        </span>
        <Icon name="caret-down" size="menu" class="text-faint" />
      </button>

      <div class="relative -mx-12 min-h-0 flex-1">
        <Show
          when={entries().length > 0}
          fallback={
            <Show when={app.sessionsLoaded || query()} fallback={<RowSkeletons />}>
              <div class="px-12 py-36 text-center text-secondary text-muted">
                <b class="mb-4 block text-body text-tx2">{query() ? "No chats match" : "No chats yet"}</b>
                {query() ? "Try fewer words." : "Start one with the pencil."}
              </div>
            </Show>
          }
        >
          <VList data={entries()} class="tds-scroll h-full px-12 pb-16" itemSize={tokens.size.row}>
            {(entry) =>
              entry.kind === "archive" ? (
                <button type="button" class="tds-archive-head" aria-expanded={archiveOpen() ? "true" : "false"} onClick={() => setArchiveOpen((open) => !open)}>
                  <Icon name="archive" size="chip" />
                  <span>Archive</span>
                  <span class="tds-archive-count num">{entry.count}</span>
                  <Icon name="caret-down" size="chip" class="tds-archive-caret" />
                </button>
              ) : (
                <Row session={entry.session} selected={params.id === entry.session.id} query={query()} />
              )
            }
          </VList>
        </Show>
      </div>
      <ResizeHandle width={width()} onWidth={setWidth} />
      <ThreadMenu />
    </aside>
  )
}

const sample = { title: "Planning the week ahead", preview: "Three things worth a look today", time: "2h" }

function RowSkeletons() {
  return (
    <div class="px-12">
      <Dynamic component="skullet-reveal" loading="" label="Loading chats">
        <For each={Array.from({ length: tokens.limit["skeleton-rows"] })}>
          {() => (
            <div class="tds-row">
              <span class="tds-row-icon">
                <Icon name="hash" size="row" />
              </span>
              <span class="tds-row-title">{sample.title}</span>
              <span class="tds-row-time">{sample.time}</span>
              <span class="tds-row-preview">{sample.preview}</span>
            </div>
          )}
        </For>
      </Dynamic>
    </div>
  )
}
