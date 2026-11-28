import { createMemo, createSignal, For, onCleanup, Show, untrack } from "solid-js"
import { Icon, type IconName } from "@tock/ui/icon"
import { MorphIcon } from "@tock/ui/morph-icon"
import { Swap } from "@tock/ui/swap"
import { TextMorph } from "@tock/ui/text-morph"
import { dur, enter, exit, prefersReducedMotion, animate, lockAxis, velocityTracker } from "@tock/ui/motion"
import { tokens } from "@tock/tokens"

export type Tone = "done" | "mono" | "failed" | "working" | "needs" | "rose"
type Glyph = IconName | "spin"

interface Item {
  readonly key: number
  readonly id: string
  readonly title: string
  readonly description?: string
  readonly tone: Tone
  readonly icon: Glyph
  readonly action?: { readonly label: string; readonly run: () => void }
  readonly group?: string
  readonly plural?: (count: number) => string
  readonly count: number
  readonly hold: boolean
  readonly gone?: "swipe" | "fade"
}

interface Clock {
  full: number
  left: number
  at: number
  timer?: ReturnType<typeof setTimeout>
  card?: HTMLElement
}

export interface ToastOptions {
  description?: string
  tone?: Tone
  icon?: Glyph
  duration?: number
  action?: { label: string; run: () => void }
  id?: string
  /** Toasts of one group merge into one, counting up: "Archived 3 chats". */
  group?: string
  plural?: (count: number) => string
  /** Progress toasts stay until updated with hold: false. */
  hold?: boolean
}

const [items, setItems] = createSignal<Item[]>([])
const [expanded, setExpanded] = createSignal(false)
const held = { over: false, hidden: false }
const [heights, setHeights] = createSignal<Record<string, number>>({})
const clocks = new Map<string, Clock>()
let serial = 0

const alive = () => untrack(items).filter((item) => !item.gone)
const revisions = new Map<string, number>()
const patch = (id: string, change: (item: Item) => Item) => {
  revisions.set(id, (revisions.get(id) ?? 0) + 1)
  setItems((all) => all.map((item) => (item.id === id ? change(item) : item)))
}

function arm(id: string, full?: number) {
  const clock = clocks.get(id)
  const item = alive().find((entry) => entry.id === id)
  if (!clock || !item) return
  clearTimeout(clock.timer)
  if (full !== undefined) clock.full = clock.left = full
  clock.timer = undefined
  clock.at = Date.now()
  if (held.over || held.hidden || item.hold) return
  clock.timer = setTimeout(() => dismissToast(id), clock.left)
}

function hold(reason: keyof typeof held, on: boolean) {
  if (held[reason] === on) return
  const wasHeld = held.over || held.hidden
  held[reason] = on
  if (reason === "over") setExpanded(on)
  const isHeld = held.over || held.hidden
  if (wasHeld === isHeld) return
  for (const [id, clock] of clocks) {
    if (!isHeld) {
      arm(id)
      continue
    }
    if (clock.timer === undefined) continue
    clearTimeout(clock.timer)
    clock.timer = undefined
    clock.left = Math.max(tokens.motion.duration.confirm, clock.left - (Date.now() - clock.at))
  }
}

export const isToastOpen = (id: string) => alive().some((item) => item.id === id)

/** ⌘Z outside text fields runs the newest Undo, so the undo window is reachable from the keyboard (sonner's Alt+T idea). */
export function undoNewest(): boolean {
  const item = alive().find((entry) => entry.action?.label === "Undo")
  if (!item?.action) return false
  item.action.run()
  return true
}

export function dismissToast(id: string, swiped = false) {
  const clock = clocks.get(id)
  if (!clock || !alive().some((item) => item.id === id)) return
  clearTimeout(clock.timer)
  serial += 1
  const ghost = `${id}~${serial}`
  clocks.delete(id)
  revisions.delete(id)
  setItems((all) => all.map((item) => (item.id === id ? { ...item, id: ghost, gone: swiped ? "swipe" : "fade" } : item)))
  const done = () => setItems((all) => all.filter((item) => item.id !== ghost))
  if (clock.card) exit.toast(clock.card, swiped).finished.then(done, done)
  else done()
}

