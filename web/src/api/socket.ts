export interface ServerEvent {
  readonly seq: number
  readonly event: string
  readonly payload: unknown
}

export type ConnectionState = "connecting" | "open" | "closed"

type Pending = { resolve: (data: unknown) => void; reject: (error: Error) => void }

const RECONNECT_BASE_MS = 500
const RECONNECT_MAX_MS = 8000

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
  private eventListeners = new Set<(event: ServerEvent) => void>()
  private stateListeners = new Set<(state: ConnectionState) => void>()
  state: ConnectionState = "connecting"

  constructor(private readonly url: string) {
    this.connect()
  }

  request<T = unknown>(type: string, body: Record<string, unknown> = {}): Promise<T> {
    const id = `${Date.now().toString(36)}-${(this.nextId++).toString(36)}`
    const frame = JSON.stringify({ ...body, id, type })
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (data: unknown) => void, reject })
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
    this.state = state
    for (const listener of this.stateListeners) listener(state)
  }

  private connect() {
    this.setState("connecting")
    const ws = new WebSocket(this.url)
    this.ws = ws
    ws.addEventListener("open", () => {
      this.attempt = 0
      this.setState("open")
      for (const frame of this.queue.splice(0)) ws.send(frame)
    })
    ws.addEventListener("message", (message) => this.receive(String(message.data)))
    ws.addEventListener("close", () => {
      this.setState("closed")
      for (const [, entry] of this.pending) entry.reject(new RequestError("disconnected", "Connection lost"))
      this.pending.clear()
      const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** this.attempt++)
      setTimeout(() => this.connect(), delay)
    })
  }

  private receive(raw: string) {
    const frame = JSON.parse(raw) as {
      id?: string
      type: string
      data?: unknown
      code?: string
      message?: string
      seq?: number
      event?: string
      payload?: unknown
    }
    if (frame.type === "event" && frame.event !== undefined && frame.seq !== undefined) {
      for (const listener of this.eventListeners) listener({ seq: frame.seq, event: frame.event, payload: frame.payload })
      return
    }
    if (!frame.id) return
    const entry = this.pending.get(frame.id)
    if (!entry) return
    this.pending.delete(frame.id)
    if (frame.type === "error") entry.reject(new RequestError(frame.code ?? "error", frame.message ?? "Request failed"))
    else entry.resolve(frame.data)
  }
}

const scheme = location.protocol === "https:" ? "wss" : "ws"

export const socket = new Socket(`${scheme}://${location.host}/ws`)
