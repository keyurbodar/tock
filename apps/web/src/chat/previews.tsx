import { createSignal, For, onCleanup, Show, untrack, type Accessor } from "solid-js"
import type { JSX } from "@solidjs/web"
import { tokens } from "@tock/tokens"
import { Icon } from "@tock/ui/icon"
import { lang } from "sugar-high/lang"
import { formatSize } from "./attachments"
import { CodeBlock } from "./code"
import { Markdown } from "./markdown"
import type { PreviewKind, RenderedMode } from "./preview-kind"
import { archiveEntries, decodeText, maskFrontmatter, parseDelimited, type ArchiveEntry } from "./preview-read"
import { openPdf, renderPage } from "../lib/pdf"

export type View = "preview" | "source"

export interface BodyProps {
  readonly name: string
  readonly kind: PreviewKind
  readonly mode: RenderedMode | null
  readonly delimiter: "," | "\t" | null
  readonly blob: Blob
  readonly url: string
  readonly view: Accessor<View>
  readonly onFail: (message: string) => void
  readonly onText: (text: string, truncated: boolean) => void
  readonly onPages: (pages: number) => void
}

/**
 * Scripts may run, as in t3code, but only inside an opaque origin (no allow-same-origin), so the page can never reach
 * Tock's session, storage or DOM; this policy also keeps it from loading remote scripts or calling out.
 */
const PAGE_POLICY = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https:; img-src data: blob: https:; font-src data: https:; media-src data: blob: https:; connect-src 'none'; form-action 'none'; base-uri 'none'"
const withPolicy = (html: string, policy = PAGE_POLICY) => {
  const meta = '<meta http-equiv="Content-Security-Policy" content="' + policy + '">'
  const doctype = /^\s*<!doctype[^>]*>/i.exec(html)
  return doctype ? doctype[0] + meta + html.slice(doctype[0].length) : meta + html
}
const escapeHtml = (text: string) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
const sourceLang = (props: BodyProps) => {
  if (props.kind === "markdown") return "md"
  if (props.kind === "html") return "html"
  if (props.kind === "mermaid" || props.delimiter) return "text"
  const ext = props.name.split(".").pop()?.toLowerCase() ?? ""
  return lang(ext) && lang(ext) !== "plaintext" ? ext : "text"
}

export function Loading() {
  return <div class="tds-preview-loading" role="status" aria-label="Loading file">Loading…</div>
}

/** What t3code shows for a format it has no viewer for, with the way out. */
export function Unsupported(props: { name: string; reason?: string }) {
  const ext = () => /\.([^./]+)$/.exec(props.name)?.[1] ?? null
  return (
    <div class="tds-preview-empty" role="status">
      <span class="tds-lightbox-failed-glyph"><Icon name="file" size="menu" /></span>
      <b>No preview for this file</b>
      <p>{props.reason ? props.reason + " Save it to open in another app." : ext() ? "Save it to open in an app that supports " + ext() + " files." : "Save it to open in an app that supports this format."}</p>
    </div>
  )
}

function Page(props: { html: string; title: string }) {
  return <iframe class="tds-preview-page" title={props.title} sandbox="allow-scripts allow-forms allow-popups allow-downloads" referrerpolicy="no-referrer" srcdoc={withPolicy(props.html)} />
}

/** Pinned so a diagram renders the same tomorrow; the library is too big for our lazy-chunk budget, so the sandboxed frame loads it. */
const MERMAID = "https://cdn.jsdelivr.net/npm/mermaid@11.12.0/dist/mermaid.min.js"

/**
 * Mermaid renders inside an opaque-origin sandbox with securityLevel strict, the way t3code keeps diagram labels from
 * running anything in the app; the frame only reports whether it drew.
 */
