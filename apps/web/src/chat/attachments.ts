import { createStore, untrack } from "solid-js"
import type { FileMeta } from "@tock/protocol"
import { tokens } from "@tock/tokens"

export type AttachmentStatus = "uploading" | "done" | "failed"

export interface Attachment {
  readonly key: string
  readonly name: string
  readonly size: number
  readonly mime: string
  readonly preview: string | null
  status: AttachmentStatus
  progress: number
  error: string | null
  fileId: string | null
}

const LINK = /\[([^\]\n]+)\]\(tock-file:([\w-]+)\)/g
const MB = 1024 * 1024

export const isImage = (name: string, mime = "") => mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|avif)$/i.test(name)
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
      reject(new Error(xhr.status === 413 ? "Too large" : "Upload failed"))
    }
    xhr.onerror = () => reject(new Error(navigator.onLine ? "Upload failed" : "You're offline"))
    xhr.send(file)
  })
}

export function createAttachments() {
  const [list, setList] = createStore<{ items: Attachment[] }>({ items: [] })
  const sources = new Map<string, File>()
  const patch = (key: string, change: Partial<Attachment>) =>
    setList((s) => {
      const item = s.items.find((entry) => entry.key === key)
      if (item) Object.assign(item, change)
    })

  const start = (key: string) => {
    const file = sources.get(key)
    if (!file) return
    patch(key, { status: "uploading", progress: 0, error: null })
    upload(file, (progress) => patch(key, { progress }))
      .then((meta) => patch(key, { status: "done", progress: 1, fileId: meta.id }))
      .catch((error: Error) => patch(key, { status: "failed", error: error.message }))
  }

  const add = (files: Iterable<File>) => {
    for (const file of files) {
      const key = crypto.randomUUID()
      const tooLarge = file.size > tokens.limit["file-mb"] * MB
      sources.set(key, file)
      setList((s) =>
        void s.items.push({
          key,
          name: file.name || "pasted",
          size: file.size,
          mime: file.type,
          preview: isImage(file.name, file.type) ? URL.createObjectURL(file) : null,
          status: tooLarge ? "failed" : "uploading",
          progress: 0,
          error: tooLarge ? `Over ${tokens.limit["file-mb"]} MB` : null,
          fileId: null,
        }),
      )
      if (!tooLarge) start(key)
    }
  }

  const remove = (key: string) => {
    const item = untrack(() => list.items.find((entry) => entry.key === key))
    if (item?.preview) URL.revokeObjectURL(item.preview)
    sources.delete(key)
    setList((s) => void (s.items = s.items.filter((entry) => entry.key !== key)))
  }

  const clear = () => {
    for (const item of untrack(() => [...list.items])) if (item.preview) URL.revokeObjectURL(item.preview)
    sources.clear()
    setList((s) => void (s.items = []))
  }

  return {
    items: () => list.items,
    add,
    remove,
    clear,
    retry: start,
    ready: () => list.items.every((item) => item.status === "done"),
    files: () => list.items.flatMap((item) => (item.fileId ? [{ name: item.name, id: item.fileId }] : [])),
  }
}