/** One toast for every confirmation, after TDS px1: a stack at the top right that fans out on hover. */
export function toast(title: string, options: ToastOptions = {}): string {
  const twin = alive().find((item) => (options.id && item.id === options.id) || (options.group && item.group === options.group))
  const full = options.duration ?? tokens.motion.toast.default
  if (twin) {
    const count = options.group && twin.group === options.group ? twin.count + 1 : 1
    patch(twin.id, (item) => ({
      ...item,
      title: count > 1 && options.plural ? options.plural(count) : title,
      description: options.description,
      tone: options.tone ?? "done",
      icon: options.icon ?? "check",
      action: options.action,
      hold: options.hold ?? false,
      count,
    }))
    const card = clocks.get(twin.id)?.card
    if (card && !prefersReducedMotion()) animate(card, [{ scale: "1.02" }, { scale: "1" }], { duration: dur.layout, easing: tokens.motion.curve.out, composite: "add" })
    arm(twin.id, full)
    return twin.id
  }
  serial += 1
  const id = options.id ?? `toast-${serial}`
  clocks.set(id, { full, left: full, at: Date.now() })
  setItems((all) => [
    { key: serial, id, title, description: options.description, tone: options.tone ?? "done", icon: options.icon ?? "check", action: options.action, group: options.group, plural: options.plural, count: 1, hold: options.hold ?? false },
    ...all,
  ])
  queueMicrotask(() => arm(id))
  return id
}

/** Turn a toast into its next state: the icon swaps, the title rolls, the timer restarts. */
export function updateToast(id: string, title: string, options: Omit<ToastOptions, "id" | "group" | "plural"> = {}) {
  if (!alive().some((item) => item.id === id)) return toast(title, options)
  patch(id, (item) => ({ ...item, title, description: options.description, tone: options.tone ?? "done", icon: options.icon ?? "check", action: options.action, hold: options.hold ?? false, count: 1 }))
  arm(id, options.duration ?? tokens.motion.toast.default)
  return id
}

function Card(props: { item: Item; index: number; offset: number }) {
  let start: { x: number; y: number } | undefined
  let axis: "x" | "y" | undefined
  const flick = velocityTracker()
  const [dx, setDx] = createSignal(0)
  const [dragging, setDragging] = createSignal(false)
  const release = () => {
    if (!start) return
    start = undefined
    setDragging(false)
    const moved = untrack(dx)
    if (axis === "x" && moved > 0 && (moved > tokens.size.swipe || flick.get() > tokens.motion.gesture["toast-flick"])) dismissToast(untrack(() => props.item.id), true)
    else setDx(0)
  }
  // Measures the content, not the card: a collapsed back card is held at the newest one's height.
  const observer = new ResizeObserver(([entry]) => setHeights((all) => ({ ...all, [props.item.id]: Math.ceil(entry!.borderBoxSize[0]!.blockSize) })))
  onCleanup(() => observer.disconnect())
  const mount = (el: HTMLDivElement) => {
    const clock = clocks.get(untrack(() => props.item.id))
    if (clock) clock.card = el
    queueMicrotask(() => enter.toast(el))
  }
  const act = () => {
    const id = props.item.id
    const before = revisions.get(id)
    props.item.action?.run()
    if (revisions.get(id) === before) dismissToast(id)
  }
  return (
    <div
      ref={mount}
      class="tds-toast tds-over"
      role="status"
      data-toast-id={props.item.id}
      data-front={props.index === 0 ? "" : undefined}
      data-back={props.index > 0 ? "" : undefined}
      data-hidden={props.index > 2 ? "" : undefined}
      data-gone={props.item.gone}
      data-swiping={dragging() ? "" : undefined}
      style={{ "--toast-index": props.index, "--toast-offset": `${props.offset}px`, "--toast-h": heights()[props.item.id] ? `${heights()[props.item.id]}px` : undefined, "--toast-swipe-x": `${dx()}px`, opacity: dx() > 0 ? Math.max(0.2, 1 - dx() / (tokens.size.swipe * 4)) : undefined }}
      onPointerDown={(e) => {
        if (e.button !== 0 || (e.target as Element).closest("button")) return
        start = { x: e.clientX, y: e.clientY }
        axis = undefined
        flick.reset()
        flick.push(e.clientX, e.timeStamp)
      }}
      onPointerMove={(e) => {
        if (!start) return
        const moved = e.clientX - start.x
        axis ??= lockAxis(moved, e.clientY - start.y)
        if (axis !== "x") return
        if (!untrack(dragging)) (e.currentTarget.setPointerCapture(e.pointerId), setDragging(true))
        flick.push(e.clientX, e.timeStamp)
        setDx(moved > 0 ? moved : moved * tokens.motion.gesture.rubber)
      }}
      onPointerUp={() => release()}
      onPointerCancel={() => ((axis = undefined), release())}
    >
      <div ref={(el) => observer.observe(el)} class="tds-toast-inner">
        <span class={`tds-tint tds-tint-${props.item.tone} tds-toast-glyph`}>
          <Swap on={props.item.icon !== "spin"} a={<span class="tds-spinner" />} b={<MorphIcon name={props.item.icon === "spin" ? "check" : props.item.icon} size="toast-glyph" />} />
        </span>
        <span class="tds-toast-body">
          <span class="tds-toast-head">
            <b class="tds-toast-title">
              <TextMorph value={props.item.title} mode="calm" />
            </b>
            <Show when={props.item.count > 1 && !props.item.plural}>
              <span class="tds-toast-count num">
                ×<TextMorph value={props.item.count} mode="roll" />
              </span>
            </Show>
          </span>
          <Show when={props.item.description}>
            <span class="tds-toast-line" dir="auto">{props.item.description}</span>
          </Show>
        </span>
        <Show when={props.item.action}>
          <button type="button" class="tds-toast-action tds-press" onClick={() => act()}>
            {props.item.action?.label}
          </button>
        </Show>
        <button type="button" class="tds-toast-close" aria-label="Close" onClick={() => dismissToast(props.item.id)}>
          <Icon name="x" size="chip" />
        </button>
      </div>
    </div>
  )
}