function Diagram(props: { text: string; onFail: (message: string) => void }) {
  const { text, onFail } = untrack(() => ({ text: props.text, onFail: props.onFail }))
  const [drawn, setDrawn] = createSignal(false)
  let frame!: HTMLIFrameElement
  const onMessage = (event: MessageEvent) => {
    if (event.source !== frame.contentWindow) return
    if (event.data === "tds-mermaid-ok") setDrawn(true)
    else if (event.data === "tds-mermaid-error") onFail("This Mermaid diagram could not be rendered. Show its source to read it.")
  }
  addEventListener("message", onMessage)
  onCleanup(() => removeEventListener("message", onMessage))
  const doc =
    '<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:transparent}body{display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box}svg{max-width:100%;max-height:100%;height:auto}</style></head><body><pre class="mermaid" id="d"></pre><script src="' + MERMAID + '" onerror="parent.postMessage(\'tds-mermaid-error\',\'*\')"></script><script>document.getElementById("d").textContent=' +
    JSON.stringify(text).replaceAll("<", "\\u003c") +
    ';window.mermaid?mermaid.initialize({startOnLoad:false,securityLevel:"strict",theme:"neutral"}):0;window.mermaid&&mermaid.run({nodes:[document.getElementById("d")]}).then(function(){parent.postMessage("tds-mermaid-ok","*")},function(){parent.postMessage("tds-mermaid-error","*")})</script></body></html>'
  return (
    <div class="tds-preview-diagram" data-drawn={drawn() ? "" : undefined}>
      <iframe
        ref={frame}
        title="Mermaid diagram"
        sandbox="allow-scripts"
        referrerpolicy="no-referrer"
        srcdoc={withPolicy(doc, "default-src 'none'; script-src 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'; form-action 'none'")}
      />
    </div>
  )
}

function Table(props: { text: string; delimiter: "," | "\t"; name: string }) {
  const { rows, truncated } = untrack(() => parseDelimited(props.text, props.delimiter))
  const [head, ...body] = rows
  return (
    <div class="tds-preview-table tds-scroll" data-edge-fade="both">
      <Show when={truncated}>
        <p class="tds-preview-notice" role="status">Showing the first {body.length} rows. Save the file to read it in full.</p>
      </Show>
      <table aria-label={untrack(() => props.name)}>
        <thead><tr><th class="num" aria-label="Row" /><For each={head ?? []} keyed={false}>{(cell) => <th>{cell()}</th>}</For></tr></thead>
        <tbody>
          <For each={body} keyed={false}>
            {(row, i) => <tr><td class="num">{i + 1}</td><For each={row()} keyed={false}>{(cell) => <td>{cell()}</td>}</For></tr>}
          </For>
        </tbody>
      </table>
    </div>
  )
}

function Font(props: { blob: Blob; name: string; onFail: (message: string) => void }) {
  const [doc, setDoc] = createSignal<string>()
  const { blob, onFail } = untrack(() => ({ blob: props.blob, onFail: props.onFail }))
  const timer = setTimeout(() => onFail("The font took too long to load."), tokens.limit["font-timeout"])
  onCleanup(() => clearTimeout(timer))
  void (async () => {
    if (blob.size > tokens.limit["font-bytes"]) throw new Error("Font previews are limited to 10 MB.")
    await new FontFace("tds-file-preview", await blob.arrayBuffer()).load()
    const data = await new Promise<string>((done, fail) => {
      const reader = new FileReader()
      reader.onload = () => done(String(reader.result))
      reader.onerror = () => fail(new Error("The font could not be decoded."))
      reader.readAsDataURL(blob)
    })
    const style = getComputedStyle(document.documentElement)
    const sample = "The quick brown fox jumps over the lazy dog."
    setDoc(
      '<!doctype html><html><head><meta charset="utf-8"><style>@font-face{font-family:preview;src:url(\'' + data + "')}html{background:" + style.getPropertyValue("--tds-surface-card") + ";color:" + style.getPropertyValue("--tds-text-tx") +
        "}body{margin:0;padding:32px;font-family:preview;overflow-wrap:anywhere}h1{font-size:40px;font-weight:normal}p{line-height:1.4}small{font:12px monospace;display:block;opacity:.6;margin-bottom:8px}</style></head><body><h1>Font preview</h1><p style=\"font-size:24px\">ABCDEFGHIJKLMNOPQRSTUVWXYZ<br>abcdefghijklmnopqrstuvwxyz<br>0123456789 !?&amp;@#%(){}[]</p>" +
        [12, 16, 24, 40, 64].map((size) => '<p style="font-size:' + size + 'px"><small>' + size + " px</small>" + escapeHtml(sample) + "</p>").join("") + "</body></html>",
    )
    clearTimeout(timer)
  })().catch((cause: unknown) => {
    clearTimeout(timer)
    onFail(cause instanceof Error && /limited|decoded/.test(cause.message) ? cause.message : "The font is damaged or unsupported.")
  })
  return (
    <Show when={doc()} fallback={<Loading />}>
      {(html) => <iframe class="tds-preview-page" title={untrack(() => props.name)} sandbox="" srcdoc={withPolicy(html(), "default-src 'none'; font-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'")} />}
    </Show>
  )
}

