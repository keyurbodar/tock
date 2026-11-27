import { createStore, untrack } from "solid-js"
import type { FileMeta } from "@tock/protocol"
import { tokens } from "@tock/tokens"

export type AttachmentStatus = "uploading" | "reading" | "done" | "failed"

export interface Attachment {
  readonly key: string
  readonly name: string
  readonly size: number
  readonly mime: string
  readonly preview: string | null
  status: AttachmentStatus
  progress: number
  error: string | null
  meta: string | null
  fileId: string | null
}

export interface Rejection {
  readonly title: string
  readonly hint: string
}

const LINK = /\[([^\]\n]+)\]\(tock-file:([\w-]+)\)/g
const MB = 1024 * 1024
const READABLE = /\.(png|jpe?g|gif|webp|heic|heif|avif|pdf|md|markdown|mdx|m?[jt]sx?|py|sql|json|css|html?|go|rs|rb|swift|sh|ya?ml|toml|mp3|wav|m4a|aac|mp4|mov|webm|zip|tar|gz|txt|csv|log)$/i
const TEXTUAL = /\.(md|markdown|mdx|m?[jt]sx?|py|sql|json|css|html?|go|rs|rb|swift|sh|ya?ml|toml|txt|csv|log)$/i

export const isImage = (name: string, mime = "") => mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|avif)$/i.test(name)
const READABLE_MIME = /^(image|audio|video|text)\/|^application\/(pdf|zip|x-zip-compressed|gzip|x-gzip|x-tar|json|javascript|x-javascript|typescript|xml|x-sh|x-python|sql|toml|yaml|x-yaml)$/
export const isReadable = (name: string, mime = "") => READABLE.test(name) || READABLE_MIME.test(mime)
export const extension = (name: string) => (/\.([a-z0-9]{1,4})$/i.exec(name)?.[1] ?? "file").toUpperCase()
export const fileUrl = (id: string) => `/api/files/${encodeURIComponent(id)}`

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < MB) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / MB).toFixed(1)} MB`
}

/** Files ride in the message text as tock-file links, so the model sees the id it can read with file_read. */
export const withFiles = (text: string, files: readonly { name: string; id: string }[]) =>
  [text.trim(), files.map((file) => `[${file.name.replace(/[[\]]/g, "")}](tock-file:${file.id})`).join("\n")].filter(Boolean).join("\n\n")

export function splitFiles(text: string) {
  const files = [...text.matchAll(LINK)].map((match) => ({ name: match[1]!, id: match[2]! }))
  return { text: text.replace(LINK, "").trim(), files }
}

function upload(file: File, onProgress: (fraction: number) => void): Promise<FileMeta> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("POST", "/api/files")
    xhr.setRequestHeader("content-type", file.type || "application/octet-stream")
    xhr.setRequestHeader("x-file-name", encodeURIComponent(file.name))
    xhr.upload.onprogress = (event) => event.lengthComputable && onProgress(event.loaded / event.total)
    xhr.onload = () => {
      if (xhr.status === 201) return resolve(JSON.parse(xhr.responseText) as FileMeta)
      reject(new Error(xhr.status === 413 ? "Too large" : "Upload failed. Check your connection, then attach the file again."))
    }
    xhr.onerror = () => reject(new Error(navigator.onLine ? "Upload failed" : "You’re offline. Reconnect, then attach the file again."))
    xhr.send(file)
  })
}

/** As T3Code's prepareImageForAttachment: big photos shrink to the longest edge we need before they upload; anything that fails stays as it was. */
async function prepare(file: File): Promise<File> {
  if (!/^image\/(png|jpe?g|webp|heic|heif)$/.test(file.type) || file.size <= tokens.limit["compress-kb"] * 1024) return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, tokens.limit["image-edge"] / Math.max(bitmap.width, bitmap.height))
    const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale))
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const blob = await canvas.convertToBlob({ type: "image/webp", quality: tokens.limit["image-quality"] })
    if (blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".webp", { type: "image/webp" })
  } catch {
    return file
  }
}

const plurals = new Intl.PluralRules()
const plural = (count: number, forms: Record<"one" | "other", string>) => (plurals.select(count) === "one" ? forms.one : forms.other).replace("#", count.toLocaleString())

/** What the card says once the file is read (TDS px3 meta): lines for text, pages for PDFs, the size for the rest. */
async function describe(file: File): Promise<string> {
  if (TEXTUAL.test(file.name) || file.type.startsWith("text/")) return `${formatSize(file.size)} · ${plural((await file.text()).split("\n").length, { one: "# line", other: "# lines" })}`
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    const pages = ((await file.text()).match(/\/Type\s*\/Page(?!s)/g) ?? []).length
    if (pages > 0) return `${formatSize(file.size)} · ${plural(pages, { one: "# page", other: "# pages" })}`
  }
  if (file.type.startsWith("video/") || /\.(mp4|mov|webm|m4v)$/i.test(file.name)) {
    const seconds = await duration(file)
    if (seconds) return `${formatSize(file.size)} · ${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`
  }
  return formatSize(file.size)
}

function duration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video")
    const url = URL.createObjectURL(file)
    const done = (value: number | null) => (URL.revokeObjectURL(url), resolve(value))
    video.preload = "metadata"
    video.onloadedmetadata = () => done(Number.isFinite(video.duration) ? video.duration : null)
    video.onerror = () => done(null)
    video.src = url
  })
}

/** The verb the reading line shimmers while toast looks inside (TDS px3 proc). */
export function readingLabel(name: string) {
  if (/\.pdf$/i.test(name)) return "Reading pages"
  if (/\.(mp3|wav|m4a|aac)$/i.test(name)) return "Transcribing"
  if (/\.(mp4|mov|webm)$/i.test(name)) return "Watching"
  if (/\.(zip|tar|gz)$/i.test(name)) return "Unpacking"
  return "Reading"
}

export function createAttachments() {
  const [list, setList] = createStore<{ items: Attachment[] }>({ items: [] })
  const sources = new Map<string, File>()
  const origins = new Map<string, DOMRect>()
  const patch = (key: string, change: Partial<Attachment>) =>
    setList((s) => {
      const item = s.items.find((entry) => entry.key === key)
      if (item) Object.assign(item, change)
    })

  const read = async (key: string, file: File) => {
    if (isImage(file.name, file.type)) return patch(key, { status: "done", progress: 1, meta: formatSize(file.size) })
    patch(key, { status: "reading", progress: 1 })
    const [meta] = await Promise.all([describe(file).catch(() => formatSize(file.size)), new Promise((done) => setTimeout(done, tokens.motion.duration["read-min"]))])
    if (sources.get(key) === file) patch(key, { status: "done", meta })
  }

  const start = (key: string) => {
    const file = sources.get(key)
    if (!file) return
    patch(key, { status: "uploading", progress: 0, error: null })
    upload(file, (progress) => patch(key, { progress }))
      .then((meta) => {
        patch(key, { fileId: meta.id })
        return read(key, file)
      })
      .catch((error: Error) => patch(key, { status: "failed", error: error.message }))
  }

  /** Adds what toast can read and returns why it refused the rest; refused files never reach the tray. */
  const add = (files: Iterable<File>, from?: DOMRect): Rejection[] => {
    const rejected: Rejection[] = []
    for (const file of files) {
      const name = file.name || "pasted"
      if (!isReadable(name, file.type)) {
        rejected.push({ title: `Tock can’t read .${extension(name).toLowerCase()} files`, hint: "Try a PDF, image, text or code file" })
        continue
      }
      if (file.size > tokens.limit["file-mb"] * MB) {
        rejected.push({ title: `${name} is ${formatSize(file.size)}`, hint: `Files can be up to ${tokens.limit["file-mb"]} MB. Try a shorter clip or a link.` })
        continue
      }
      const key = crypto.randomUUID()
      sources.set(key, file)
      if (from) origins.set(key, from)
      setList((s) =>
        void s.items.push({ key, name, size: file.size, mime: file.type, preview: isImage(name, file.type) ? URL.createObjectURL(file) : null, status: "uploading", progress: 0, error: null, meta: null, fileId: null }),
      )
      void prepare(file).then((ready) => {
        if (!sources.has(key)) return
        sources.set(key, ready)
        if (ready !== file) patch(key, { name: ready.name, size: ready.size, mime: ready.type })
        start(key)
      })
    }
    return rejected
  }

  const remove = (key: string) => {
    const preview = untrack(() => list.items.find((entry) => entry.key === key)?.preview)
    if (preview) URL.revokeObjectURL(preview)
    sources.delete(key)
    setList((s) => void (s.items = s.items.filter((entry) => entry.key !== key)))
  }

  const move = (key: string, to: number) =>
    setList((s) => {
      const from = s.items.findIndex((entry) => entry.key === key)
      if (from < 0 || from === to) return
      const [item] = s.items.splice(from, 1)
      s.items.splice(to, 0, item!)
    })

  const clear = () => {
    for (const preview of untrack(() => list.items.map((item) => item.preview))) if (preview) URL.revokeObjectURL(preview)
    sources.clear()
    setList((s) => void (s.items = []))
  }

  return {
    items: () => list.items,
    add,
    remove,
    move,
    clear,
    retry: start,
    /** Where a card was attached from (the plus button or the drop point), read once when it mounts. */
    origin: (key: string) => {
      const from = origins.get(key)
      origins.delete(key)
      return from
    },
    ready: () => list.items.every((item) => item.status === "done"),
    files: () => list.items.flatMap((item) => (item.fileId ? [{ name: item.name, id: item.fileId }] : [])),
  }
}
