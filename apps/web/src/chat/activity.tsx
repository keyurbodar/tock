import { createEffect, createMemo, createSignal, For, Match, onCleanup, Show, Switch, untrack } from "solid-js"
import { MorphIcon } from "@tock/ui/morph-icon"
import { Icon } from "@tock/ui/icon"
import { Orb } from "@tock/ui/orb"
import { TextMorph } from "@tock/ui/text-morph"
import { tokens } from "@tock/tokens"
import { spring, watchLayout } from "@tock/ui/motion"
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
  const [ran, setRan] = createSignal(false)
  createEffect(
    () => statusOf(props.step) === "running",
    (running) => {
      if (running) setRan(true)
    },
  )
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
          <Switch fallback={<MorphIcon name={status() === "running" ? "spinner" : ran() ? "check" : kind().icon} size="menu" class="tds-ws-kind" />}>
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

export function WorkLog(props: { work: Work | undefined; anchor: HTMLElement | undefined; sessionId: string; onClose: () => void }) {
  const [closing, setClosing] = createSignal(false)
  const [place, setPlace] = createSignal({ width: 0, left: 0, edge: 0, up: true, max: 0 })
  const [scrolled, setScrolled] = createSignal(false)
  let panel!: HTMLDivElement
  let head!: HTMLDivElement
  let content!: HTMLDivElement
  const [body, setBody] = createSignal<HTMLDivElement>()
  const [height, setHeight] = createSignal<number>()
  let stick = true

  let side: "up" | "down" | undefined
  let base: number | undefined
  let drift = 0
  let glide: Animation | undefined
  const measure = () => {
    const host = panel?.offsetParent
    if (!props.anchor || !host) return
    const box = host.getBoundingClientRect()
    const at = props.anchor.getBoundingClientRect()
    const above = at.top - box.top - tokens.size["worklog-top"]
    const below = box.bottom - at.bottom - tokens.size["column-bottom"]
    const want = untrack(height) ?? 0
    const pick = want > 0 && want <= below ? "down" : above > below ? "up" : "down"
    if (want > 0) side ??= pick
    const up = (side ?? pick) === "up"
    const mine = [...document.querySelectorAll(".tds-bubble[data-side='me'], .tds-sent-images, .tds-file-card[data-side='me']")]
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.bottom > box.top && r.top < box.bottom && r.left > at.left)
    const room = Math.min(...mine.map((r) => r.left - at.left - tokens.size["worklog-anchor"]), tokens.size["worklog-pane"])
    const edge = up ? box.bottom - at.top + tokens.size["worklog-anchor"] : at.bottom - box.top + tokens.size["worklog-anchor"]
    if (base === undefined || want <= 0) base = edge
    const shift = up ? base - edge : edge - base
    if (Math.abs(shift - drift) >= 1 && panel) {
      const [, from = "0"] = getComputedStyle(panel).translate.split(" ")
      glide?.cancel()
      glide = spring(panel, [{ translate: `0 ${parseFloat(from) || 0}px` }, { translate: `0 ${shift}px` }], "snappy", { fill: "forwards" })
      drift = shift
    }
    setPlace({
      width: Math.max(room, tokens.size["worklog-pane-min"]),
      left: at.left - box.left,
      edge: base,
      up,
      max: up ? above : below,
    })
  }


  const close = () => {
    if (closing()) return
    setClosing(true)
    props.onClose()
  }

  const onKey = (e: KeyboardEvent) => e.key === "Escape" && close()
  const onPointer = (e: PointerEvent) => {
    const target = e.target as Node
    if (!panel.contains(target) && !props.anchor?.contains(target)) close()
  }
  const fit = () => {
    const scroller = body()
    if (!scroller || !content || !head) return
    const style = getComputedStyle(scroller)
    setHeight(head.offsetHeight + content.offsetHeight + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom))
    if (stick && props.work?.active) requestAnimationFrame(() => (scroller.scrollTop = scroller.scrollHeight))
  }
  const grow = new ResizeObserver(fit)
  const [ready, setReady] = createSignal(false)
  const frame = requestAnimationFrame(() => {
    fit()
    measure()
    requestAnimationFrame(() => setFull(true))
    setTimeout(() => {
      setReady(true)
      reflow()
    }, tokens.motion.duration.panel)
    if (content) grow.observe(content)
    if (props.anchor?.offsetParent) grow.observe(props.anchor.offsetParent)
    fit()
  })
  let flip: { stop: () => void } | undefined
  let fold = 0
  const reflow = () => {
    flip?.stop()
    const list = content?.firstElementChild as HTMLElement | null
    flip = list ? watchLayout(list, ":scope > div", (el) => el.querySelector<HTMLElement>("[data-key]")?.dataset.key ?? "plan") : undefined
  }
  onCleanup(() => {
    flip?.stop()
    clearTimeout(fold)
  })
  const onScroll = (e: Event) => {
    if (!panel.contains(e.target as Node)) measure()
  }
  addEventListener("keydown", onKey)
  addEventListener("pointerdown", onPointer, true)
  addEventListener("resize", measure)
  addEventListener("scroll", onScroll, true)
  onCleanup(() => {
    cancelAnimationFrame(frame)
    grow.disconnect()
    removeEventListener("keydown", onKey)
    removeEventListener("pointerdown", onPointer, true)
    removeEventListener("resize", measure)
    removeEventListener("scroll", onScroll, true)
  })

  const steps = createMemo(() => props.work?.steps ?? [])
  const [expanded, setExpanded] = createSignal<ReadonlySet<string>>(new Set<string>())
  const toggleRow = (key: string, row: HTMLElement) => {
    const opening = !untrack(expanded).has(key)
    flip?.stop()
    flip = undefined
    clearTimeout(fold)
    fold = window.setTimeout(reflow, tokens.motion.duration.spring)
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
  const [full, setFull] = createSignal(false)
  const rows = createMemo((): Row[] => {
    const all = [...(props.work?.plan ? [row("plan", "plan")] : []), ...steps().map((step) => row("step", step.key))]
    if (full()) return all
    const first = tokens.limit["worklog-first"]
    return props.work?.active ? all.slice(-first) : all.slice(0, first)
  })
  const byKey = createMemo(() => new Map(steps().map((step) => [step.key, step])))
  const renderRow = (row: Row) =>
    row.kind === "plan" ? (
      <Show when={props.work?.plan}>{(plan) => <PlanList plan={plan()} at={planAt(props.work!)} />}</Show>
    ) : (
      <Show when={byKey().get(row.key)}>{(step) => <StepRow step={step()} sessionId={props.sessionId} open={expanded().has(row.key)} onToggle={(el) => toggleRow(row.key, el)} live={!!props.work?.active && row.key === steps().at(-1)?.key && statusOf(step()) === "running"} />}</Show>
    )
  const limit = () => Math.max(place().max, tokens.size["worklog-head"])
  return (
    <div
      ref={panel}
      class="tds-worklog tds-raise-3"
      data-material="solid"
      role="dialog"
      aria-label="Work log"
      data-closing={closing() ? "" : undefined}
      data-up={scrolled() ? "" : undefined}
      data-down={place().up ? undefined : ""}
      data-ready={ready() ? "" : undefined}
      style={{ width: place().width ? `${place().width}px` : undefined, left: `${place().left}px`, [place().up ? "bottom" : "top"]: `${place().edge}px`, "max-height": `${limit()}px`, height: height() === undefined ? undefined : `${Math.min(height()!, limit())}px` }}
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
              <span class="tds-worklog-title"><TextMorph value={work().active ? "Working for" : failed(work()) ? "Failed after" : "Worked for"} /></span>
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
                <Show
                  when={rows().length > tokens.limit["worklog-virtual"] ? body() : undefined}
                  fallback={
                    <div>
                      <For each={rows()} keyed={(row) => row.key}>
                        {(row) => <div>{renderRow(row())}</div>}
                      </For>
                    </div>
                  }
                >
                  {(scroller) => (
                    <Virtualizer data={rows()} scrollRef={scroller()} itemSize={tokens.size["worklog-row"]}>
                      {(row) => renderRow(row)}
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
