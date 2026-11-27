import { createMemo, createSignal, For, Match, onCleanup, Show, Switch, untrack } from "solid-js"
import { Icon } from "@tock/ui/icon"
import { Orb } from "@tock/ui/orb"
import { TextMorph } from "@tock/ui/text-morph"
import type { JSX } from "@solidjs/web"
import { tokens } from "@tock/tokens"
import { animate, spring, watchLayout } from "@tock/ui/motion"
import { Virtualizer } from "virtua/solid"
import type { Item, Step } from "./items"
import { stepLabel, summarize, type Plan, type StepLabel } from "./steps"
import { AskButtons } from "./ask"
import { askOf } from "./items"
import { elapsed } from "../lib/time"
import { now } from "../lib/clock"

export type Work = Extract<Item, { kind: "work" }>

type Row = { kind: "plan" | "step" | "group"; key: string }

type Status = "running" | "done" | "failed" | "cancelled"

const spent = (ms: number | undefined) => (ms !== undefined && ms >= 1000 ? elapsed(ms) : "")
const toolMs = (step: Step) => (step.kind === "tool" ? (step.result as { durationMs?: number } | undefined)?.durationMs : undefined)
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
      <span class="tds-step-verb"><TextMorph value={props.label.verb} mode="morph" /></span>
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
          <Show when={state() === "live" || state() === "needs"} fallback={<>{state() === "failed" ? "Failed after " : "Worked for "}<TextMorph value={took(props.work, now())} mode="calm" /></>}>
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
              <span class="tds-plan-title"><TextMorph value={title()} mode="morph" /></span>
            </div>
          )
        }}
      </For>
    </div>
  )
}

/** CDS work-group row: plain text, the verb muted, the object bright, the time faint, a caret when there is more. Thoughts open into prose under a rule. */
function StepRow(props: { step: Step; live: boolean; sessionId: string; open: boolean; ms: number | undefined; nested?: boolean; onToggle: (row: HTMLElement) => void }) {
  let row!: HTMLDivElement
  const open = () => props.open
  const [seen, setSeen] = createSignal(false)
  const status = () => (asking(props.step) ? "needs" : statusOf(props.step))
  const label = createMemo((): StepLabel => {
    const base = labelOf(props.step)
    if (props.step.kind !== "thinking" || props.step.active) return base
    const took = spent(props.ms)
    return { ...base, verb: took ? `Thought for ${took}` : "Thought" }
  })
  const took = () => (props.step.kind === "tool" && props.step.status !== "running" ? spent(props.ms) : "")
  const body = createMemo(() => {
    const step = props.step
    if (step.kind === "thinking") return step.text.trim() ? { kind: "think" as const, text: step.text.trim() } : undefined
    const code = codeOf(step)
    const out = step.status === "running" ? (step.output ?? "").trim() : resultText(step)
    if (code !== undefined) return { kind: "code" as const, code, out, bad: step.status === "failed" }
    return out ? { kind: "out" as const, text: out, bad: step.status === "failed" } : undefined
  })
  return (
    <div ref={row} class="tds-ws" data-key={props.step.key} data-kind={props.step.kind} data-nested={props.nested ? "" : undefined} data-status={status()} data-open={open() ? "" : undefined}>
      <button type="button" class="tds-ws-line" disabled={!body()} aria-expanded={body() ? (open() ? "true" : "false") : undefined} onClick={() => {
        setSeen(true)
        props.onToggle(row)
      }}>
        <Show when={status() === "failed" || status() === "needs"}>
          <span class="tds-ws-slot">
            <Orb status={status() === "failed" ? "failed" : "needs"} surface="main" size="orb-row" />
          </span>
        </Show>
        <span class="tds-ws-text">
          <span class="tds-ws-label" data-shimmer={props.live && status() !== "needs" ? "" : undefined}>
            <Label label={label()} live={props.live && status() !== "needs"} />
          </span>
          <Show when={took()}>{(time) => <span class="tds-ws-dur num">{time()}</span>}</Show>
          <Show when={body()}>
            <span class="tds-ws-caret">
              <Icon name="caret-down" size="chip" />
            </span>
          </Show>
        </span>
      </button>
      <Show when={status() === "needs" && props.step.kind === "tool" ? props.step.call : undefined}>
        {(call) => <AskButtons sessionId={props.sessionId} ask={askOf(call())} />}
      </Show>
      <div class="tds-ws-fold" data-open={open() ? "" : undefined}>
      <div class="tds-ws-clip">
      <Show when={seen() || open() ? body() : undefined}>
        {(shown) => (
          <div class="tds-ws-body" data-edge-fade="y">
            <Switch>
              <Match when={shown().kind === "think"}>
                <div class="tds-ws-thought" data-edge-fade="y">
                  <For each={(shown() as { text: string }).text.split(/\n{2,}/)} keyed={false}>
                    {(para) => <p>{para()}</p>}
                  </For>
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
                    {(out) => <pre data-edge-fade="y" data-bad={(shown() as { bad: boolean }).bad ? "" : undefined}>{out()}</pre>}
                  </Show>
                </div>
              </Match>
              <Match when={shown().kind === "out"}>
                <pre class="tds-ws-output" data-edge-fade="y" data-bad={(shown() as { bad: boolean }).bad ? "" : undefined}>{(shown() as { text: string }).text}</pre>
              </Match>
            </Switch>
          </div>
        )}
      </Show>
      </div>
      </div>
    </div>
  )
}

