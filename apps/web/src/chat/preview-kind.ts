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
