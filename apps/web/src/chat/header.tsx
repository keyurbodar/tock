import { createEffect, createSignal, onCleanup, Show, untrack } from "solid-js"
import { Icon } from "@tock/ui/icon"
import { TockIcon } from "@tock/ui/tock-icon"
import { Orb, type OrbStatus } from "@tock/ui/orb"
import { TextMorph } from "@tock/ui/text-morph"
import { MenuTrigger } from "@ui-sdk/solid/menu"
import { useNavigate, useParams } from "@solidjs/router"
import { glyphFor } from "../lib/glyph"
import { Skeleton, scrollBehavior } from "@tock/ui/motion"
import { tokens } from "@tock/tokens"
import { app } from "../state/app"
import { visibleTimeout } from "../lib/socket"
import { STATUS_LABEL } from "../lib/status"
import { dirOf } from "../lib/dir"
import { toast } from "../shell/toasts"
import { threadMenu } from "../shell/thread-menu"
import { sidebarOpen, toggleSidebar } from "../shell/sidebar"
import { narrow } from "../shell/narrow"

const LABEL: Record<OrbStatus, string> = STATUS_LABEL

export function Header(props: { title: string; glyph: ReturnType<typeof glyphFor> | undefined; status: OrbStatus | undefined; loading?: boolean; shape?: string }) {
  const [finding, setFinding] = createSignal(false)
  const share = async () => {
    await navigator.clipboard.writeText(location.href)
    toast("Link copied", { description: location.host + location.pathname, id: "copy", duration: tokens.motion.toast.copy })
  }
  const onKey = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f" && !e.shiftKey) {
      e.preventDefault()
      setFinding(true)
      document.querySelector<HTMLInputElement>(".tds-find input")?.select()
    }
  }
  addEventListener("keydown", onKey)
  onCleanup(() => removeEventListener("keydown", onKey))
  const params = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const session = () => app.sessions.find((s) => s.id === params.id)
  const glyph = () => props.glyph ?? (params.id ? glyphFor(params.id) : undefined)
  const status = () => (props.status && props.status !== "done" ? props.status : undefined)
  const [shown, setShown] = createSignal<OrbStatus>()
  createEffect(status, (now) => void (now && setShown(now)))
  const title = () => (
    <>
      <span class={`tds-ttl-icon ${glyph()?.hue ?? ""}`} aria-hidden="true">
        <Show when={glyph()}>{(g) => <TockIcon name={g().icon} color={g().tone} size={tokens.icon.channel} />}</Show>
      </span>
      <span class="tds-header-title" dir={dirOf(props.title)}>
        <Skeleton inline id={props.shape} label="Loading channel name" loading={props.loading === true} sample={() => <span>Planning the week</span>}>
          <span>{props.title}</span>
        </Skeleton>
      </span>
    </>
  )
  return (
    <>
      <header class="tds-header">
        <span class="tds-header-band" aria-hidden="true" />
        <h1 class="sr-only">{props.title}</h1>
        <div class="tds-header-start">
          <Show when={narrow() || !sidebarOpen()}>
            <button type="button" class="tds-ib" aria-label={narrow() ? "Channels" : "Open sidebar"} aria-expanded="false" data-tip="" data-tip-side="right" onClick={() => (untrack(narrow) ? navigate("/") : toggleSidebar(true))}>
              <Icon name="sidebar-simple" size="bar" />
            </button>
          </Show>
          <Show when={session()} fallback={<span class="tds-ttl" data-static="">{title()}</span>}>
            {(s) => (
              <MenuTrigger controller={threadMenu} payload={s()} class="tds-ttl" aria-label={`${props.title}, channel options`}>
                {title()}
                <Icon name="caret-down" size="caret" class="tds-ttl-cv" />
              </MenuTrigger>
            )}
          </Show>
          <span class="tds-header-status" data-on={status() ? "" : undefined} role="status">
            <span class="tds-header-orb">
              <Show when={shown()}>{(s) => <Orb status={s()} />}</Show>
            </span>
            <TextMorph value={status() ? LABEL[status()!] : ""} mode="calm" />
          </span>
        </div>
        <div class="tds-header-actions" data-finding={finding() ? "" : undefined}>
          <Show when={finding()}>
            <Finder onClose={() => setFinding(false)} />
          </Show>
          <button type="button" class="tds-ib" aria-label="Search in channel" data-tip="" data-tip-side="bottom" aria-pressed={finding() ? "true" : "false"} onClick={() => setFinding((on) => !on)}>
            <Icon name="magnifying-glass" size="bar" />
          </button>
          <button type="button" class="tds-ib" aria-label="Share" data-tip="" data-tip-side="bottom" onClick={() => void share()}>
            <Icon name="export" size="bar" />
          </button>
        </div>
      </header>
      <OfflineBanner />
    </>
  )
}