/** Consecutive tool calls fold into one sentence ("Searched memory 3 times and ran code 2s"); open it to see each call. */
function GroupRow(props: { key: string; steps: readonly Step[]; ms: number; live: boolean; open: boolean; onToggle: (row: HTMLElement) => void; children: JSX.Element }) {
  let row!: HTMLDivElement
  const [seen, setSeen] = createSignal(false)
  const label = createMemo(() => summarize(props.steps.flatMap((step) => (step.kind === "tool" ? [step.call] : []))))
  const live = () => {
    const step = props.steps.findLast((s) => statusOf(s) === "running")
    return step ? labelOf(step).live : label()
  }
  const failed = () => props.steps.some((step) => statusOf(step) === "failed")
  return (
    <div ref={row} class="tds-ws" data-key={props.key} data-kind="group" data-status={props.live ? "running" : failed() ? "failed" : "done"} data-open={props.open ? "" : undefined}>
      <button type="button" class="tds-ws-line" aria-expanded={props.open ? "true" : "false"} onClick={() => {
        setSeen(true)
        props.onToggle(row)
      }}>
        <span class="tds-ws-text">
          <span class="tds-ws-label" data-shimmer={props.live ? "" : undefined}>
            <TextMorph value={props.live ? live() : label()} mode="morph" />
          </span>
          <Show when={!props.live && spent(props.ms)}>{(time) => <span class="tds-ws-dur num">{time()}</span>}</Show>
          <span class="tds-ws-caret">
            <Icon name="caret-down" size="chip" />
          </span>
        </span>
      </button>
      <div class="tds-ws-fold" data-open={props.open ? "" : undefined}>
        <div class="tds-ws-clip">
          <Show when={seen() || props.open}>
            <div class="tds-ws-body tds-ws-group">{props.children}</div>
          </Show>
        </div>
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
  let foldTimer = 0
  const [folding, setFolding] = createSignal(false)
  const [dropping, setDropping] = createSignal(false)
  const reflow = () => {
    flip?.stop()
    const list = content?.firstElementChild as HTMLElement | null
    flip = list ? watchLayout(list, ":scope > div", (el) => el.querySelector<HTMLElement>("[data-key]")?.dataset.key ?? "plan") : undefined
  }
  onCleanup(() => {
    flip?.stop()
    clearTimeout(foldTimer)
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
    clearTimeout(foldTimer)
    setFolding(true)
    foldTimer = window.setTimeout(() => {
      setFolding(false)
      reflow()
    }, tokens.motion.duration.spring)
    const fold = (row.querySelector(":scope > .tds-ws-fold .tds-ws-body") as HTMLElement | null)
    const flipTo = () =>
      setExpanded((current) => {
        const next = new Set(current)
        if (opening) next.add(key)
        else next.delete(key)
        return next
      })
    const scroller = untrack(body)
    if (!opening && fold && scroller && content && head) {
      const view = scroller.getBoundingClientRect()
      const box = fold.getBoundingClientRect()
      const seen = Math.max(0, Math.min(box.bottom, view.bottom) - Math.max(box.top, view.top))
      if (box.height - seen > 1) {
        const style = getComputedStyle(scroller)
        const pads = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
        clearTimeout(foldTimer)
        setFolding(false)
        const fade = animate(fold, [{ opacity: 1 }, { opacity: 0 }], { duration: tokens.motion.duration.layout, fill: "forwards" })
        setDropping(true)
        setHeight(head.offsetHeight + content.offsetHeight - box.height + pads)
        foldTimer = window.setTimeout(() => {
          const shell = fold.closest(".tds-ws-fold") as HTMLElement | null
          shell?.setAttribute("data-instant", "")
          flipTo()
          requestAnimationFrame(() => {
            fade.cancel()
            shell?.removeAttribute("data-instant")
            setDropping(false)
            reflow()
          })
        }, tokens.motion.duration.spring)
        return
      }
    }
    flipTo()
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
  const grouped = createMemo(() => {
    const groups = new Map<string, Step[]>()
    const order: Row[] = []
    let run: Step[] = []
    const flush = () => {
      if (run.length > 1) {
        const key = `g:${run[0]!.key}`
        groups.set(key, run)
        order.push(row("group", key))
      } else for (const step of run) order.push(row("step", step.key))
      run = []
    }
    for (const step of steps()) {
      if (step.kind === "tool" && !asking(step)) {
        run.push(step)
        continue
      }
      flush()
      order.push(row("step", step.key))
    }
    flush()
    return { groups, order }
  })
  const msOf = createMemo(() => {
    const list = steps()
    const out = new Map<string, number | undefined>()
    list.forEach((step, index) => {
      if (step.kind === "tool") return out.set(step.key, toolMs(step))
      if (step.at === null) return out.set(step.key, undefined)
      const next = list.slice(index + 1).find((later) => later.at !== null && later.at > step.at!)?.at ?? props.work?.endedAt ?? undefined
      out.set(step.key, next !== undefined && next !== null ? next - step.at : undefined)
    })
    return out
  })
  const rows = createMemo((): Row[] => {
    const all = [...(props.work?.plan ? [row("plan", "plan")] : []), ...grouped().order]
    if (full()) return all
    const first = tokens.limit["worklog-first"]
    return props.work?.active ? all.slice(-first) : all.slice(0, first)
  })
  const byKey = createMemo(() => new Map(steps().map((step) => [step.key, step])))
  const stepRow = (key: string, nested?: boolean) => (
    <Show when={byKey().get(key)}>{(step) => <StepRow step={step()} nested={nested} ms={msOf().get(key)} sessionId={props.sessionId} open={expanded().has(key)} onToggle={(el) => toggleRow(key, el)} live={!!props.work?.active && key === steps().at(-1)?.key && statusOf(step()) === "running"} />}</Show>
  )
  const renderRow = (row: Row) => {
    if (row.kind === "plan") return <Show when={props.work?.plan}>{(plan) => <PlanList plan={plan()} at={planAt(props.work!)} />}</Show>
    if (row.kind === "step") return stepRow(row.key)
    return (
      <Show when={grouped().groups.get(row.key)}>
        {(members) => (
          <GroupRow
            key={row.key}
            steps={members()}
            ms={members().reduce((sum, step) => sum + (toolMs(step) ?? 0), 0)}
            live={!!props.work?.active && members().some((step) => statusOf(step) === "running")}
            open={expanded().has(row.key)}
            onToggle={(el) => toggleRow(row.key, el)}
          >
            <For each={members()} keyed={(step) => step.key}>
              {(step) => stepRow(untrack(step).key, true)}
            </For>
          </GroupRow>
        )}
      </Show>
    )
  }
  const limit = () => Math.max(place().max, tokens.size["worklog-head"])
  return (
    <div
      ref={panel}
      class="tds-worklog tds-over"
      data-material="solid"
      role="dialog"
      aria-label="Work log"
      data-closing={closing() ? "" : undefined}
      data-up={scrolled() ? "" : undefined}
      data-down={place().up ? undefined : ""}
      data-ready={ready() ? "" : undefined}
      data-folding={folding() ? "" : undefined}
      data-dropping={dropping() ? "" : undefined}
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
              <span class="tds-worklog-title"><TextMorph value={work().active ? "Working for" : failed(work()) ? "Failed after" : "Worked for"} mode="morph" /></span>
              <span class="tds-timer">
                <TextMorph value={took(work(), now())} mode="swap" />
              </span>
              <Show when={work().plan}>
                {(plan) => (
                  <span class="tds-worklog-count num">
                    <TextMorph value={`${Math.min(planAt(work()) + 1, plan().steps.length)} of ${plan().steps.length}`} mode="calm" />
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
              data-edge-fade="y"
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
