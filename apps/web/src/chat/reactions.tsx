import { createEffect, createMemo, createSignal, For, onCleanup, onSettled, Show, untrack } from "solid-js"
import { Portal, type JSX } from "@solidjs/web"
import { Icon } from "@tock/ui/icon"
import { expandTo, growFrom, spring, TextMorph, watchLayout } from "@tock/ui/motion"
import { createPopoverController, Popover, PopoverContent } from "@ui-sdk/solid/popover"
import { tokens } from "@tock/tokens"
import { toast } from "../shell/toasts"
import { addComment, commentsOf, deleteComment, pillsOf, reacted, settledSince, setReaction } from "../state/reactions"

/** The quick-react bar: the six everyday reactions, then + for the picker. */
export const QUICK = ["👍", "❤️", "😂", "😮", "😢", "🙏"] as const

/** The picker: a curated grid of common emojis, searchable by name. No emoji dataset dependency. */
export const EMOJIS: readonly (readonly [emoji: string, name: string])[] = [
  ["👍", "thumbs up yes like"], ["❤️", "red heart love"], ["😂", "laughing tears joy"], ["😮", "surprised wow"], ["😢", "sad crying tear"], ["🙏", "pray thanks please"],
  ["🎉", "party tada celebrate"], ["🔥", "fire hot lit"], ["👏", "clap applause"], ["🙌", "raised hands hooray"], ["💯", "hundred perfect"], ["✅", "check done yes"],
  ["👀", "eyes looking"], ["🤔", "thinking hmm"], ["😊", "smile happy blush"], ["😍", "heart eyes love"], ["🥰", "smiling hearts love"], ["😎", "cool sunglasses"],
  ["🤯", "mind blown exploding"], ["😅", "sweat smile phew"], ["🙂", "slight smile"], ["😉", "wink"], ["😁", "grin beaming"], ["🤣", "rolling laughing rofl"],
  ["😬", "grimace yikes"], ["😴", "sleeping tired zzz"], ["🥲", "smile tear grateful"], ["😭", "sobbing loud cry"], ["😡", "angry mad"], ["🤝", "handshake deal"],
  ["👌", "ok perfect"], ["✌️", "peace victory"], ["🤞", "fingers crossed luck"], ["💪", "strong muscle flex"], ["👋", "wave hello bye"], ["👎", "thumbs down no dislike"],
  ["🚀", "rocket ship launch"], ["⭐", "star"], ["✨", "sparkles magic"], ["💡", "idea bulb"], ["🎯", "target bullseye"], ["🏆", "trophy win"],
  ["☕", "coffee"], ["🍕", "pizza"], ["🐛", "bug"], ["⚡", "lightning zap fast"], ["💀", "skull dead"], ["❓", "question"],
]

export interface ReplyTarget {
  readonly ref: string
  readonly side: "me" | "agent"
  readonly text: string
}

/**
 * The reply feature plugs in here: call setReplyHandler(fn) once and every message's rail shows Reply, which hands fn
 * the message it points at. Until it is set the rail shows only React and the time.
 */
export const [replyHandler, setReplyHandler] = createSignal<((target: ReplyTarget) => void) | undefined>()

const RECENT = "tock.recentReactions"

/** Emojis you reacted with, newest first, one picker row at most. */
export function recentReactions(): string[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(RECENT) ?? "[]")
    return Array.isArray(saved) ? saved.filter((item): item is string => typeof item === "string").slice(0, tokens.limit["react-cols"]) : []
  } catch {
    return []
  }
}

const remember = (emoji: string) => localStorage.setItem(RECENT, JSON.stringify([emoji, ...recentReactions().filter((item) => item !== emoji)].slice(0, tokens.limit["react-cols"])))

const timeOf = (at: number) => new Date(at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })

/**
 * Reactable units: every bubble of a message plus anything inside it marked data-react (code blocks, attachments).
 * Components only mark themselves; Message finds them, gives each a stable ref and owns the one hover bar.
 */
const UNIT = ":scope > .tds-bubble, [data-react]"

interface Unit {
  readonly el: HTMLElement
  readonly ref: string
  readonly label: string
  /** The message's direct child that holds the unit: its reactions and comments sit right under it. */
  readonly lane: HTMLElement
}

/**
 * A unit's ref is "<message ref>#<key>": key is the file id, or the unit's kind and ordinal ("code2"). The message's
 * last bubble keeps the bare message ref, so reactions made before units existed (and the agent's) stay where they were.
 */
export const messageRef = (ref: string) => ref.split("#", 1)[0]!

