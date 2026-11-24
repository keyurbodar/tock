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

export const upload = <T>(file: File, sessionId?: string) =>
  http<T>(`/api/files${sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ""}`, {
    method: "POST",
    headers: { "content-type": file.type || "application/octet-stream", "x-file-name": encodeURIComponent(file.name) },
    body: file,
  })
