import { tokens } from "@tock/tokens"

/**
 * File preview kinds, ported from t3code (packages/shared/src/filePreview.ts): the MIME type decides first and a
 * generic one (empty, octet-stream, text/plain) falls back to the extension.
 */
export type PreviewKind =
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "html"
  | "markdown"
  | "mermaid"
  | "font"
  | "archive"
  | "sqlite"
  | "docx"
  | "xlsx"
  | "pptx"
  | "odt"
  | "ods"
  | "odp"
  | "rtf"
  | "epub"
  | "ipynb"
  | "text"
  | "unsupported"

/** The kinds with a rendered view and a source view behind the Preview / Source toggle. */
export type RenderedMode = "markdown" | "mermaid" | "html" | "table"

const GENERIC = new Set(["application/octet-stream", "binary/octet-stream", "application/unknown", "video/mp2t", "video/vnd.dlna.mpeg-tts"])
const IMAGE_EXT = /^\.(avif|bmp|gif|ico|jpe?g|png|svg|webp|apng)$/
const VIDEO_EXT = /^\.(mp4|m4v|mov|webm|ogv)$/
const AUDIO_EXT = /^\.(mp3|wav|ogg|oga|flac|aac|m4a|opus|aiff|weba)$/
const TEXT_EXT =
  /^\.(txt|log|json|jsonc|jsonl|ndjson|yaml|yml|toml|ini|conf|config|env|csv|tsv|xml|css|scss|sass|less|js|jsx|mjs|cjs|ts|tsx|mts|cts|py|pyi|rb|go|rs|swift|kt|kts|java|c|h|cc|cpp|hpp|cs|php|sh|bash|zsh|fish|sql|graphql|gql|vue|svelte|r|lua|ex|exs|erl|hs|clj|dart|diff|patch|lock|properties|gradle)$/
const TEXT_NAME = /^(dockerfile|makefile|gemfile|rakefile|license|readme|\.gitignore|\.gitattributes|\.editorconfig|\.env)(\.|$)/i
const OFFICE = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odt: "application/vnd.oasis.opendocument.text",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  odp: "application/vnd.oasis.opendocument.presentation",
  rtf: "application/rtf",
  epub: "application/epub+zip",
  ipynb: "application/x-ipynb+json",
} as const
type OfficeKind = keyof typeof OFFICE
const ARCHIVE_MIME = ["application/zip", "application/x-zip-compressed", "application/java-archive", "application/x-java-archive", "application/x-tar", "application/gzip", "application/x-gzip", "application/x-compressed-tar"]
const SQLITE_MIME = ["application/vnd.sqlite3", "application/x-sqlite3", "application/x-sqlite"]

const mimeOf = (mime = "") => mime.split(";", 1)[0]!.trim().toLowerCase()
const generic = (mime: string) => !mime || GENERIC.has(mime) || mime === "text/plain"
const extOf = (name: string) => {
  const lower = name.toLowerCase()
  const dot = lower.lastIndexOf(".")
  return dot < 0 ? "" : lower.slice(dot)
}

function officeKind(name: string, mime: string): OfficeKind | null {
  if (mime === "text/rtf") return "rtf"
  for (const kind of Object.keys(OFFICE) as OfficeKind[]) {
    if (mime === OFFICE[kind]) return kind
    const loose = generic(mime) || ((kind === "docx" || kind === "xlsx" || kind === "pptx") && (mime === "application/x-ole-storage" || mime === "application/cdfv2")) || (kind === "ipynb" && mime === "application/json")
    if (loose && name.toLowerCase().endsWith("." + kind)) return kind
  }
  return null
}

function binaryKind(name: string, mime: string): "archive" | "sqlite" | null {
  if (SQLITE_MIME.includes(mime)) return "sqlite"
  if (ARCHIVE_MIME.includes(mime)) return "archive"
  if (!generic(mime)) return null
  const ext = extOf(name)
  if (/^\.(sqlite3?|db)$/.test(ext)) return "sqlite"
  return /^\.(zip|jar|tar|gz|tgz)$/.test(ext) ? "archive" : null
}

