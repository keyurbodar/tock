import { createMemo, createSignal, For, onCleanup, Show, untrack } from "solid-js"
import { Icon, type IconName } from "@tock/ui/icon"
import { MorphIcon } from "@tock/ui/morph-icon"
import { Swap } from "@tock/ui/swap"
import { TextMorph } from "@tock/ui/text-morph"
import { dur, enter, exit, prefersReducedMotion } from "@tock/motion"
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
  bar?: HTMLElement
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
const [hovered, setHovered] = createSignal(false)
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
  clock.at = Date.now()
  clock.bar?.getAnimations().forEach((a) => a.cancel())
  if (untrack(hovered) || item.hold) return
  clock.timer = setTimeout(() => dismissToast(id), clock.left)
  clock.bar?.animate([{ scale: `${clock.left / clock.full} 1` }, { scale: "0 1" }], { duration: clock.left, fill: "forwards" })
}

export const isToastOpen = (id: string) => alive().some((item) => item.id === id)

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
    if (card && !prefersReducedMotion()) card.animate([{ scale: "1.02" }, { scale: "1" }], { duration: dur.layout, easing: tokens.motion.curve.out, composite: "add" })
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

function hover(on: boolean) {
  setHovered(on)
  for (const [id, clock] of clocks) {
    if (on) {
      clearTimeout(clock.timer)
      clock.left = Math.max(tokens.motion.duration.confirm, clock.left - (Date.now() - clock.at))
      clock.bar?.getAnimations().forEach((a) => a.pause())
    } else arm(id)
  }
}

function Card(props: { item: Item; index: number; offset: number }) {
  let card!: HTMLDivElement
  let start: number | undefined
  const [dx, setDx] = createSignal(0)
  const observer = new ResizeObserver(() => setHeights((all) => ({ ...all, [props.item.id]: card.offsetHeight })))
  onCleanup(() => observer.disconnect())
  const mount = (el: HTMLDivElement) => {
    card = el
    const clock = clocks.get(untrack(() => props.item.id))
    if (clock) clock.card = el
    observer.observe(el)
    queueMicrotask(() => enter.toast(el))
  }
  const bar = (el: HTMLElement) => {
    const clock = clocks.get(untrack(() => props.item.id))
    if (clock) clock.bar = el
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
      data-swiping={start !== undefined && dx() !== 0 ? "" : undefined}
      style={{ "--toast-index": props.index, "--toast-offset": `${props.offset}px`, "--toast-swipe-x": `${dx()}px`, opacity: dx() > 0 ? Math.max(0.2, 1 - dx() / (tokens.size.swipe * 4)) : undefined }}
      onPointerDown={(e) => {
        if ((e.target as Element).closest("button")) return
        start = e.clientX
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        if (start === undefined) return
        const moved = e.clientX - start
        setDx(moved > 0 ? moved : moved * 0.2)
      }}
      onPointerUp={() => {
        if (start === undefined) return
        start = undefined
        if (untrack(dx) > tokens.size.swipe) dismissToast(props.item.id, true)
        else setDx(0)
      }}
      onPointerCancel={() => ((start = undefined), setDx(0))}
    >
      <span class={`tds-tint tds-tint-${props.item.tone} size-toast-icon tds-toast-glyph`}>
        <Swap on={props.item.icon !== "spin"} a={<span class="tds-spinner" />} b={<MorphIcon name={props.item.icon === "spin" ? "check" : props.item.icon} size="toast" />} />
      </span>
      <span class="tds-toast-body">
        <b class="tds-toast-head">
          <span class="tds-toast-title">
            <TextMorph value={props.item.title} />
          </span>
          <Show when={props.item.count > 1 && !props.item.plural}>
            <span class="tds-toast-count num">
              <TextMorph value={props.item.count} />
            </span>
          </Show>
        </b>
        <Show when={props.item.description}>
          <span class="tds-toast-line">{props.item.description}</span>
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
      <Show when={!props.item.hold}>
        <span class="tds-toast-progress">
          <i ref={bar} />
        </span>
      </Show>
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
  document.addEventListener("keydown", onKey)
  onCleanup(() => document.removeEventListener("keydown", onKey))
  return (
    <section
      class="tds-toasts"
      aria-live="polite"
      aria-label="Notifications"
      data-expanded={hovered() ? "" : undefined}
      style={{ "--toast-count": layout().count, "--toast-stack-height": `${layout().stack}px`, "--toast-front-height": `${layout().front}px`, "--toast-peek": Math.min(Math.max(layout().count - 1, 0), 2) }}
      onMouseEnter={() => hover(true)}
      onMouseLeave={() => hover(false)}
      onFocusIn={() => hover(true)}
      onFocusOut={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && hover(false)}
    >
      <For each={items()} keyed={(item) => item.key}>
        {(item) => <Card item={item()} index={layout().placed.get(item().id)?.index ?? 0} offset={layout().placed.get(item().id)?.offset ?? 0} />}
      </For>
    </section>
  )
}

