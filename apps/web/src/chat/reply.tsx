import { createEffect, createSignal, For, onCleanup, onSettled, Show, untrack } from "solid-js"
import { createMenuController, Menu, MenuContent, MenuItem, MenuItemIcon } from "@ui-sdk/solid/menu"
import { Icon, type IconName } from "@tock/ui/icon"
import { dock, enter, flash, scrollBehavior } from "@tock/ui/motion"
import { tokens } from "@tock/tokens"
import { authorOf, excerpt, quoteFor, setQuote, type Quote } from "./quote"
import { plainText } from "../state/app"
import { setReplyHandler, type ReplyTarget } from "./reactions"

const focusComposer = () => document.querySelector<HTMLElement>(".tds-composer-wrap .ProseMirror")?.focus()

/** Starts a reply in the composer: the quote preview slides up and the caret lands in the field. */
export function reply(sessionId: string, quote: Quote) {
  setQuote(sessionId, quote)
  requestAnimationFrame(focusComposer)
}

const bubblesOf = (ref: string) => [...document.querySelectorAll<HTMLElement>(`.tds-column [data-ref="${CSS.escape(ref)}"]`)]

/** Scrolls the message with this ref into the middle of the chat and flashes it; mounts the rest of a long chat first if it isn't drawn yet. */
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
  const visible = view && box.top >= view.top && box.bottom <= view.bottom
  const play = () => found.forEach((el) => flash(el))
  if (visible || !scroller) return play(), true
  scroller.addEventListener("scrollend", play, { once: true })
  first.scrollIntoView({ block: "center", behavior: scrollBehavior() })
  return true
}

/** The compact quote above a sent message's text: a thin bar, who said it and one line of what they said. A click goes to the source. */
export function QuoteChip(props: { source: string; excerpt: string; exists: boolean }) {
  return (
    <button
      type="button"
      class="tds-quote-chip tds-press"
      data-gone={props.exists ? undefined : ""}
      disabled={!props.exists}
      aria-label={props.exists ? `Go to the quoted message from ${authorOf(props.source)}` : "The quoted message is no longer in this chat"}
      onClick={() => void jumpTo(props.source)}
    >
      <span class="tds-quote-bar" aria-hidden="true" />
      <span class="tds-quote-body">
        <b class="tds-quote-author">{props.exists ? authorOf(props.source) : "Message Removed"}</b>
        <span class="tds-quote-text">{props.exists ? props.excerpt : "The original is no longer in this chat"}</span>
      </span>
    </button>
  )
}

/** The reply preview docked above the composer: excerpt, author and a close. Esc or the close clears it. */
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
        <div ref={el} class="tds-quote-preview tds-over" role="group" aria-label={`Replying to ${authorOf(quote().ref)}`}>
          <span class="tds-quote-bar" aria-hidden="true" />
          <span class="tds-quote-body">
            <b class="tds-quote-author">
              <Icon name="arrow-bend-up-left" size="chip" /> Replying to {authorOf(quote().ref)}
            </b>
            <span class="tds-quote-text">{excerpt(quote().text)}</span>
          </span>
          <button type="button" class="tds-press tds-quote-close" aria-label="Clear Reply" data-tip="" data-tip-side="top" onMouseDown={(event) => event.preventDefault()} onClick={() => (clear(), focusComposer())}>
            <Icon name="x" size="chip" />
          </button>
        </div>
      )}
    </Show>
  )
}

const menuItems = (selected: string): readonly { value: string; icon: IconName; label: string }[] => [
  { value: "reply", icon: "arrow-bend-up-left", label: "Reply" },
  ...(selected ? [{ value: "quote", icon: "quotes", label: "Quote Selection" } as const] : []),
  { value: "copy", icon: "copy", label: selected ? "Copy Selection" : "Copy Text" },
]

const bubbleAt = (node: Node | null) => (node instanceof Element ? node : node?.parentElement)?.closest<HTMLElement>(".tds-column .tds-bubble[data-ref]:not([data-queued])") ?? undefined