export function previewKind(name: string, rawMime?: string): PreviewKind {
  const mime = mimeOf(rawMime)
  const ext = extOf(name)
  const loose = generic(mime)
  const office = officeKind(name, mime)
  if (office) return office
  const binary = binaryKind(name, mime)
  if (binary) return binary
  if (mime === "application/pdf") return "pdf"
  if (mime === "text/html") return "html"
  if (mime === "text/markdown" || mime === "text/x-markdown") return "markdown"
  if (mime === "text/vnd.mermaid") return "mermaid"
  if (mime.startsWith("font/") || (ext === ".otf" && mime === "application/vnd.oasis.opendocument.formula-template")) return "font"
  if (mime.startsWith("image/")) return "image"
  if (mime.startsWith("video/") && !loose) return "video"
  if (mime.startsWith("audio/")) return "audio"
  if (loose) {
    if (ext === ".pdf") return "pdf"
    if (/^\.html?$/.test(ext)) return "html"
    if (/^\.(md|markdown|mdown|mkd|mdx)$/.test(ext)) return "markdown"
    if (/^\.(mmd|mermaid)$/.test(ext)) return "mermaid"
    if (/^\.(ttf|otf|woff2?)$/.test(ext)) return "font"
    if (IMAGE_EXT.test(ext)) return "image"
    if (VIDEO_EXT.test(ext)) return "video"
    if (AUDIO_EXT.test(ext)) return "audio"
    if (TEXT_EXT.test(ext) || TEXT_NAME.test(name.split(/[\\/]/).at(-1) ?? "")) return "text"
  }
  if (mime.startsWith("text/") || /^application\/(json|.*\+json|xml|.*\+xml|javascript|x-javascript|yaml|x-yaml|toml|sql)$/.test(mime)) return "text"
  return "unsupported"
}

/** CSV and TSV render as a table first (t3code delimitedPreview.ts). */
export function previewDelimiter(name: string, rawMime?: string): "," | "\t" | null {
  const mime = mimeOf(rawMime)
  if (mime === "text/csv") return ","
  if (mime === "text/tab-separated-values") return "\t"
  if (mime && !generic(mime)) return null
  if (/\.csv$/i.test(name)) return ","
  if (/\.tsv$/i.test(name)) return "\t"
  return null
}

export function renderedMode(kind: PreviewKind, delimiter: string | null): RenderedMode | null {
  if (kind === "markdown" || kind === "mermaid" || kind === "html") return kind
  return delimiter ? "table" : null
}

/** Kinds whose preview is read as text: the rendered ones and plain text. */
export const readsText = (kind: PreviewKind) => kind === "text" || kind === "markdown" || kind === "mermaid" || kind === "html"

const ENCODINGS = ["utf-8", "gb18030"] as const

/** Text up to the preview cap, refusing binary and undecodable bytes, as t3code's decodeFilePreviewText. */
export function decodeText(bytes: Uint8Array): { text: string; truncated: boolean } {
  const cap = tokens.limit["preview-text-bytes"]
  const bounded = bytes.subarray(0, cap)
  if (bounded.some((byte) => byte === 0)) throw new Error("This file contains binary data and cannot be shown as text.")
  const truncated = bytes.length > bounded.length
  for (const encoding of ENCODINGS) {
    try {
      return { text: new TextDecoder(encoding, { fatal: true }).decode(bounded, { stream: truncated }), truncated }
    } catch {}
  }
  throw new Error("This file is not UTF-8 text. Open it in another app to view its contents.")
}

const FRONTMATTER = /^\uFEFF?---[ \t]*(?:\r\n|\r|\n)(?:[\s\S]*?(?:\r\n|\r|\n))??(?:---|\.\.\.)[ \t]*(?=\r\n|\r|\n|$)/
/** Blanks leading YAML frontmatter so the rendered view skips it instead of showing a rule and a setext heading. */
export const maskFrontmatter = (markdown: string) => markdown.replace(FRONTMATTER, (block) => block.replace(/[^\r\n]/g, " "))

function csvDelimiter(text: string): "," | ";" {
  const commas = [0, 0]
  const semicolons = [0, 0]
  let record = 0
  let second = false
  let quoted = false
  let fieldStart = true
  for (let i = text.charCodeAt(0) === 0xfeff ? 1 : 0; i < text.length; i++) {
    const char = text[i]
    if (quoted) {
      if (char !== '"') continue
      if (text[i + 1] === '"') i++
      else quoted = false
    } else if (char === '"' && fieldStart) quoted = true
    else if (char === "\n" || char === "\r") {
      if (record === 1) break
      if (char === "\r" && text[i + 1] === "\n") i++
      record = 1
      fieldStart = true
      continue
    } else if (char === ",") commas[record]!++
    else if (char === ";") semicolons[record]!++
    second ||= record === 1
    fieldStart = char === "," || char === ";"
  }
  if (semicolons[0]! <= commas[0]!) return ","
  if (!second) return ";"
  const consistentCommas = commas[0]! > 0 && commas[1] === commas[0]
  return semicolons[1] === semicolons[0] && !consistentCommas ? ";" : ","
}