const sameUnits = (a: readonly Unit[], b: readonly Unit[]) => a.length === b.length && a.every((unit, i) => unit.el === b[i]!.el && unit.ref === b[i]!.ref && unit.lane === b[i]!.lane)

/** A message in the transcript: its units, the hover bar (React, Comment, Reply, time), and each unit's pills and comments. */
export function Message(props: { sessionId: string; side: "me" | "agent"; target?: string; at: number | null; text: string; children: JSX.Element }) {
  let root!: HTMLDivElement
  let bar: HTMLDivElement | undefined
  const [units, setUnits] = createSignal<readonly Unit[]>([])
  const [active, setActive] = createSignal<Unit>()
  const [spot, setSpot] = createSignal<{ x: number; y: number; mode: "side" | "corner" }>()
  const [held, setHeld] = createSignal(false)
  const [open, setOpen] = createSignal<{ anchor: HTMLButtonElement; unit: Unit }>()
  const [composing, setComposing] = createSignal<Unit>()
  const composer = createPopoverController<Unit>()

  const laneOf = (el: HTMLElement) => {
    let at = el
    while (at.parentElement && at.parentElement !== root) at = at.parentElement
    return at
  }
  const scan = () => {
    const target = untrack(() => props.target)
    const found = target ? [...root.querySelectorAll<HTMLElement>(UNIT)].filter((el) => el.closest(".tds-msg") === root && !el.closest(".tds-unit-deco")) : []
    const seen = new Map<string, number>()
    const keyed = found.map((el) => {
      const kind = el.dataset.react ?? "b"
      const n = (seen.get(kind) ?? 0) + 1
      seen.set(kind, n)
      return { el, kind, key: kind.includes(":") ? kind : `${kind}${n}` }
    })
    const main = keyed.findLast((unit) => unit.kind === "b") ?? keyed.at(-1)
    const next = keyed.map(({ el, key }, i): Unit => ({ el, ref: keyed[i] === main ? target! : `${target}#${key}`, label: el.dataset.reactLabel ?? "message", lane: laneOf(el) }))
    if (!sameUnits(next, untrack(units))) setUnits(next)
    place(untrack(decorated))
  }
  let frame = 0
  const observer = new MutationObserver((records) => {
    if (records.every((record) => record.target instanceof Element && record.target.closest(".tds-unit-deco, .tds-msg-rail"))) return
    frame ||= requestAnimationFrame(() => ((frame = 0), scan()))
  })
  onSettled(() => {
    scan()
    observer.observe(root, { childList: true, subtree: true })
  })
  createEffect(
    () => props.target,
    () => void (frame ||= requestAnimationFrame(() => ((frame = 0), scan()))),
  )

  /** Lanes holding a unit with pills or comments, each with its units in order. */
  const decorated = createMemo(() => {
    const lanes = new Map<HTMLElement, Unit[]>()
    for (const unit of units()) {
      if (pillsOf(props.sessionId, unit.ref).length === 0 && commentsOf(props.sessionId, unit.ref).length === 0) continue
      const list = lanes.get(unit.lane) ?? []
      lanes.set(unit.lane, [...list, unit])
    }
    return [...lanes].map(([lane, list]) => ({ lane, units: list, shared: units().filter((unit) => unit.lane === lane).length > 1 }))
  })
  /** Each decorated lane gets a slot right after it, in flow, so its notes take real room under the unit. */
  const slots = new Map<HTMLElement, HTMLDivElement>()
  const slotFor = (lane: HTMLElement) => {
    let slot = slots.get(lane)
    if (!slot) {
      slot = document.createElement("div")
      slot.className = "tds-unit-deco"
      slot.dataset.side = untrack(() => props.side)
      slots.set(lane, slot)
    }
    return slot
  }
  const place = (groups: readonly { lane: HTMLElement }[]) => {
    const live = new Set(groups.map((group) => group.lane))
    for (const [lane, slot] of slots) {
      if (live.has(lane) && lane.isConnected) continue
      slot.remove()
      slots.delete(lane)
    }
    for (const lane of live) {
      const slot = slotFor(lane)
      if (slot.previousElementSibling === lane) continue
      const fresh = !slot.isConnected
      lane.after(slot)
      if (fresh && settledSince(untrack(() => props.sessionId))) queueMicrotask(() => slot.isConnected && expandTo(slot, 0, slot.offsetHeight))
    }
  }
  createEffect(decorated, (groups) => place(groups))
  onCleanup(() => {
    observer.disconnect()
    cancelAnimationFrame(frame)
    for (const slot of slots.values()) slot.remove()
  })

  const unitAt = (node: EventTarget | null) => {
    const list = untrack(units)
    for (let at = node instanceof Element ? node : null; at && at !== root; at = at.parentElement) {
      const unit = list.find((item) => item.el === at)
      if (unit) return unit
    }
    return undefined
  }
  /** The bar sits beside the unit when the column has room (a bubble), else on its top corner (a full-width code block). */
  const activate = (unit: Unit | undefined) => {
    if (!unit || !bar) return
    if (unit !== untrack(active)) setActive(unit)
    const box = root.getBoundingClientRect()
    const at = unit.el.getBoundingClientRect()
    const gap = tokens.space[8] ?? 8
    const w = bar.offsetWidth
    const h = bar.offsetHeight
    const top = at.top - box.top
    const beside = top + Math.min(at.height, h * 2) / 2 - h / 2
    if (props.side === "agent")
      setSpot(box.right - at.right >= w + gap ? { x: at.right - box.left + gap, y: beside, mode: "side" } : { x: at.right - box.left - w - gap, y: top - h / 2, mode: "corner" })
    else setSpot(at.left - box.left >= w + gap ? { x: at.left - box.left - w - gap, y: beside, mode: "side" } : { x: at.left - box.left + gap, y: top - h / 2, mode: "corner" })
  }
  const busy = () => untrack(open) !== undefined || untrack(composing) !== undefined || untrack(held)
  const rest = () => {
    if (busy() || root.matches(":hover") || bar?.contains(document.activeElement)) return
    setActive(undefined)
  }

  let press = 0
  const touchDown = (event: PointerEvent) => {
    if (event.pointerType !== "touch") return
    const unit = unitAt(event.target)
    if (!unit) return
    clearTimeout(press)
    press = window.setTimeout(() => (activate(unit), setHeld(true)), tokens.motion.duration["long-press"])
  }
  const cancel = () => clearTimeout(press)
  const outside = (event: PointerEvent) => {
    if (untrack(held) && !root.contains(event.target as Node)) (setHeld(false), setActive(undefined))
  }
  document.addEventListener("pointerdown", outside, true)
  onCleanup(() => (cancel(), document.removeEventListener("pointerdown", outside, true)))

  const closePicker = (refocus: boolean) => {
    const anchor = untrack(open)?.anchor
    setOpen(undefined)
    setHeld(false)
    if (refocus) anchor?.focus()
    else queueMicrotask(rest)
  }
  const toggle = (ref: string, emoji: string) => {
    const sessionId = untrack(() => props.sessionId)
    const on = !reacted(sessionId, ref, emoji)
    void setReaction(sessionId, ref, emoji, on)
    if (on) remember(emoji)
    if (!on) toast("Reaction removed", { description: emoji, id: `reaction:${ref}`, action: { label: "Undo", run: () => void setReaction(sessionId, ref, emoji, true) } })
  }
  const startComment = (unit: Unit) => {
    setComposing(unit)
    void composer.open({ payload: unit, anchor: unit.el }).then(() => {
      setComposing(undefined)
      setHeld(false)
      queueMicrotask(rest)
    })
  }
  const pop = (el: HTMLElement) => {
    if (!settledSince(untrack(() => props.sessionId))) return
    queueMicrotask(() => el.isConnected && spring(el, [{ opacity: 0, scale: tokens.motion["pop-from"] }, { opacity: 1, scale: 1 }], "press"))
  }
  const mainUnit = () => untrack(units).find((unit) => unit.ref === untrack(() => props.target)) ?? untrack(units).at(-1)

  return (
    <div
      ref={root}
      class="tds-msg"
      data-side={props.side}
      data-held={held() || open() || composing() ? "" : undefined}
      onPointerOver={(event) => activate(unitAt(event.target))}
      onPointerLeave={rest}
      onPointerDown={touchDown}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onPointerMove={cancel}
      onContextMenu={(event) => held() && event.preventDefault()}
      onFocusIn={(event) => activate(unitAt(event.target) ?? (bar?.contains(event.target as Node) ? (untrack(active) ?? mainUnit()) : undefined))}
      onFocusOut={(event) => !root.contains(event.relatedTarget as Node) && queueMicrotask(rest)}
    >
      {props.children}
      <Show when={props.target}>
        <div
          ref={bar}
          class="tds-msg-rail"
          role="toolbar"
          aria-label="Message actions"
          data-on={active() ? "" : undefined}
          data-mode={spot()?.mode}
          style={{ left: `${spot()?.x ?? 0}px`, top: `${spot()?.y ?? 0}px` }}
        >
          <button
            type="button"
            class="tds-msg-action tds-press"
            aria-label="React"
            aria-haspopup="menu"
            aria-expanded={open() ? "true" : "false"}
            data-tip=""
            data-tip-side="top"
            onClick={(event) => {
              const anchor = event.currentTarget
              const unit = untrack(active) ?? mainUnit()
              setOpen((now) => (now || !unit ? undefined : { anchor, unit }))
            }}
          >
            <Icon name="smiley" size="menu" />
          </button>
          <button
            type="button"
            class="tds-msg-action tds-press"
            aria-label="Comment"
            aria-haspopup="dialog"
            aria-expanded={composing() ? "true" : "false"}
            data-tip=""
            data-tip-side="top"
            onClick={() => {
              const unit = untrack(active) ?? mainUnit()
              if (unit) startComment(unit)
            }}
          >
            <Icon name="chat-circle" size="menu" />
          </button>
          <Show when={replyHandler()}>
            {(reply) => (
              <button type="button" class="tds-msg-action tds-press" aria-label="Reply" data-tip="" data-tip-side="top" onClick={() => reply()({ ref: props.target!, side: props.side, text: props.text })}>
                <Icon name="arrow-bend-up-left" size="menu" />
              </button>
            )}
          </Show>
          <Show when={props.at}>{(at) => <time class="tds-msg-time num" datetime={new Date(at()).toISOString()}>{timeOf(at())}</time>}</Show>
        </div>
        <Popover controller={composer}>
          <PopoverContent class="tds-comment-pop" data-material="solid" aria-label="Add a comment" side="bottom" align={props.side === "me" ? "end" : "start"} sideOffset={tokens.space[6]} initialFocus="[data-autofocus]">
            <CommentForm label={composing()?.label ?? "message"} onSave={async (text) => {
              const unit = untrack(composing)
              if (!unit) return
              if (await addComment(untrack(() => props.sessionId), unit.ref, text)) composer.close()
              else toast("Comment not saved", { description: "Check your connection and try again." })
            }} onCancel={() => composer.close()} />
          </PopoverContent>
        </Popover>
      </Show>
      <For each={decorated()} keyed={(group) => group.lane}>
        {(group) => (
          <Portal mount={slotFor(group().lane)}>
            <For each={group().units} keyed={(unit) => unit.ref}>
              {(unit) => (
                <div class="tds-unit-notes" data-whole={unit().el === unit().lane ? "" : undefined} onPointerEnter={() => activate(unit())}>
                  <Show when={pillsOf(props.sessionId, unit().ref).length > 0 || (group().shared && unit().el !== unit().lane)}>
                    <div class="tds-react-pills" role="group" aria-label={`Reactions on ${unit().label}`} ref={(el) => void watchLayout(el, ".tds-react-pill")}>
                      <Show when={group().shared && unit().el !== unit().lane}>
                        <span class="tds-unit-label">{unit().label}</span>
                      </Show>
                      <For each={pillsOf(props.sessionId, unit().ref)} keyed={(pill) => pill.emoji}>
                        {(pill) => (
                          <button
                            ref={pop}
                            type="button"
                            class="tds-react-pill tds-press"
                            data-id={pill().emoji}
                            data-mine={pill().mine ? "" : undefined}
                            aria-pressed={pill().mine ? "true" : "false"}
                            aria-label={`${pill().emoji} ${pill().count}${pill().mine ? ", you reacted" : ""}`}
                            onClick={() => toggle(unit().ref, pill().emoji)}
                          >
                            <span class="tds-react-pill-emoji">{pill().emoji}</span>
                            <span class="tds-react-pill-count num" data-empty={pill().count > 1 ? undefined : ""}>
                              <TextMorph value={pill().count > 1 ? String(pill().count) : ""} mode="roll" />
                            </span>
                          </button>
                        )}
                      </For>
                    </div>
                  </Show>
                  <Show when={commentsOf(props.sessionId, unit().ref).length > 0}>
                    <ul class="tds-comments" aria-label={`Comments on ${unit().label}`}>
                      <For each={commentsOf(props.sessionId, unit().ref)} keyed={(comment) => comment.id}>
                        {(comment) => (
                          <li ref={pop} class="tds-comment">
                            <span class="tds-comment-meta">
                              <span class="tds-comment-author">{comment().by === "toast" ? "toast" : "You"}</span>
                              <time class="num" datetime={new Date(comment().at).toISOString()}>{timeOf(comment().at)}</time>
                              <button type="button" class="tds-comment-delete tds-press" aria-label="Delete comment" data-tip="" data-tip-side="top" onClick={() => void deleteComment(untrack(() => props.sessionId), comment())}>
                                <Icon name="trash" size="toast" />
                              </button>
                            </span>
                            <p class="tds-comment-text" dir="auto">{comment().text}</p>
                          </li>
                        )}
                      </For>
                    </ul>
                  </Show>
                </div>
              )}
            </For>
          </Portal>
        )}
      </For>
      <Show when={open()}>
        {(picking) => <ReactBar anchor={picking().anchor} side={props.side} isOn={(emoji) => reacted(props.sessionId, picking().unit.ref, emoji)} onPick={(emoji) => (toggle(picking().unit.ref, emoji), closePicker(false))} onClose={closePicker} />}
      </Show>
    </div>
  )
}

