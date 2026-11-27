import { createEffect, createSignal, For, onCleanup, Show, untrack } from "solid-js"
import { backdropTo, drive, scrub } from "@tock/ui/motion"
import { TextMorph } from "@tock/ui/text-morph"
import { Orb } from "@tock/ui/orb"
import { useNavigate } from "@solidjs/router"
import { groups, markAllRead, notes, readChat, unreadNotes, type Group, type Note, type Tone } from "../state/notes"
import { shortTime } from "../lib/time"
import { Empty } from "../chat/empty"
import { minute } from "../lib/clock"
import { tokens } from "@tock/tokens"

const [open, setOpen] = createSignal(false)
export { open as centreOpen, setOpen as setCentreOpen }

function Card(props: { note: Note; tone: Tone; index: number; onOpen: () => void }) {
  return (
    <button type="button" class="tds-note" data-read={props.note.read ? "" : undefined} style={{ "--i": props.index }} onClick={() => props.onOpen()}>
      <span class="tds-note-tint" data-tone={props.tone}>
        <Orb status={props.tone} />
      </span>
      <span class="tds-note-text">
        <b dir="auto">{props.note.title}</b>
        <span dir="auto">{props.note.body}</span>
      </span>
      <i class="num"><TextMorph value={shortTime(props.note.at, minute())} mode="calm" /></i>
    </button>
  )
}

/** One stack per chat: the newest note on top, older ones tucked behind as two under-cards until you click it open. */
function Stack(props: { group: Group; start: number; onOpen: (note: Note) => void }) {
  const [expanded, setExpanded] = createSignal(false)
  const more = () => props.group.notes.length > 1
  const pick = (note: Note) => (more() && !expanded() ? setExpanded(true) : props.onOpen(note))
  return (
    <div class="tds-note-group" data-chat={props.group.notes[0]?.chat} data-stacked={more() ? "" : undefined} data-open={expanded() ? "" : undefined}>
      <Card note={props.group.notes[0]!} tone={props.group.tone} index={props.start} onOpen={() => pick(props.group.notes[0]!)} />
      <Show when={more()}>
        <div class="tds-note-more">
          <div>
            <For each={props.group.notes.slice(1)} keyed={(note) => note.id}>
              {(note, index) => <Card note={note()} tone={note().tone} index={props.start + index() + 1} onOpen={() => props.onOpen(note())} />}
            </For>
          </div>
        </div>
        <span class="tds-note-under" />
        <span class="tds-note-under" data-back="" />
      </Show>
    </div>
  )
}

/** TDS px2 Centre: slides out from behind the rail, Needs you first, then Today. */
export function Centre() {
  const navigate = useNavigate()
  let panel!: HTMLElement
  let sheet: ReturnType<typeof drive> | undefined
  createEffect(open, (next) => sheet?.to(next ? 1 : 0))
  let unbind = () => {}
  onCleanup(() => (unbind(), sheet?.stop(), backdropTo("centre", 0)))
  const bind = (el: HTMLElement) => {
    panel = el
    let travel = 0
    const moved = drive(el, {
      preset: "glide",
      backdrop: "centre",
      tracks: [{ el: () => el, at: (p) => ({ translate: ((p - 1) * (travel ||= el.offsetWidth + el.offsetLeft + parseFloat(getComputedStyle(el).getPropertyValue("--tds-space-24")))).toFixed(2) + "px 0" }) }],
    })
    sheet = moved
    unbind = scrub(el, {
      axis: "x",
      distance: el.offsetWidth || tokens.size.centre,
      from: () => moved.value,
      onProgress: (p) => moved.set(p),
      onRelease: (keep, velocity) => {
        if (!keep && untrack(open)) setOpen(false)
        moved.to(keep ? 1 : 0, undefined, (velocity * 1000) / (el.offsetWidth || tokens.size.centre))
      },
    })
  }
  const go = (note: Note) => {
    setOpen(false)
    if (note.chat) {
      readChat(note.chat)
      navigate(`/t/${note.chat}`)
    }
  }
  const onKey = (event: KeyboardEvent) => event.key === "Escape" && open() && setOpen(false)
  const onPointer = (event: PointerEvent) => {
    if (open() && event.target instanceof Element && !panel.contains(event.target) && !event.target.closest("[data-bell]")) setOpen(false)
  }
  addEventListener("keydown", onKey)
  addEventListener("pointerdown", onPointer, true)
  onCleanup(() => {
    removeEventListener("keydown", onKey)
    removeEventListener("pointerdown", onPointer, true)
  })
  const sections = () => groups()
  const offset = (list: readonly Group[], at: number) => list.slice(0, at).reduce((sum, group) => sum + group.notes.length, 0)
  return (
    <aside ref={bind} class="tds-centre tds-over" data-open={open() ? "" : undefined} aria-label="Notifications" aria-hidden={open() ? undefined : "true"} inert={!open()}>
      <div class="tds-centre-head">
        <b>Notifications</b>
        <button type="button" class="tds-centre-read" disabled={unreadNotes() === 0} onClick={markAllRead}>
          Mark All Read
        </button>
      </div>
      <div class="tds-centre-body tds-scroll" data-edge-fade="y">
        <Show when={notes.list.length > 0} fallback={<Empty art="quiet" small />}>
          <Show when={sections().needs.length > 0}>
            <div class="tds-centre-sec">Needs you</div>
            <For each={sections().needs} keyed={(group) => group.key}>
              {(group, index) => <Stack group={group()} start={offset(sections().needs, index())} onOpen={go} />}
            </For>
          </Show>
          <Show when={sections().today.length > 0}>
            <div class="tds-centre-sec">Today</div>
            <For each={sections().today} keyed={(group) => group.key}>
              {(group, index) => <Stack group={group()} start={offset(sections().today, index())} onOpen={go} />}
            </For>
          </Show>
        </Show>
      </div>
    </aside>
  )
}
