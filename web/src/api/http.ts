import { RequestError } from "./socket"

export async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init)
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null)
    const code =
      typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
        ? body.error
        : String(response.status)
    throw new RequestError(code, `Request failed (${code})`)
  }
  return (await response.json()) as T
}

export const post = <T>(path: string, body?: unknown) =>
  http<T>(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

const MEBIBYTE = 1024 * 1024

export const upload = <T>(
  file: File,
  options: { sessionId?: string; signal?: AbortSignal; onProgress?: (percent: number) => void } = {},
) =>
  new Promise<T>((resolve, reject) => {
    const { sessionId, signal, onProgress } = options
    const request = new XMLHttpRequest()
    if (onProgress !== undefined) {
      request.upload.onloadstart = () => onProgress(0)
      request.upload.onprogress = (event) => {
        if (event.lengthComputable && event.total > 0) onProgress(Math.min(100, Math.floor((event.loaded / event.total) * 100)))
      }
      request.upload.onload = () => onProgress(100)
    }
    request.open("POST", `/api/files${sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ""}`)
    request.responseType = "json"
    request.setRequestHeader("content-type", file.type || "application/octet-stream")
    request.setRequestHeader("x-file-name", encodeURIComponent(file.name))
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) return resolve(request.response as T)
      const body: unknown = request.response
      const code =
        typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
          ? body.error
          : String(request.status)
      const limit = typeof body === "object" && body !== null && "limit" in body && typeof body.limit === "number" ? body.limit : null
      reject(
        new RequestError(
          code,
          code === "file_too_large" && limit !== null
            ? `Over the ${Math.round(limit / MEBIBYTE)} MB file limit`
            : `Upload failed: ${request.status}`,
        ),
      )
    }
    request.onerror = () => reject(new RequestError("network", "Upload failed: network error"))
    request.onabort = () => reject(new RequestError("aborted", "Upload aborted"))
    signal?.addEventListener("abort", () => request.abort(), { once: true })
    request.send(file)
  })
