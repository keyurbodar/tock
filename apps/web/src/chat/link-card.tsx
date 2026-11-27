import { createSignal, onCleanup, Show } from "solid-js"
import { Icon } from "@tock/ui/icon"
import { tokens } from "@tock/tokens"

interface Shown {
  readonly href: string
  readonly host: string
  readonly path: string
  readonly left: number
  readonly bottom: number
}

const describe = (anchor: HTMLAnchorElement, host: DOMRect): Shown | undefined => {
  let url: URL
  try {
    url = new URL(anchor.href)
  } catch {
    return undefined
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return undefined
  const at = anchor.getBoundingClientRect()
  return {
    href: url.href,
    host: url.host.replace(/^www\./, ""),
    path: decodeURIComponent(url.pathname + url.search).replace(/\/$/, "") || "/",
    left: Math.min(at.left - host.left, host.width - tokens.size["hover-card"] - tokens.space[12]),
    bottom: host.bottom - at.top + tokens.size["menu-offset"],
  }
}

/** Hovering a link in a reply shows where it goes, after hover intent, and lets you open or copy it. */
export function LinkCards(props: { root: () => HTMLElement | undefined }) {
  const [shown, setShown] = createSignal<Shown>()
  const [copied, setCopied] = createSignal(false)
  let openTimer: ReturnType<typeof setTimeout> | undefined
  let leaveTimer: ReturnType<typeof setTimeout> | undefined
  let card: HTMLDivElement | undefined

  const hide = () => {
    clearTimeout(openTimer)
    clearTimeout(leaveTimer)
    leaveTimer = setTimeout(() => (setShown(undefined), setCopied(false)), tokens.motion["hover-intent"].leave)
  }
  const over = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return
    const target = event.target as Element
    if (card?.contains(target)) return clearTimeout(leaveTimer)
    const anchor = target.closest?.("a.tds-link") as HTMLAnchorElement | null
    if (!anchor) return
    clearTimeout(leaveTimer)
    clearTimeout(openTimer)
    const root = props.root()
    if (!root) return
    const delay = shown() ? 0 : tokens.motion["hover-intent"].open
    openTimer = setTimeout(() => setShown(describe(anchor, root.getBoundingClientRect())), delay)
  }
  const out = (event: PointerEvent) => {
    const next = event.relatedTarget as Element | null
    if (next && (card?.contains(next) || next.closest?.("a.tds-link"))) return
    if ((event.target as Element).closest?.("a.tds-link") || card?.contains(event.target as Node)) hide()
  }
  addEventListener("pointerover", over)
  addEventListener("pointerout", out)
  onCleanup(() => {
    clearTimeout(openTimer)
    clearTimeout(leaveTimer)
    removeEventListener("pointerover", over)
    removeEventListener("pointerout", out)
  })

  return (
    <Show when={shown()}>
      {(info) => (
        <div ref={card} class="tds-hover-card" role="tooltip" style={{ left: `${info().left}px`, bottom: `${info().bottom}px` }}>
          <div class="tds-hover-head">
            <span class="tds-fav">{info().host.charAt(0).toUpperCase()}</span>
            <span class="min-w-0">
              <b>{info().path === "/" ? info().host : info().path}</b>
              <span>{info().host}</span>
            </span>
          </div>
          <div class="tds-hover-actions">
            <a class="tds-hover-button tds-press" href={info().href} target="_blank" rel="noreferrer">
              <Icon name="arrow-square-out" size="chip" />
              Open
            </a>
            <button type="button" class="tds-hover-button tds-press" onClick={() => void navigator.clipboard.writeText(info().href).then(() => setCopied(true))}>
              <Icon name={copied() ? "check" : "link-simple"} size="chip" />
              {copied() ? "Copied" : "Copy Link"}
            </button>
          </div>
        </div>
      )}
    </Show>
  )
}
