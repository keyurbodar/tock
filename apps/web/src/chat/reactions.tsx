import { createEffect, createMemo, createSignal, For, onCleanup, onSettled, Show, untrack } from "solid-js"
import { Portal, type JSX } from "@solidjs/web"
import { Icon } from "@tock/ui/icon"
import { expandTo, growFrom, measure, spring, TextMorph, watchLayout } from "@tock/ui/motion"
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

/**
 * Where CSS anchor positioning is missing (Firefox), the rail and pills are placed from JS: each message measures its last
 * bubble in the motion library's measure batch and hands the box to CSS as --a-l/t/w/h. Dev builds can force the path
 * with localStorage["tock.anchorless"] = "1" so a journey can prove it in Chrome.
 */
const anchorless = (import.meta.env.DEV && localStorage.getItem("tock.anchorless") === "1") || !CSS.supports("anchor-name: --a")
if (anchorless) document.documentElement.setAttribute("data-anchorless", "")

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
    if (on) remember(emoji)
    if (!on) toast("Reaction removed", { description: emoji, id: `reaction:${ref}`, action: { label: "Undo", run: () => void setReaction(sessionId, ref, emoji, true) } })
  }
  const has = createMemo(() => pillsOf(props.sessionId, props.target).length > 0)
  let room!: HTMLDivElement
  let roomy = false
  /** The pill row needs room under the bubble; it grows in on the layout curve so a bottom-stuck chat glides up instead of jumping. */
  createEffect(has, (on) => {
    if (on === roomy) return
    roomy = on
    place()
    const reserve = tokens.size["react-pill"] - tokens.size["react-pill-overlap"]
    if (settledSince(untrack(() => props.sessionId))) expandTo(room, on ? 0 : reserve, on ? reserve : 0)
  })
  const place = () => {
    if (!anchorless) return
    measure(
      () => {
        const last = [...root.children].findLast((el): el is HTMLElement => el instanceof HTMLElement && !el.matches(".tds-msg-rail, .tds-react-pills, .tds-react-room"))
        return last && { l: last.offsetLeft, t: last.offsetTop, w: last.offsetWidth, h: last.offsetHeight }
      },
      (box) => {
        if (!box) return
        for (const [key, value] of Object.entries(box)) root.style.setProperty(`--a-${key}`, `${value}px`)
      },
    )
  }
  if (anchorless) {
    const resized = new ResizeObserver(place)
    onSettled(() => resized.observe(root))
    onCleanup(() => resized.disconnect())
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
      onPointerEnter={place}
      onFocusIn={place}
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
      <div ref={room} class="tds-react-room" data-on={has() ? "" : undefined} aria-hidden="true" />
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
