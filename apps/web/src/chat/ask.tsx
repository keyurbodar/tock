import { createSignal, For, Show } from "solid-js"
import { Icon } from "@tock/ui/icon"
import { tokens } from "@tock/tokens"
import type { Ask } from "./items"
import { answerAsk } from "../state/app"

const sentence = (ask: Ask, answer: string) => {
  if (ask.kind === "question") return { lead: "You chose", object: answer }
  return answer === "Approve" ? { lead: "You approved", object: ask.question.replace(/\?$/, "") } : { lead: "You declined", object: ask.question.replace(/\?$/, "") }
}

/** TDS sessions-approval-and-updates .ap: a card that asks, then folds into one answered line. */
export function AskCard(props: { sessionId: string; ask: Ask; answer: string | undefined; pending: boolean }) {
  const [chosen, setChosen] = createSignal<string>()
  const [folding, setFolding] = createSignal(false)
  const [height, setHeight] = createSignal<number>()
  let card!: HTMLDivElement
  const answer = () => props.answer ?? chosen()
  const choose = (option: string) => {
    if (chosen() || !props.pending) return
    setHeight(card.offsetHeight)
    setFolding(true)
    requestAnimationFrame(() => setHeight(tokens.size["ask-done"]))
    setTimeout(() => setChosen(option), tokens.motion.duration.layout)
    void answerAsk(props.sessionId, option)
  }
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
          </div>
          <div class="tds-ask-q">{props.ask.question}</div>
          <Show when={props.ask.summary}>{(summary) => <pre class="tds-ask-pre">{summary()}</pre>}</Show>
          <div class="tds-ask-ks">
            <For each={props.ask.options} keyed={false}>
              {(option, index) => (
                <button
                  type="button"
                  class={`tds-key${props.ask.kind === "approval" ? (option() === "Approve" ? " tds-key-cream" : "") : index === 0 ? " tds-key-cream" : ""}`}
                  data-option={option()}
                  onClick={() => choose(option())}
                >
                  {option()}
                </button>
              )}
            </For>
          </div>
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
