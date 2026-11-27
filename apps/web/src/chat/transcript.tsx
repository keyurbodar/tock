import { createEffect, createMemo, createSignal, For, Match, Show, Switch } from "solid-js"
import { Icon } from "@tock/ui/icon"
import { tokens } from "@tock/tokens"
import { buildItems, type Item } from "./items"
import { Markdown } from "./markdown"
import { Activity, Typing, WorkLog, type Work } from "./activity"
import { extension, fileUrl, isImage, splitFiles } from "./attachments"
import { LinkCards } from "./link-card"
import type { ThreadState } from "../state/app"

function Bubble(props: { item: Extract<Item, { kind: "user" | "routine" }>; queued?: boolean }) {
  const mine = () => props.item.kind === "user"
  const parts = createMemo(() => splitFiles(props.item.text))
  const images = () => parts().files.filter((file) => isImage(file.name))
  const docs = () => parts().files.filter((file) => !isImage(file.name))
  return (
    <>
      <Show when={images().length > 0}>
        <div class="tds-sent-images" data-count={Math.min(images().length, 3)} data-queued={props.queued ? "" : undefined}>
          <For each={images()} keyed={(file) => file.id}>
            {(file) => (
              <a href={fileUrl(file().id)} target="_blank" rel="noreferrer" class="tds-sent-image">
                <img src={fileUrl(file().id)} alt={file().name} loading="lazy" draggable={false} />
              </a>
            )}
          </For>
        </div>
      </Show>
      <For each={docs()} keyed={(file) => file.id}>
        {(file) => (
          <a href={fileUrl(file().id)} target="_blank" rel="noreferrer" class="tds-file-card" data-side={mine() ? "me" : "agent"}>
            <span class="tds-attach-glyph">
              <Icon name="file-text" size="menu" />
              <b>{extension(file().name)}</b>
            </span>
            <span class="tds-attach-meta">
              <b>{file().name}</b>
              <span>Open</span>
            </span>
          </a>
        )}
      </For>
      <Show when={parts().text}>
        <div class="tds-bubble" data-side={mine() ? "me" : "agent"} data-queued={props.queued ? "" : undefined}>
          {parts().text}
        </div>
      </Show>
    </>
  )
}

export function Transcript(props: { state: ThreadState | undefined }) {
  let scroller!: HTMLDivElement
  let pinned = true
  const [open, setOpen] = createSignal<{ key: string; anchor: HTMLElement }>()
  const toggle = (key: string, anchor: HTMLElement) => setOpen((current) => (current?.key === key ? undefined : { key, anchor }))
  const items = createMemo(() => (props.state ? buildItems(props.state.entries, props.state.live, props.state.pending) : []))
  createEffect(
    () => items().length + (items().at(-1)?.kind === "text" ? (items().at(-1) as { text: string }).text.length : 0),
    () => {
      if (pinned) scroller.scrollTop = scroller.scrollHeight
    },
  )
  return (
    <>
    <div ref={scroller} class="tds-transcript tds-scroll" onScroll={() => (pinned = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < tokens.size["column-bottom"])}>
      <div class="tds-column">
        <For each={items()} keyed={(item) => item.key}>
          {(item) => (
            <Switch>
              <Match when={item().kind === "text"}>
                <Markdown text={(item() as Extract<Item, { kind: "text" }>).text} />
              </Match>
              <Match when={item().kind === "user" || item().kind === "routine"}>
                <Bubble item={item() as Extract<Item, { kind: "user" | "routine" }>} queued={item().key.startsWith("pending:")} />
              </Match>
              <Match when={item().kind === "work"}>
                <Activity work={item() as Work} open={open()?.key === item().key} onToggle={(anchor) => toggle(item().key, anchor)} />
              </Match>
              <Match when={item().kind === "typing"}>
                <Typing />
              </Match>
              <Match when={item().kind === "error"}>
                <div class="tds-alert" role="status">
                  <span class="tds-tint tds-tint-failed size-toast-icon"><Icon name="warning-circle" size="toast" /></span>
                  <span class="min-w-0">
                    <b class="block text-body">{(item() as Extract<Item, { kind: "error" }>).title}</b>
                    <span class="text-caption text-muted">{(item() as Extract<Item, { kind: "error" }>).detail}</span>
                  </span>
                </div>
              </Match>
            </Switch>
          )}
        </For>
        <Show when={props.state?.pending.length && props.state.live?.run}>
          <span class="tds-queue-caption">Waiting for toast to finish this step</span>
        </Show>
      </div>
    </div>
    <LinkCards root={() => scroller?.parentElement ?? undefined} />
    <Show when={open()}>
      {(current) => <WorkLog work={items().find((item): item is Work => item.kind === "work" && item.key === current().key)} anchor={current().anchor} onClose={() => setOpen(undefined)} />}
    </Show>
    </>
  )
}
