import { createEffect, createSignal, For, onCleanup, onSettled, Show, untrack } from "solid-js"
import { createMenuController, Menu, MenuContent, MenuItem, MenuItemIcon } from "@ui-sdk/solid/menu"
import { Icon, type IconName } from "@tock/ui/icon"
import { dock, enter, flash, scrollBehavior } from "@tock/ui/motion"
import { tokens } from "@tock/tokens"
import { authorOf, excerpt, quoteFor, setQuote, type Quote, type QuoteKind } from "./quote"
import { MorphIcon } from "@tock/ui/morph-icon"
import { plainText } from "../state/app"
import { setReplyHandler, type ReplyTarget } from "./reactions"

const focusComposer = () => document.querySelector<HTMLElement>(".tds-composer-wrap .ProseMirror")?.focus()

export function reply(sessionId: string, quote: Quote) {
  setQuote(sessionId, quote)
  requestAnimationFrame(focusComposer)
}

const bubblesOf = (ref: string) => [...document.querySelectorAll<HTMLElement>(`.tds-column [data-ref="${CSS.escape(ref)}"]`)]

export async function jumpTo(ref: string) {
  let found = bubblesOf(ref)
  if (found.length === 0) {
    dispatchEvent(new Event("tds-transcript-all"))
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
    found = bubblesOf(ref)
  }
  const first = found[0]
  if (!first) return false
  const scroller = first.closest<HTMLElement>(".tds-transcript")
  const box = first.getBoundingClientRect()
  const view = scroller?.getBoundingClientRect()
  const visible = view && box.top >= view.top + tokens.size["column-top"] && box.bottom <= view.bottom - tokens.size["column-bottom"]
  const play = () => found.forEach((el) => flash(el))
  if (visible || !scroller) return play(), true
  scroller.addEventListener("scrollend", play, { once: true })
  first.scrollIntoView({ block: "center", behavior: scrollBehavior() })
  return true
}

/**
 * A reply's quote inside the sent bubble, Telegram's: a tinted card with the accent bar down its left edge, the author in
 * the accent over one line of what was said. A code block quotes in mono, media shows its picture as a thumbnail, and a
 * quoted selection carries a quote glyph in its corner. Clicking scrolls to the original and gives its row a brief band.
 */
export function QuoteChip(props: { source: string; excerpt: string; kind?: QuoteKind; partial?: boolean; exists: boolean }) {
  const [thumb, setThumb] = createSignal<string>()
  onSettled(() => {
    if (props.kind === "media" && props.exists) requestAnimationFrame(() => setThumb(thumbOf(props.source)))
  })
  return (
    <button
      type="button"
      class="tds-quote-chip tds-press"
      data-kind={props.kind ?? "text"}
      data-gone={props.exists ? undefined : ""}
      disabled={!props.exists}
      aria-label={props.exists ? `Go to quoted message from ${authorOf(props.source)}` : "Quoted message removed"}
      onClick={() => void jumpTo(props.source)}
    >
      <Show when={thumb()}>{(src) => <img class="tds-quote-thumb" src={src()} alt="" draggable={false} />}</Show>
      <span class="tds-quote-body">
        <b class="tds-quote-author">{props.exists ? authorOf(props.source) : "Message removed"}</b>
        <span class="tds-quote-text">{props.exists ? props.excerpt : "Original message is no longer in this channel"}</span>
      </span>
      <Show when={props.partial}>
        <Icon name="quotes" size="chip" class="tds-quote-mark" />
      </Show>
    </button>
  )
}

export function QuotePreview(props: { sessionId: string }) {
  const [shown, setShown] = createSignal<Quote>()
  let el: HTMLDivElement | undefined
  let leaving: Animation | undefined

  createEffect(
    () => quoteFor(props.sessionId),
    (quote) => {
      if (quote) {
        leaving?.cancel()
        leaving = undefined
        const fresh = !untrack(shown)
        setShown(quote)
        if (fresh) requestAnimationFrame(() => el && dock.in(el))
        return
      }
      if (!untrack(shown) || !el) return void setShown(undefined)
      leaving = dock.out(el)
      leaving.finished.then(() => setShown(undefined), () => undefined)
    },
  )

  const clear = () => setQuote(props.sessionId, undefined)
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || event.defaultPrevented || event.isComposing || !quoteFor(props.sessionId)) return
    if (document.querySelector('.tds-suggest, .tds-held, [role="menu"], [role="dialog"], .tds-peek')) return
    event.preventDefault()
    event.stopPropagation()
    clear()
  }
  addEventListener("keydown", onKey, { capture: true })
  onCleanup(() => removeEventListener("keydown", onKey, { capture: true }))

  return (
    <Show when={shown()}>
      {(quote) => (
        <div ref={el} class="tds-quote-preview" data-kind={quote().kind ?? "text"} role="group" aria-label={`Replying to ${authorOf(quote().ref)}`}>
          <Icon name={quote().partial ? "quotes" : "arrow-bend-up-left"} size="composer" class="tds-quote-lead" />
          <span class="tds-quote-card">
            <Show when={quote().kind === "media" && thumbOf(quote().ref)}>{(src) => <img class="tds-quote-thumb" src={src()} alt="" draggable={false} />}</Show>
            <span class="tds-quote-body">
              <b class="tds-quote-author">{quote().partial ? `Quote from ${authorOf(quote().ref)}` : `Reply to ${authorOf(quote().ref)}`}</b>
              <span class="tds-quote-text">{excerpt(quote().text)}</span>
            </span>
          </span>
          <button
            type="button"
            class="tds-press tds-quote-close"
            aria-label="Clear reply"
            data-tip="Clear reply"
            data-tip-side="top"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => (clear(), focusComposer())}
          >
            <MorphIcon name="x" size="chip" />
          </button>
        </div>
      )}
    </Show>
  )
}

