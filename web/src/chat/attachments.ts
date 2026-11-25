import type { AttachmentStatus } from "@tock/ui/chat/attachments"
import { useEffect, useRef, useState } from "react"
import { upload } from "../api/http"
import type { FileMeta } from "../api/types"
import { rememberFile } from "../state/files"

export const RENDERABLE = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/bmp",
  "image/svg+xml",
  "image/x-icon",
  "image/vnd.microsoft.icon",
  "image/apng",
])

export interface Attachment {
  readonly localId: string
  readonly name: string
  readonly mediaType: string
  readonly sizeBytes: number
  readonly previewUrl?: string
  readonly status: AttachmentStatus
  readonly meta?: FileMeta
}

const heic = (name: string) => {
  const extension = name.split(".").at(-1)?.toLowerCase()
  return extension === "heic" || extension === "heif" ? `image/${extension}` : undefined
}

export function useAttachments(sessionId: string | undefined) {
  const [entries, setEntries] = useState<readonly Attachment[]>([])
  const current = useRef(entries)
  current.current = entries
  const aborts = useRef(new Map<string, AbortController>())

  const release = (attachments: readonly Attachment[]) => {
    for (const attachment of attachments) {
      aborts.current.get(attachment.localId)?.abort()
      aborts.current.delete(attachment.localId)
      if (attachment.previewUrl !== undefined) URL.revokeObjectURL(attachment.previewUrl)
    }
  }

  useEffect(() => () => release(current.current), [])

  const patch = (localId: string, change: Partial<Attachment>) =>
    setEntries((list) => list.map((entry) => (entry.localId === localId ? { ...entry, ...change } : entry)))

  const add = (files: readonly File[]) => {
    const added = files.map((file): readonly [Attachment, File] => {
      const mediaType = file.type === "" ? (heic(file.name) ?? "application/octet-stream") : file.type
      return [
        {
          localId: crypto.randomUUID(),
          name: file.name === "" ? "file" : file.name,
          mediaType,
          sizeBytes: file.size,
          previewUrl: RENDERABLE.has(mediaType.toLowerCase()) ? URL.createObjectURL(file) : undefined,
          status: file.size === 0 ? { phase: "failed", message: "Empty file" } : { phase: "uploading" },
        },
        file,
      ]
    })
    setEntries((list) => [...list, ...added.map(([attachment]) => attachment)])
    for (const [attachment, file] of added) {
      if (attachment.status.phase !== "uploading") continue
      const abort = new AbortController()
      aborts.current.set(attachment.localId, abort)
      upload<FileMeta>(file, {
        sessionId,
        signal: abort.signal,
        onProgress: (progress) => {
          if (!abort.signal.aborted) patch(attachment.localId, { status: { phase: "uploading", progress } })
        },
      }).then(
        (meta) => {
          rememberFile(meta)
          patch(attachment.localId, { status: { phase: "ready" }, meta })
        },
        (error: unknown) => {
          if (abort.signal.aborted) return
          patch(attachment.localId, {
            status: { phase: "failed", message: error instanceof Error ? error.message : "Upload failed" },
          })
        },
      )
    }
  }

  const remove = (localId: string) => {
    release(current.current.filter((entry) => entry.localId === localId))
    setEntries((list) => list.filter((entry) => entry.localId !== localId))
  }

  const clear = () => {
    release(current.current)
    setEntries([])
  }

  return { entries, add, remove, clear }
}