/** RFC 4180 rows with quoted fields, bounded in rows, columns and cell length (t3code parseDelimitedPreview). */
export function parseDelimited(text: string, delimiter: "," | "\t") {
  const { "table-rows": maxRows, "table-columns": maxColumns, "table-cell": maxCell } = tokens.limit
  const split = delimiter === "," ? csvDelimiter(text) : delimiter
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false
  let truncated = false
  let rowStart = text.charCodeAt(0) === 0xfeff ? 1 : 0
  const endCell = () => {
    if (cell.length > maxCell) {
      cell = cell.slice(0, maxCell)
      truncated = true
    }
    if (row.length < maxColumns) row.push(cell)
    else truncated = true
    cell = ""
  }
  for (let i = rowStart; i < text.length; i++) {
    const char = text[i]!
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"'
        i++
        continue
      }
      if (quoted || cell === "") {
        quoted = !quoted
        continue
      }
    }
    if (!quoted && (char === split || char === "\n" || char === "\r")) {
      endCell()
      if (char !== split) {
        rows.push(row)
        row = []
        if (char === "\r" && text[i + 1] === "\n") i++
        rowStart = i + 1
        if (rows.length === maxRows) return { rows, truncated: truncated || i < text.length - 1 }
      }
    } else if (cell.length <= maxCell) cell += char
    else truncated = true
  }
  if (rowStart < text.length) {
    endCell()
    rows.push(row)
  }
  return { rows, truncated: truncated || quoted }
}

export interface ArchiveEntry {
  readonly path: string
  readonly size: number
  readonly directory: boolean
}

const tooMany = () => new Error("This archive has too many entries to list.")

/** Names and sizes from a zip's central directory, without inflating any entry. */
function zipEntries(bytes: Uint8Array): ArchiveEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let end = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--)
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i
      break
    }
  if (end < 0) throw new Error("This archive is damaged or not a zip file.")
  const count = view.getUint16(end + 10, true)
  if (count > tokens.limit["archive-entries"]) throw tooMany()
  let at = view.getUint32(end + 16, true)
  const names = new TextDecoder()
  const entries: ArchiveEntry[] = []
  for (let n = 0; n < count; n++) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== 0x02014b50) throw new Error("This archive is damaged or not a zip file.")
    const size = view.getUint32(at + 24, true)
    const nameLength = view.getUint16(at + 28, true)
    const extra = view.getUint16(at + 30, true)
    const comment = view.getUint16(at + 32, true)
    const path = names.decode(bytes.subarray(at + 46, at + 46 + nameLength))
    entries.push({ path, size, directory: path.endsWith("/") })
    at += 46 + nameLength + extra + comment
  }
  return entries
}

function tarEntries(bytes: Uint8Array): ArchiveEntry[] {
  const names = new TextDecoder()
  const field = (at: number, length: number) => names.decode(bytes.subarray(at, at + length)).replace(/\0.*$/s, "")
  const entries: ArchiveEntry[] = []
  for (let at = 0; at + 512 <= bytes.length; ) {
    const name = field(at, 100)
    if (!name) break
    const prefix = field(at + 345, 155)
    const size = parseInt(field(at + 124, 12).trim() || "0", 8)
    const type = String.fromCharCode(bytes[at + 156]!)
    if (type !== "x" && type !== "g" && type !== "L") entries.push({ path: prefix ? prefix + "/" + name : name, size, directory: type === "5" || name.endsWith("/") })
    if (entries.length > tokens.limit["archive-entries"]) throw tooMany()
    at += 512 + Math.ceil(size / 512) * 512
  }
  return entries
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const cap = bytes.length * tokens.limit["archive-ratio"]
  const reader = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip")).getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  for (;;) {
    const next = await reader.read()
    if (next.done) break
    length += next.value.length
    if (length > cap) {
      void reader.cancel()
      throw new Error("This archive expands too far to preview safely.")
    }
    chunks.push(next.value)
  }
  const out = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) out.set(chunk, (offset += chunk.length) - chunk.length)
  return out
}

/** The listing of a zip, jar, tar, tar.gz or gz file, as t3code's binary preview worker builds it. */
export async function archiveEntries(name: string, bytes: Uint8Array): Promise<ArchiveEntry[]> {
  const lower = name.toLowerCase()
  const entries = bytes[0] === 0x50 && bytes[1] === 0x4b ? zipEntries(bytes) : bytes[0] === 0x1f && bytes[1] === 0x8b ? await (async () => {
    const inner = await gunzip(bytes)
    if (/\.(tar\.gz|tgz)$/.test(lower) || field257(inner)) return tarEntries(inner)
    return [{ path: name.replace(/\.gz$/i, ""), size: inner.length, directory: false }]
  })() : tarEntries(bytes)
  if (!entries.length) throw new Error("This archive is empty.")
  return entries
}
const field257 = (bytes: Uint8Array) => bytes.length > 262 && new TextDecoder().decode(bytes.subarray(257, 262)) === "ustar"