const menuItems = (selected: string): readonly { value: string; icon: IconName; label: string }[] => [
  { value: "reply", icon: "arrow-bend-up-left", label: "Reply" },
  ...(selected ? [{ value: "quote", icon: "quotes", label: "Quote selection" } as const] : []),
  { value: "copy", icon: "copy", label: selected ? "Copy selection" : "Copy text" },
]

const bubbleAt = (node: Node | null) => (node instanceof Element ? node : node?.parentElement)?.closest<HTMLElement>(".tds-column [data-ref]:not([data-queued])") ?? undefined

/** What a reply is to, read off the element it starts from: a code block quotes its first line, media its file names. */
const fileNames = (el: Element) =>
  [...el.querySelectorAll<HTMLElement>("[data-name], img[alt], video[aria-label]")].map((node) => node.dataset.name || node.getAttribute("alt") || node.getAttribute("aria-label") || "").filter(Boolean)
export function quoteFrom(el: HTMLElement, text: (ref: string) => string | undefined): Quote {
  const ref = el.dataset.ref!
  if (el.dataset.kind === "code") {
    const code = el.querySelector("code")?.textContent ?? ""
    const lang = el.querySelector<HTMLElement>("[data-lang], .tds-code-lang")?.textContent?.trim()
    return { ref, kind: "code", text: `${lang ? `${lang}: ` : ""}${code.split("\n").find((line) => line.trim()) ?? "Code"}` }
  }
  if (el.dataset.kind === "media") {
    const names = fileNames(el)
    const photos = el.querySelectorAll("img").length
    const label = names.length === 1 ? names[0]! : photos && photos === names.length ? `${photos} photos` : `${Math.max(names.length, 1)} files`
    return { ref, kind: "media", text: label }
  }
  return { ref, kind: "text", text: plainText(text(ref) ?? "") }
}
/** The first picture inside a quoted message, for the card's thumbnail. */
const thumbOf = (ref: string) => bubblesOf(ref).map((el) => el.querySelector<HTMLImageElement>("img")?.currentSrc).find(Boolean)

