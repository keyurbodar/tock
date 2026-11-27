import { createSignal, For, Show } from "solid-js"
import type { JSX } from "@solidjs/web"
import { createMenuController, Menu, MenuContent, MenuItem, MenuItemIcon, MenuSeparator } from "@ui-sdk/solid/menu"
import { Icon } from "@tock/ui/icon"
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

const failed = new Set<string>()

function Favicon(props: { host: string }) {
  const [broken, setBroken] = createSignal(false)
  return (
    <span class="tds-link-fav" aria-hidden="true">
      <Show
        when={!broken() && !failed.has(props.host)}
        fallback={
          <svg class="tds-icon tds-chip-icon">
            <use href="#i-globe" />
          </svg>
        }
      >
        <img src={`https://${props.host}/favicon.ico`} alt="" loading="lazy" draggable={false} onError={() => (failed.add(props.host), setBroken(true))} />
      </Show>
    </span>
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

/** An external link in prose, after T3Code's MarkdownExternalLink: the site's favicon glued to the first characters, then text that wraps. */
export function ExternalLink(props: { href: string; host: string; text: string | null; children?: JSX.Element }) {
  return (
    <a class="tds-link" data-link="web" href={props.href} target="_blank" rel="noopener noreferrer">
      {props.text ? (
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
    </a>
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
      <MenuContent<string> class="tds-menu" align="start" sideOffset={tokens.size["menu-offset"]}>
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
