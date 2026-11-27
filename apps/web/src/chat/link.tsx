import { createSignal, For, Show, untrack } from "solid-js"
import type { JSX } from "@solidjs/web"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@ui-sdk/solid/hover-card"
import { createMenuController, Menu, MenuContent, MenuItem, MenuItemIcon, MenuSeparator } from "@ui-sdk/solid/menu"
import { Icon } from "@tock/ui/icon"
import { animate, dur } from "@tock/ui/motion"
import { tokens } from "@tock/tokens"

export const webHost = (href: string | undefined): string | null => {
  if (!href) return null
  try {
    const url = new URL(href, location.href)
    return url.protocol === "http:" || url.protocol === "https:" ? url.hostname : null
  } catch {
    return null
  }
}

/** What the worker's resolver (GET /api/link) says about a page; one fetch per URL per session, shared by every link and card. */
export interface LinkPreview {
  readonly url: string
  readonly title: string | null
  readonly site: string
  readonly favicon: string | null
  readonly image: string | null
}

const previews = new Map<string, () => LinkPreview | null | undefined>()

/** The page's preview: undefined while it loads, null when the resolver refused the URL. */
export function linkPreview(href: string): LinkPreview | null | undefined {
  let read = previews.get(href)
  if (!read) {
    const [get, set] = createSignal<LinkPreview | null | undefined>(undefined)
    void fetch(`/api/link?url=${encodeURIComponent(href)}`)
      .then((response) => (response.ok ? (response.json() as Promise<LinkPreview>) : null))
      .catch(() => null)
      .then((value) => set(() => value))
    previews.set(href, get)
    read = get
  }
  return read()
}

/** Favicon bytes come through the worker, so the client never hotlinks a third-party host. */
export const iconUrl = (host: string) => `/api/link/icon?host=${encodeURIComponent(host)}`

const failed = new Set<string>()

/** The icon box is reserved before the bytes arrive; the favicon fades in over the globe, so nothing on the line moves. */
export function fadeFavicon(img: HTMLImageElement) {
  const opts = { duration: dur.tooltip, fill: "forwards" as const }
  animate(img, [{ opacity: 0 }, { opacity: 1 }], opts)
  animate(img.parentElement?.querySelector(".tds-link-fav-glyph"), [{ opacity: 1 }, { opacity: 0 }], opts)
}

/** The globe stays; the box keeps the URL that failed (data-icon-failed) so a journey can report why. */
export function brokenFavicon(img: HTMLImageElement, host: string) {
  failed.add(host)
  img.parentElement?.setAttribute("data-icon-failed", img.getAttribute("src") ?? "")
  img.remove()
}

function Favicon(props: { host: string }) {
  return (
    <span class="tds-link-fav" aria-hidden="true">
      <svg class="tds-icon tds-link-fav-glyph">
        <use href="#i-globe" />
      </svg>
      <Show when={!failed.has(props.host)}>
        <img src={iconUrl(props.host)} alt="" decoding="async" draggable={false} onLoad={(event) => fadeFavicon(event.currentTarget)} onError={(event) => brokenFavicon(event.currentTarget, untrack(() => props.host))} />
      </Show>
    </span>
  )
}

/** The link's hover card (TG-34): favicon, page title, site and the full URL, from the same resolver as the chip. */
export function LinkCardBody(props: { href: string; host: string }) {
  const preview = () => linkPreview(props.href)
  const site = () => preview()?.site ?? props.host.replace(/^www\./, "")
  return (
    <>
      <span class="tds-link-card-head">
        <Favicon host={props.host} />
        <b class="tds-link-card-title" data-loading={preview() === undefined ? "" : undefined}>
          {preview()?.title ?? site()}
        </b>
      </span>
      <span class="tds-link-card-site">{site()}</span>
      <span class="tds-link-card-url">{props.href}</span>
    </>
  )
}

const LEAD = /^https?:\/\//i
const lead = (text: string) => LEAD.exec(text)?.[0].length ?? (Array.from(text.slice(0, 2))[0]?.length ?? 0)

/** Long words break anywhere, short ones (a PR number) stay whole, as T3Code's breakableExternalLinkText. */
const breakable = (text: string) =>
  Array.from(text.matchAll(/\s+|\S+/g), ({ 0: word }) => (word.length <= tokens.limit["link-word"] ? word : <span class="tds-link-break">{word}</span>))