/** Find in chat: matches are painted with the CSS Custom Highlight API, so the transcript DOM is never touched. */
function Finder(props: { onClose: () => void }) {
  const [query, setQuery] = createSignal("")
  const [at, setAt] = createSignal(0)
  const [count, setCount] = createSignal(0)
  let ranges: Range[] = []
  let input!: HTMLInputElement
  queueMicrotask(() => dispatchEvent(new Event("tds-transcript-all")))
  const paint = (q: string, index: number) => {
    const root = document.querySelector(".tds-transcript .tds-column")
    const all = new Highlight()
    const current = new Highlight()
    ranges = []
    if (root && q.trim()) {
      const needle = q.toLowerCase()
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent?.toLowerCase() ?? ""
        for (let i = text.indexOf(needle); i !== -1; i = text.indexOf(needle, i + needle.length)) {
          const range = new Range()
          range.setStart(node, i)
          range.setEnd(node, i + needle.length)
          ranges.push(range)
        }
      }
    }
    const pick = ranges.length ? ((index % ranges.length) + ranges.length) % ranges.length : 0
    ranges.forEach((range, i) => (i === pick ? current : all).add(range))
    CSS.highlights.set("tds-find", all)
    CSS.highlights.set("tds-find-on", current)
    setCount(ranges.length)
    setAt(pick)
    ranges[pick]?.startContainer.parentElement?.scrollIntoView({ block: "center", behavior: scrollBehavior() })
  }
  createEffect(query, (q) => untrack(() => paint(q, 0)))
  const step = (by: number) => paint(query(), at() + by)
  onCleanup(() => {
    CSS.highlights.delete("tds-find")
    CSS.highlights.delete("tds-find-on")
  })
  queueMicrotask(() => input.focus())
  return (
    <div class="tds-find tds-glass" role="search">
      <Icon name="magnifying-glass" size="menu" class="text-faint" />
      <input
        ref={input}
        value={query()}
        placeholder="Search in chat"
        aria-label="Search in chat"
        onInput={(e) => setQuery(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") step(e.shiftKey ? -1 : 1)
          if (e.key === "Escape") props.onClose()
        }}
      />
      <span class="tds-find-count num" data-empty={query().trim() && count() === 0 ? "" : undefined}>
        <TextMorph value={!query().trim() ? "" : count() ? `${at() + 1} of ${count()}` : "No matches"} mode="calm" />
      </span>
      <button type="button" class="tds-find-step tds-press" aria-label="Previous match" disabled={count() === 0} onClick={() => step(-1)}>
        <Icon name="caret-up" size="chip" />
      </button>
      <button type="button" class="tds-find-step tds-press" aria-label="Next match" disabled={count() === 0} onClick={() => step(1)}>
        <Icon name="caret-down" size="chip" />
      </button>
      <button type="button" class="tds-find-step tds-press" aria-label="Close search" onClick={() => props.onClose()}>
        <Icon name="x" size="chip" />
      </button>
    </div>
  )
}

/** Slides under the header when the socket drops, then turns green with "Back online" for a moment (px4 setOffline). It says offline only when the browser is; a dropped socket on a live network is reconnecting. */
function OfflineBanner() {
  const [shown, setShown] = createSignal<"off" | "on" | "ok">("off")
  const [online, setOnline] = createSignal(navigator.onLine)
  const network = () => setOnline(navigator.onLine)
  addEventListener("online", network)
  addEventListener("offline", network)
  let seen = untrack(() => app.connection) === "open"
  let timer: ReturnType<typeof setTimeout> | undefined
  let grace: (() => void) | undefined
  /** Offline shows at once. A dropped socket on a live network shows only after reconnect-grace of visible time, so a quick silent reconnect (often after the tab comes back) never flashes the banner. */
  const dropped = () => {
    clearTimeout(timer)
    grace?.()
    if (!navigator.onLine) return setShown("on")
    grace = visibleTimeout(tokens.motion.duration["reconnect-grace"], () => untrack(() => app.connection) !== "open" && setShown("on"))
  }
  addEventListener("offline", dropped)
  onCleanup(() => (clearTimeout(timer), grace?.(), removeEventListener("offline", dropped), removeEventListener("online", network), removeEventListener("offline", network)))
  createEffect(
    () => app.connection,
    (connection) => {
      if (connection === "open") {
        grace?.()
        if (untrack(shown) === "on") {
          clearTimeout(timer)
          setShown("ok")
          timer = setTimeout(() => setShown("off"), tokens.motion.duration.confirm + tokens.motion.duration.exit * 4)
        }
        seen = true
        return
      }
      if ((seen || !navigator.onLine) && connection !== "unauthorized") dropped()
    },
  )
  return (
    <div class="tds-banner tds-glass" data-state={shown()} role="status" aria-live="polite" aria-hidden={shown() === "off" ? "true" : undefined}>
      <Icon name={shown() === "ok" ? "check" : online() ? "arrow-clockwise" : "wifi-slash"} size="toast" />
      <TextMorph value={shown() === "ok" ? "Back online" : online() ? "Reconnecting…" : "You’re offline. Messages and files wait, and send when you’re back."} mode="calm" />
    </div>
  )
}
