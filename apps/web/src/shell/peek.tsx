import { createSignal, For, Show } from "solid-js"
import { Portal } from "@solidjs/web"
import { useNavigate } from "@solidjs/router"
import { Icon } from "@tock/ui/icon"
import { Orb } from "@tock/ui/orb"
import { tokens } from "@tock/tokens"
import { glyphFor } from "../lib/glyph"
import { shortTime } from "../lib/time"
import { now } from "../lib/clock"
import { peekLines, titleOf, type PeekLine, type Session } from "../state/app"

interface Shown {
  readonly session: Session
  readonly top: number
  readonly left: number
  readonly lines: readonly PeekLine[]
}

const [shown, setShown] = createSignal<Shown>()
let restTimer: ReturnType<typeof setTimeout> | undefined
let leaveTimer: ReturnType<typeof setTimeout> | undefined
let coolTimer: ReturnType<typeof setTimeout> | undefined
let warm = false
let pending = 0
let hovered: { session: Session; row: HTMLElement } | undefined

const intent = tokens.motion["hover-intent"]

async function show(session: Session, row: HTMLElement) {
  clearTimeout(leaveTimer)
  const box = row.getBoundingClientRect()
  const side = row.closest(".tds-sidebar")?.getBoundingClientRect()
  const left = (side?.right ?? box.right) + tokens.space[14]!
  const top = Math.max(tokens.size["menu-dialog-top"] / 2, Math.min(box.top - tokens.space[14]!, innerHeight - tokens.size.peek * 2 / 3))
  const ticket = ++pending
  const lines = await peekLines(session.id)
  if (ticket !== pending) return
  if (hovered?.session.id !== session.id && shown() === undefined && !keyed) return
  keyed = false
  warm = true
  setShown({ session, top, left, lines })
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
  const top = { x: card.left, y: card.top }
  const bottom = { x: card.left, y: card.bottom }
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

/** Resting on a row shows the peek; once one is open, moving to the next row swaps it at once, as TDS px2 Peek. */
export function peekEnter(session: Session, row: HTMLElement) {
  if (shown() && shown()?.session.id !== session.id && aiming()) return
  hovered = { session, row }
  clearTimeout(restTimer)
  clearTimeout(leaveTimer)
  apex = undefined
  if (shown()?.session.id === session.id) return
  restTimer = setTimeout(() => void show(session, row), warm ? 0 : intent["peek-rest"])
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
  void show(target.session, target.row)
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
            style={{ left: `${peek().left}px`, top: `${peek().top}px` }}
            onPointerEnter={() => ((apex = undefined), clearTimeout(leaveTimer))}
            onPointerLeave={() => peekLeave()}
            onClick={() => (navigate(`/t/${peek().session.id}`), hidePeek())}
          >
            <div class="tds-peek-head">
              <span class={glyphFor(peek().session.id).hue}>
                <Icon name={glyphFor(peek().session.id).icon} size="toast" />
              </span>
              <b>{titleOf(peek().session)}</b>
              <Show when={peek().session.busy} fallback={<em class="num">{shortTime(peek().session.updatedAt, now())}</em>}>
                <Orb status="working" surface="main" size="orb-sm" />
                <em>Working</em>
              </Show>
            </div>
            <div class="tds-peek-lines">
              <Show when={peek().lines.length > 0} fallback={<div class="tds-peek-line">No messages yet</div>}>
                <For each={peek().lines} keyed={(line) => line.key}>
                  {(line) => (
                    <div class="tds-peek-line" data-me={line().me ? "" : undefined}>
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
        )}
      </Show>
    </Portal>
  )
}
