import { useAtomValue } from "@effect/atom-react"
import * as Atom from "effect/reactivity/Atom"
import { useEffect } from "react"
import { socket } from "../api/socket"
import type { ConversationView, EntryRecord, LiveState } from "../api/types"
import { refreshSessions, sessionsAtom } from "./data"
import { registry } from "./registry"

const LIVE_DOC = "pi.live"

export interface Pending {
  readonly text: string
  readonly seq: number
}

export interface ThreadState {
  readonly phase: "loading" | "ready" | "missing"
  readonly entries: readonly EntryRecord[]
  readonly live: LiveState | null
  readonly pending: readonly Pending[]
  readonly error: string | null
}

const EMPTY: ThreadState = { phase: "loading", entries: [], live: null, pending: [], error: null }

export const threadAtom = Atom.family((sessionId: string) => {
  void sessionId
  return Atom.make<ThreadState>(EMPTY).pipe(Atom.keepAlive)
})

const patch = (sessionId: string, update: (state: ThreadState) => ThreadState) =>
  registry.set(threadAtom(sessionId), update(registry.get(threadAtom(sessionId))))

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null

function liveOf(view: ConversationView): LiveState | null {
  const doc = view.docs[LIVE_DOC]
  return isRecord(doc) ? (doc as LiveState) : null
}

const userCount = (entries: readonly EntryRecord[]) =>
  entries.reduce((count, entry) => count + (entry.model ?? []).filter((message) => message.role === "user").length, 0)

function withEntries(state: ThreadState, entries: readonly EntryRecord[]): ThreadState {
  const users = userCount(entries)
  return { ...state, entries, pending: state.pending.filter((item) => item.seq >= users) }
}

function announce(sessionId: string, text: string) {
  const sessions = registry.get(sessionsAtom)
  const known = sessions.find((session) => session.id === sessionId)
  const next = {
    id: sessionId,
    busy: true,
    title: known?.title || text,
    preview: text,
    messageCount: (known?.messageCount ?? 0) + 1,
    updatedAt: Date.now(),
  }
  registry.set(sessionsAtom, [next, ...sessions.filter((session) => session.id !== sessionId)])
}

socket.onEvent(({ event, payload }) => {
  if (!isRecord(payload) || typeof payload.sessionId !== "string") return
  const sessionId = payload.sessionId
  if (event === "session.delta" && isRecord(payload.value)) {
    const view = payload.value as unknown as ConversationView
    const live = liveOf(view)
    patch(sessionId, (state) => ({
      ...(view.before === undefined ? withEntries(state, view.entries) : state),
      phase: "ready",
      live,
      error: live?.runFailure ? (live.runFailure.detail ?? live.runFailure.reason) : state.error,
    }))
    if (view.before !== undefined || live?.run === undefined) void reload(sessionId)
    if (live?.run === undefined) void refreshSessions()
    return
  }
  if (event === "session.error" && typeof payload.error === "string") {
    const error = payload.error
    patch(sessionId, (state) => ({ ...state, error }))
  }
})

async function reload(sessionId: string): Promise<void> {
  const entries = await socket.request<readonly EntryRecord[]>("session.messages", { sessionId })
  patch(sessionId, (state) => withEntries(state, entries))
}

async function subscribe(sessionId: string): Promise<void> {
  try {
    const result = await socket.request<{ messages: readonly EntryRecord[] }>("chat.subscribe", { sessionId })
    patch(sessionId, (state) => ({ ...withEntries(state, result.messages), phase: "ready" }))
  } catch {
    patch(sessionId, (state) => ({ ...state, phase: "missing" }))
  }
}

export async function send(
  sessionId: string,
  text: string,
  options: { model?: string; thinkingLevel?: string } = {},
): Promise<void> {
  const current = registry.get(threadAtom(sessionId))
  const item: Pending = { text, seq: userCount(current.entries) + current.pending.length }
  patch(sessionId, (state) => ({ ...state, phase: "ready", pending: [...state.pending, item], error: null }))
  announce(sessionId, text)
  try {
    await socket.request("chat.send", { sessionId, text, ...options })
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : "Message failed to send"
    patch(sessionId, (state) => ({ ...state, pending: state.pending.filter((entry) => entry !== item), error }))
    void refreshSessions()
  }
}

export const abort = (sessionId: string) => socket.request("chat.abort", { sessionId }).catch(() => undefined)

export async function createSession(): Promise<string> {
  const { id } = await socket.request<{ id: string }>("session.create")
  return id
}

export function useThread(sessionId: string): ThreadState {
  const state = useAtomValue(threadAtom(sessionId))
  useEffect(() => {
    void subscribe(sessionId)
    return socket.onState((connection) => {
      if (connection === "open") void subscribe(sessionId)
    })
  }, [sessionId])
  return state
}

export const isWorking = (state: ThreadState) => state.live?.run !== undefined || state.pending.length > 0
