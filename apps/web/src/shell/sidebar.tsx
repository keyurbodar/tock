import { Empty } from "../chat/empty"
import { createMemo, createSignal, For, onCleanup, Show, untrack } from "solid-js"
import { MorphIcon } from "@tock/ui/morph-icon"
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
import { spring } from "../lib/spring"
import { app, newThreadId, plainText, titleOf, updateThread, type Session } from "../state/app"
import { shortTime } from "../lib/time"
import { now } from "../lib/clock"
import { archive, doomed, markRead, pin, remove, renaming, selected, setRenaming, setSelected, takeEntering, threadAction, threadMenu, ThreadMenu } from "./thread-menu"
import { dropping, Pins, setDropping } from "./pins"
import { hidePeek, Peek, peekEnter, peekLeave, peekToggle } from "./peek"
import { ToastRow } from "./session-stack"
import { MoveDialog } from "./move-dialog"

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

const L = tokens.limit
const D = tokens.motion.duration
const curve = tokens.motion.curve
let closeOpenSwipe: (() => void) | undefined
let suppressClick = false
const swallowClick = () => ((suppressClick = true), requestAnimationFrame(() => requestAnimationFrame(() => (suppressClick = false))))


function Row(props: { session: Session; selected: boolean; multi: boolean; query: string; current: string | undefined; navigate: (to: string) => void }) {
  const glyph = () => glyphFor(props.session.id)
  let wrap!: HTMLDivElement
  let row!: HTMLAnchorElement
  let left!: HTMLDivElement
  let right!: HTMLDivElement
  let icon!: HTMLSpanElement
  let start: { x: number; y: number; from: number; id: number; mouse: boolean } | undefined
  let velocity = 0
  let last = { x: 0, t: 0 }
  let mode: "swipe" | "drag" | undefined
  let x = 0
  let go = false
  let ghost: HTMLElement | undefined

  const setX = (next: number, animate = false) => {
    x = next
    const settle = spring()
    const ease = animate ? `${settle.duration}ms ${settle.easing}` : "0s"
    row.style.transition = `transform ${ease}`
    for (const side of [left, right]) side.style.transition = `width ${ease}`
    row.style.transform = next ? `translateX(${next}px)` : ""
    left.style.width = `${Math.max(0, next)}px`
    right.style.width = `${Math.max(0, -next)}px`
    wrap.toggleAttribute("data-swiping", next !== 0)
  }
  const close = () => {
    setX(0, true)
    if (closeOpenSwipe === close) closeOpenSwipe = undefined
  }
  const drag = (dx: number) => {
    const width = row.offsetWidth
    let next = Math.abs(dx) > L["swipe-max"] ? Math.sign(dx) * (L["swipe-max"] + (Math.abs(dx) - L["swipe-max"]) * L["swipe-rubber"]) : dx
    next = Math.max(-width + tokens.space[18]!, Math.min(width - tokens.space[18]!, next))
    setX(next)
    const commit = Math.abs(next) > width * L["swipe-commit"]
    if (commit !== go) {
      go = commit
      wrap.dataset.go = commit ? (next > 0 ? "left" : "right") : ""
    }
  }
  const act = (action: string) => {
    const session = untrack(() => props.session)
    const from = { rect: icon.getBoundingClientRect(), glyph: icon.innerHTML }
    if (action === "pin-drop") return pin(session, from)
    if (action === "unread") return close(), threadAction(action, session, props.current, props.navigate)
    row.style.transition = `transform ${D.panel}ms ${curve.sheet}`
    row.style.transform = `translateX(${Math.sign(x || (action === "pin" ? 1 : -1)) * row.offsetWidth}px)`
    closeOpenSwipe = undefined
    setTimeout(() => {
      if (action === "pin") pin(session, from)
      if (action === "archive") archive([session], props.current, props.navigate)
      if (action === "delete") remove([session], props.current, props.navigate)
    }, D.menu)
  }
  const release = () => {
    const projected = x + velocity * D["swipe-project"]
    const flick = Math.abs(velocity) > L["swipe-velocity"] && Math.sign(velocity) === Math.sign(x)
    if (go || (flick && Math.abs(projected) > row.offsetWidth * L["swipe-commit"])) return act(x > 0 ? "pin" : "archive")
    if (Math.abs(projected) > L["swipe-snap"] && Math.sign(projected) === Math.sign(x)) {
      setX(Math.sign(x) * tokens.size.swipe * 2, true)
      closeOpenSwipe = close
      const outside = (e: PointerEvent) => {
        if (wrap.contains(e.target as Node)) return
        removeEventListener("pointerdown", outside, true)
        if (closeOpenSwipe === close) close()
      }
      addEventListener("pointerdown", outside, true)
      return
    }
    close()
  }

  let wheel: { lock: "swipe" | "scroll" | undefined; acc: number; idle?: ReturnType<typeof setTimeout>; t: number } | undefined
  /** px2 trackpad swipe: two-finger horizontal scroll moves the row; intent locks per gesture, release comes a beat (wheel-idle) after the last event. */
  const onWheel = (e: WheelEvent) => {
    if (renaming() === untrack(() => props.session.id) || start) return
    wheel ??= { lock: undefined, acc: x, t: e.timeStamp }
    if (!wheel.lock) {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) * L["swipe-ratio"]) wheel.lock = "swipe"
      else if (Math.abs(e.deltaY) > 0) wheel.lock = "scroll"
      if (wheel.lock === "swipe") {
        if (closeOpenSwipe && closeOpenSwipe !== close) closeOpenSwipe()
        go = false
        velocity = 0
        hidePeek()
      }
    }
    clearTimeout(wheel.idle)
    const done = () => {
      const ended = wheel
      wheel = undefined
      if (ended?.lock === "swipe") release()
    }
    wheel.idle = setTimeout(done, D["wheel-idle"])
    if (wheel.lock !== "swipe") return
    e.preventDefault()
    const dt = e.timeStamp - wheel.t
    if (dt > 0) velocity = velocity * 0.4 + (-e.deltaX / dt) * 0.6
    wheel.t = e.timeStamp
    wheel.acc -= e.deltaX
    drag(wheel.acc)
  }

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
      return act("pin-drop")
    }
    g.animate([{ top: g.style.top }, { top: `${row.getBoundingClientRect().top}px` }], { duration: D.layout, easing: curve.sheet }).onfinish = () => g.remove()
  }

  return (
    <div
      ref={(el) => {
        wrap = el
        if (takeEntering(props.session.id)) el.setAttribute("data-entering", "")
      }}
      class="tds-row-wrap"
      data-id={props.session.id}
      data-archived={props.session.meta.archived ? "" : undefined}
      onContextMenu={(e) => {
        e.preventDefault()
        e.currentTarget.querySelector<HTMLElement>(".tds-row-more")?.click()
      }}
    >
      <div class="tds-swipe" aria-hidden="true">
        <div class="tds-swipe-side" data-side="left" ref={left}>
          <button type="button" tabindex="-1" class="tds-swipe-act" data-act="pin" onClick={() => act("pin")}>
            <Icon name="push-pin" size="code-action" />
            Pin
          </button>
          <button type="button" tabindex="-1" class="tds-swipe-act" data-act="unread" onClick={() => act("unread")}>
            <Icon name="circle" size="code-action" />
            {props.session.meta.unread ? "Read" : "Unread"}
          </button>
        </div>
        <div class="tds-swipe-side" data-side="right" ref={right}>
          <button type="button" tabindex="-1" class="tds-swipe-act" data-act="archive" onClick={() => act("archive")}>
            <Icon name="archive" size="code-action" />
            Archive
          </button>
          <button type="button" tabindex="-1" class="tds-swipe-act" data-act="delete" onClick={() => act("delete")}>
            <Icon name="trash" size="code-action" />
            Delete
          </button>
        </div>
      </div>
      <a
        ref={row}
        href={`/t/${props.session.id}`}
        class="tds-row"
        draggable={false}
        data-selected={props.selected ? "" : undefined}
        data-multi={props.multi ? "" : undefined}
        data-status={props.session.busy ? "working" : app.threads[props.session.id]?.error ? "failed" : undefined}
        data-unread={props.session.meta.unread ? "" : undefined}
        aria-current={props.selected ? "page" : undefined}
        onPointerEnter={(e) => peekEnter(untrack(() => props.session), e.currentTarget)}
        onPointerLeave={() => peekLeave()}
        onWheel={(e) => onWheel(e)}
        onPointerDown={(e) => {
          hidePeek()
          if (e.button !== 0 || renaming() === untrack(() => props.session.id)) return
          if (closeOpenSwipe && closeOpenSwipe !== close) closeOpenSwipe()
          start = { x: e.clientX, y: e.clientY, from: x, id: e.pointerId, mouse: e.pointerType === "mouse" }
          velocity = 0
          last = { x: e.clientX, t: e.timeStamp }
          mode = undefined
        }}
        onPointerMove={(e) => {
          if (!start) return
          const dx = e.clientX - start.x
          const dy = e.clientY - start.y
          if (!mode) {
            if (Math.abs(dx) > L["swipe-intent"] && Math.abs(dx) > Math.abs(dy) * L["swipe-ratio"]) {
              mode = "swipe"
              go = false
              e.currentTarget.setPointerCapture(start.id)
            } else if (start.mouse && untrack(() => !props.session.meta.archived) && Math.abs(dy) > L["swipe-intent"]) {
              mode = "drag"
              e.currentTarget.setPointerCapture(start.id)
              dragStart(e)
            } else return
          }
          const dt = e.timeStamp - last.t
          if (dt > 0) velocity = velocity * 0.4 + ((e.clientX - last.x) / dt) * 0.6
          last = { x: e.clientX, t: e.timeStamp }
          if (mode === "swipe") drag(start.from + dx)
          else dragMove(e)
        }}
        onPointerUp={() => {
          if (mode) swallowClick()
          if (mode === "swipe") release()
          if (mode === "drag") dragEnd()
          start = undefined
          mode = undefined
        }}
        onPointerCancel={() => {
          if (mode === "swipe") close()
          if (mode === "drag") dragEnd()
          start = undefined
          mode = undefined
        }}
        onClick={(e) => {
          if (suppressClick) return e.preventDefault()
          if (x !== 0) return e.preventDefault(), close()
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
          <MorphIcon name={glyph().icon} size="row" />
        </span>
        <span class="tds-row-title">
          <Show when={renaming() === props.session.id} fallback={<Highlight text={titleOf(props.session)} query={props.query} />}>
            <RenameField session={props.session} />
          </Show>
        </span>
        <span class="tds-row-time num"><TextMorph value={shortTime(props.session.updatedAt, now())} /></span>
        <span class="tds-row-preview">
          <Highlight text={plainText(props.session.preview) || "No messages yet"} query={props.query} />
        </span>
        <span class="tds-row-mark">
          <Show when={props.session.busy} fallback={<Show when={props.session.meta.unread}><i class="tds-unread" /></Show>}>
            <Orb status="working" surface={props.selected ? "sel" : "side"} />
          </Show>
        </span>
      </a>
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

  const visible = createMemo(() => app.sessions.filter((s) => !doomed().includes(s.id) && !((s.meta.snoozedUntil ?? 0) > now())))
  const matches = createMemo(() => {
    const q = query().trim().toLowerCase()
    if (!q) return visible().filter((s) => !s.meta.pinned || s.meta.archived)
    return visible().filter((s) => `${titleOf(s)} ${s.preview}`.toLowerCase().includes(q))
  })
  const entries = createMemo<Entry[]>(() => {
    const active = matches().filter((s) => !s.meta.archived)
    const archived = matches().filter((s) => s.meta.archived)
    const rows = active.map(rowEntry)
    if (archived.length === 0) return rows
    const open = archiveOpen() || query().trim() !== ""
    return [...rows, archiveEntry(archived.length), ...(open ? archived.map(rowEntry) : [])]
  })
  const chosen = () => app.sessions.filter((s) => selected().includes(s.id))
  const startChat = () => navigate(`/t/${newThreadId()}`)

  const onKey = (e: KeyboardEvent) => {
    const typing = (e.target as HTMLElement | null)?.closest("input, textarea, [contenteditable=true], .ProseMirror")
    if (e.key === "Escape" && untrack(selected).length) return setSelected([])
    if ((e.key === " " || e.code === "Space") && !typing && !e.repeat) {
      const row = document.querySelector<HTMLElement>(".tds-row:hover") ?? document.querySelector<HTMLElement>(".tds-row[aria-current=page]")
      const session = app.sessions.find((item) => row && row.getAttribute("href") === `/t/${item.id}`)
      if (!row || !session) return
      e.preventDefault()
      peekToggle({ session, row })
    }
    if (e.key === "Escape") hidePeek()
  }
  addEventListener("keydown", onKey)
  onCleanup(() => removeEventListener("keydown", onKey))

  return (
    <aside class="tds-sidebar" style={{ width: `${width()}px` }} aria-label="Chats">
      <div class="flex gap-6">
        <label class="tds-search tds-raise-1" data-filled={query() ? "" : undefined}>
          <Icon name="magnifying-glass" size="menu" class="tds-search-glyph" />
          <input ref={search} value={query()} onInput={(e) => setQuery(e.currentTarget.value)} placeholder="Search" aria-label="Search chats" onKeyDown={(e) => e.key === "Escape" && (setQuery(""), e.currentTarget.blur())} />
          <kbd class="tds-search-hint">⌘K</kbd>
        </label>
        <button type="button" class="tds-press grid size-new-chat flex-none place-items-center rounded-pill bg-glass text-tx2 tds-raise-1" aria-label="New chat" onClick={startChat}>
          <Icon name="note-pencil" size="menu" />
        </button>
      </div>

      <Pins show={query().trim() === ""} />
      <ToastRow show={query().trim() === ""} />

      <div class="relative -mx-12 min-h-0 flex-1" onPointerLeave={() => peekLeave()}>
        <Show
          when={entries().length > 0}
          fallback={
            <Show when={app.sessionsLoaded || query()} fallback={<RowSkeletons />}>
              <div class="px-12 py-36">
                <Empty art={query() ? "search" : "hi"} small />
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
                  <span class="tds-archive-count num"><TextMorph value={entry.count} /></span>
                  <Icon name="caret-down" size="chip" class="tds-archive-caret" />
                </button>
              ) : (
                <Row
                  session={entry.session}
                  selected={params.id === entry.session.id}
                  multi={selected().includes(entry.session.id)}
                  query={query()}
                  current={params.id}
                  navigate={navigate}
                />
              )
            }
          </VList>
        </Show>
      </div>

      <div class="tds-bulk tds-over" data-open={selected().length > 1 ? "" : undefined} role="toolbar" aria-label="Selected chats">
        <b class="num">
          <TextMorph value={`${selected().length} selected`} />
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
      <ResizeHandle width={width()} onWidth={setWidth} />
      <ThreadMenu />
      <MoveDialog />
      <Peek />
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
