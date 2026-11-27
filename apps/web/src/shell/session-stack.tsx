import { createMemo, createSignal, For, Show } from "solid-js"
import { Portal } from "@solidjs/web"
import { useNavigate } from "@solidjs/router"
import { Icon } from "@tock/ui/icon"
import { tokens } from "@tock/tokens"
import { TextMorph } from "@tock/ui/text-morph"
import { glyphFor } from "../lib/glyph"
import { shortTime } from "../lib/time"
import { now } from "../lib/clock"
import { app, titleOf, type Session } from "../state/app"
import { hidePeek } from "./peek"

type Status = "working" | "needs" | "failed" | "idle"

const statusOf = (session: Session): Status => (session.busy ? "working" : app.threads[session.id]?.error ? "failed" : "idle")
const statusName: Record<Status, string> = { working: "Working", needs: "Needs you", failed: "Failed", idle: "Idle" }

/**
 * The toast row, TDS px2 .me: mascot 36, "toast" 15/600 and a live status line. Holding it fans out the
 * session stack (px4 Stack): a blurred veil, glass pills with a stagger; slide to a pill and let go to open it.
 */
export function ToastRow(props: { show: boolean }) {
  const navigate = useNavigate()
  const [open, setOpen] = createSignal(false)
  const [hot, setHot] = createSignal<string>()
  const [pressed, setPressed] = createSignal(false)
  const [origin, setOrigin] = createSignal({ left: 0, top: 0 })
  let row!: HTMLButtonElement
  let pills!: HTMLDivElement
  let hold: ReturnType<typeof setTimeout> | undefined
  let dragging = false

  const live = createMemo(() => app.sessions.filter((session) => !session.meta.archived))
  const line = createMemo(() => {
    const count = (status: Status) => live().filter((session) => statusOf(session) === status).length
    const parts = [
      count("working") && `${count("working")} working`,
      count("needs") && `${count("needs")} needs you`,
      count("failed") && `${count("failed")} failed`,
    ].filter(Boolean)
    return parts.length ? parts.join(", ") : "here when you need me"
  })

  const openStack = () => {
    const box = row.getBoundingClientRect()
    setOrigin({ left: box.left + tokens.space[4]!, top: box.bottom + tokens.space[23]! })
    hidePeek()
    setOpen(true)
  }
  const close = (pick?: string) => {
    setOpen(false)
    setHot(undefined)
    if (pick) navigate(`/t/${pick}`)
  }
  const pillAt = (y: number) =>
    [...pills.querySelectorAll<HTMLElement>(".tds-stack-pill")].find((pill) => {
      const box = pill.getBoundingClientRect()
      return y >= box.top - tokens.space[4]! && y <= box.bottom + tokens.space[4]!
    })?.dataset.id

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
            e.currentTarget.setPointerCapture(e.pointerId)
            hold = setTimeout(() => ((hold = undefined), openStack(), (dragging = true)), tokens.motion["hover-intent"].hold)
          }}
          onPointerMove={(e) => {
            if (open() && dragging) setHot(pillAt(e.clientY))
          }}
          onPointerUp={() => {
            setPressed(false)
            if (hold) return clearTimeout(hold), (hold = undefined), openStack()
            if (dragging) (dragging = false), close(hot())
          }}
          onPointerCancel={() => (setPressed(false), clearTimeout(hold), (hold = undefined))}
        >
          <img src="/brand/toast-mascot-36.svg" alt="" class="size-mascot flex-none rounded-small" draggable={false} />
          <span class="min-w-0 flex-1 pl-6 text-left">
            <b class="block text-name">toast</b>
            <span class="tds-toast-status block truncate text-preview text-muted">
              <TextMorph value={line()} />
            </span>
          </span>
          <span class="tds-toast-hint">Hold</span>
          <Icon name="caret-down" size="menu" class="text-faint" />
        </button>
      </Show>
      <Portal>
        <div class="tds-veil tds-veil-glass" data-open={open() ? "" : undefined} onClick={() => close()} />
        <div
          ref={pills}
          class="tds-stack"
          data-material="solid"
          data-open={open() ? "" : undefined}
          role={open() ? "dialog" : undefined}
          aria-label="Sessions"
          aria-hidden={open() ? undefined : "true"}
          style={{ left: `${origin().left}px`, top: `${origin().top}px` }}
          onKeyDown={(e) => e.key === "Escape" && close()}
        >
          <div class="tds-stack-label">Hold and slide to a chat, let go to open it</div>
          <For each={live().slice(0, tokens.limit["stack-pills"])} keyed={(session) => session.id}>
            {(session, index) => (
              <button
                type="button"
                class="tds-stack-pill tds-glass"
                data-id={session().id}
                data-hot={hot() === session().id ? "" : undefined}
                tabindex={open() ? 0 : -1}
                style={{ top: `${index() * tokens.size["session-gap"]}px`, "--stack-i": index() }}
                onPointerEnter={() => !dragging && setHot(session().id)}
                onClick={() => close(session().id)}
              >
                <span class={`tds-stack-icon ${glyphFor(session().id).hue}`}>
                  <Icon name={glyphFor(session().id).icon} size="pin" />
                </span>
                <span class="min-w-0">
                  <b>{titleOf(session())}</b>
                  <span>
                    {statusName[statusOf(session())]}, in the cloud, {shortTime(session().updatedAt, now()) || "now"}
                  </span>
                </span>
                <Show when={statusOf(session()) !== "idle"}>
                  <i class="tds-stack-dot" data-status={statusOf(session())} />
                </Show>
              </button>
            )}
          </For>
        </div>
      </Portal>
    </>
  )
}
