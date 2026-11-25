import { For, Show } from "solid-js"
import { ComposerPlaceholder } from "../composer/composer"
import type { FixtureMessage } from "../fixtures/types"

type ThreadViewProps = {
  messages?: FixtureMessage[]
  emptyTitle?: string
  emptyBody?: string
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(value))
}

export function ThreadView(props: ThreadViewProps) {
  const empty = () => !props.messages?.length
  return (
    <div class="thread-page">
      <Show
        when={!empty()}
        fallback={
          <div class="empty-state">
            <h1>{props.emptyTitle ?? "What would you like to work on?"}</h1>
            <p>{props.emptyBody ?? "Start a conversation and the thread will appear here."}</p>
          </div>
        }
      >
        <div class="thread-scroll">
          <div class="thread-column">
            <For each={props.messages}>
              {(message, index) => (
                <div
                  class="message-row"
                  data-author={message.author}
                  data-turn={index() === 0 || props.messages?.[index() - 1]?.author !== message.author ? "start" : "continue"}
                >
                  <div class="message-bubble-wrap">
                    <div class="message-bubble">{message.body}</div>
                    <div class="message-meta">{timeLabel(message.createdAt)}</div>
                  </div>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>
      <ComposerPlaceholder />
    </div>
  )
}