export function ReplyActions(props: { sessionId: string; scroller: () => HTMLElement | undefined; text: (ref: string) => string | undefined }) {
  const whole = (ref: string, el?: HTMLElement): Quote => (el ? quoteFrom(el, props.text) : { ref, kind: "text", text: plainText(props.text(ref) ?? "") })
  onSettled(() => void setReplyHandler(() => (target: ReplyTarget) => reply(untrack(() => props.sessionId), whole(target.ref, bubblesOf(target.ref)[0]))))
  onCleanup(() => setReplyHandler(undefined))

  const [picked, setPicked] = createSignal<{ ref: string; text: string; left: number; top: number; below: boolean }>()
  let bar: HTMLDivElement | undefined
  let frame = 0

  const readSelection = () => {
    frame = 0
    const selection = getSelection()
    const text = selection?.toString().trim() ?? ""
    const from = bubbleAt(selection?.anchorNode ?? null)
    const to = bubbleAt(selection?.focusNode ?? null)
    if (!selection || selection.isCollapsed || !text || !from || from.dataset.ref !== to?.dataset.ref || from.closest(".tds-quote-chip")) return void setPicked(undefined)
    const box = selection.getRangeAt(0).getBoundingClientRect()
    const settling = from.getAnimations()
    if (settling.length) void Promise.all(settling.map((animation) => animation.finished)).then(onSelection, () => undefined)
    const was = untrack(picked)
    const header = document.querySelector(".tds-header-band")?.getBoundingClientRect().bottom ?? 0
    const below = box.top - tokens.size["reply-gap"] - tokens.size["select-bar"] < header
    setPicked({ ref: from.dataset.ref!, text, left: box.left + box.width / 2, top: below ? box.bottom + tokens.size["reply-gap"] : box.top - tokens.size["reply-gap"], below })
    if (!was) requestAnimationFrame(() => bar && enter.menu(bar))
  }

  const onSelection = () => void (frame ||= requestAnimationFrame(readSelection))
  const onScroll = () => void (untrack(picked) && onSelection())
  const menu = createMenuController<{ ref: string; selected: string }>()
  let target: HTMLElement | undefined

  const onContextMenu = (event: MouseEvent) => {
    if (event.defaultPrevented || event.shiftKey || (event.target as Element).closest?.("a[data-link=web]")) return
    const bubble = bubbleAt(event.target as Node)
    if (!bubble) return
    target = bubble
    event.preventDefault()
    const selection = getSelection()
    const selected = selection && !selection.isCollapsed && bubbleAt(selection.anchorNode)?.dataset.ref === bubble.dataset.ref ? selection.toString().trim() : ""
    const at = DOMRect.fromRect({ x: event.clientX, y: event.clientY, width: 0, height: 0 })
    void menu.open({ payload: { ref: bubble.dataset.ref!, selected }, anchor: { getBoundingClientRect: () => at } as Element })
  }

  const onDblClick = (event: MouseEvent) => {
    if ((event.target as Element).closest?.("a, button, .tds-quote-chip")) return
    const bubble = bubbleAt(event.target as Node)
    if (!bubble?.dataset.ref) return
    const sel = getSelection()
    if (sel && !sel.isCollapsed && sel.toString().trim().length > 0) return
    reply(props.sessionId, whole(bubble.dataset.ref, bubble))
  }

  const moved = new ResizeObserver(onScroll)
  let scroller: HTMLElement | undefined
  onSettled(() => {
    scroller = props.scroller()
    scroller?.addEventListener("scroll", onScroll, { passive: true })
    scroller?.addEventListener("contextmenu", onContextMenu)
    scroller?.addEventListener("dblclick", onDblClick)
    document.addEventListener("selectionchange", onSelection)
    const column = scroller?.querySelector(".tds-column")
    if (column) moved.observe(column)
  })
  onCleanup(() => {
    scroller?.removeEventListener("scroll", onScroll)
    scroller?.removeEventListener("contextmenu", onContextMenu)
    scroller?.removeEventListener("dblclick", onDblClick)
    document.removeEventListener("selectionchange", onSelection)
    moved.disconnect()
    cancelAnimationFrame(frame)
  })

  const take = (quote: Quote) => {
    reply(props.sessionId, quote)
    getSelection()?.removeAllRanges()
  }

  const copySelection = (text: string) => {
    void navigator.clipboard.writeText(text)
    getSelection()?.removeAllRanges()
    setPicked(undefined)
  }

  const run = (action: string) => {
    const payload = menu.getPayload()
    if (!payload) return
    if (action === "reply") reply(props.sessionId, whole(payload.ref, target?.dataset.ref === payload.ref ? target : undefined))
    if (action === "quote") reply(props.sessionId, { ref: payload.ref, text: payload.selected, kind: target?.dataset.kind === "code" ? "code" : "text", partial: true })
    if (action === "copy") void navigator.clipboard.writeText(payload.selected || (props.text(payload.ref) ?? ""))
  }

  return (
    <>
      <Show when={picked()}>
        {(at) => (
          <div
            ref={bar}
            class="tds-select-bar tds-over"
            role="toolbar"
            aria-label="Selection actions"
            data-below={at().below ? "" : undefined}
            style={{ left: `${at().left}px`, top: `${at().top}px` }}
            onPointerDown={(event) => event.preventDefault()}
          >
            <button type="button" class="tds-press tds-select-action" onClick={() => take({ ref: at().ref, text: at().text, kind: "text", partial: true })}>
              <Icon name="quotes" size="chip" />
              <span>Quote</span>
            </button>
            <button type="button" class="tds-press tds-select-action" onClick={() => take(whole(at().ref))}>
              <Icon name="arrow-bend-up-left" size="chip" />
              <span>Reply</span>
            </button>
            <button type="button" class="tds-press tds-select-action" onClick={() => copySelection(at().text)}>
              <Icon name="copy" size="chip" />
              <span>Copy</span>
            </button>
          </div>
        )}
      </Show>
      <Menu controller={menu} onAction={(value) => run(String(value))}>
        <MenuContent<{ ref: string; selected: string }> class="tds-menu tds-over" align="start" sideOffset={tokens.size["menu-offset"]}>
          {(state) => (
            <For each={menuItems(state.payload?.selected ?? "")} keyed={(item) => item.value}>
              {(item) => (
                <MenuItem value={item().value} class="tds-menu-item">
                  <MenuItemIcon class="tds-menu-icon">
                    <Icon name={item().icon} size="menu" />
                  </MenuItemIcon>
                  {item().label}
                </MenuItem>
              )}
            </For>
          )}
        </MenuContent>
      </Menu>
    </>
  )
}
