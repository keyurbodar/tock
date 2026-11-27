import { Show } from "solid-js"
import type { JSX } from "@solidjs/web"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@ui-sdk/solid/hover-card"
import type { IconName } from "@tock/ui/icon"
import { tokens } from "@tock/tokens"
import { app, titleOf } from "../state/app"
import { glyphFor } from "../lib/glyph"
import { shortTime } from "../lib/time"
import { extension, fileUrl, isImage } from "./attachments"

export type ChipKind = keyof typeof tokens.color.chip

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

/** One inline chip for every reference kind: the accent comes from the kind, the label truncates, the icon sits at 1em on the text's baseline. */
export function Chip(props: { kind: ChipKind; icon: IconName; label: string; href?: string; state?: "invalid"; class?: string; children?: JSX.Element; onRemove?: () => void; title?: string }) {
  const body = () => (
    <>
      <svg class="tds-icon tds-chip-icon" aria-hidden="true">
        <use href={`#i-${props.icon}:duotone`} />
      </svg>
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
  const attrs = () => ({ class: `tds-chip ${props.class ?? ""}`, "data-kind": props.kind, "data-state": props.state, title: props.title, style: { "--tds-chip-accent": `var(--tds-chip-${props.kind})` } })
  return (
    <Show when={props.href} fallback={<span {...attrs()}>{body()}</span>}>
      {(href) => (
        <a {...attrs()} href={href()} target="_blank" rel="noreferrer noopener">
          {body()}
        </a>
      )}
    </Show>
  )
}

export function FileChip(props: { id: string; name: string }) {
  const meta = () => fileChip(props.name)
  return <Chip kind={meta().kind} icon={meta().icon} label={props.name} href={fileUrl(props.id)} title={props.name} />
}

/** The thread's file card (TDS PxChips "Files"): the kind's glyph with its type under it, the name, and what opening does. */
export function FileCard(props: { id: string; name: string; side: "me" | "agent" }) {
  const meta = () => fileChip(props.name)
  return (
    <a href={fileUrl(props.id)} target="_blank" rel="noreferrer" class="tds-file-card" data-side={props.side} style={{ "--tds-chip-accent": `var(--tds-chip-${meta().kind})` }}>
      <span class="tds-attach-glyph" data-kind={meta().kind}>
        <svg class="tds-icon tds-chip-icon" aria-hidden="true">
          <use href={`#i-${meta().icon}:duotone`} />
        </svg>
        <b>{extension(props.name)}</b>
      </span>
      <span class="tds-attach-meta">
        <b>{props.name}</b>
        <span>Open</span>
      </span>
    </a>
  )
}

export const threadHref = (id: string) => `/t/${id}`

/** A thread reference: the chip navigates in place, and a pause on it previews the thread, the one hover card in chat (as T3Code's ThreadChipHoverCard). */
export function ThreadChip(props: { id: string; label?: string }) {
  const session = () => app.sessions.find((entry) => entry.id === props.id)
  const glyph = () => glyphFor(props.id)
  const title = () => (session() ? titleOf(session()) : (props.label ?? "Chat"))
  return (
    <HoverCard delay={tokens.motion["hover-intent"].open} closeDelay={tokens.motion["hover-intent"].leave}>
      <HoverCardTrigger href={threadHref(props.id)} class="tds-chip" data-kind="thread" data-state={session() ? undefined : "invalid"} style={{ "--tds-chip-accent": "var(--tds-chip-thread)" }}>
        <svg class="tds-icon tds-chip-icon" aria-hidden="true">
          <use href="#i-chat-circle:duotone" />
        </svg>
        <span class="tds-chip-label">{title()}</span>
      </HoverCardTrigger>
      <HoverCardContent class="tds-thread-card tds-over" side="top" align="start" sideOffset={tokens.size["menu-offset"]}>
        <div class="tds-thread-card-head">
          <span class={`tds-row-icon ${glyph().hue}`}>
            <svg class="tds-icon tds-chip-icon" aria-hidden="true">
              <use href={`#i-${glyph().icon}`} />
            </svg>
          </span>
          <b>{title()}</b>
        </div>
        <Show when={session()} fallback={<span class="tds-thread-card-line">This chat was deleted or isn't on this device yet.</span>}>
          {(current) => (
            <>
              <Show when={current().preview}>
                <span class="tds-thread-card-preview">{current().preview}</span>
              </Show>
              <span class="tds-thread-card-line">
                {current().busy ? "Working" : `${current().messageCount} messages`}
                <Show when={current().updatedAt}> · {shortTime(current().updatedAt)}</Show>
              </span>
            </>
          )}
        </Show>
      </HoverCardContent>
    </HoverCard>
  )
}
