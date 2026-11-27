import { createEffect, createSignal, onCleanup, Show, untrack } from "solid-js"
import { Icon } from "@tock/ui/icon"
import { Orb, type OrbStatus } from "@tock/ui/orb"
import { TextMorph } from "@tock/ui/text-morph"
import { tokens } from "@tock/tokens"
import { app } from "../state/app"
import { toast } from "../shell/toasts"

const LABEL: Record<OrbStatus, string> = { working: "working", needs: "needs you", failed: "failed", done: "done" }

export function Header(props: { title: string; status: OrbStatus | undefined }) {
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
  const status = () => (props.status && props.status !== "done" ? props.status : undefined)
  return (
    <>
      <header class="tds-header">
        <div class="tds-header-stack">
          <span class="grid size-header-avatar place-items-center rounded-pill bg-glass shadow-glass">
            <img src="/brand/toast-face-center.svg" alt="" class="size-header-face" draggable={false} />
          </span>
          <span class="tds-header-pill tds-glass">
            <span class="tds-header-title" title={props.title} role="heading" aria-level="1"><TextMorph value={props.title} /></span>
            <span class="tds-header-status" data-on={status() ? "" : undefined}>
              <Show when={status()}>{(s) => <Orb status={s()} surface="main" size="orb-sm" />}</Show>
              <TextMorph value={status() ? LABEL[status()!] : ""} />
            </span>
          </span>
        </div>
        <div class="tds-header-actions" data-finding={finding() ? "" : undefined}>
          <Show when={finding()}>
            <Finder onClose={() => setFinding(false)} />
          </Show>
          <button type="button" class="tds-header-button tds-press" aria-label="Search in chat" aria-pressed={finding() ? "true" : "false"} onClick={() => setFinding((on) => !on)}>
            <Icon name="magnifying-glass" size="row" />
          </button>
          <button type="button" class="tds-header-button tds-press" aria-label="Share" onClick={() => void share()}>
            <Icon name="link-simple" size="row" />
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
    ranges[pick]?.startContainer.parentElement?.scrollIntoView({ block: "center", behavior: "smooth" })
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
        <TextMorph value={!query().trim() ? "" : count() ? `${at() + 1} of ${count()}` : "No matches"} />
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

/** Slides under the header when the socket drops, then turns green with "Back online" for a moment (px4 setOffline). */
function OfflineBanner() {
  const [shown, setShown] = createSignal<"off" | "on" | "ok">("off")
  let seen = app.connection === "open"
  let timer: ReturnType<typeof setTimeout> | undefined
  const dropped = () => {
    clearTimeout(timer)
    setShown("on")
  }
  addEventListener("offline", dropped)
  onCleanup(() => (clearTimeout(timer), removeEventListener("offline", dropped)))
  createEffect(
    () => app.connection,
    (connection) => {
      if (connection === "open") {
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
    <div class="tds-banner" data-state={shown()} role="status" aria-live="polite" aria-hidden={shown() === "off" ? "true" : undefined}>
      <Icon name={shown() === "ok" ? "check" : "wifi-slash"} size="toast" />
      <TextMorph value={shown() === "ok" ? "Back online" : "You’re offline. Messages and files wait, and send when you’re back."} />
    </div>
  )
}