/** A bare URL reads as host and path, cut at the TDS length with one ellipsis. */
export function shortUrl(href: string) {
  const bare = href.replace(LEAD, "").replace(/^www\./, "").replace(/\/$/, "")
  return bare.length > tokens.limit["link-chars"] ? `${bare.slice(0, tokens.limit["link-chars"]).replace(/[./-]+$/, "")}…` : bare
}

const bare = (text: string) => text.trim().toLowerCase().replace(LEAD, "").replace(/^www\./, "").replace(/\/$/, "")

/**
 * A link is a chip when its text is the address itself: a bare URL, or a label that is the URL or a prefix of it with no
 * spaces (`[x.com/a](https://x.com/a)`). Any other words stay words, with the favicon in front.
 */
export function isAddressLabel(label: string | null, href: string) {
  if (label === null || /\s/.test(label.trim()) || !label.includes(".")) return false
  const text = bare(label).replace(/…$/, "")
  return text.length > 0 && bare(href).startsWith(text)
}

/**
 * An external link in prose, after T3Code's MarkdownExternalLink: the site's favicon glued to the first characters, then
 * text that wraps. A pause on it opens the link card, the way the thread chip opens its card.
 */
export function ExternalLink(props: { href: string; host: string; text: string | null; chip: boolean; children?: JSX.Element }) {
  return (
    <HoverCard delay={tokens.motion["hover-intent"].open} closeDelay={tokens.motion["hover-intent"].leave}>
      <HoverCardTrigger class="tds-link" data-link="web" data-shape={props.chip ? "chip" : "words"} href={props.href} target="_blank" rel="noopener noreferrer">
        <ExternalLinkText {...props} />
      </HoverCardTrigger>
      <HoverCardContent class="tds-link-card tds-over" side="top" align="start" sideOffset={tokens.size["menu-offset"]}>
        <LinkCardBody href={props.href} host={props.host} />
      </HoverCardContent>
    </HoverCard>
  )
}

function ExternalLinkText(props: { host: string; text: string | null; chip: boolean; children?: JSX.Element }) {
  return (
    <>
      {props.chip && props.text ? (
        <span class="tds-link-lead">
          <Favicon host={props.host} />
          {props.text}
        </span>
      ) : props.text ? (
        <>
          <span class="tds-link-lead">
            <Favicon host={props.host} />
            {props.text.slice(0, lead(props.text))}
          </span>
          {breakable(props.text.slice(lead(props.text)))}
        </>
      ) : (
        <span class="tds-link-break">
          <Favicon host={props.host} />
          {props.children}
        </span>
      )}
    </>
  )
}

const linkMenu = createMenuController<string>()

const items = [
  { value: "open", icon: "arrow-square-out", label: "Open Link" },
  { value: "copy", icon: "link-simple", label: "Copy Link" },
] as const

/** Right-click on a link in chat opens Open and Copy, as T3Code's external link context menu; plain clicks still navigate. */
export function LinkMenu(props: { onCopied: (href: string) => void }) {
  const run = (action: string) => {
    const href = linkMenu.getPayload()
    if (!href) return
    if (action === "open") open(href, "_blank", "noopener,noreferrer")
    if (action === "copy") void navigator.clipboard.writeText(href).then(() => props.onCopied(href))
  }
  return (
    <Menu controller={linkMenu} onAction={(value) => run(String(value))}>
      <MenuContent<string> class="tds-menu tds-over" data-edge-fade="y" align="start" sideOffset={tokens.size["menu-offset"]}>
        {(state) => (
          <>
            <span class="tds-menu-label">{webHost(state.payload) ?? ""}</span>
            <MenuSeparator class="tds-menu-sep" />
            <For each={items} keyed={false}>
              {(item) => (
                <MenuItem value={item().value} class="tds-menu-item">
                  <MenuItemIcon class="tds-menu-icon">
                    <Icon name={item().icon} size="menu" />
                  </MenuItemIcon>
                  {item().label}
                </MenuItem>
              )}
            </For>
          </>
        )}
      </MenuContent>
    </Menu>
  )
}

export function openLinkMenu(event: MouseEvent) {
  const anchor = (event.target as Element | null)?.closest?.("a[data-link=web]") as HTMLAnchorElement | null
  if (!anchor || event.shiftKey) return
  event.preventDefault()
  const at = DOMRect.fromRect({ x: event.clientX, y: event.clientY, width: 0, height: 0 })
  void linkMenu.open({ payload: anchor.href, anchor: { getBoundingClientRect: () => at } as Element })
}
