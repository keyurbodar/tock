import type { ServerEvent } from "@tock/protocol"

export type ConnectionState = "connecting" | "open" | "closed" | "unauthorized"

type Pending = { resolve: (data: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }

const RECONNECT_BASE_MS = 400
const RECONNECT_MAX_MS = 8000
const REQUEST_TIMEOUT_MS = 20000
const HEARTBEAT_MS = 25000
const PONG_TIMEOUT_MS = 5000

export class RequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

export class Socket {
  private ws: WebSocket | null = null
  private pending = new Map<string, Pending>()
  private queue: string[] = []
  private attempt = 0
  private nextId = 0
  private retry: ReturnType<typeof setTimeout> | undefined
  private heartbeat: ReturnType<typeof setInterval> | undefined
  private probing: Promise<boolean> | undefined
  private pong: (() => void) | undefined
  private eventListeners = new Set<(event: ServerEvent) => void>()
  private stateListeners = new Set<(state: ConnectionState) => void>()
  state: ConnectionState = "closed"

  constructor(private readonly url: string) {
    addEventListener("online", () => this.reconnectNow())
    addEventListener("offline", () => this.ws && this.lost(this.ws))
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible") return
      this.reconnectNow()
      void this.alive()
    })
  }

  start() {
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) return
    this.connect()
  }

  request<T = unknown>(type: string, body: Record<string, unknown> = {}): Promise<T> {
    const id = `${Date.now().toString(36)}-${(this.nextId++).toString(36)}`
    const frame = JSON.stringify({ ...body, id, type })
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => void this.timedOut(id), REQUEST_TIMEOUT_MS)
      this.pending.set(id, { resolve: resolve as (data: unknown) => void, reject, timer })
      if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(frame)
      else this.queue.push(frame)
    })
  }

  onEvent(listener: (event: ServerEvent) => void): () => void {
    this.eventListeners.add(listener)
    return () => this.eventListeners.delete(listener)
  }

  onState(listener: (state: ConnectionState) => void): () => void {
    this.stateListeners.add(listener)
    return () => this.stateListeners.delete(listener)
  }

  private setState(state: ConnectionState) {
    if (this.state === state) return
    this.state = state
    for (const listener of this.stateListeners) listener(state)
  }

  /** A request with no reply asks the socket whether it is alive: a half-open socket is dropped and every request retries on the next open; a live one that ignored the request fails it as a timeout. */
  private async timedOut(id: string) {
    if (!this.pending.has(id)) return
    const ws = this.ws
    if (!(await this.alive()) || ws !== this.ws) return
    const entry = this.pending.get(id)
    if (!entry) return
    this.pending.delete(id)
    entry.reject(new RequestError("timeout", "The server didn’t answer. Try again."))
  }

  /** Pings over the socket (the Durable Object answers "pong" without waking); no pong in time means the socket is half-open, so it is dropped and reconnects. */
  private alive(): Promise<boolean> {
    const ws = this.ws
    if (!ws || ws.readyState !== WebSocket.OPEN) return Promise.resolve(false)
    this.probing ??= new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        this.pong = undefined
        if (this.ws === ws) void this.lost(ws)
        resolve(false)
      }, PONG_TIMEOUT_MS)
      this.pong = () => {
        clearTimeout(timer)
        this.pong = undefined
        resolve(true)
      }
      ws.send("ping")
    }).finally(() => (this.probing = undefined))
    return this.probing
  }

  private reconnectNow() {
    if (this.state !== "closed") return
    clearTimeout(this.retry)
    this.attempt = 0
    this.connect()
  }

  private connect() {
    this.setState("connecting")
    const ws = new WebSocket(this.url)
    this.ws = ws
    const opened = Date.now()
    ws.addEventListener("open", () => {
      this.attempt = 0
      this.setState("open")
      for (const frame of this.queue.splice(0)) ws.send(frame)
      clearInterval(this.heartbeat)
      this.heartbeat = setInterval(() => void this.alive(), HEARTBEAT_MS)
    })
    ws.addEventListener("message", (message) => {
      const slow = import.meta.env.DEV ? Number(sessionStorage.getItem("tock.slow")) : 0
      if (slow > 0) return void setTimeout(() => this.receive(String(message.data)), slow)
      this.receive(String(message.data))
    })
    ws.addEventListener("close", () => {
      if (this.ws === ws) void this.lost(ws, Date.now() - opened < 1500)
    })
  }

  /** Drops the socket at once: a close handshake over a dead network can take many seconds, so offline never waits for it. */
  private async lost(ws: WebSocket, quick = false) {
    this.ws = null
    clearInterval(this.heartbeat)
    this.pong?.()
    if (ws.readyState <= WebSocket.OPEN) ws.close()
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer)
      entry.reject(new RequestError("disconnected", "Connection lost"))
    }
    this.pending.clear()
    this.queue = []
    clearTimeout(this.retry)
    if (quick && this.attempt > 0) {
      const res = await fetch("/api/auth", { credentials: "same-origin" }).catch(() => null)
      if (res?.status === 401) return this.setState("unauthorized")
    }
    this.setState("closed")
    const jitter = Math.random() * 200
    const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** this.attempt++) + jitter
    this.retry = setTimeout(() => this.connect(), delay)
  }

  private receive(raw: string) {
    if (raw === "pong") return this.pong?.()
    let frame: {
      id?: string
      type: string
      data?: unknown
      code?: string
      message?: string
      seq?: number
      event?: string
      payload?: unknown
    }
    try {
      frame = JSON.parse(raw)
    } catch {
      return
    }
    if (typeof frame !== "object" || frame === null) return
    if (frame.type === "event" && frame.event !== undefined && frame.seq !== undefined) {
      for (const listener of this.eventListeners) listener({ seq: frame.seq, event: frame.event, payload: frame.payload })
      return
    }
    if (!frame.id) return
    const entry = this.pending.get(frame.id)
    if (!entry) return
    this.pending.delete(frame.id)
    clearTimeout(entry.timer)
    if (frame.type === "error") entry.reject(new RequestError(frame.code ?? "error", frame.message ?? "Request failed"))
    else entry.resolve(frame.data)
  }
}

const scheme = location.protocol === "https:" ? "wss" : "ws"

export const socket = new Socket(`${scheme}://${location.host}/ws`)
