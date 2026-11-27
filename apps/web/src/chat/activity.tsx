import { createEffect, createMemo, createSignal, For, Match, onCleanup, Show, Switch, untrack } from "solid-js"
import { MorphIcon } from "@tock/ui/morph-icon"
import { Icon } from "@tock/ui/icon"
import { Orb } from "@tock/ui/orb"
import { TextMorph } from "@tock/ui/text-morph"
import { tokens } from "@tock/tokens"
import { Virtualizer } from "virtua/solid"
import type { Item, Step } from "./items"
import { kinds, stepLabel, type Plan, type StepLabel } from "./steps"
import { Markdown } from "./markdown"
import { AskButtons } from "./ask"
import { askOf } from "./items"
import { elapsed } from "../lib/time"
import { now } from "../lib/clock"

export type Work = Extract<Item, { kind: "work" }>

type Row = { kind: "plan" | "step"; key: string }

type Status = "running" | "done" | "failed" | "cancelled"

const clock = new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" })
const statusOf = (step: Step): Status => (step.kind === "thinking" ? (step.active ? "running" : "done") : step.status)
const labelOf = (step: Step): StepLabel =>
  step.kind === "thinking" ? { kind: "think", verb: step.active ? "Thinking" : "Thought", live: "Thinking" } : stepLabel(step.call)
const resultText = (step: Extract<Step, { kind: "tool" }>) =>
  (step.result?.content ?? []).flatMap((block) => (block.type === "text" ? [block.text] : [])).join("\n").trim()
const codeOf = (step: Extract<Step, { kind: "tool" }>) => {
  const source = step.call.arguments.code ?? step.call.arguments.command
  return typeof source === "string" ? source.trim() : undefined
}
const asking = (step: Step | undefined) => step?.kind === "tool" && step.call.name === "ask_owner" && !step.result && step.status !== "cancelled"
const needs = (work: Work) => asking(work.steps.at(-1))
const failed = (work: Work) => !work.active && work.steps.length > 0 && statusOf(work.steps.at(-1)!) === "failed"
const took = (work: Work, at: number) => elapsed((work.active ? at : (work.endedAt ?? at)) - (work.startedAt ?? at))
const planAt = (work: Work) => (work.plan ? (work.active ? work.plan.current : work.plan.steps.length) : 0)

