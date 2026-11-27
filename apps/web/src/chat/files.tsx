import { createSignal, For, Show } from "solid-js"
import { createStore } from "solid-js"
import { Icon } from "@tock/ui/icon"
import { TextMorph } from "@tock/ui/text-morph"
import { extension, fileUrl, formatSize, isImage } from "./attachments"
import { fileChip } from "./chip"
import { openLightbox, type LightboxItem } from "./lightbox-state"
import { pdfThumb } from "../lib/pdf"
import { tokens } from "@tock/tokens"

export interface SentFile {
  readonly id: string
  readonly name: string
}

export type FileKind = "image" | "video" | "text" | "doc"

const TEXTUAL = /\.(md|markdown|mdx|txt|csv|log|m?[jt]sx?|json|css|html?|py|rs|go|rb|swift|sh|ya?ml|toml|sql|xml)$/i
export const isPdf = (name: string) => /\.pdf$/i.test(name)
/** Text and PDFs open in the lightbox; anything else opens in a new tab. */
const opensInViewer = (name: string) => kindOf(name) === "text" || isPdf(name)
export const kindOf = (name: string): FileKind => (isImage(name) ? "image" : /\.(mp4|mov|webm|m4v)$/i.test(name) ? "video" : TEXTUAL.test(name) ? "text" : "doc")

interface Meta {
  readonly state: "loading" | "ready" | "missing"
  readonly size: number | null
  readonly lines: number | null
}

const [metas, setMetas] = createStore<Record<string, Meta>>({})
const requested = new Set<string>()
const TEXT_LIMIT = 2 * 1024 * 1024

async function load(id: string, name: string) {
  setMetas((all) => void (all[id] = { state: "loading", size: null, lines: null }))
  const controller = new AbortController()
  try {
    const response = await fetch(fileUrl(id), { signal: controller.signal })
    if (!response.ok) return setMetas((all) => void (all[id] = { state: "missing", size: null, lines: null }))
    let size = Number(response.headers.get("x-file-size") || response.headers.get("content-length")) || null
    let lines: number | null = null
    if (kindOf(name) === "text" && (size ?? 0) < TEXT_LIMIT) {
      const bytes = await response.arrayBuffer()
      size = bytes.byteLength
      lines = new TextDecoder().decode(bytes).split("\n").length
    } else controller.abort()
    setMetas((all) => void (all[id] = { state: "ready", size, lines }))
  } catch {
    if (!controller.signal.aborted) setMetas((all) => void (all[id] = { state: "missing", size: null, lines: null }))
  }
}

/** Size and line count for a sent file, read once from the file itself and shared by every card that shows it. */
export function fileMeta(id: string, name: string): Meta | undefined {
  if (!requested.has(id)) {
    requested.add(id)
    queueMicrotask(() => void load(id, name))
  }
  return metas[id]
}

export const describe = (meta: { size: number | null; lines: number | null } | undefined) =>
  meta ? [meta.size !== null ? formatSize(meta.size) : null, meta.lines !== null ? (new Intl.PluralRules().select(meta.lines) === "one" ? "# line" : "# lines").replace("#", meta.lines.toLocaleString()) : null].filter(Boolean).join(" · ") : ""

const typeName = (name: string) => {
  const ext = extension(name)
  return ({ MD: "Markdown", TXT: "Text", PDF: "PDF", JSON: "JSON", CSV: "Spreadsheet", ZIP: "Archive", HTML: "HTML" } as Record<string, string>)[ext] ?? `${ext} file`
}

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`

function MediaTile(props: { file: SentFile; more: number; onOpen: (el: HTMLElement) => void }) {
  const [duration, setDuration] = createSignal<number | null>(null)
  const video = () => kindOf(props.file.name) === "video"
  return (
    <button type="button" class="tds-media-tile" data-kind={video() ? "video" : "image"} data-file={props.file.id} aria-label={`Open ${props.file.name}`} onClick={(event) => props.onOpen(event.currentTarget)}>
      <Show when={video()} fallback={<img src={fileUrl(props.file.id)} alt={props.file.name} loading="lazy" draggable={false} />}>
        <video src={`${fileUrl(props.file.id)}#t=0.1`} preload="metadata" muted playsinline onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)} />
        <span class="tds-media-play" aria-hidden="true">
          <Icon name="play:fill" size="menu" />
        </span>
        <Show when={duration()}>{(seconds) => <span class="tds-media-badge num">{clock(seconds())}</span>}</Show>
      </Show>
      <Show when={props.more > 0}>
        <span class="tds-media-more num">+{props.more}</span>
      </Show>
    </button>
  )
}

