import type { HighlightRequest, Token, WorkerResponse } from "./protocol"

const MAX_KEYS = 200

export interface HighlightState {
  readonly id: number
  readonly generation: number
  readonly source: string
  readonly stable: readonly Token[]
  readonly unstable: readonly Token[]
}

export type HighlightResult =
  | { readonly type: "tokens"; readonly state: HighlightState }
  | { readonly type: "unavailable" | "superseded" | "disposed" }
  | { readonly type: "error"; readonly message: string }

interface Waiter {
  readonly key: string
  readonly text: string
  readonly complete: boolean
  readonly resolve: (result: HighlightResult) => void
}

let worker: Worker | undefined
let broken = false
let nextId = 0
const waiters = new Map<number, Waiter>()
const states = new Map<string, HighlightState>()
const keys = new Set<string>()
const latest = new Map<string, number>()
const inFlight = new Map<string, HighlightRequest>()
const queued = new Map<string, HighlightRequest>()

const supersede = (request: HighlightRequest) => {
  const waiter = waiters.get(request.id)
  if (waiter === undefined) return
  waiters.delete(request.id)
  waiter.resolve({ type: "superseded" })
}

const send = (request: HighlightRequest) => {
  if (!inFlight.has(request.key)) {
    inFlight.set(request.key, request)
    worker?.postMessage(request)
    return
  }
  const waiting = queued.get(request.key)
  if (waiting) supersede(waiting)
  queued.set(request.key, request)
}

const settle = (key: string, id: number) => {
  if (inFlight.get(key)?.id !== id) return
  inFlight.delete(key)
  const next = queued.get(key)
  if (next === undefined) return
  queued.delete(key)
  inFlight.set(key, next)
  worker?.postMessage(next)
}

const merge = (previous: HighlightState | undefined, response: Extract<WorkerResponse, { type: "highlight" }>, source: string) => {
  if (previous && response.id <= previous.id) return previous
  if (!previous || response.reset) {
    return { id: response.id, generation: response.id, source, stable: response.stable, unstable: response.unstable }
  }
  return {
    id: response.id,
    generation: previous.generation,
    source,
    stable: response.stable.length > 0 ? [...previous.stable, ...response.stable] : previous.stable,
    unstable: response.unstable,
  }
}

const receive = (response: WorkerResponse) => {
  const waiter = waiters.get(response.id)
  if (waiter === undefined) {
    settle(response.key, response.id)
    return
  }
  waiters.delete(response.id)
  if (!keys.has(response.key)) waiter.resolve({ type: "disposed" })
  else if (response.type === "superseded") waiter.resolve({ type: "superseded" })
  else if (response.type === "error") waiter.resolve({ type: "error", message: response.message })
  else {
    const state = merge(states.get(response.key), response, waiter.text)
    if (waiter.complete && latest.get(response.key) === response.id) {
      states.delete(response.key)
      keys.delete(response.key)
      latest.delete(response.key)
    } else states.set(response.key, state)
    waiter.resolve({ type: "tokens", state })
  }
  settle(response.key, response.id)
}

const fail = () => {
  broken = true
  for (const request of queued.values()) supersede(request)
  queued.clear()
  inFlight.clear()
  for (const waiter of waiters.values()) waiter.resolve({ type: "unavailable" })
  waiters.clear()
  states.clear()
  keys.clear()
  latest.clear()
  worker?.terminate()
  worker = undefined
}

const start = () => {
  if (worker) return worker
  if (broken || typeof Worker === "undefined") return undefined
  try {
    worker = new Worker(new URL("./highlight.worker.ts", import.meta.url), { type: "module" })
  } catch {
    broken = true
    return undefined
  }
  worker.onmessage = (event: MessageEvent<WorkerResponse>) => receive(event.data)
  worker.onerror = fail
  worker.onmessageerror = fail
  return worker
}

export function highlight(key: string, text: string, language: string, complete: boolean): Promise<HighlightResult> {
  if (!start()) return Promise.resolve({ type: "unavailable" })
  const id = ++nextId
  latest.set(key, id)
  keys.delete(key)
  keys.add(key)
  const oldest = keys.values().next().value
  if (keys.size > MAX_KEYS && oldest !== undefined) disposeHighlight(oldest)
  return new Promise((resolve) => {
    waiters.set(id, { key, text, complete, resolve })
    send({ type: "highlight", id, key, text, language, complete })
  })
}

export function disposeHighlight(key: string) {
  keys.delete(key)
  latest.delete(key)
  states.delete(key)
  inFlight.delete(key)
  const waiting = queued.get(key)
  if (waiting) supersede(waiting)
  queued.delete(key)
  for (const [id, waiter] of waiters) {
    if (waiter.key !== key) continue
    waiters.delete(id)
    waiter.resolve({ type: "disposed" })
  }
  worker?.postMessage({ type: "dispose", key })
}