function Label(props: { label: StepLabel; live?: boolean }) {
  return (
    <Show when={!props.live} fallback={props.label.live}>
      <span class="tds-step-verb"><TextMorph value={props.label.verb} /></span>
      <Show when={props.label.object}>
        {(object) => <b class="tds-step-object"> {object()}</b>}
      </Show>
    </Show>
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

/** The one line under the user's message: live step while it runs, a muted "Worked for" once it's done. */
export function Activity(props: { work: Work; open: boolean; onToggle: (anchor: HTMLElement) => void }) {
  const state = () => (needs(props.work) ? "needs" : props.work.active ? "live" : failed(props.work) ? "failed" : "done")
  const live = () => {
    const step = props.work.steps.at(-1)
    if (step?.kind === "tool" && needs(props.work)) return askOf(step.call).question || labelOf(step).live
    if (step && statusOf(step) === "running") return labelOf(step).live
    const plan = props.work.plan
    return plan ? (plan.steps[Math.min(plan.current, plan.steps.length - 1)] ?? "Thinking") : "Thinking"
  }
  return (
    <div class="tds-act" data-state={state()}>
      <button type="button" class="tds-act-button" aria-expanded={props.open ? "true" : "false"} aria-label="Open the work log" onClick={(e) => props.onToggle(e.currentTarget)}>
        <Switch>
          <Match when={state() === "needs"}>
            <Orb status="needs" surface="main" size="orb-act" />
          </Match>
          <Match when={state() === "live"}>
            <Orb status="working" surface="main" size="orb-act" />
          </Match>
          <Match when={state() === "failed"}>
            <Orb status="failed" surface="main" size="orb-act" />
          </Match>
        </Switch>
        <span class="tds-act-text" data-shimmer={state() === "live" ? "" : undefined}>
          <Show when={state() === "live" || state() === "needs"} fallback={<>{state() === "failed" ? "Failed after " : "Worked for "}<TextMorph value={took(props.work, now())} /></>}>
            {live()}
          </Show>
        </span>
        <span class="tds-act-caret">
          <Icon name="caret-right" size="chip" />
        </span>
      </button>
    </div>
  )
}

function PlanList(props: { plan: Plan; at: number }) {
  return (
    <div class="tds-plan">
      <For each={props.plan.steps} keyed={false}>
        {(title, index) => {
          const state = () => (index < props.at ? "done" : index === props.at ? "cur" : "next")
          return (
            <div class="tds-plan-item" data-state={state()}>
              <span class="tds-plan-glyph">
                <Switch fallback={<i />}>
                  <Match when={state() === "done"}>
                    <Icon name="check" size="chip" />
                  </Match>
                  <Match when={state() === "cur"}>
                    <Orb status="working" surface="main" size="orb-act" />
                  </Match>
                </Switch>
              </span>
              <span class="tds-plan-title"><TextMorph value={title()} /></span>
            </div>
          )
        }}
      </For>
    </div>
  )
}

function StepRow(props: { step: Step; live: boolean; sessionId: string; open: boolean; onToggle: (row: HTMLElement) => void }) {
  let row!: HTMLDivElement
  const open = () => props.open
  const [seen, setSeen] = createSignal(false)
  const status = () => (asking(props.step) ? "needs" : statusOf(props.step))
  const label = createMemo(() => labelOf(props.step))
  const kind = () => kinds[label().kind]
  const body = createMemo(() => {
    const step = props.step
    if (step.kind === "thinking") return step.text.trim() ? { kind: "think" as const, text: step.text.trim() } : undefined
    const code = codeOf(step)
    const out = step.status === "running" ? (step.output ?? "").trim() : resultText(step)
    if (code !== undefined) return { kind: "code" as const, code, out, bad: step.status === "failed" }
    return out ? { kind: "out" as const, text: out, bad: step.status === "failed" } : undefined
  })
  const at = () => (props.step.kind === "tool" ? props.step.result?.timestamp : undefined)
  return (
    <div ref={row} class="tds-ws" data-key={props.step.key} data-status={status()} data-open={open() ? "" : undefined}>
      <button type="button" class="tds-ws-line" disabled={!body()} aria-expanded={body() ? (open() ? "true" : "false") : undefined} onClick={() => {
        setSeen(true)
        props.onToggle(row)
      }}>
        <span class="tds-ws-slot" style={{ color: status() === "failed" ? undefined : kind().hue }}>
          <Switch fallback={<MorphIcon name={kind().icon} size="menu" class="tds-ws-kind" />}>
            <Match when={status() === "failed"}>
              <Orb status="failed" surface="main" size="orb-row" />
            </Match>
            <Match when={status() === "needs"}>
              <Orb status="needs" surface="main" size="orb-row" />
            </Match>
          </Switch>
        </span>
        <span class="tds-ws-text">
          <span class="tds-ws-label" data-shimmer={props.live && status() !== "needs" ? "" : undefined}>
            <Label label={label()} live={props.live && status() !== "needs"} />
          </span>
          <Show when={body()}>
            <span class="tds-ws-caret">
              <Icon name="caret-down" size="chip" />
            </span>
          </Show>
        </span>
        <span class="tds-ws-time num">{at() ? clock.format(at()!) : ""}</span>
      </button>
      <Show when={status() === "needs" && props.step.kind === "tool" ? props.step.call : undefined}>
        {(call) => <AskButtons sessionId={props.sessionId} ask={askOf(call())} />}
      </Show>
      <div class="tds-ws-fold" data-open={open() ? "" : undefined}>
      <Show when={seen() || open() ? body() : undefined}>
        {(shown) => (
          <div class="tds-ws-body">
            <Switch>
              <Match when={shown().kind === "think"}>
                <div class="tds-ws-thought">
                  <Markdown text={(shown() as { text: string }).text} streaming={props.live} />
                </div>
              </Match>
              <Match when={shown().kind === "code"}>
                <div class="tds-ws-code">
                  <div class="tds-ws-cmd">
                    <Icon name="terminal-window" size="chip" class="tds-ws-prompt" />
                    <span>{(shown() as { code: string }).code.split("\n")[0]}</span>
                  </div>
                  <div class="tds-ws-on">on tock</div>
                  <Show when={(shown() as { out: string }).out}>
                    {(out) => <pre data-bad={(shown() as { bad: boolean }).bad ? "" : undefined}>{out()}</pre>}
                  </Show>
                </div>
              </Match>
              <Match when={shown().kind === "out"}>
                <pre class="tds-ws-output" data-bad={(shown() as { bad: boolean }).bad ? "" : undefined}>{(shown() as { text: string }).text}</pre>
              </Match>
            </Switch>
          </div>
        )}
      </Show>
      </div>
    </div>
  )
}

export function WorkLog(props: { work: Work | undefined; shut: boolean; sessionId: string; onClose: () => void }) {
  const [closing, setClosing] = createSignal(false)
  const [scrolled, setScrolled] = createSignal(false)
  let head!: HTMLDivElement
  let content!: HTMLDivElement
  const [body, setBody] = createSignal<HTMLDivElement>()
  const [height, setHeight] = createSignal(0)
  let stick = true

  const close = () => {
    if (untrack(closing)) return
    setClosing(true)
    setHeight(0)
    setTimeout(() => props.onClose(), tokens.motion.duration.layout)
  }
  createEffect(
    () => props.shut,
    (shut) => {
      if (shut) close()
    },
  )
  const onKey = (e: KeyboardEvent) => e.key === "Escape" && close()
  const fit = () => {
    const scroller = body()
    if (!scroller || !content || !head || untrack(closing)) return
    const style = getComputedStyle(scroller)
    setHeight(head.offsetHeight + content.offsetHeight + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom))
    if (stick && props.work?.active) requestAnimationFrame(() => (scroller.scrollTop = scroller.scrollHeight))
  }
  const grow = new ResizeObserver(fit)
  const frame = requestAnimationFrame(() => {
    if (content) grow.observe(content)
    fit()
  })
  addEventListener("keydown", onKey)
  onCleanup(() => {
    cancelAnimationFrame(frame)
    grow.disconnect()
    removeEventListener("keydown", onKey)
  })

  const steps = createMemo(() => props.work?.steps ?? [])
  const [expanded, setExpanded] = createSignal<ReadonlySet<string>>(new Set<string>())
  const toggleRow = (key: string, row: HTMLElement) => {
    const opening = !untrack(expanded).has(key)
    setExpanded((current) => {
      const next = new Set(current)
      if (opening) next.add(key)
      else next.delete(key)
      return next
    })
    if (!opening) return
    stick = false
    setTimeout(() => row.scrollIntoView({ block: "nearest", behavior: "smooth" }), tokens.motion.duration.layout)
  }
  const cache = new Map<string, Row>()
  const row = (kind: Row["kind"], key: string) => {
    const known = cache.get(key) ?? { kind, key }
    cache.set(key, known)
    return known
  }
  const rows = createMemo((): Row[] => [...(props.work?.plan ? [row("plan", "plan")] : []), ...steps().map((step) => row("step", step.key))])
  const byKey = createMemo(() => new Map(steps().map((step) => [step.key, step])))
  const limit = () => Math.min(innerHeight * 0.6, tokens.size["worklog-inline"])
  return (
    <div
      class="tds-worklog tds-raise-3"
      data-material="solid"
      role="dialog"
      aria-label="Work log"
      data-closing={closing() ? "" : undefined}
      data-up={scrolled() ? "" : undefined}
      style={{ "max-height": `${limit()}px`, height: `${Math.min(height(), limit())}px` }}
    >
      <Show when={props.work}>
        {(work) => (
          <>
            <div ref={head} class="tds-worklog-head">
              <Switch fallback={<Icon name="check" size="menu" class="tds-worklog-ok" />}>
                <Match when={needs(work())}>
                  <Orb status="needs" surface="main" size="orb-row" />
                </Match>
                <Match when={work().active}>
                  <Orb status="working" surface="main" size="orb-row" />
                </Match>
                <Match when={failed(work())}>
                  <Orb status="failed" surface="main" size="orb-row" />
                </Match>
              </Switch>
              <span class="tds-worklog-title">{work().active ? "Working for" : failed(work()) ? "Failed after" : "Worked for"}</span>
              <span class="tds-timer">
                <TextMorph value={took(work(), now())} />
              </span>
              <Show when={work().plan}>
                {(plan) => (
                  <span class="tds-worklog-count num">
                    <TextMorph value={`${Math.min(planAt(work()) + 1, plan().steps.length)} of ${plan().steps.length}`} />
                  </span>
                )}
              </Show>
              <button type="button" class="tds-worklog-close" aria-label="Close" onClick={close}>
                <Icon name="x" size="menu" />
              </button>
            </div>
            <div
              ref={setBody}
              class="tds-worklog-body tds-scroll"
              onScroll={(e) => {
                const scroller = e.currentTarget
                setScrolled(scroller.scrollTop > tokens.size["worklog-up"])
                stick = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < tokens.size["worklog-stick"]
              }}
            >
              <div ref={content} class="tds-worklog-content">
                <Show when={body()}>
                  {(scroller) => (
                    <Virtualizer data={rows()} scrollRef={scroller()} itemSize={tokens.size["worklog-row"]}>
                      {(row) =>
                        row.kind === "plan" ? (
                          <Show when={work().plan}>{(plan) => <PlanList plan={plan()} at={planAt(work())} />}</Show>
                        ) : (
                          <Show when={byKey().get(row.key)}>{(step) => <StepRow step={step()} sessionId={props.sessionId} open={expanded().has(row.key)} onToggle={(el) => toggleRow(row.key, el)} live={work().active && row.key === steps().at(-1)?.key && statusOf(step()) === "running"} />}</Show>
                        )
                      }
                    </Virtualizer>
                  )}
                </Show>
              </div>
            </div>
          </>
        )}
      </Show>
    </div>
  )
}
