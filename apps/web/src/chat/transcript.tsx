import { createEffect, createMemo, createSignal, For, Match, Show, Switch } from "solid-js"
import { Dynamic } from "@solidjs/web"
import "skullet/element"
import { Icon } from "@tock/ui/icon"
import { tokens } from "@tock/tokens"
import { buildItems, type Item } from "./items"
import { Markdown } from "./markdown"
import { Activity, Typing, WorkLog, type Work } from "./activity"
import { AskCard } from "./ask"
import { fileUrl, isImage, splitFiles } from "./attachments"
import { FileCard, ThreadChip } from "./chip"
import { openLightbox } from "./lightbox"
import { ExternalLink, LinkMenu, openLinkMenu, shortUrl, webHost } from "./link"
import { toast } from "../shell/toasts"
import { app, type ThreadState } from "../state/app"

const SPANS = /\[([^\]\n]+)\]\(tock-thread:([\w-]+)\)|https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"\]]/g

/** A sent message stays plain text, except thread mentions become chips and bare URLs become links. */
function Prose(props: { text: string }) {
  const parts = createMemo(() => {
    const out: ({ kind: "text"; value: string } | { kind: "thread"; id: string; label: string } | { kind: "link"; href: string })[] = []
    let at = 0
    for (const match of props.text.matchAll(SPANS)) {
      if (match.index > at) out.push({ kind: "text", value: props.text.slice(at, match.index) })
      out.push(match[2] ? { kind: "thread", id: match[2], label: match[1]!.replace(/^@/, "") } : { kind: "link", href: match[0] })
      at = match.index + match[0].length
    }
    if (at < props.text.length) out.push({ kind: "text", value: props.text.slice(at) })
    return out
  })
  return (
    <For each={parts()} keyed={false}>
      {(part) => (
        <Switch>
          <Match when={part().kind === "thread" && (part() as { id: string; label: string })}>{(thread) => <ThreadChip id={thread().id} label={thread().label} />}</Match>
          <Match when={part().kind === "link" && (part() as { href: string })}>{(link) => <ExternalLink href={link().href} host={webHost(link().href) ?? ""} text={shortUrl(link().href)} />}</Match>
          <Match when={part().kind === "text"}>{(part() as { value: string }).value}</Match>
        </Switch>
      )}
    </For>
  )
}

/** A plain click grows the picture into the lightbox, with every picture in this chat as its gallery; modified clicks keep the link. */
function viewImage(event: MouseEvent) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
  event.preventDefault()
  const from = event.currentTarget as HTMLElement
  const all = [...(from.closest(".tds-column") ?? from.parentElement!).querySelectorAll<HTMLElement>(".tds-sent-image[data-file]")]
  openLightbox(all.map((el) => ({ id: el.dataset.file!, name: el.dataset.name ?? "" })), all.indexOf(from), from)
}

function Bubble(props: { item: Extract<Item, { kind: "user" | "routine" }>; queued?: boolean }) {
  const mine = () => props.item.kind === "user"
  const parts = createMemo(() => splitFiles(props.item.text))
  const images = () => parts().files.filter((file) => isImage(file.name))
  const docs = () => parts().files.filter((file) => !isImage(file.name))
  return (
    <>
      <Show when={images().length > 0}>
        <div class="tds-sent-images" data-count={Math.min(images().length, 3)} data-side={mine() ? "me" : "agent"} data-queued={props.queued ? "" : undefined}>
          <For each={images()} keyed={(file) => file.id}>
            {(file) => (
              <a href={fileUrl(file().id)} target="_blank" rel="noreferrer" class="tds-sent-image" data-file={file().id} data-name={file().name} onClick={viewImage}>
                <img src={fileUrl(file().id)} alt={file().name} loading="lazy" draggable={false} />
              </a>
            )}
          </For>
        </div>
      </Show>
      <For each={docs()} keyed={(file) => file.id}>
        {(file) => <FileCard id={file().id} name={file().name} side={mine() ? "me" : "agent"} />}
      </For>
      <Show when={parts().text}>
        <div class="tds-bubble" data-side={mine() ? "me" : "agent"} data-queued={props.queued ? "" : undefined}>
          <Prose text={parts().text} />
        </div>
      </Show>
    </>
  )
}

export function Transcript(props: { state: ThreadState | undefined; sessionId: string }) {
  let scroller!: HTMLDivElement
  let pinned = true
  const [open, setOpen] = createSignal<{ key: string; anchor: HTMLElement }>()
  const toggle = (key: string, anchor: HTMLElement) => setOpen((current) => (current?.key === key ? undefined : { key, anchor }))
  const items = createMemo(() => (props.state ? buildItems(props.state.entries, props.state.live, props.state.pending, app.connection === "open" || app.connection === "connecting") : []))
  createEffect(
    () => items().length + (items().at(-1)?.kind === "text" ? (items().at(-1) as { text: string }).text.length : 0),
    () => {
      if (pinned) scroller.scrollTop = scroller.scrollHeight
    },
  )
  return (
    <>
    <div ref={scroller} class="tds-transcript tds-scroll" onContextMenu={openLinkMenu} onScroll={() => (pinned = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < tokens.size["column-bottom"])}>
      <div class="tds-column">
        <Show when={props.state?.phase === "loading" && items().length === 0}>
          <Dynamic component="skullet-reveal" loading="" label="Loading messages" class="tds-transcript-skeleton">
            <div class="tds-bubble" data-side="me">Plan the week ahead with me</div>
            <p>Here is a first pass at the week, with the three things worth a look today and what can wait.</p>
            <p>Tuesday holds the longest block, so the deep work goes there.</p>
          </Dynamic>
        </Show>
        <For each={items()} keyed={(item) => item.key}>
          {(item) => (
            <Switch>
              <Match when={item().kind === "text"}>
                <Markdown text={(item() as Extract<Item, { kind: "text" }>).text} streaming={(item() as Extract<Item, { kind: "text" }>).streaming} />
              </Match>
              <Match when={item().kind === "user" || item().kind === "routine"}>
                <Bubble item={item() as Extract<Item, { kind: "user" | "routine" }>} queued={item().key.startsWith("pending:")} />
              </Match>
              <Match when={item().kind === "work"}>
                <Activity work={item() as Work} open={open()?.key === item().key} onToggle={(anchor) => toggle(item().key, anchor)} />
              </Match>
              <Match when={item().kind === "ask" && (item() as Extract<Item, { kind: "ask" }>)}>
                {(ask) => <AskCard sessionId={props.sessionId} ask={ask().ask} answer={ask().answer} pending={ask().pending} />}
              </Match>
              <Match when={item().kind === "typing"}>
                <Typing />
              </Match>
              <Match when={item().kind === "caption"}>
                <span class="tds-caption" data-side={(item() as Extract<Item, { kind: "caption" }>).side}>{(item() as Extract<Item, { kind: "caption" }>).text}</span>
              </Match>
              <Match when={item().kind === "divider"}>
                <div class="tds-divider" role="separator"><span class="tds-divider-rule" /><span class="tds-divider-text">{(item() as Extract<Item, { kind: "divider" }>).text}</span><span class="tds-divider-rule" /></div>
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
      </div>
    </div>
    <LinkMenu onCopied={(href) => toast("Link copied", { description: shortUrl(href), id: "copy", duration: tokens.motion.toast.copy })} />
    <Show when={open()}>
      {(current) => <WorkLog work={items().find((item): item is Work => item.kind === "work" && item.key === current().key)} anchor={current().anchor} sessionId={props.sessionId} onClose={() => setOpen(undefined)} />}
    </Show>
    </>
  )
}
