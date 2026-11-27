import { clamp } from "./clamp"
import { createEffect, createMemo, createSignal, For, Match, onCleanup, onSettled, Show, Switch, untrack } from "solid-js"
import { Skeleton } from "@tock/ui/motion"
import { Icon } from "@tock/ui/icon"
import { MorphIcon, TextMorph } from "@tock/ui/motion"
import { tokens } from "@tock/tokens"
import { buildItems, type Item } from "./items"
import { Markdown } from "./markdown"
import { Activity, Typing, WorkLog, type Work } from "./activity"
import { AskCard } from "./ask"
import { splitFiles } from "./attachments"
import { ThreadChip } from "./chip"
import { Attachments } from "./files"
import { ExternalLink, LinkMenu, openLinkMenu, shortUrl, webHost } from "./link"
import { toast } from "../shell/toasts"
import { app, type ThreadState } from "../state/app"

const SPANS = /\[([^\]\n]+)\]\(tock-thread:([\w-]+)\)|https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"\]]/g

/** A sent message stays plain text, except thread mentions become chips and bare URLs become links. */
const RICH = /(^|\n)([-*+] |\d+\. |> |```)|\*\*[^*\n]+\*\*|(^|[\s(])[*_][^*_\n]+[*_]|`[^`\n]+`|\[[^\]\n]+\]\((?!tock-)[^)\s]+\)/

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

function Bubble(props: { item: Extract<Item, { kind: "user" | "routine" }>; queued?: boolean }) {
  const mine = () => props.item.kind === "user"
  const parts = createMemo(() => splitFiles(props.item.text))
  return (
    <>
      <Show when={parts().files.length > 0}>
        <Attachments files={parts().files} side={mine() ? "me" : "agent"} queued={props.queued} />
      </Show>
      <Show when={parts().text}>
        <div ref={(el) => clamp(el)} class="tds-bubble" data-side={mine() ? "me" : "agent"} data-queued={props.queued ? "" : undefined}>
          <Show when={RICH.test(parts().text)} fallback={<Prose text={parts().text} />}>
            <div class="tds-bubble-rich">
              <Markdown text={parts().text} />
            </div>
          </Show>
        </div>
      </Show>
    </>
  )
}

/** One finished exchange in the shapes a chat loads into: drawn as the transcript's bones while its messages load. */
const SAMPLE: readonly Item[] = [
  { kind: "divider", key: "divider", text: "Today" },
  { kind: "user", key: "user", text: "Plan the week ahead with me", images: [], at: null },
  { kind: "work", key: "work", steps: [], plan: undefined, active: false, startedAt: 0, endedAt: 2000 },
  { kind: "text", key: "text", text: "Here is a first pass at the week, with the three things worth a look today.", streaming: false, at: null },
]

