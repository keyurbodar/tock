import { createMemo, createSignal, For, Match, onCleanup, Show, Switch } from "solid-js"
import { Icon } from "@tock/ui/icon"
import { Orb } from "@tock/ui/orb"
import { TextMorph } from "@tock/ui/text-morph"
import { tokens } from "@tock/tokens"
import type { Item, Step } from "./items"
import { stepIcon, stepLabel } from "./steps"
import { elapsed } from "../lib/time"
import { now } from "../lib/clock"

export type Work = Extract<Item, { kind: "work" }>

const running = (step: Step) => (step.kind === "thinking" ? step.active : step.status === "running")
const label = (step: Step) => (step.kind === "thinking" ? (step.active ? "Thinking" : "Thought") : stepLabel(step.call.name, running(step)))
const failed = (work: Work) => !work.active && work.steps.at(-1)?.kind === "tool" && (work.steps.at(-1) as Extract<Step, { kind: "tool" }>).status === "failed"
const took = (work: Work, at: number) => elapsed((work.active ? at : (work.endedAt ?? at)) - (work.startedAt ?? at))

export function Typing() {
  return (
    <div class="tds-typing" role="status" aria-label="toast is typing">
      <i />
      <i />
      <i />
    </div>
  )
}

export function Activity(props: { work: Work; open: boolean; onToggle: (anchor: HTMLElement) => void }) {
  const state = () => (props.work.active ? "live" : failed(props.work) ? "failed" : "done")
  const lead = () => (state() === "live" ? "Working for" : state() === "failed" ? "Failed after" : "Worked for")
  return (
    <div class="tds-act" data-state={state()}>
      <button type="button" class="tds-act-button tds-press" aria-expanded={props.open ? "true" : "false"} aria-label="Open the work log" onClick={(e) => props.onToggle(e.currentTarget)}>
        <Switch>
          <Match when={state() === "live"}>
            <Orb status="working" surface="main" />
          </Match>
          <Match when={state() === "failed"}>
            <Orb status="failed" surface="main" />
          </Match>
        </Switch>
        <span class="tds-act-text">
          <span class={state() === "live" ? "tds-shimmer" : undefined}>{lead()}</span>{" "}
          <span class={state() === "live" ? "tds-timer" : undefined}>
            <TextMorph value={took(props.work, now())} />
          </span>
        </span>
        <span class="tds-act-caret">
          <Icon name="caret-right" size="chip" />
        </span>
      </button>
    </div>
  )
}

function StepRow(props: { step: Step }) {
  const status = () => (props.step.kind === "thinking" ? (props.step.active ? "running" : "done") : props.step.status)
  return (
    <div class="tds-ws" data-status={status()}>
      <span class="tds-ws-slot">
        <Switch fallback={<Icon name={props.step.kind === "thinking" ? "brain" : stepIcon(props.step.call.name)} size="menu" />}>
          <Match when={status() === "running"}>
            <Orb status="working" surface="main" />
          </Match>
          <Match when={status() === "failed"}>
            <Orb status="failed" surface="main" />
          </Match>
        </Switch>
      </span>
      <span class={`tds-ws-text ${status() === "running" ? "tds-shimmer" : ""}`}>{label(props.step)}</span>
    </div>
  )
}

export function WorkLog(props: { work: Work | undefined; anchor: HTMLElement | undefined; onClose: () => void }) {
  const [closing, setClosing] = createSignal(false)
  const [place, setPlace] = createSignal({ left: 0, bottom: 0, max: 0 })
  let panel!: HTMLDivElement

  const measure = () => {
    const host = panel?.offsetParent
    if (!props.anchor || !host) return
    const box = host.getBoundingClientRect()
    const at = props.anchor.getBoundingClientRect()
    setPlace({
      left: at.left - box.left,
      bottom: box.bottom - at.top + tokens.size["worklog-anchor"],
      max: at.top - box.top - tokens.size["worklog-top"],
    })
  }

  const close = () => {
    if (closing()) return
    setClosing(true)
    setTimeout(props.onClose, tokens.motion.duration.exit)
  }

  const onKey = (e: KeyboardEvent) => e.key === "Escape" && close()
  const onPointer = (e: PointerEvent) => {
    const target = e.target as Node
    if (!panel.contains(target) && !props.anchor?.contains(target)) close()
  }
  const frame = requestAnimationFrame(measure)
  addEventListener("keydown", onKey)
  addEventListener("pointerdown", onPointer, true)
  addEventListener("resize", measure)
  addEventListener("scroll", measure, true)
  onCleanup(() => {
    cancelAnimationFrame(frame)
    removeEventListener("keydown", onKey)
    removeEventListener("pointerdown", onPointer, true)
    removeEventListener("resize", measure)
    removeEventListener("scroll", measure, true)
  })

  const steps = createMemo(() => props.work?.steps ?? [])
  return (
    <div
      ref={panel}
      class="tds-worklog"
      role="dialog"
      aria-label="Work log"
      data-closing={closing() ? "" : undefined}
      style={{ left: `${place().left}px`, bottom: `${place().bottom}px`, "max-height": `${Math.max(place().max, tokens.size["worklog-head"])}px` }}
    >
      <Show when={props.work}>
        {(work) => (
          <>
            <div class="tds-worklog-head">
              <Switch fallback={<Icon name="check" size="chip" class="text-done" />}>
                <Match when={work().active}>
                  <Orb status="working" surface="main" />
                </Match>
                <Match when={failed(work())}>
                  <Orb status="failed" surface="main" />
                </Match>
              </Switch>
              <span>{work().active ? "Working for" : failed(work()) ? "Failed after" : "Worked for"}</span>
              <span class="tds-timer">
                <TextMorph value={took(work(), now())} />
              </span>
              <button type="button" class="tds-worklog-close tds-press" aria-label="Close" onClick={close}>
                <Icon name="x" size="menu" />
              </button>
            </div>
            <div class="tds-worklog-body tds-scroll">
              <For each={steps()} keyed={false}>{(step) => <StepRow step={step()} />}</For>
            </div>
          </>
        )}
      </Show>
    </div>
  )
}