/** The anchored comment composer: Enter saves, Shift+Enter breaks the line, Escape closes. */
function CommentForm(props: { label: string; onSave: (text: string) => Promise<void>; onCancel: () => void }) {
  const [text, setText] = createSignal("")
  const [saving, setSaving] = createSignal(false)
  const save = async () => {
    const body = untrack(text).trim()
    if (!body || untrack(saving)) return
    setSaving(true)
    await props.onSave(body)
    setSaving(false)
  }
  return (
    <form
      class="tds-comment-form"
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      <textarea
        data-autofocus=""
        class="tds-comment-field"
        maxlength={tokens.limit["comment-chars"]}
        aria-label={`Comment on ${props.label}`}
        placeholder={`Comment on ${props.label}`}
        value={text()}
        onInput={(event) => setText(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || event.shiftKey || event.isComposing) return
          event.preventDefault()
          void save()
        }}
      />
      <div class="tds-comment-actions">
        <button type="button" class="tds-comment-button tds-press" onClick={() => props.onCancel()}>
          Cancel
        </button>
        <button type="submit" class="tds-comment-button tds-press" data-primary="" data-empty={text().trim() ? undefined : ""} aria-disabled={saving() ? "true" : undefined}>
          Comment
        </button>
      </div>
    </form>
  )
}

