import { clamp } from "./clamp"
import { createEffect, createMemo, createSignal, For, Match, onCleanup, onSettled, Show, Switch, untrack } from "solid-js"
import { afterLayout, enter, exit, scrollBehavior, Skeleton } from "@tock/ui/motion"
import { Icon } from "@tock/ui/icon"
import { MorphIcon, TextMorph } from "@tock/ui/motion"
import { tokens } from "@tock/tokens"
import { buildItems, type Item } from "./items"
import { Markdown } from "./markdown"
import { Activity, Typing, WorkLog, type Work } from "./activity"
import { AskCard } from "./ask"
import { splitFiles } from "./attachments"
import { Attachments } from "./files"
import { LinkMenu, openLinkMenu, shortUrl } from "./link"
import { toast } from "../shell/toasts"
import { app, send, type ThreadState } from "../state/app"
import { cancelIdle, whenIdle } from "../lib/idle"

function Bubble(props: { item: Extract<Item, { kind: "user" | "routine" }>; queued?: boolean }) {
  const mine = () => props.item.kind === "user"
  const parts = createMemo(() => splitFiles(props.item.text))
  return (
    <>
      <Show when={parts().files.length > 0}>
        <Attachments files={parts().files} side={mine() ? "me" : "agent"} queued={props.queued} />
      </Show>
      <Show when={parts().text}>
        <div ref={(el) => clamp(el)} class="tds-bubble" dir="auto" data-side={mine() ? "me" : "agent"} data-queued={props.queued ? "" : undefined}>
          <div class="tds-bubble-rich">
            <Markdown text={parts().text} nested />
          </div>
        </div>
      </Show>
    </>
  )
}

const WAVE = `M0 6${"q7.5 -6 15 0t15 0".repeat(20)}`

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
  /** Entrances play only for what arrives after a chat's first paint, so opening or switching chats shows the history at rest. */
  const [ready, setReady] = createSignal(false)
  const distance = () => scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight
  const toEnd = (smooth = false) => {
    following = true
    setAway(false)
    const height = scroller.scrollHeight
    const top = smooth ? scroller.scrollTop : Math.max(0, height - scroller.clientHeight)
    scroller.scrollTo({ top: height, behavior: smooth ? scrollBehavior() : "instant" })
    baseline = { top, height }
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
  const built = createMemo(() => (props.state ? buildItems(props.state.entries, props.state.live, props.state.pending, app.connection === "open" || app.connection === "connecting", Date.now(), props.state.thinking) : []))
  const groupOf = (item: Item) => (item.kind === "text" ? item.key.replace(/:\d+$/, "") : item.kind === "user" ? item.key : undefined)
  /** TDS CxDividersTime "New": a rose "N new" divider where the messages that arrived while you were scrolled up start; it stays until you send. */
  const [seen, setSeen] = createSignal<ReadonlySet<string>>()
  let jump: HTMLButtonElement | undefined
  let jumpShown = false
  createEffect(away, (on) => {
    if (on === jumpShown || !jump) return
    jumpShown = on
    if (on) enter.menu(jump)
    else exit.menu(jump)
  })
  createEffect(away, (on) => {
    if (on && !untrack(seen)) setSeen(new Set(untrack(built).flatMap((item) => groupOf(item) ?? [])))
    if (!on && !untrack(items).some((item) => item.key === "divider:new")) setSeen(undefined)
  })
  createEffect(
    () => props.sessionId,
    () => void setSeen(undefined),
  )
  createEffect(
    () => props.state?.pending.at(-1)?.id,
    (sent) => void (sent && setSeen(undefined)),
  )
  const items = createMemo(() => {
    const all = built()
    const known = seen()
    if (!known) return all
    const at = all.findIndex((item) => groupOf(item) !== undefined && !known.has(groupOf(item)!))
    if (at < 0) return all
    const count = new Set(all.slice(at).flatMap((item) => groupOf(item) ?? [])).size
    return [...all.slice(0, at), { kind: "divider", key: "divider:new", text: `${count} new`, tone: "new" } as const, ...all.slice(at)]
  })
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
    cancelIdle(idle)
    if (untrack(depth) >= untrack(items).length) return
    idle = whenIdle(() => {
      setDepth((now) => now + tokens.limit["transcript-step"])
      fill()
    })
  }
  createEffect(
    () => [props.sessionId, items().length] as const,
    () => fill(),
  )
  onCleanup(() => cancelIdle(idle))
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
  createEffect(
    () => (props.state?.phase !== "loading" && items().length > 0 ? props.sessionId : undefined),
    (painted) => {
      setReady(false)
      if (painted) return afterLayout(scroller, () => requestAnimationFrame(() => setReady(true)))
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
        <div class="tds-divider" role="separator" data-tone={(item() as Extract<Item, { kind: "divider" }>).tone}>
          <Show when={(item() as Extract<Item, { kind: "divider" }>).tone === "passed"} fallback={<span class="tds-divider-rule" />}>
            <span class="tds-divider-wave"><svg viewBox="0 0 600 12" aria-hidden="true"><path d={WAVE} /></svg></span>
          </Show>
          <span class="tds-divider-text">{(item() as Extract<Item, { kind: "divider" }>).text}</span>
          <Show when={(item() as Extract<Item, { kind: "divider" }>).tone === "passed"} fallback={<span class="tds-divider-rule" />}>
            <span class="tds-divider-wave" data-end=""><svg viewBox="0 0 600 12" aria-hidden="true"><path d={WAVE} /></svg></span>
          </Show>
        </div>
      </Match>
      <Match when={item().kind === "error" && (item() as Extract<Item, { kind: "error" }>)}>
        {(error) => (
          <div class="tds-alert tds-raise-1" role="status">
            <span class="tds-tint tds-tint-failed size-toast-icon"><Icon name="warning-circle" size="toast" /></span>
            <span class="min-w-0">
              <b class="block text-body">{error().title}</b>
              <span class="text-caption text-muted">{error().detail}</span>
            </span>
            <Show when={error().retry}>
              {(text) => (
                <button type="button" class="tds-wbtn tds-alert-retry" data-primary="" onClick={() => void send(props.sessionId, text())}>
                  Retry
                </button>
              )}
            </Show>
          </div>
        )}
      </Match>
    </Switch>
  )
  return (
    <>
    <div ref={scroller} class="tds-transcript tds-scroll" data-away={away() ? "" : undefined} data-ready={ready() ? "" : undefined} onContextMenu={openLinkMenu} onScroll={onScroll}>
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
    <button ref={jump} type="button" class="tds-press tds-jump tds-glass tds-raise-glass" data-on={away() ? "" : undefined} data-count={unseen() ? "" : undefined} tabindex={away() ? 0 : -1} aria-hidden={away() ? undefined : "true"} aria-label={unseen() ? `Scroll to end, ${unseen()} new` : "Scroll to end"} onClick={() => toEnd(true)}>
      <MorphIcon name="chevron-down" size="send" weight={tokens.icon["stroke-crisp"]} />
      <span class="tds-jump-count num"><TextMorph value={unseen() ? String(unseen()) : ""} mode="roll" /></span>
    </button>
    <LinkMenu onCopied={(href) => toast("Link copied", { description: shortUrl(href), id: "copy", duration: tokens.motion.toast.copy })} />
    <Show when={open()}>
      {(current) => <WorkLog work={items().find((item): item is Work => item.kind === "work" && item.key === current().key)} anchor={current().anchor} sessionId={props.sessionId} onClose={() => setOpen(undefined)} />}
    </Show>
    </>
  )
}
