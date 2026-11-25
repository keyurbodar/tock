import { createMemo, createSignal, For, Show } from "solid-js"
import { Composer } from "../composer/composer"
import { Markdown } from "../chat/rich/Markdown"
import type { FixtureMessage } from "../fixtures/types"

type ThreadViewProps = {
  messages?: FixtureMessage[]
  emptyTitle?: string
  emptyBody?: string
  conversationId?: string
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(value))
}

export function ThreadView(props: ThreadViewProps) {
  const [sent, setSent] = createSignal<FixtureMessage[]>([])
  const messages = createMemo(() => [...(props.messages ?? []), ...sent()])
  const empty = () => messages().length === 0
  const send = (markdown: string) => {
    const now = new Date().toISOString()
    setSent((items) => [
      ...items,
      {
        id: `local-${crypto.randomUUID()}`,
        author: "user",
        body: markdown,
        createdAt: now,
        turn: messages().length + 1,
        state: "complete",
      },
    ])
  }

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
          <For each={messages()}>
            {(message, index) => (
            <div class="thread-column" data-component="chat-vrow">
              <div
                class="message-row"
                data-author={message.author}
                data-turn={index() === 0 || messages()[index() - 1]?.author !== message.author ? "start" : "continue"}
              >
                <div class="message-bubble-wrap">
                  <div class="message-bubble">
                    <Markdown text={message.body} />
                  </div>
                  <div class="message-meta">{timeLabel(message.createdAt)}</div>
                </div>
              </div>
            </div>
            )}
          </For>
        </div>
      </Show>
      <Composer draftKey={props.conversationId} onSend={send} />
    </div>
  )
}