/** A sent document as one compact press target: a type-tinted glyph, the name, and "Markdown · 54 B · 4 lines" in quiet tabular type. Text opens in the lightbox, anything else in a new tab. */
function DocCard(props: { file: SentFile; onOpen: (el: HTMLElement) => void }) {
  const meta = () => fileMeta(props.file.id, props.file.name)
  const chip = () => fileChip(props.file.name)
  const [thumb, setThumb] = createSignal<string | null>(null)
  if (isPdf(props.file.name)) void pdfThumb(fileUrl(props.file.id), tokens.size["file-tile"]).then(setThumb)
  const line = () => (meta()?.state === "missing" ? "Unavailable" : [typeName(props.file.name), meta()?.state === "ready" ? describe(meta()) : ""].filter(Boolean).join(" · "))
  return (
    <a
      href={fileUrl(props.file.id)}
      target="_blank"
      rel="noreferrer"
      class="tds-doc tds-raise-1"
      data-file={props.file.id}
      data-state={meta()?.state ?? "loading"}
      style={{ "--tds-chip-accent": `var(--tds-chip-${chip().kind})` }}
      onClick={(event) => {
        if (!opensInViewer(props.file.name) || event.metaKey || event.ctrlKey) return
        event.preventDefault()
        props.onOpen(event.currentTarget)
      }}
    >
      <span class="tds-doc-glyph" data-thumb={thumb() ? "" : undefined}>
        <Show when={thumb()} fallback={<Icon name={chip().icon} size="menu" />}>
          {(src) => <img src={src()} alt="" draggable={false} />}
        </Show>
      </span>
      <span class="tds-doc-text">
        <b>{props.file.name}</b>
        <span class="tds-doc-meta num">
          <TextMorph value={line()} mode="calm" />
        </span>
      </span>
    </a>
  )
}

/** Files in the chat, from either side (Claude and CDS page 22): pictures and clips as one media group, documents as cards; the user's sit above their bubble on the right, the agent's under its text on the left. */
export function Attachments(props: { files: readonly SentFile[]; side: "me" | "agent"; queued?: boolean }) {
  const media = () => props.files.filter((file) => kindOf(file.name) === "image" || kindOf(file.name) === "video")
  const docs = () => props.files.filter((file) => kindOf(file.name) === "text" || kindOf(file.name) === "doc")
  const layout = () => (media().length === 1 ? "single" : media().length <= 3 ? "row" : "grid")
  const shown = () => (layout() === "grid" ? media().slice(0, 4) : media())
  const open = (list: readonly SentFile[], index: number, el: HTMLElement) => openLightbox(list.map((file): LightboxItem => ({ id: file.id, name: file.name })), index, el)
  return (
    <div class="tds-files" data-side={props.side} data-queued={props.queued ? "" : undefined}>
      <Show when={media().length > 0}>
        <div class="tds-media" data-layout={layout()} data-count={shown().length}>
          <For each={shown()} keyed={(file) => file.id}>
            {(file, index) => <MediaTile file={file()} more={layout() === "grid" && index() === 3 && media().length > 4 ? media().length - 3 : 0} onOpen={(el) => open(media(), index(), el)} />}
          </For>
        </div>
      </Show>
      <Show when={docs().length > 0}>
        <div class="tds-docs" data-side={props.side}>
          <For each={docs()} keyed={(file) => file.id}>
            {(file) => {
              const text = () => docs().filter((entry) => opensInViewer(entry.name))
              const onOpen = (el: HTMLElement) => open(text(), text().indexOf(file()), el)
              return (
                <DocCard file={file()} onOpen={onOpen} />
              )
            }}
          </For>
        </div>
      </Show>
    </div>
  )
}