export function Toasts() {
  const layout = createMemo(() => {
    const all = items()
    const size = heights()
    let offset = 0
    let index = 0
    const placed = new Map<string, { index: number; offset: number }>()
    for (const item of all) {
      if (item.gone) {
        placed.set(item.id, { index: 0, offset: 0 })
        continue
      }
      placed.set(item.id, { index, offset })
      offset += size[item.id] ?? tokens.size["toast-min"]
      index += 1
    }
    const front = all.find((item) => !item.gone)
    return { placed, count: index, stack: offset, front: front ? (size[front.id] ?? tokens.size["toast-min"]) : 0 }
  })
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || e.defaultPrevented) return
    if ([...document.querySelectorAll('[role="menu"], [role="dialog"], [role="alertdialog"], [role="listbox"]')].some((el) => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && el.getBoundingClientRect().width > 0)) return
    const newest = alive()[0]
    if (newest) dismissToast(newest.id)
  }
  const onVisibility = () => hold("hidden", document.hidden)
  document.addEventListener("keydown", onKey)
  document.addEventListener("visibilitychange", onVisibility)
  onCleanup(() => (document.removeEventListener("keydown", onKey), document.removeEventListener("visibilitychange", onVisibility)))
  return (
    <section
      class="tds-toasts"
      aria-live="polite"
      aria-label="Notifications"
      data-expanded={expanded() ? "" : undefined}
      style={{ "--toast-count": layout().count, "--toast-stack-height": `${layout().stack}px`, "--toast-front-height": `${layout().front}px`, "--toast-peek": Math.min(Math.max(layout().count - 1, 0), 2) }}
      onMouseEnter={() => hold("over", true)}
      onMouseLeave={(e) => !e.currentTarget.contains(document.activeElement) && hold("over", false)}
      onFocusIn={() => hold("over", true)}
      onFocusOut={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && !e.currentTarget.matches(":hover") && hold("over", false)}
    >
      <For each={items()} keyed={(item) => item.key}>
        {(item) => <Card item={item()} index={layout().placed.get(item().id)?.index ?? 0} offset={layout().placed.get(item().id)?.offset ?? 0} />}
      </For>
    </section>
  )
}