/**
 * Reply from a message three ways: Reply on the message's hover rail (reactions.tsx hands it over through setReplyHandler),
 * the bubble's context menu, and a glass Quote / Reply pair over text you select in it. text(ref) gives the whole message for a reply.
 */
export function ReplyActions(props: { sessionId: string; scroller: () => HTMLElement | undefined; text: (ref: string) => string | undefined }) {
  const whole = (ref: string): Quote => ({ ref, text: plainText(props.text(ref) ?? "") })
  onSettled(() => void setReplyHandler(() => (target: ReplyTarget) => reply(untrack(() => props.sessionId), whole(target.ref))))
  onCleanup(() => setReplyHandler(undefined))
  const [picked, setPicked] = createSignal<{ ref: string; text: string; left: number; top: number }>()
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
    setPicked({ ref: from.dataset.ref!, text, left: box.left + box.width / 2, top: box.top })
    if (!was) requestAnimationFrame(() => bar && enter.menu(bar))
  }
  const onSelection = () => void (frame ||= requestAnimationFrame(readSelection))
  const onScroll = () => void (untrack(picked) && onSelection())
  const menu = createMenuController<{ ref: string; selected: string }>()
  const open = (event: MouseEvent) => {
    if (event.defaultPrevented || event.shiftKey || (event.target as Element).closest?.("a[data-link=web]")) return
    const bubble = bubbleAt(event.target as Node)
    if (!bubble) return
    event.preventDefault()
    const selection = getSelection()
    const selected = selection && !selection.isCollapsed && bubbleAt(selection.anchorNode)?.dataset.ref === bubble.dataset.ref ? selection.toString().trim() : ""
    const at = DOMRect.fromRect({ x: event.clientX, y: event.clientY, width: 0, height: 0 })
    void menu.open({ payload: { ref: bubble.dataset.ref!, selected }, anchor: { getBoundingClientRect: () => at } as Element })
  }
  /** The column reflows under a still selection (a reply lands, a block expands): follow it like a scroll. */
  const moved = new ResizeObserver(onScroll)
  let scroller: HTMLElement | undefined
  onSettled(() => {
    scroller = props.scroller()
    scroller?.addEventListener("scroll", onScroll, { passive: true })
    scroller?.addEventListener("contextmenu", open)
    document.addEventListener("selectionchange", onSelection)
    const column = scroller?.querySelector(".tds-column")
    if (column) moved.observe(column)
  })
  onCleanup(() => {
    scroller?.removeEventListener("scroll", onScroll)
    scroller?.removeEventListener("contextmenu", open)
    document.removeEventListener("selectionchange", onSelection)
    moved.disconnect()
    cancelAnimationFrame(frame)
  })
  const take = (quote: Quote) => {
    reply(props.sessionId, quote)
    getSelection()?.removeAllRanges()
  }
  const run = (action: string) => {
    const payload = menu.getPayload()
    if (!payload) return
    if (action === "reply") reply(props.sessionId, whole(payload.ref))
    if (action === "quote") reply(props.sessionId, { ref: payload.ref, text: payload.selected })
    if (action === "copy") void navigator.clipboard.writeText(payload.selected || (props.text(payload.ref) ?? ""))
  }
  return (
    <>
      <Show when={picked()}>
        {(at) => (
          <div ref={bar} class="tds-select-bar tds-over" role="toolbar" aria-label="Selection" style={{ left: `${at().left}px`, top: `${at().top - tokens.size["reply-gap"]}px` }} onPointerDown={(event) => event.preventDefault()}>
            <button type="button" class="tds-press tds-select-action" onClick={() => take({ ref: at().ref, text: at().text })}>
              <Icon name="quotes" size="menu" /> Quote
            </button>
            <button type="button" class="tds-press tds-select-action" onClick={() => take(whole(at().ref))}>
              <Icon name="arrow-bend-up-left" size="menu" /> Reply
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
