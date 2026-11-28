import { Empty } from "../chat/empty"
import { animate, inertiaTail, lockAxis, Skeleton, spring, springEasing, swipeDecision, swipeOffset, swipeStage, swipeThresholds, velocityTracker, type SwipeStage } from "@tock/ui/motion"
import { createEffect, createMemo, createSignal, For, Show, untrack } from "solid-js"
import { useNavigate, useParams } from "@solidjs/router"

import { MenuTrigger } from "@ui-sdk/solid/menu"
import { Icon } from "@tock/ui/icon"
import { Orb } from "@tock/ui/orb"
import { tokens } from "@tock/tokens"
import { TextMorph } from "@tock/ui/text-morph"
import { glyphFor } from "../lib/glyph"
import { statusOf } from "../lib/status"
import { pressable } from "../lib/keys"
import { app, newThreadId, titleOf, updateThread, type Session } from "../state/app"
import { dirOf } from "../lib/dir"
import { minute } from "../lib/clock"
import { archive, doomed, markRead, pin, remove, renaming, selected, setRenaming, setSelected, takeEntering, threadAction, threadMenu, ThreadMenu } from "./thread-menu"
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
/** Collapsing keeps the choice across reloads; the shell animates width and opacity, the contents keep their own width so nothing reflows mid-slide. */
export const toggleSidebar = (next = !untrack(sidebarOpen)) => {
  setOpen(next)
  localStorage.setItem(OPEN_KEY, next ? "1" : "0")
  // the button that was pressed goes inert or away, so focus moves to the toggle that undoes it
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
      aria-label="Chat name"
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
let closeOpenSwipe: (() => void) | undefined
let suppressClick = false
const swallowClick = () => ((suppressClick = true), requestAnimationFrame(() => requestAnimationFrame(() => (suppressClick = false))))


const orbOf = (session: Session) => {
  const status = statusOf(session)
  return status === "working" || status === "needs" ? status : undefined
}

function Row(props: { session: Session; selected: boolean; multi: boolean; current: string | undefined; navigate: (to: string) => void }) {
  const glyph = () => glyphFor(props.session.id)
  let wrap!: HTMLDivElement
  let row!: HTMLAnchorElement
  let left!: HTMLDivElement
  let right!: HTMLDivElement
  let icon!: HTMLSpanElement
  let start: { x: number; y: number; from: number; id: number; mouse: boolean } | undefined
  const speed = velocityTracker()
  let mode: "swipe" | "drag" | undefined
  let x = 0
  let stage: SwipeStage = 0
  let ghost: HTMLElement | undefined
  const limits = () => swipeThresholds(row.offsetWidth)
  const actionFor = (side: number, at: 1 | 2) => (side > 0 ? (at === 1 ? "unread" : "pin") : at === 1 ? "archive" : "delete")

  /** Crossing a threshold shows the action that release would run: its pill takes the strip and pops, before you let go. */
  const arm = (next: SwipeStage) => {
    if (next === stage) return
    stage = next
    wrap.dataset.armed = next ? String(next) : ""
    if (!next) return
    const pill = wrap.querySelector(`.tds-swipe-side[data-side="${x > 0 ? "left" : "right"}"] [data-stage="${next}"] .tds-swipe-body`)
    if (pill) spring(pill, [{ scale: 1 }, { scale: 1.16 }, { scale: 1 }], "press")
    try {
      navigator.vibrate?.(tokens.motion.gesture.frame / 2)
    } catch {}
  }
  const paint = (next: number, settle = false) => {
    x = next
    const { easing, duration } = springEasing("snappy")
    const ease = settle ? `${duration}ms ${easing}` : "0s"
    row.style.transition = `transform ${ease}`
    row.style.transform = next ? `translateX(${next}px)` : ""
    for (const [side, w] of [[left, Math.max(0, next)], [right, Math.max(0, -next)]] as const) {
      side.style.transition = `width ${ease}`
      side.style.width = `${w}px`
      side.style.setProperty("--w", `${w}px`)
    }
    wrap.toggleAttribute("data-swiping", next !== 0)
    arm(settle ? 0 : swipeStage(next, limits()))
  }
  const close = () => {
    paint(0, true)
    if (closeOpenSwipe === close) closeOpenSwipe = undefined
  }
  const rest = () => {
    paint(Math.sign(x) * limits().rest, true)
    closeOpenSwipe = close
    const outside = (e: PointerEvent) => {
      if (wrap.contains(e.target as Node)) return
      removeEventListener("pointerdown", outside, true)
      if (closeOpenSwipe === close) close()
    }
    addEventListener("pointerdown", outside, true)
  }
  const act = (action: string) => {
    const session = untrack(() => props.session)
    const from = { rect: icon.getBoundingClientRect(), glyph: icon.innerHTML }
    if (!wrap.dispatchEvent(new CustomEvent("tds-swipe", { bubbles: true, cancelable: true, detail: action }))) return close()
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
  const release = (velocity: number) => {
    const decision = swipeDecision(x, velocity, limits())
    wrap.dispatchEvent(new CustomEvent("tds-swipe-release", { bubbles: true, detail: decision.kind }))
    if (decision.kind === "commit") return act(actionFor(x, decision.stage))
    if (decision.kind === "open") return rest()
    close()
  }

  let wheel: { lock?: "x" | "y"; sx: number; sy: number; acc: number; spent: boolean; tail: ReturnType<typeof inertiaTail>; idle?: ReturnType<typeof setTimeout> } | undefined
  /**
   * Trackpad swipe: the axis locks once the summed deltas leave the dead zone. When the deltas start decaying smoothly
   * (the OS inertia tail after the fingers lift), the row settles from where the finger let go and the rest of the tail
   * is swallowed, so momentum never pushes a swipe into the next action. A vertical scroll closes an open row.
   */
  const onWheel = (e: WheelEvent) => {
    if (renaming() === untrack(() => props.session.id) || start) return
    wheel ??= { sx: 0, sy: 0, acc: x, spent: false, tail: inertiaTail() }
    const current = wheel
    clearTimeout(current.idle)
    current.idle = setTimeout(() => {
      wheel = undefined
      if (current.lock === "x" && !current.spent) release(0)
    }, D["wheel-idle"])
    if (!current.lock) {
      current.sx -= e.deltaX
      current.sy += e.deltaY
      current.lock = lockAxis(current.sx, current.sy)
      if (!current.lock) return Math.abs(e.deltaX) > Math.abs(e.deltaY) && e.preventDefault()
      if (current.lock === "x") {
        if (closeOpenSwipe && closeOpenSwipe !== close) closeOpenSwipe()
        hidePeek()
      }
    }
    if (current.lock === "y") return void (x !== 0 && close())
    e.preventDefault()
    if (current.spent) return
    const letGo = current.tail.push(e.deltaX, current.acc)
    if (letGo !== undefined) {
      current.spent = true
      paint(swipeOffset(letGo, limits()))
      return release(0)
    }
    current.acc -= e.deltaX
    paint(swipeOffset(current.acc, limits()))
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
    animate(g, [{ translate: "0 0" }, { translate: `0 ${row.getBoundingClientRect().top - parseFloat(g.style.top)}px` }], { duration: D.layout, easing: curve.sheet, fill: "forwards" }).onfinish = () => g.remove()
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
        hidePeek()
        e.currentTarget.querySelector<HTMLElement>(".tds-row-more")?.click()
      }}
    >
      <div class="tds-swipe" aria-hidden="true">
        <div class="tds-swipe-side" data-side="left" ref={left}>
          <button type="button" tabindex="-1" class="tds-swipe-act" data-act="pin" data-stage="2" onClick={() => act("pin")}>
            <span class="tds-swipe-body">
              <Icon name="push-pin" size="code-action" />
              Pin
            </span>
          </button>
          <button type="button" tabindex="-1" class="tds-swipe-act" data-act="unread" data-stage="1" onClick={() => act("unread")}>
            <span class="tds-swipe-body">
              <Icon name="circle" size="code-action" />
              {props.session.meta.unread ? "Read" : "Unread"}
            </span>
          </button>
        </div>
        <div class="tds-swipe-side" data-side="right" ref={right}>
          <button type="button" tabindex="-1" class="tds-swipe-act" data-act="archive" data-stage="1" onClick={() => act("archive")}>
            <span class="tds-swipe-body">
              <Icon name="archive" size="code-action" />
              Archive
            </span>
          </button>
          <button type="button" tabindex="-1" class="tds-swipe-act" data-act="delete" data-stage="2" onClick={() => act("delete")}>
            <span class="tds-swipe-body">
              <Icon name="trash" size="code-action" />
              Delete
            </span>
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
        data-status={statusOf(props.session) === "idle" ? undefined : statusOf(props.session)}
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
          speed.reset()
          speed.push(e.clientX, e.timeStamp)
          mode = undefined
        }}
        onPointerMove={(e) => {
          if (!start) return
          const dx = e.clientX - start.x
          const dy = e.clientY - start.y
          if (!mode) {
            const axis = lockAxis(dx, dy)
            if (!axis) return
            if (axis === "x") {
              mode = "swipe"
              start.x += Math.sign(dx) * tokens.motion.gesture["swipe-dead"]
              hidePeek()
            } else if (start.mouse && untrack(() => !props.session.meta.archived)) {
              mode = "drag"
              dragStart(e)
            } else return void (start = undefined)
            try {
              e.currentTarget.setPointerCapture(start.id)
            } catch {}
          }
          speed.push(e.clientX, e.timeStamp)
          if (mode === "swipe") paint(swipeOffset(start.from + e.clientX - start.x, limits()))
          else dragMove(e)
        }}
        onPointerUp={() => {
          if (mode) swallowClick()
          if (mode === "swipe") release(speed.get())
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
          <Icon name={glyph().icon} size="channel" />
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
  const [archiveOpen, setArchiveOpen] = createSignal(false)

  const visible = createMemo(() => app.sessions.filter((s) => !doomed().includes(s.id) && !((s.meta.snoozedUntil ?? 0) > minute())))
  const entries = createMemo<Entry[]>(() => {
    const list = visible().filter((s) => !s.meta.pinned || s.meta.archived)
    const rows = list.filter((s) => !s.meta.archived).map(rowEntry)
    const archived = list.filter((s) => s.meta.archived)
    if (archived.length === 0) return archiveOpen() ? [...rows, archiveEntry(0), ARCHIVE_EMPTY] : rows
    return [...rows, archiveEntry(archived.length), ...(archiveOpen() ? archived.map(rowEntry) : [])]
  })
  /** The open chat's row stays in view when the chat changes by keyboard (⌥↑↓) or anywhere else; a row already visible doesn't move. */
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
            aria-label={archiveOpen() ? "Hide archived" : "Show archived"}
            aria-pressed={archiveOpen() ? "true" : "false"}
            data-tip=""
            data-tip-side="bottom"
            onClick={() => setArchiveOpen((open) => !open)}
          >
            <Icon name="funnel-simple" size="bar" />
          </button>
        </div>

        <div class="tds-chs" onPointerLeave={() => peekLeave()}>
          <Skeleton fill label="Loading channels" loading={!app.sessionsLoaded && entries().length === 0} sample={() => <SampleRows />}>
            <div class="h-full">
              <Show
                when={entries().length > 0}
                fallback={
                  <div class="px-12 py-36">
                    <Empty art="hi" small />
                  </div>
                }
              >
                {/* A plain keyed list: rows keep their identity, so scrolling and selection never re-create them (the virtual list re-mounted rows every frame). */}
                <div ref={roster} class="tds-roster tds-scroll h-full" tabindex="-1" data-edge-fade="y">
                  <For each={entries()}>
                    {(item) => {
                      const entry = untrack(item)
                      if (entry.kind === "archive-empty")
                        return (
                          <div class="tds-archive-empty">
                            <Empty art="archive" small />
                          </div>
                        )
                      if (entry.kind === "archive")
                        return (
                          <button type="button" class="tds-archive-head" aria-expanded={archiveOpen() ? "true" : "false"} onClick={() => setArchiveOpen((open) => !open)}>
                            <Icon name="archive" size="channel" />
                            <span>Archive</span>
                            <span class="tds-archive-count num">{entry.count}</span>
                            <Icon name="caret-down" size="chip" class="tds-archive-caret" />
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

/** Notifications live in the sidebar strip now the rail is gone: a blue dot while anything is unread. */
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

/** Sample rows through the row's own classes, so each bone sits where a loaded row will. */
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
