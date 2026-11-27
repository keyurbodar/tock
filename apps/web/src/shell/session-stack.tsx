import { createMemo, createSignal, For, onCleanup, Show } from "solid-js"
import { Portal } from "@solidjs/web"
import { useNavigate } from "@solidjs/router"
import { backdrop } from "@tock/ui/motion"
import { Icon } from "@tock/ui/icon"
import { tokens } from "@tock/tokens"
import { TextMorph } from "@tock/ui/text-morph"
import { glyphFor } from "../lib/glyph"
import { STATUS_LABEL, statusOf, type ChatStatus } from "../lib/status"
import { shortTime } from "../lib/time"
import { minute } from "../lib/clock"
import { app, titleOf, type Session } from "../state/app"
import { hidePeek } from "./peek"

type Status = ChatStatus
const statusName = STATUS_LABEL
const gap = tokens.size["session-gap"]
const edge = tokens.size["edge-fade"]

/**
 * The toast row, TDS px2 .me: mascot 36, "toast" 15/600 and a live status line. Holding it fans out the session
 * stack (px4 Stack) over the shared backdrop (the app scales back, blurs and dims). The stack scrolls when there are
 * more chats than fit, fades at the edge that has more, and scrolls itself while you hold near that edge.
 */
export function ToastRow(props: { show: boolean }) {
  const navigate = useNavigate()
  const [open, setOpen] = createSignal(false)
  const [hot, setHot] = createSignal<string>()
  const [pressed, setPressed] = createSignal(false)
  const [place, setPlace] = createSignal({ left: 0, top: 0, height: 0 })
  let row!: HTMLButtonElement
  let scroller!: HTMLDivElement
  let hold: ReturnType<typeof setTimeout> | undefined
  let dragging = false
  let pointerY = 0
  let frame = 0

  const live = createMemo(() => app.sessions.filter((session) => !session.meta.archived).slice(0, tokens.limit["stack-max"]))
  const line = createMemo(() => {
    const count = (status: Status) => live().filter((session) => statusOf(session) === status).length
    const parts = [
      count("working") && `${count("working")} working`,
      count("needs") && `${count("needs")} needs you`,
      count("failed") && `${count("failed")} failed`,
    ].filter(Boolean)
    return parts.length ? parts.join(", ") : "here when you need me"
  })

  /** The pill under the finger; past the stack's top or bottom edge, the nearest visible pill stays hot. */
  const pillAt = (raw: number) => {
    const box = scroller.getBoundingClientRect()
    const y = Math.max(box.top + edge, Math.min(box.bottom - edge, raw))
    return [...scroller.querySelectorAll<HTMLElement>(".tds-stack-pill")].find((pill) => {
      const at = pill.getBoundingClientRect()
      return y >= at.top - tokens.space[4]! && y <= at.bottom + tokens.space[4]!
    })?.dataset.id
  }

  /** Holding near the top or bottom edge scrolls the stack, faster the closer you are, and keeps the hot pill under the finger. */
  const autoScroll = () => {
    cancelAnimationFrame(frame)
    if (!open() || !dragging) return
    const box = scroller.getBoundingClientRect()
    const reach = edge * 2
    const into = pointerY < box.top + reach ? pointerY - (box.top + reach) : pointerY > box.bottom - reach ? pointerY - (box.bottom - reach) : 0
    if (!into) return
    scroller.scrollTop += Math.max(-reach, Math.min(reach, into)) / tokens.space[4]!
    setHot(pillAt(pointerY))
    frame = requestAnimationFrame(autoScroll)
  }

  const openStack = () => {
    const box = row.getBoundingClientRect()
    const count = live().length
    const want = count * gap + edge
    const room = innerHeight - box.bottom - tokens.space[23]! - tokens.space[24]!
    const least = Math.min(want, gap * 3 + edge)
    const top = room >= least ? box.bottom + tokens.space[23]! : Math.max(tokens.space[24]! * 3, innerHeight - tokens.space[24]! - least)
    setPlace({ left: box.left, top, height: Math.min(want, innerHeight - top - tokens.space[24]!) })
    scroller.scrollTop = 0
    hidePeek()
    if (!open()) backdrop(true)
    setOpen(true)
  }
  const close = (pick?: string) => {
    cancelAnimationFrame(frame)
    if (open()) backdrop(false)
    setOpen(false)
    setHot(undefined)
    if (pick) navigate(`/t/${pick}`)
  }
  onCleanup(() => open() && backdrop(false))

  return (
    <>
      <Show when={props.show}>
        <button
          ref={row}
          type="button"
          class="tds-toast-row"
          data-press={pressed() ? "" : undefined}
          aria-haspopup="dialog"
          aria-expanded={open() ? "true" : "false"}
          onPointerDown={(e) => {
            if (e.button !== 0) return
            setPressed(true)
            dragging = false
            pointerY = e.clientY
            e.currentTarget.setPointerCapture(e.pointerId)
            hold = setTimeout(() => ((hold = undefined), openStack(), (dragging = true)), tokens.motion["hover-intent"].hold)
          }}
          onPointerMove={(e) => {
            pointerY = e.clientY
            if (!open() || !dragging) return
            setHot(pillAt(e.clientY))
            autoScroll()
          }}
          onPointerUp={() => {
            setPressed(false)
            cancelAnimationFrame(frame)
            if (hold) return clearTimeout(hold), (hold = undefined), openStack()
            if (dragging) (dragging = false), close(hot())
          }}
          onPointerCancel={() => (setPressed(false), clearTimeout(hold), (hold = undefined), cancelAnimationFrame(frame))}
        >
          <img src="/brand/toast-mascot-36.svg" alt="" class="size-mascot flex-none rounded-small" draggable={false} />
          <span class="min-w-0 flex-1 pl-6 text-left">
            <b class="block text-name">toast</b>
            <span class="tds-toast-status block truncate text-preview text-muted">
              <TextMorph value={line()} mode="calm" />
            </span>
          </span>
          <span class="tds-toast-hint">Hold for all chats</span>
          <Icon name="caret-down" size="menu" class="text-faint" />
        </button>
      </Show>
      <Portal>
        <div class="tds-veil tds-veil-glass" aria-hidden="true" data-open={open() ? "" : undefined} onClick={() => close()} />
        <div
          class="tds-stack"
          data-open={open() ? "" : undefined}
          role={open() ? "dialog" : undefined}
          aria-label={open() ? "Sessions" : undefined}
          aria-hidden={open() ? undefined : "true"}
          style={{ left: `${place().left}px`, top: `${place().top}px` }}
          onKeyDown={(e) => e.key === "Escape" && close()}
        >
          <div class="tds-stack-label">Hold and slide to a chat, let go to open it</div>
          <div
            ref={scroller}
            class="tds-stack-scroll"
            data-edge-fade="y"
            style={{ height: `${place().height}px` }}
            onScroll={() => dragging && setHot(pillAt(pointerY))}
          >
            <div class="tds-stack-track" style={{ height: `${live().length * gap}px` }}>
              <For each={live()} keyed={(session) => session.id}>
                {(session, index) => (
                  <button
                    type="button"
                    class="tds-stack-pill"
                    data-id={session().id}
                    data-hot={hot() === session().id ? "" : undefined}
                    tabindex={open() ? 0 : -1}
                    style={{ top: `${index() * gap}px`, "--stack-i": Math.min(index(), tokens.limit["stack-pills"]) }}
                    onPointerEnter={() => !dragging && setHot(session().id)}
                    onClick={() => close(session().id)}
                  >
                    <span class={`tds-stack-icon ${glyphFor(session().id).hue}`}>
                      <Icon name={glyphFor(session().id).icon} size="pin" />
                    </span>
                    <span class="tds-stack-text">
                      <b title={titleOf(session())}>{titleOf(session())}</b>
                      <span>
                        {statusName[statusOf(session())]}, in the cloud, {shortTime(session().updatedAt, minute()) || "now"}
                      </span>
                    </span>
                    <Show when={statusOf(session()) !== "idle"}>
                      <i class="tds-stack-dot" data-status={statusOf(session())} />
                    </Show>
                  </button>
                )}
              </For>
            </div>
          </div>
        </div>
      </Portal>
    </>
  )
}
