import { createSignal, For, Show } from "solid-js"
import { Portal } from "@solidjs/web"
import { useNavigate } from "@solidjs/router"
import { Icon } from "@tock/ui/icon"
import { Orb } from "@tock/ui/orb"
import { tokens } from "@tock/tokens"
import { animate, morphFrom } from "@tock/ui/motion"
import { glyphFor } from "../lib/glyph"
import { shortTime } from "../lib/time"
import { minute } from "../lib/clock"
import { peekLines, titleOf, type PeekLine, type Session } from "../state/app"

/** side: beside the sidebar, level with a roster row. below: under a pin, over the roster, as kat's pinned grid. */
type Place = "side" | "below"

interface Shown {
  readonly session: Session
  readonly top: number
  readonly left: number
  readonly width: number | undefined
  readonly place: Place
  readonly lines: readonly PeekLine[]
}

const [shown, setShown] = createSignal<Shown>()
let restTimer: ReturnType<typeof setTimeout> | undefined
let leaveTimer: ReturnType<typeof setTimeout> | undefined
let coolTimer: ReturnType<typeof setTimeout> | undefined
let warm = false
let pending = 0
let hovered: { session: Session; row: HTMLElement; place: Place } | undefined

const intent = tokens.motion["hover-intent"]

async function show(session: Session, row: HTMLElement, place: Place = "side") {
  clearTimeout(leaveTimer)
  const box = row.getBoundingClientRect()
  const side = row.closest(".tds-sidebar")?.getBoundingClientRect()
  const gap = tokens.space[14]!
  const inset = tokens.space[12]!
  const below = place === "below" && side !== undefined
  const left = below ? side.left + inset : (side?.right ?? box.right) + gap
  const width = below ? Math.min(tokens.size.peek, side.width - inset * 2) : undefined
  const top = below
    ? Math.min(box.bottom + tokens.space[6]!, innerHeight - tokens.size.peek * 2 / 3)
    : Math.max(tokens.size["menu-dialog-top"] / 2, Math.min(box.top - gap, innerHeight - tokens.size.peek * 2 / 3))
  const ticket = ++pending
  const lines = await peekLines(session.id)
  if (ticket !== pending) return
  if (hovered?.session.id !== session.id && shown() === undefined && !keyed) return
  keyed = false
  warm = true
  const from = shown()
  setShown({ session, top, left, width, place, lines })
  if (from && from.session.id !== session.id) swap()
}

/** The card stays up between chats: it glides to the new spot and its content cross-fades, never closing and reopening. */
function swap() {
  queueMicrotask(() => animate(document.querySelector(".tds-peek-body"), [{ opacity: 0.35, filter: `blur(${tokens.motion.blur.swap})` }, { opacity: 1, filter: "blur(0px)" }], { duration: tokens.motion.duration.swap }))
}
let keyed = false

let pointer = { x: 0, y: 0 }
let apex: { x: number; y: number } | undefined
if (typeof document !== "undefined") document.addEventListener("pointermove", (e) => (pointer = { x: e.clientX, y: e.clientY }), { passive: true })

const cross = (a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)

/** Safe triangle: from where the pointer left its row to the card's near edge. Inside it the pointer is on its way to the card, so the card holds. */
function aiming() {
  const card = document.querySelector(".tds-peek")?.getBoundingClientRect()
  if (!card || !apex) return false
  const below = shown()?.place === "below"
  const top = { x: card.left, y: card.top }
  const bottom = below ? { x: card.right, y: card.top } : { x: card.left, y: card.bottom }
  const d1 = cross(apex, top, pointer)
  const d2 = cross(top, bottom, pointer)
  const d3 = cross(bottom, apex, pointer)
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))
}

function holdOrHide(since: number) {
  if (aiming() && Date.now() - since < intent.open * 2) {
    leaveTimer = setTimeout(() => holdOrHide(since), intent.leave)
    return
  }
  hidePeek()
}

