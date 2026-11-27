import { createMemo, createSignal, For, Match, onCleanup, Show, Switch } from "solid-js"
import { Icon } from "@tock/ui/icon"
import { Orb } from "@tock/ui/orb"
import { TextMorph } from "@tock/ui/text-morph"
import { tokens } from "@tock/tokens"
import type { Item, Step } from "./items"
import { stepIcon, stepLabel, type StepLabel } from "./steps"
import { elapsed } from "../lib/time"
import { now } from "../lib/clock"

export type Work = Extract<Item, { kind: "work" }>

type Status = "running" | "done" | "failed" | "cancelled"

const statusOf = (step: Step): Status => (step.kind === "thinking" ? (step.active ? "running" : "done") : step.status)
const labelOf = (step: Step): StepLabel =>
  step.kind === "thinking" ? { verb: step.active ? "Thinking" : "Thought" } : stepLabel(step.call, step.status === "running")
const bodyOf = (step: Step) => {
  if (step.kind === "thinking") return step.text.trim()
  return (step.result?.content ?? []).flatMap((block) => (block.type === "text" ? [block.text] : [])).join("\n").trim()
}
const failed = (work: Work) => !work.active && work.steps.some((step) => statusOf(step) === "failed") && statusOf(work.steps.at(-1)!) === "failed"
const took = (work: Work, at: number) => elapsed((work.active ? at : (work.endedAt ?? at)) - (work.startedAt ?? at))

function Label(props: { label: StepLabel }) {
  return (
    <>
      <span class="tds-step-verb">{props.label.verb}</span>
      <Show when={props.label.object}>
        {(object) => <b class="tds-step-object"> {object()}</b>}
      </Show>
    </>
  )
}

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
  const current = () => {
    const step = props.work.steps.at(-1)
    return step && statusOf(step) === "running" ? labelOf(step) : { verb: "Thinking" }
  }
  return (
    <div class="tds-act" data-state={state()}>
      <button type="button" class="tds-act-button" aria-expanded={props.open ? "true" : "false"} aria-label="Open the work log" onClick={(e) => props.onToggle(e.currentTarget)}>
        <Switch>
          <Match when={state() === "live"}>
            <Orb status="working" surface="main" />
          </Match>
          <Match when={state() === "failed"}>
            <Orb status="failed" surface="main" />
          </Match>
        </Switch>
        <span class="tds-act-text" data-shimmer={state() === "live" ? "" : undefined}>
          <Show when={state() === "live"} fallback={<>{state() === "failed" ? "Failed after " : "Worked for "}<TextMorph value={took(props.work, now())} /></>}>
            <Label label={current()} />
          </Show>
        </span>
        <span class="tds-act-caret">
          <Icon name="caret-right" size="chip" />
        </span>
      </button>
    </div>
  )
}

function StepRow(props: { step: Step }) {
  const [open, setOpen] = createSignal(false)
  const status = () => statusOf(props.step)
  const body = createMemo(() => bodyOf(props.step))
  const expandable = () => body() !== "" && status() !== "running"
  return (
    <div class="tds-ws" data-status={status()} data-open={open() ? "" : undefined}>
      <button type="button" class="tds-ws-line" disabled={!expandable()} aria-expanded={expandable() ? (open() ? "true" : "false") : undefined} onClick={() => setOpen((value) => !value)}>
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
        <span class="tds-ws-text" data-shimmer={status() === "running" ? "" : undefined}>
          <Label label={labelOf(props.step)} />
        </span>
        <Show when={expandable()}>
          <span class="tds-ws-caret">
            <Icon name="caret-right" size="chip" />
          </span>
        </Show>
      </button>
      <Show when={open()}>
        <div class={props.step.kind === "thinking" ? "tds-ws-thought" : "tds-ws-output"}>{body()}</div>
      </Show>
    </div>
  )
}

export function WorkLog(props: { work: Work | undefined; anchor: HTMLElement | undefined; onClose: () => void }) {
  const [closing, setClosing] = createSignal(false)
  const [place, setPlace] = createSignal({ left: 0, bottom: 0, max: 0 })
  const [scrolled, setScrolled] = createSignal(false)
  let panel!: HTMLDivElement
  let body!: HTMLDivElement
  let stick = true

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
  const follow = new MutationObserver(() => stick && body && (body.scrollTop = body.scrollHeight))
  const frame = requestAnimationFrame(() => {
    measure()
    if (body) {
      body.scrollTop = body.scrollHeight
      follow.observe(body, { childList: true, subtree: true, characterData: true })
    }
  })
  addEventListener("keydown", onKey)
  addEventListener("pointerdown", onPointer, true)
  addEventListener("resize", measure)
  onCleanup(() => {
    cancelAnimationFrame(frame)
    follow.disconnect()
    removeEventListener("keydown", onKey)
    removeEventListener("pointerdown", onPointer, true)
    removeEventListener("resize", measure)
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
            <div class="tds-worklog-head" data-up={scrolled() ? "" : undefined}>
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
              <span class="tds-worklog-count num">{steps().length} {steps().length === 1 ? "step" : "steps"}</span>
              <button type="button" class="tds-worklog-close" aria-label="Close" onClick={close}>
                <Icon name="x" size="menu" />
              </button>
            </div>
            <div
              ref={body}
              class="tds-worklog-body tds-scroll"
              onScroll={() => {
                setScrolled(body.scrollTop > 0)
                stick = body.scrollHeight - body.scrollTop - body.clientHeight < tokens.size["worklog-slot"]
              }}
            >
              <For each={steps()} keyed={(step) => step.key}>
                {(step) => <StepRow step={step()} />}
              </For>
            </div>
          </>
        )}
      </Show>
    </div>
  )
}