export function Transcript(props: { state: ThreadState | undefined; sessionId: string }) {
  let scroller!: HTMLDivElement
  let column!: HTMLDivElement
  let following = true
  let baseline = { top: 0, height: 0 }
  const [away, setAway] = createSignal(false)
  const distance = () => scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight
  const toEnd = (smooth = false) => {
    following = true
    setAway(false)
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: smooth ? "smooth" : "instant" })
    baseline = { top: scroller.scrollTop, height: scroller.scrollHeight }
  }
  const onScroll = () => {
    if (scroller.scrollTop < tokens.limit["transcript-edge"] && untrack(depth) < untrack(items).length) {
      const pinnedTop = scroller.scrollTop < 1
      const fromEnd = pinnedTop ? scroller.scrollHeight : 0
      setDepth((now) => now + tokens.limit["transcript-step"])
      if (pinnedTop) requestAnimationFrame(() => (scroller.scrollTop = scroller.scrollHeight - fromEnd))
    }
    const next = { top: scroller.scrollTop, height: scroller.scrollHeight }
    const upward = next.height >= baseline.height && next.top < baseline.top - 1
    baseline = next
    if (upward) following = false
    if (distance() <= tokens.size["column-bottom"]) following = true
    setAway(!following && distance() > tokens.size["column-bottom"])
  }
  const grow = new ResizeObserver(() => {
    if (following) toEnd()
    else setAway(distance() > tokens.size["column-bottom"])
  })
  onSettled(() => {
    grow.observe(column)
    toEnd()
  })
  onCleanup(() => grow.disconnect())
  const [open, setOpen] = createSignal<{ key: string; anchor: HTMLElement }>()
  const toggle = (key: string, anchor: HTMLElement) => setOpen((current) => (current?.key === key ? undefined : { key, anchor }))
  const items = createMemo(() => (props.state ? buildItems(props.state.entries, props.state.live, props.state.pending, app.connection === "open" || app.connection === "connecting") : []))
  const [depth, setDepth] = createSignal<number>(tokens.limit["transcript-window"])
  /** Long chats mount their newest items first and the rest as you scroll up (overflow-anchor keeps your place), so opening a 500-message chat costs what opening a short one does. */
  const shown = createMemo(() => {
    const all = items()
    return all.length > depth() ? all.slice(all.length - depth()) : all
  })
  createEffect(
    () => props.sessionId,
    () => void setDepth(tokens.limit["transcript-window"]),
  )
  /** The rest of a long chat mounts above the fold in idle slices right after it opens, so scrolling back later never waits on a mount. */
  let idle = 0
  const fill = () => {
    cancelIdleCallback(idle)
    if (untrack(depth) >= untrack(items).length) return
    idle = requestIdleCallback(() => {
      setDepth((now) => now + tokens.limit["transcript-step"])
      fill()
    })
  }
  createEffect(
    () => [props.sessionId, items().length] as const,
    () => fill(),
  )
  onCleanup(() => cancelIdleCallback(idle))
  /** Messages that arrived while you were scrolled up: counted from the moment the pill appears. */
  const messages = createMemo(() => new Set(items().flatMap((item) => (item.kind === "text" ? [item.key.replace(/:\d+$/, "")] : item.kind === "user" ? [item.key] : []))).size)
  const [mark, setMark] = createSignal(0)
  createEffect(away, (on) => void (on && setMark(untrack(messages))))
  const unseen = () => (away() ? Math.max(0, messages() - mark()) : 0)
  const all = () => setDepth(Number.POSITIVE_INFINITY)
  addEventListener("tds-transcript-all", all)
  onCleanup(() => removeEventListener("tds-transcript-all", all))
  createEffect(
    () => props.state?.pending.at(-1)?.id,
    (sent) => {
      if (sent) requestAnimationFrame(() => toEnd())
    },
  )
  createEffect(
    () => props.sessionId,
    () => {
      requestAnimationFrame(() => toEnd())
    },
  )
  const view = (item: () => Item) => (
    <Switch>
      <Match when={item().kind === "text"}>
        <Markdown text={(item() as Extract<Item, { kind: "text" }>).text} streaming={(item() as Extract<Item, { kind: "text" }>).streaming} />
      </Match>
      <Match when={item().kind === "user" || item().kind === "routine"}>
        <Bubble item={item() as Extract<Item, { kind: "user" | "routine" }>} queued={(item() as { queued?: boolean }).queued === true} />
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
        <div class="tds-alert tds-raise-1" role="status">
          <span class="tds-tint tds-tint-failed size-toast-icon"><Icon name="warning-circle" size="toast" /></span>
          <span class="min-w-0">
            <b class="block text-body">{(item() as Extract<Item, { kind: "error" }>).title}</b>
            <span class="text-caption text-muted">{(item() as Extract<Item, { kind: "error" }>).detail}</span>
          </span>
        </div>
      </Match>
    </Switch>
  )
  return (
    <>
    <div ref={scroller} class="tds-transcript tds-scroll" onContextMenu={openLinkMenu} onScroll={onScroll}>
      <Skeleton
        fill
        id={`transcript:${props.sessionId}`}
        label="Loading messages"
        loading={props.state?.phase === "loading" && items().length === 0}
        sample={() => <div class="tds-column">{SAMPLE.map((item) => view(() => item))}</div>}
      >
        <div ref={column} class="tds-column">
          <For each={shown()} keyed={(item) => item.key}>
            {(item) => view(item)}
          </For>
        </div>
      </Skeleton>
    </div>
    <button type="button" class="tds-jump tds-glass" data-on={away() ? "" : undefined} data-count={unseen() ? "" : undefined} tabindex={away() ? 0 : -1} aria-hidden={away() ? undefined : "true"} aria-label={unseen() ? `Scroll to end, ${unseen()} new` : "Scroll to end"} onClick={() => toEnd(true)}>
      <MorphIcon name="arrow-down" size="chip" class="tds-optical-down" weight={tokens.icon["stroke-send"]} />
      <span class="tds-jump-count"><TextMorph value={unseen() ? `${unseen()} new` : ""} mode="roll" /></span>
    </button>
    <LinkMenu onCopied={(href) => toast("Link copied", { description: shortUrl(href), id: "copy", duration: tokens.motion.toast.copy })} />
    <Show when={open()}>
      {(current) => <WorkLog work={items().find((item): item is Work => item.kind === "work" && item.key === current().key)} anchor={current().anchor} sessionId={props.sessionId} onClose={() => setOpen(undefined)} />}
    </Show>
    </>
  )
}
