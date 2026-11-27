import { createEffect, createMemo, For, Match, Show, Switch } from "solid-js"
import { Icon } from "@tock/ui/icon"
import { Orb } from "@tock/ui/orb"
import { buildItems, type Item, type Step } from "./items"
import { stepLabel } from "./steps"
import { Markdown } from "./markdown"
import type { ThreadState } from "../state/app"

function StepLine(props: { step: Step }) {
  const running = () => (props.step.kind === "thinking" ? props.step.active : props.step.status === "running")
  const failed = () => props.step.kind === "tool" && props.step.status === "failed"
  const label = () => (props.step.kind === "thinking" ? (props.step.active ? "Thinking" : "Thought") : stepLabel(props.step.call.name, running()))
  return (
    <div class="tds-step" data-running={running() ? "" : undefined}>
      <span class="grid size-orb place-items-center">
        <Switch>
          <Match when={running()}>
            <Orb status="working" surface="main" />
          </Match>
          <Match when={failed()}>
            <span class="tds-tint tds-tint-failed size-orb"><Icon name="x" size="chip" /></span>
          </Match>
          <Match when={true}>
            <span class="tds-tint tds-tint-done size-orb"><Icon name="check" size="chip" /></span>
          </Match>
        </Switch>
      </span>
      <span class={running() ? "tds-shimmer" : undefined}>{label()}</span>
    </div>
  )
}

function Bubble(props: { item: Extract<Item, { kind: "user" | "routine" }>; queued?: boolean }) {
  const mine = () => props.item.kind === "user"
  return (
    <div class="tds-bubble" data-side={mine() ? "me" : "agent"} data-queued={props.queued ? "" : undefined}>
      {props.item.text}
    </div>
  )
}

export function Transcript(props: { state: ThreadState | undefined }) {
  let scroller!: HTMLDivElement
  let pinned = true
  const items = createMemo(() => (props.state ? buildItems(props.state.entries, props.state.live, props.state.pending) : []))
  createEffect(
    () => items().length + (items().at(-1)?.kind === "text" ? (items().at(-1) as { text: string }).text.length : 0),
    () => {
      if (pinned) scroller.scrollTop = scroller.scrollHeight
    },
  )
  return (
    <div ref={scroller} class="tds-scroll min-h-0 flex-1 overflow-y-auto" onScroll={() => (pinned = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 48)}>
      <div class="tds-column">
        <For each={items()}>
          {(item) => (
            <Switch>
              <Match when={item.kind === "text"}>
                <Markdown text={(item as Extract<Item, { kind: "text" }>).text} />
              </Match>
              <Match when={item.kind === "user" || item.kind === "routine"}>
                <Bubble item={item as Extract<Item, { kind: "user" | "routine" }>} queued={item.key.startsWith("pending:")} />
              </Match>
              <Match when={item.kind === "work"}>
                <div class="tds-work">
                  <For each={(item as Extract<Item, { kind: "work" }>).steps}>{(step) => <StepLine step={step} />}</For>
                </div>
              </Match>
              <Match when={item.kind === "error"}>
                <div class="tds-alert" role="status">
                  <span class="tds-tint tds-tint-failed size-toast-icon"><Icon name="warning-circle" size="toast" /></span>
                  <span class="min-w-0">
                    <b class="block text-body">{(item as Extract<Item, { kind: "error" }>).title}</b>
                    <span class="text-caption text-muted">{(item as Extract<Item, { kind: "error" }>).detail}</span>
                  </span>
                </div>
              </Match>
            </Switch>
          )}
        </For>
        <Show when={props.state?.pending.length}>
          <span class="tds-queue-caption">Waiting for toast to finish this step</span>
        </Show>
      </div>
    </div>
  )
}