/**
 * Resting on a row shows the peek; once one is open, moving to the next row (or pin) swaps it in place, as TDS px2
 * Peek and kat. Entering a row while heading for the card (inside the safe triangle and still moving) defers the swap
 * instead of dropping it, so a pointer that stops on the new row always gets that row's chat.
 */
export function peekEnter(session: Session, row: HTMLElement, place: Place = "side") {
  hovered = { session, row, place }
  clearTimeout(restTimer)
  clearTimeout(leaveTimer)
  if (shown()?.session.id === session.id) return void (apex = undefined)
  let last = { ...pointer }
  const go = () => {
    if (hovered?.session.id !== session.id) return
    const moving = Math.hypot(pointer.x - last.x, pointer.y - last.y) > 1
    last = { ...pointer }
    if (shown() && shown()?.place === place && moving && aiming()) return void (restTimer = setTimeout(go, intent.leave))
    apex = undefined
    void show(session, row, place)
  }
  restTimer = setTimeout(go, warm || shown() ? intent.leave / 2 : intent["peek-rest"])
}

export function peekLeave() {
  hovered = undefined
  clearTimeout(restTimer)
  clearTimeout(leaveTimer)
  apex ??= pointer
  const since = Date.now()
  leaveTimer = setTimeout(() => holdOrHide(since), intent.leave)
}

export function hidePeek() {
  clearTimeout(restTimer)
  clearTimeout(leaveTimer)
  pending++
  if (!shown()) return
  setShown(undefined)
  clearTimeout(coolTimer)
  coolTimer = setTimeout(() => (warm = shown() !== undefined), intent.open)
}

/** Space toggles the peek for the row under the pointer, or the open chat. */
export function peekToggle(fallback: { session: Session; row: HTMLElement } | undefined) {
  if (shown()) return hidePeek()
  const target = hovered ?? fallback
  if (!target) return
  keyed = true
  void show(target.session, target.row, hovered?.place ?? "side")
}

export const peeking = () => shown() !== undefined

export function Peek() {
  const navigate = useNavigate()
  return (
    <Portal>
      <Show when={shown()}>
        {(peek) => (
          <div
            class="tds-peek tds-over"
            role="dialog"
            aria-label={`Peek at ${titleOf(peek().session)}`}
            data-place={peek().place}
            data-id={peek().session.id}
            style={{ left: "0px", top: "0px", translate: `${peek().left}px ${peek().top}px`, width: peek().width === undefined ? undefined : `${peek().width}px` }}
            onPointerEnter={() => ((apex = undefined), clearTimeout(leaveTimer))}
            onPointerLeave={() => peekLeave()}
            onClick={(e) => (morphFrom(e.currentTarget), navigate(`/t/${peek().session.id}`), hidePeek())}
          >
            <div class="tds-peek-body">
            <div class="tds-peek-head">
              <span class={glyphFor(peek().session.id).hue}>
                <Icon name={glyphFor(peek().session.id).icon} size="toast" />
              </span>
              <b>{titleOf(peek().session)}</b>
              <Show when={peek().session.busy} fallback={<em class="num">{shortTime(peek().session.updatedAt, minute())}</em>}>
                <Orb status="working" />
                <em>Working</em>
              </Show>
            </div>
            <div class="tds-peek-lines">
              <Show when={peek().lines.length > 0} fallback={<div class="tds-peek-line">No messages yet</div>}>
                <For each={peek().lines} keyed={(line) => line.key}>
                  {(line) => (
                    <div class="tds-peek-line" dir="auto" data-me={line().me ? "" : undefined}>
                      <span>{line().text}</span>
                    </div>
                  )}
                </For>
              </Show>
            </div>
            <div class="tds-peek-foot">
              <span>
                <Icon name="folder-simple" size="chip" />
                {peek().session.meta.folder ?? "No folder"}
              </span>
              <span>
                <Icon name="cloud" size="chip" />
                In the cloud
              </span>
              <i>Click to open</i>
            </div>
            </div>
          </div>
        )}
      </Show>
    </Portal>
  )
}