function Archive(props: { blob: Blob; name: string; onFail: (message: string) => void }) {
  const [entries, setEntries] = createSignal<ArchiveEntry[]>()
  const { blob, name, onFail } = untrack(() => ({ blob: props.blob, name: props.name, onFail: props.onFail }))
  void blob.arrayBuffer().then((buffer) => archiveEntries(name, new Uint8Array(buffer))).then(setEntries, (cause: unknown) => onFail(cause instanceof Error ? cause.message : "This archive could not be read."))
  return (
    <Show when={entries()} fallback={<Loading />}>
      {(list) => (
        <div class="tds-preview-table tds-scroll" data-edge-fade="both">
          <p class="tds-preview-notice" role="status">{list().filter((e) => !e.directory).length} files · listed without extracting</p>
          <table aria-label={name}>
            <thead><tr><th>Name</th><th class="num">Size</th></tr></thead>
            <tbody>
              <For each={list()} keyed={false}>
                {(entry) => (
                  <tr data-directory={entry().directory ? "" : undefined}>
                    <td><Icon name={entry().directory ? "folder-simple" : "file"} size="chip" /> {entry().path}</td>
                    <td class="num">{entry().directory ? "" : formatSize(entry().size)}</td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      )}
    </Show>
  )
}

type NotebookOutput = { kind: "text"; text: string } | { kind: "image"; src: string } | { kind: "html"; html: string }
interface NotebookCell { type: "markdown" | "code" | "raw"; source: string; count: number | null; outputs: NotebookOutput[] }
const joined = (value: unknown) => (Array.isArray(value) ? value.join("") : typeof value === "string" ? value : "")

function parseNotebook(text: string): { language: string; cells: NotebookCell[] } {
  const book = JSON.parse(text) as { cells?: unknown[]; metadata?: { language_info?: { name?: string }; kernelspec?: { language?: string } } }
  if (!Array.isArray(book.cells)) throw new Error("This notebook has no cells.")
  const language = book.metadata?.language_info?.name ?? book.metadata?.kernelspec?.language ?? "python"
  const cells = book.cells.map((raw): NotebookCell => {
    const cell = raw as { cell_type?: string; source?: unknown; execution_count?: number | null; outputs?: Record<string, unknown>[] }
    const outputs = (cell.outputs ?? []).flatMap((output): NotebookOutput[] => {
      if (output.output_type === "stream") return [{ kind: "text", text: joined(output.text) }]
      if (output.output_type === "error") return [{ kind: "text", text: (output.ename as string) + ": " + (output.evalue as string) }]
      const data = (output.data ?? {}) as Record<string, unknown>
      for (const type of ["image/png", "image/jpeg", "image/gif"]) if (data[type]) return [{ kind: "image", src: "data:" + type + ";base64," + joined(data[type]).replace(/\s/g, "") }]
      if (data["image/svg+xml"]) return [{ kind: "image", src: URL.createObjectURL(new Blob([joined(data["image/svg+xml"])], { type: "image/svg+xml" })) }]
      if (data["text/html"]) return [{ kind: "html", html: joined(data["text/html"]) }]
      if (data["text/plain"]) return [{ kind: "text", text: joined(data["text/plain"]) }]
      return []
    })
    return { type: cell.cell_type === "markdown" ? "markdown" : cell.cell_type === "code" ? "code" : "raw", source: joined(cell.source), count: cell.execution_count ?? null, outputs }
  })
  return { language, cells }
}

/** Saved cells and outputs only; nothing runs. HTML outputs sit in a script-less sandbox. */
function Notebook(props: { text: string; onFail: (message: string) => void }) {
  const parsed = untrack(() => {
    try {
      return parseNotebook(props.text)
    } catch {
      props.onFail("This notebook could not be read. Show its source to read it.")
      return undefined
    }
  })
  return (
    <Show when={parsed}>
      {(book) => (
        <div class="tds-preview-notebook tds-scroll" data-edge-fade="y">
          <p class="tds-preview-notice" role="status">Saved outputs only. Code is never executed.</p>
          <For each={book().cells} keyed={false}>
            {(cell) => (
              <section class="tds-preview-cell" data-type={cell().type}>
                <Show when={cell().type === "markdown"} fallback={<><span class="tds-preview-count num">[{cell().count ?? " "}]</span><CodeBlock code={cell().source} lang={cell().type === "code" ? book().language : "text"} /></>}>
                  <div class="tds-lightbox-md"><Markdown text={cell().source} /></div>
                </Show>
                <For each={cell().outputs} keyed={false}>
                  {(output) => {
                    const out = untrack(output)
                    if (out.kind === "image") return <img class="tds-preview-output" src={out.src} alt="Cell output" />
                    if (out.kind === "html") return <iframe class="tds-preview-output" sandbox="" title="Cell output" srcdoc={withPolicy(out.html, "default-src 'none'; style-src 'unsafe-inline'; img-src data:")} />
                    return <pre class="tds-preview-output">{out.text}</pre>
                  }}
                </For>
              </section>
            )}
          </For>
        </div>
      )}
    </Show>
  )
}

const clock = (seconds: number) => (Number.isFinite(seconds) ? Math.floor(seconds / 60) + ":" + String(Math.floor(seconds % 60)).padStart(2, "0") : "0:00")

/** t3code's AudioPreview: one play control, a progress line and the time, over a native audio element. */
function Audio(props: { url: string; name: string; onFail: (message: string) => void }) {
  const [playing, setPlaying] = createSignal(false)
  const [elapsed, setElapsed] = createSignal(0)
  const [duration, setDuration] = createSignal(0)
  let audio!: HTMLAudioElement
  return (
    <div class="tds-preview-audio">
      <button type="button" class="tds-lightbox-button tds-over" aria-label={playing() ? "Pause" : "Play"} onClick={() => (audio.paused ? void audio.play() : audio.pause())}>
        <Icon name={playing() ? "pause" : "play"} size="menu" />
      </button>
      <input
        type="range"
        class="tds-preview-track"
        aria-label="Seek"
        min="0"
        max={duration() || 0}
        step="any"
        value={elapsed()}
        style={{ "--progress": (duration() > 0 ? Math.min(100, (elapsed() / duration()) * 100) : 0) + "%" }}
        onInput={(event) => (audio.currentTime = Number(event.currentTarget.value))}
      />
      <span class="num">{clock(elapsed()) + " / " + clock(duration())}</span>
      <audio
        ref={audio}
        src={untrack(() => props.url)}
        preload="metadata"
        aria-label={untrack(() => props.name)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(event) => setElapsed(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
        onDurationChange={(event) => setDuration(event.currentTarget.duration)}
        onError={() => untrack(() => props.onFail)("This audio can’t be played here. Download it to listen.")}
      />
    </div>
  )
}

/** Chromium and Firefox desktop bring a native PDF viewer; elsewhere pdf.js draws the pages (t3code PdfDocumentRevision). */
const nativePdf = () => navigator.pdfViewerEnabled && !/iPad|iPhone|iPod|HeadlessChrome/.test(navigator.userAgent) && !(navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)

function Pdf(props: { url: string; name: string; onFail: (message: string) => void; onPages: (pages: number) => void }) {
  const { url, onFail, onPages } = untrack(() => ({ url: props.url, onFail: props.onFail, onPages: props.onPages }))
  if (nativePdf()) return <iframe class="tds-preview-page" title={untrack(() => props.name)} src={url.split("#", 1)[0] + "#navpanes=0&view=FitH"} />
  const doc = document.createElement("div")
  doc.className = "tds-lightbox-pdf tds-scroll"
  doc.dataset.edgeFade = "y"
  void openPdf(url)
    .then(async (pdf) => {
      onPages(pdf.numPages)
      for (let n = 1; n <= Math.min(pdf.numPages, tokens.limit["pdf-pages"]) && doc.isConnected !== false; n++) {
        const page = await renderPage(pdf, n, tokens.size["lightbox-doc"])
        page.className = "tds-lightbox-page"
        page.dataset.page = String(n)
        doc.append(page)
      }
    })
    .catch(() => onFail("PDF unavailable. The file may have been moved, deleted or damaged."))
  return doc
}

/** The body for one file: the port of t3code's AttachmentFilePreview switch, inside our lightbox box. */
export function FileBody(props: BodyProps): JSX.Element {
  const p = untrack(() => props)
  if (p.kind === "pdf") return <Pdf url={p.url} name={p.name} onFail={(m) => p.onFail(m)} onPages={(n) => p.onPages(n)} />
  if (p.kind === "audio") return <Audio url={p.url} name={p.name} onFail={(m) => p.onFail(m)} />
  if (p.kind === "font") return <Font blob={p.blob} name={p.name} onFail={(m) => p.onFail(m)} />
  if (p.kind === "archive") return <Archive blob={p.blob} name={p.name} onFail={(m) => p.onFail(m)} />
  if (p.kind !== "text" && p.kind !== "markdown" && p.kind !== "mermaid" && p.kind !== "html" && p.kind !== "ipynb") return <Unsupported name={p.name} />
  const [content, setContent] = createSignal<{ text: string; truncated: boolean }>()
  void p.blob
    .arrayBuffer()
    .then((buffer) => {
      const read = decodeText(new Uint8Array(buffer))
      p.onText(read.text, read.truncated)
      setContent(read)
    })
    .catch((cause: unknown) => p.onFail(cause instanceof Error ? cause.message : "Could not load this file."))
  return (
    <Show when={content()} fallback={<Loading />}>
      {(read) => (
        <>
          <Show when={read().truncated}>
            <p class="tds-preview-notice" role="status">{"Preview limited to the first 1 MB of a " + p.blob.size.toLocaleString() + " byte file. Save the file to read it in full."}</p>
          </Show>
          <Show when={!(p.mode || p.kind === "ipynb") || props.view() === "source"} fallback={<div class="tds-lightbox-preview" data-mode={p.mode ?? "notebook"}>{
            p.kind === "ipynb" ? <Notebook text={read().text} onFail={(m) => p.onFail(m)} />
            : p.mode === "html" ? <Page html={read().text} title={p.name} />
            : p.mode === "mermaid" ? <Diagram text={read().text} onFail={(m) => p.onFail(m)} />
            : p.mode === "table" ? <Table text={read().text} delimiter={p.delimiter!} name={p.name} />
            : <div class="tds-preview-markdown tds-scroll" data-edge-fade="y"><div class="tds-lightbox-md"><Markdown text={maskFrontmatter(read().text)} /></div></div>
          }</div>}>
            <div class="tds-lightbox-source"><CodeBlock code={read().text} lang={p.kind === "ipynb" ? "json" : sourceLang(p)} /></div>
          </Show>
        </>
      )}
    </Show>
  )
}
