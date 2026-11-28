import { Show } from "solid-js"
import type { JSX } from "@solidjs/web"
import type { IconName } from "@tock/ui/icon"
import { tokens } from "@tock/tokens"
import { app, titleOf } from "../state/app"
import { fileUrl, isImage } from "./attachments"

export type ChipKind = keyof typeof tokens.color.chip

/** The chips that open the shared hover card (chip-card.tsx); the trigger carries what the card needs as data attributes. */
export type CardKind = "link" | "thread" | "file" | "skill" | "plugin"

const documents: readonly { test: RegExp; kind: ChipKind; icon: IconName }[] = [
  { test: /\.pdf$/i, kind: "pdf", icon: "file-pdf" },
  { test: /\.(docx?|rtf|odt|pages)$/i, kind: "word", icon: "file-doc" },
  { test: /\.(xlsx?|csv|tsv|ods|numbers)$/i, kind: "sheet", icon: "file-xls" },
  { test: /\.(pptx?|odp|key)$/i, kind: "slides", icon: "file-ppt" },
  { test: /\.(zip|tar|gz|tgz|rar|7z)$/i, kind: "archive", icon: "file-zip" },
  { test: /\.(m?[jt]sx?|json|py|rs|go|css|html?|sh|ya?ml|toml|sql|md)$/i, kind: "code", icon: "file-code" },
  { test: /\.(mp3|wav|m4a|flac|ogg)$/i, kind: "file", icon: "file-audio" },
  { test: /\.(mp4|mov|webm|mkv)$/i, kind: "file", icon: "file-video" },
]

export function fileChip(name: string): { kind: ChipKind; icon: IconName } {
  if (isImage(name)) return { kind: "image", icon: "image" }
  return documents.find((entry) => entry.test.test(name)) ?? { kind: "file", icon: "file-text" }
}

/** The 14px icon box every chip leads with. Its children are out of flow, so its bottom edge is the label's baseline and a late icon never moves the line. */
export function ChipSlot(props: { icon?: `${IconName}` | `${IconName}:duotone`; children?: JSX.Element }) {
  return (
    <span class="tds-chip-slot" aria-hidden="true">
      <Show when={props.icon} fallback={props.children}>
        {(icon) => (
          <svg class="tds-icon">
            <use href={`#i-${icon()}`} />
          </svg>
        )}
      </Show>
    </span>
  )
}

/**
 * One inline chip for every reference kind, as T3Code's ContextChip: an inline-flex row aligned on the baseline, the icon
 * slot, then a label that truncates and underlines on hover. The accent comes from the kind. A chip with a card opens the
 * shared hover card after hover intent.
 */
export function Chip(props: {
  kind: ChipKind
  icon?: IconName
  slot?: JSX.Element
  label: string
  href?: string
  state?: "invalid"
  class?: string
  children?: JSX.Element
  onRemove?: () => void
  title?: string
  card?: { kind: CardKind; id: string }
  attrs?: Record<string, string>
}) {
  const body = () => (
    <>
      <Show when={props.icon} fallback={<ChipSlot>{props.slot}</ChipSlot>}>
        {(icon) => <ChipSlot icon={`${icon()}:duotone`} />}
      </Show>
      <span class="tds-chip-label">{props.label}</span>
      {props.children}
      <Show when={props.onRemove}>
        {(remove) => (
          <button type="button" class="tds-chip-action" aria-label={`Remove ${props.label}`} onClick={(event) => (event.preventDefault(), remove()())}>
            <svg class="tds-icon tds-chip-icon" aria-hidden="true">
              <use href="#i-x" />
            </svg>
          </button>
        )}
      </Show>
    </>
  )
  const attrs = () => ({
    ...props.attrs,
    class: `tds-chip ${props.class ?? ""}`,
    "data-kind": props.kind,
    "data-state": props.state,
    "data-card": props.card?.kind,
    "data-card-id": props.card?.id,
    "data-card-label": props.card ? props.label : undefined,
    title: props.title,
    style: { "--tds-chip-accent": `var(--tds-chip-${props.kind})` },
  })
  return (
    <Show when={props.href} fallback={<span {...attrs()}>{body()}</span>}>
      {(href) => (
        <a {...attrs()} href={href()} target={href().startsWith("/t/") ? undefined : "_blank"} rel={href().startsWith("/t/") ? undefined : "noreferrer noopener"}>
          {body()}
        </a>
      )}
    </Show>
  )
}

export function FileChip(props: { id: string; name: string }) {
  const meta = () => fileChip(props.name)
  return <Chip kind={meta().kind} icon={meta().icon} label={props.name} href={fileUrl(props.id)} card={{ kind: "file", id: props.id }} />
}

/** The thread's file card (TDS PxChips "Files"): the kind's glyph with its type under it, the name, and what opening does. */

export const threadHref = (id: string) => `/t/${id}`

/** A thread reference: the chip navigates in place, and a pause on it previews the thread in the shared card. */
export function ThreadChip(props: { id: string; label?: string }) {
  const session = () => app.sessions.find((entry) => entry.id === props.id)
  const title = () => (session() ? titleOf(session()) : (props.label ?? "Chat"))
  return <Chip kind="thread" icon="chat-circle" label={title()} href={threadHref(props.id)} state={session() ? undefined : "invalid"} card={{ kind: "thread", id: props.id }} attrs={{ "aria-label": title() }} />
}

/** A skill reference (`[$name](tock-skill:name)`): the chip names the skill, and its card shows what the skill is for. */
export function SkillChip(props: { name: string }) {
  return <Chip kind="skill" icon="sparkle" label={props.name} card={{ kind: "skill", id: props.name }} />
}

export function PluginChip(props: { name: string }) {
  return <Chip kind="plugin" icon="sparkle" label={props.name} card={{ kind: "plugin", id: props.name }} />
}
