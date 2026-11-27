import { createSignal, For, onCleanup, Show, untrack } from "solid-js"
import { Icon } from "@tock/ui/icon"
import { TextMorph } from "@tock/ui/motion"
import { tokens } from "@tock/tokens"
import type { Ask } from "./items"
import { answerAsk } from "../state/app"

const choicesOf = (ask: Ask, answer: string) =>
  ask.questions.length > 1 ? answer.split("\n").map((line, index) => line.slice((ask.questions[index]?.question.length ?? -2) + 2) || line).join(", ") : answer

const sentence = (ask: Ask, answer: string) => {
  if (ask.kind === "question") return { lead: "You chose", object: choicesOf(ask, answer) }
  return answer === "Approve" ? { lead: "You approved", object: ask.question.replace(/\?$/, "") } : { lead: "You declined", object: ask.question.replace(/\?$/, "") }
}

const typing = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return (target.textContent ?? "").trim().length > 0
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement
}

/** TDS sessions-approval-and-updates .ap and KcQuestions: a card that asks (numbered keys, 1/2/3 then Enter, stepped questions), then folds into one answered line that keeps Undo until the answer is sent. */
export function AskCard(props: { sessionId: string; ask: Ask; answer: string | undefined; pending: boolean }) {
  const [chosen, setChosen] = createSignal<string>()
  const [folding, setFolding] = createSignal(false)
  const [height, setHeight] = createSignal<number>()
  const [step, setStep] = createSignal(0)
  const [picked, setPicked] = createSignal<number>()
  const [held, setHeld] = createSignal(false)
  const answers: string[] = []
  let timer: ReturnType<typeof setTimeout> | undefined
  let card!: HTMLDivElement
  const answer = () => props.answer ?? chosen()
  const current = () => props.ask.questions[step()] ?? props.ask.questions[0]!
  const options = () => (props.ask.kind === "approval" ? props.ask.options : current().options)
  const flush = () => {
    if (timer === undefined) return
    clearTimeout(timer)
    timer = undefined
    setHeld(false)
    const value = chosen()
    if (value !== undefined) void answerAsk(props.sessionId, value)
  }
  const choose = (option: string) => {
    if (chosen() || folding() || !props.pending) return
    if (props.ask.kind === "question" && props.ask.questions.length > 1) {
      answers[step()] = `${current().question}: ${option}`
      if (step() < props.ask.questions.length - 1) {
        setPicked(undefined)
        setStep(step() + 1)
        return
      }
    }
    const value = props.ask.kind === "question" && props.ask.questions.length > 1 ? answers.join("\n") : option
    setHeight(card.offsetHeight)
    setFolding(true)
    requestAnimationFrame(() => setHeight(tokens.size["ask-done"]))
    setTimeout(() => {
      setChosen(value)
      setHeld(true)
      timer = setTimeout(flush, tokens.motion.duration["ask-undo"])
    }, tokens.motion.duration.layout)
  }
  const undo = () => {
    clearTimeout(timer)
    timer = undefined
    answers.length = 0
    setHeld(false)
    setStep(0)
    setPicked(undefined)
    setHeight(undefined)
    setFolding(false)
    setChosen(undefined)
  }
  {
    const onKey = (event: KeyboardEvent) => untrack(() => {
      if (props.ask.kind !== "question" || answer() || folding() || !props.pending || event.metaKey || event.ctrlKey || event.altKey || typing(event.target)) return
      const digit = Number(event.key)
      if (Number.isInteger(digit) && digit >= 1 && digit <= options().length) {
        event.preventDefault()
        setPicked(digit - 1)
        return
      }
      const index = picked()
      if (event.key === "Enter" && index !== undefined) {
        event.preventDefault()
        event.stopPropagation()
        choose(options()[index]!)
      }
    })
    window.addEventListener("keydown", onKey, true)
    onCleanup(() => window.removeEventListener("keydown", onKey, true))
  }
  onCleanup(flush)
  return (
    <Show
      when={!answer() && props.pending}
      fallback={
        <Show when={answer()}>
          {(value) => (
            <div class="tds-ask-done" data-answer={value()}>
              <span class="tds-ask-check" data-tone={value() === "Deny" ? "no" : "yes"}>
                <Icon name={value() === "Deny" ? "x" : "check"} size="chip" />
              </span>
              <span>
                {sentence(props.ask, value()).lead} <b>{sentence(props.ask, value()).object}</b>
              </span>
              <Show when={held()}>
                <button type="button" class="tds-undo" onClick={() => undo()}>
                  Undo
                </button>
              </Show>
            </div>
          )}
        </Show>
      }
    >
      <div ref={card} class="tds-ask" data-kind={props.ask.kind} data-folding={folding() ? "" : undefined} style={height() === undefined ? undefined : { height: `${height()}px` }}>
        <div class="tds-ask-in">
          <div class="tds-ask-k">
            <Icon name="hand" size="menu" />
            {props.ask.kind === "approval" ? "Needs your approval" : "Needs your answer"}
            <Show when={props.ask.questions.length > 1}>
              <span class="tds-ask-step">
                <TextMorph value={`${step() + 1} of ${props.ask.questions.length}`} mode="roll" />
                <span class="tds-ask-dots">
                  <For each={props.ask.questions} keyed={false}>{(_, index) => <i data-on={index === step() ? "" : undefined} />}</For>
                </span>
              </span>
            </Show>
          </div>
          <div class="tds-ask-q">{props.ask.kind === "question" ? current().question : props.ask.question}</div>
          <Show when={props.ask.summary}>{(summary) => <div class="tds-ask-pre">{summary()}</div>}</Show>
          <Show
            when={props.ask.kind === "question"}
            fallback={
              <div class="tds-ask-ks">
                <For each={props.ask.options.toReversed()} keyed={false}>
                  {(option) => (
                    <button type="button" class={`tds-key${option() === "Approve" ? " tds-key-cream" : ""}`} data-option={option()} onClick={() => choose(option())}>
                      {option()}
                    </button>
                  )}
                </For>
              </div>
            }
          >
            <div class="tds-ask-opts">
              <For each={options()} keyed={false}>
                {(option, index) => (
                  <button type="button" class="tds-key tds-ask-opt" data-option={option()} data-on={picked() === index ? "" : undefined} onClick={() => choose(option())}>
                    <span class="tds-ask-num">{index + 1}</span>
                    {option()}
                  </button>
                )}
              </For>
            </div>
          </Show>
        </div>
      </div>
    </Show>
  )
}

/** TDS WorklogLive .wa: the ask inside the work log, answered with pill buttons. */
export function AskButtons(props: { sessionId: string; ask: Ask }) {
  const [sent, setSent] = createSignal(false)
  return (
    <div class="tds-wa" data-sent={sent() ? "" : undefined}>
      <For each={props.ask.options} keyed={false}>
        {(option, index) => (
          <button
            type="button"
            class="tds-wbtn"
            data-primary={index === 0 ? "" : undefined}
            disabled={sent()}
            onClick={() => {
              setSent(true)
              void answerAsk(props.sessionId, option())
            }}
          >
            {option()}
          </button>
        )}
      </For>
    </div>
  )
}