/** The glass quick-react bar under the React button; + turns it into the picker in place. */
function ReactBar(props: { anchor: HTMLElement; side: "me" | "agent"; isOn: (emoji: string) => boolean; onPick: (emoji: string) => void; onClose: (refocus: boolean) => void }) {
  let surface!: HTMLDivElement
  let search: HTMLInputElement | undefined
  const [mode, setMode] = createSignal<"quick" | "picker">("quick")
  const [query, setQuery] = createSignal("")
  const [place, setPlace] = createSignal({ x: 0, y: 0, above: false })
  const found = () => {
    const words = query().trim().toLowerCase()
    return words ? EMOJIS.filter(([emoji, name]) => name.includes(words) || emoji === words) : EMOJIS
  }
  const items = () => [...surface.querySelectorAll<HTMLElement>("[data-pick]")]
  const recent = recentReactions()
  const columns = { "grid-template-columns": `repeat(${tokens.limit["react-cols"]}, var(--tds-size-react-cell))` }
  /** Up and Down go to the nearest cell in the row above or below, so the short Recently Used row and the grid share one keyboard model. */
  const vertical = (list: HTMLElement[], from: HTMLElement, dir: 1 | -1) => {
    const a = from.getBoundingClientRect()
    const rows = list.map((el) => ({ el, box: el.getBoundingClientRect() })).filter(({ box }) => (dir > 0 ? box.top >= a.bottom - 1 : box.bottom <= a.top + 1))
    const row = dir > 0 ? Math.min(...rows.map(({ box }) => box.top)) : Math.max(...rows.map(({ box }) => box.top))
    return rows.filter(({ box }) => box.top === row).sort((x, y) => Math.abs(x.box.left - a.left) - Math.abs(y.box.left - a.left))[0]?.el
  }
  const measure = () => {
    const box = props.anchor.getBoundingClientRect()
    const gap = tokens.space[6] ?? 0
    const above = box.bottom + gap + surface.offsetHeight > innerHeight
    setPlace({ x: props.side === "agent" ? box.left : box.right, y: above ? box.top - gap : box.bottom + gap, above })
  }
  onSettled(() => {
    measure()
    items()[0]?.focus()
  })
  const outside = (event: PointerEvent) => {
    if (!surface.contains(event.target as Node) && !props.anchor.contains(event.target as Node)) props.onClose(false)
  }
  const scrolled = (event: Event) => {
    if (!surface.contains(event.target as Node)) props.onClose(false)
  }
  document.addEventListener("pointerdown", outside, true)
  document.addEventListener("scroll", scrolled, true)
  onCleanup(() => (document.removeEventListener("pointerdown", outside, true), document.removeEventListener("scroll", scrolled, true)))
  const openPicker = (from: HTMLElement) => {
    setMode("picker")
    requestAnimationFrame(() => {
      measure()
      growFrom(surface, from, "popover")
    })
  }
  const keys = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault()
      event.stopPropagation()
      return props.onClose(true)
    }
    const list = items()
    const at = list.indexOf(document.activeElement as HTMLElement)
    const step: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1 }
    if (document.activeElement === search) {
      if (event.key === "ArrowDown" || event.key === "Enter") {
        event.preventDefault()
        if (event.key === "Enter" && list[0]) return props.onPick(list[0].dataset.pick ?? "")
        list[0]?.focus()
      }
      return
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault()
      return list[event.key === "Home" ? 0 : list.length - 1]?.focus()
    }
    if (at < 0) return
    const by = step[event.key]
    if (by !== undefined) {
      event.preventDefault()
      return list[(at + by + list.length) % list.length]?.focus()
    }
    if (untrack(mode) === "quick" || (event.key !== "ArrowDown" && event.key !== "ArrowUp")) return
    event.preventDefault()
    const next = vertical(list, list[at]!, event.key === "ArrowDown" ? 1 : -1)
    if (next) next.focus()
    else if (event.key === "ArrowUp") search?.focus()
  }
  return (
    <Portal>
      <div
        ref={surface}
        class="tds-react-bar"
        role={mode() === "quick" ? "menu" : "dialog"}
        aria-label={mode() === "quick" ? "React" : "Pick a Reaction"}
        data-mode={mode()}
        data-side={props.side}
        data-above={place().above ? "" : undefined}
        style={{ left: `${place().x}px`, top: `${place().y}px` }}
        onKeyDown={keys}
      >
        <Show
          when={mode() === "picker"}
          fallback={
            <div class="tds-react-quick">
              <For each={QUICK} keyed={false}>
                {(emoji) => (
                  <button type="button" role="menuitem" class="tds-react-emoji tds-press" data-pick={emoji()} data-on={props.isOn(emoji()) ? "" : undefined} aria-label={emoji()} onClick={() => props.onPick(emoji())}>
                    {emoji()}
                  </button>
                )}
              </For>
              <button type="button" role="menuitem" class="tds-react-more tds-press" data-pick="" aria-label="More Reactions" onClick={(event) => openPicker(event.currentTarget)}>
                <Icon name="plus" size="row" />
              </button>
            </div>
          }
        >
          <input ref={(el) => ((search = el), queueMicrotask(() => el.focus()))} class="tds-react-search" type="search" aria-label="Search Emoji" placeholder="Search emoji" autocomplete="off" value={query()} onInput={(event) => setQuery(event.currentTarget.value)} />
          <Show when={!query().trim() && recent.length > 0}>
            <p class="tds-react-label">Recently Used</p>
            <div class="tds-react-grid tds-react-recent" role="group" aria-label="Recently Used" style={columns}>
              <For each={recent} keyed={false}>
                {(emoji) => (
                  <button type="button" class="tds-react-emoji tds-press" data-pick={emoji()} data-on={props.isOn(emoji()) ? "" : undefined} aria-label={emoji()} onClick={() => props.onPick(emoji())}>
                    {emoji()}
                  </button>
                )}
              </For>
            </div>
          </Show>
          <Show when={found().length > 0} fallback={<p class="tds-react-none">No emoji matches “{query().trim()}”</p>}>
            <div class="tds-react-grid" role="group" aria-label="Emoji" style={columns}>
              <For each={found()} keyed={(entry) => entry[0]}>
                {(entry) => (
                  <button type="button" class="tds-react-emoji tds-press" data-pick={entry()[0]} data-on={props.isOn(entry()[0]) ? "" : undefined} aria-label={entry()[1].split(" ")[0]} title={entry()[1].split(" ")[0]} onClick={() => props.onPick(entry()[0])}>
                    {entry()[0]}
                  </button>
                )}
              </For>
            </div>
          </Show>
        </Show>
      </div>
    </Portal>
  )
}
