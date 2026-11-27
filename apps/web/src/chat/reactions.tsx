import { createSignal, For, onCleanup, onSettled, Show, untrack } from "solid-js"
import { Portal, type JSX } from "@solidjs/web"
import { Icon } from "@tock/ui/icon"
import { growFrom, spring, TextMorph, watchLayout } from "@tock/ui/motion"
import { tokens } from "@tock/tokens"
import { toast } from "../shell/toasts"
import { pillsOf, reacted, settledSince, setReaction } from "../state/reactions"

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

const timeOf = (at: number) => new Date(at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })

/** A message in the transcript: its bubbles, the hover rail (React, Reply, time) and the reaction pills on its edge. */
export function Message(props: { sessionId: string; side: "me" | "agent"; target?: string; at: number | null; text: string; children: JSX.Element }) {
  let root!: HTMLDivElement
  const [open, setOpen] = createSignal<HTMLButtonElement>()
  const [held, setHeld] = createSignal(false)
  let press = 0
  const touchDown = (event: PointerEvent) => {
    if (event.pointerType !== "touch" || !untrack(() => props.target)) return
    clearTimeout(press)
    press = window.setTimeout(() => setHeld(true), tokens.motion.duration["long-press"])
  }
  const cancel = () => clearTimeout(press)
  const outside = (event: PointerEvent) => {
    if (untrack(held) && !root.contains(event.target as Node)) setHeld(false)
  }
  document.addEventListener("pointerdown", outside, true)
  onCleanup(() => (cancel(), document.removeEventListener("pointerdown", outside, true)))
  const close = (refocus: boolean) => {
    const anchor = untrack(open)
    setOpen(undefined)
    setHeld(false)
    if (refocus) anchor?.focus()
  }
  const toggle = (emoji: string) => {
    const ref = untrack(() => props.target)
    if (!ref) return
    const sessionId = untrack(() => props.sessionId)
    const on = !reacted(sessionId, ref, emoji)
    void setReaction(sessionId, ref, emoji, on)
    if (!on) toast("Reaction removed", { description: emoji, id: `reaction:${ref}`, action: { label: "Undo", run: () => void setReaction(sessionId, ref, emoji, true) } })
  }
  const pop = (el: HTMLElement) => {
    if (!settledSince(untrack(() => props.sessionId))) return
    queueMicrotask(() => el.isConnected && spring(el, [{ opacity: 0, scale: tokens.motion["pop-from"] }, { opacity: 1, scale: 1 }], "press"))
  }
  return (
    <div
      ref={root}
      class="tds-msg"
      data-side={props.side}
      data-held={held() || open() ? "" : undefined}
      onPointerDown={touchDown}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onPointerMove={cancel}
      onContextMenu={(event) => held() && event.preventDefault()}
    >
      {props.children}
      <Show when={props.target}>
        {(target) => (
          <div class="tds-msg-rail">
            <button
              type="button"
              class="tds-msg-action tds-press"
              aria-label="React"
              aria-haspopup="menu"
              aria-expanded={open() ? "true" : "false"}
              data-tip=""
              data-tip-side="top"
              onClick={(event) => {
                const button = event.currentTarget
                setOpen((now) => (now ? undefined : button))
              }}
            >
              <Icon name="smiley" size="row" />
            </button>
            <Show when={replyHandler()}>
              {(reply) => (
                <button type="button" class="tds-msg-action tds-press" aria-label="Reply" data-tip="" data-tip-side="top" onClick={() => reply()({ ref: target(), side: props.side, text: props.text })}>
                  <Icon name="arrow-bend-up-left" size="row" />
                </button>
              )}
            </Show>
            <Show when={props.at}>{(at) => <time class="tds-msg-time num" datetime={new Date(at()).toISOString()}>{timeOf(at())}</time>}</Show>
          </div>
        )}
      </Show>
      <Show when={pillsOf(props.sessionId, props.target).length > 0}>
        <div class="tds-react-pills" role="group" aria-label="Reactions" ref={(el) => void watchLayout(el, ".tds-react-pill")}>
          <For each={pillsOf(props.sessionId, props.target)} keyed={(pill) => pill.emoji}>
            {(pill) => (
              <button
                ref={pop}
                type="button"
                class="tds-react-pill tds-press"
                data-id={pill().emoji}
                data-mine={pill().mine ? "" : undefined}
                aria-pressed={pill().mine ? "true" : "false"}
                aria-label={`${pill().emoji} ${pill().count}${pill().mine ? ", you reacted" : ""}`}
                onClick={() => toggle(pill().emoji)}
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
      <Show when={open()}>
        {(anchor) => <ReactBar anchor={anchor()} side={props.side} isOn={(emoji) => reacted(props.sessionId, props.target ?? "", emoji)} onPick={(emoji) => (toggle(emoji), close(false))} onClose={close} />}
      </Show>
    </div>
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
      search?.focus()
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
    const cols = untrack(mode) === "quick" ? list.length : tokens.limit["react-cols"]
    const step: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }
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
    const by = step[event.key]
    if (by === undefined || at < 0) return
    event.preventDefault()
    if (untrack(mode) === "quick") return list[(at + by + list.length) % list.length]?.focus()
    const next = at + by
    if (next < 0) return search?.focus()
    list[Math.min(next, list.length - 1)]?.focus()
  }
  return (
    <Portal>
      <div
        ref={surface}
        class="tds-react-bar tds-glass tds-raise-glass"
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
          <input ref={search} class="tds-react-search" type="search" aria-label="Search Emoji" placeholder="Search emoji" autocomplete="off" value={query()} onInput={(event) => setQuery(event.currentTarget.value)} />
          <Show when={found().length > 0} fallback={<p class="tds-react-none">No emoji matches “{query().trim()}”</p>}>
            <div class="tds-react-grid" role="group" aria-label="Emoji" style={{ "grid-template-columns": `repeat(${tokens.limit["react-cols"]}, var(--tds-size-react-cell))` }}>
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
