import { createStore, reconcile, snapshot } from "solid-js"
import type { ConversationView, EntryRecord, LiveState, SessionSummary, ThreadMeta } from "@tock/protocol"
import { idb } from "../lib/idb"
import { RequestError, socket, type ConnectionState } from "../lib/socket"
import { addNote, needsNote } from "./notes"
import { finishedElsewhere } from "../shell/finished"
import { tokens } from "@tock/tokens"

const LIVE_DOC = "pi.live"

export interface Pending {
  readonly id: string
  readonly text: string
  readonly seq: number
}

export interface ThreadState {
  phase: "loading" | "ready" | "missing"
  entries: readonly EntryRecord[]
  live: LiveState | null
  pending: readonly Pending[]
  error: string | null
  /** Real reasoning times from the server: "<assistant message timestamp>:<block index>" -> ms. */
  thinking: Readonly<Record<string, number>>
}

export interface Session extends SessionSummary {
  readonly busy: boolean
  readonly meta: ThreadMeta
}

const noMeta: ThreadMeta = { title: null, pinned: false, pinnedAt: null, archived: false, unread: false, folder: null, snoozedUntil: null }

const ordered = (sessions: Session[]) => sessions.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))

interface AppState {
  connection: ConnectionState
  sessionsLoaded: boolean
  sessions: Session[]
  threads: Record<string, ThreadState>
}

const blank = (): ThreadState => ({ phase: "loading", entries: [], live: null, pending: [], error: null, thinking: {} })

export const [app, setApp] = createStore<AppState>({ connection: "connecting", sessionsLoaded: false, sessions: [], threads: {} })

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null

const userCount = (entries: readonly EntryRecord[]) =>
  entries.reduce((count, entry) => count + (entry.model ?? []).filter((message) => message.role === "user").length, 0)

function thread(sessionId: string, update: (state: ThreadState) => void) {
  setApp((s) => {
    s.threads[sessionId] ??= blank()
    update(s.threads[sessionId]!)
  })
}

function withEntries(state: ThreadState, entries: readonly EntryRecord[]) {
  const users = userCount(entries)
  state.entries = entries
  state.pending = state.pending.filter((item) => item.seq >= users)
  void idb.put("threads", sessionIdOf(entries) ?? "", entries)
}

const sessionIdOf = (entries: readonly EntryRecord[]) => {
  const first = entries[0] as (EntryRecord & { conversationId?: unknown }) | undefined
  return first?.conversationId !== undefined ? String(first.conversationId) : undefined
}

function upsertSession(next: Session) {
  setApp((s) => {
    reconcile([next, ...snapshot(s.sessions).filter((session) => session.id !== next.id)], "id")(s.sessions)
  })
  void idb.put("sessions", "list", snapshot(app.sessions))
}

socket.onState((connection) => {
  setApp((s) => {
    s.connection = connection
  })
  if (connection !== "open") return
  void refreshSessions()
  void Promise.all(Object.keys(app.threads).map((sessionId) => subscribe(sessionId))).then(flushOutbox)
})

socket.onEvent(({ event, payload }) => {
  if (event === "notification.push" && isRecord(payload) && typeof payload.title === "string") {
    return addNote({ chat: undefined, tone: payload.urgency === "urgent" ? "needs" : "done", title: payload.title, body: typeof payload.body === "string" ? payload.body : "" })
  }
  if (!isRecord(payload) || typeof payload.sessionId !== "string") return
  const sessionId = payload.sessionId
  if (event === "session.delta" && isRecord(payload.value)) {
    const view = payload.value as unknown as ConversationView
    const doc = view.docs[LIVE_DOC]
    const live = isRecord(doc) ? (doc as LiveState) : null
    thread(sessionId, (state) => {
      if (view.before === undefined) withEntries(state, view.entries)
      state.phase = "ready"
      state.live = live
      const failure = live?.runFailure && live.runFailure.reason !== "aborted" ? (live.runFailure.detail ?? live.runFailure.reason) : undefined
      if (failure) state.error = failure
    })
    if (view.before !== undefined || live?.run === undefined) void reload(sessionId)
    setApp((s) => {
      const known = s.sessions.find((session) => session.id === sessionId)
      if (known) Object.assign(known, { busy: live?.run !== undefined })
    })
    if (live?.run === undefined) void refreshSessions()
    return
  }
  if (event === "session.needs") {
    const needs = typeof payload.needs === "string" ? payload.needs : null
    setApp((s) => {
      const known = s.sessions.find((session) => session.id === sessionId)
      if (known) Object.assign(known, { needs })
    })
    needsNote(sessionId, titleOf(app.sessions.find((session) => session.id === sessionId)), needs)
    return
  }
  if (event === "session.thinking" && typeof payload.key === "string" && typeof payload.ms === "number") {
    const { key, ms } = payload
    return thread(sessionId, (state) => void (state.thinking = { ...state.thinking, [key]: ms }))
  }
  if (event === "session.status" && typeof payload.busy === "boolean") {
    const busy = payload.busy
    setApp((s) => {
      const known = s.sessions.find((session) => session.id === sessionId)
      if (known) Object.assign(known, { busy })
    })
    if (!busy) void refreshSessions().then(() => noteFinished(sessionId, isRecord(payload.failure) ? (payload.failure as unknown as LiveState["runFailure"]) : undefined))
    return
  }
  if (event === "session.error" && typeof payload.error === "string") {
    const error = payload.error
    thread(sessionId, (state) => {
      state.error = error
    })
  }
})

export async function boot() {
  const cached = await idb.get<Session[]>("sessions", "list")
  if (cached?.length && !app.sessionsLoaded) setApp((s) => void (s.sessions = cached.map((session) => ({ ...session, meta: { ...noMeta, ...session.meta } }))))
  await flushOutbox()
  socket.start()
}

export async function refreshSessions() {
  try {
    const list = await socket.request<(SessionSummary & { busy?: boolean; meta?: ThreadMeta })[]>("session.list")
    const sessions = ordered(list.map((session) => ({ ...session, busy: Boolean(session.busy), meta: { ...noMeta, ...session.meta } })))
    setApp((s) => {
      reconcile(sessions, "id")(s.sessions)
      s.sessionsLoaded = true
    })
    for (const session of sessions) needsNote(session.id, titleOf(session), session.needs)
    void idb.put("sessions", "list", sessions)
  } catch {
    return
  }
}

/** A run that ends while you look elsewhere leaves a note in the centre, as TDS px2 Centre. */
function noteFinished(sessionId: string, failure: LiveState["runFailure"]) {
  if (failure?.reason === "aborted") return
  if (!document.hidden && location.pathname === `/t/${sessionId}`) return
  const session = app.sessions.find((item) => item.id === sessionId)
  const title = titleOf(session)
  const body = failure ? (failure.detail ?? failure.reason) : plainText(session?.preview ?? "") || "Finished"
  addNote({ chat: sessionId, tone: failure ? "failed" : "done", title, body })
  if (!failure && location.pathname !== `/t/${sessionId}`) finishedElsewhere(sessionId, title, body, () => void updateThread(sessionId, { unread: true }))
}

async function reload(sessionId: string) {
  try {
    const entries = await socket.request<readonly EntryRecord[]>("session.messages", { sessionId })
    thread(sessionId, (state) => withEntries(state, entries))
  } catch {
    return
  }
}

export async function subscribe(sessionId: string) {
  if (app.sessions.find((session) => session.id === sessionId)?.meta.unread) queueMicrotask(() => void updateThread(sessionId, { unread: false }))
  if (!app.threads[sessionId]) {
    const cached = await idb.get<readonly EntryRecord[]>("threads", sessionId)
    thread(sessionId, (state) => {
      if (cached?.length && state.entries.length === 0) {
        state.entries = cached
        state.phase = "ready"
      }
    })
  }
  try {
    const result = await socket.request<{ messages: readonly EntryRecord[]; thinking?: Record<string, number> }>("chat.subscribe", { sessionId })
    thread(sessionId, (state) => {
      withEntries(state, result.messages)
      state.thinking = { ...state.thinking, ...(result.thinking ?? {}) }
      state.phase = "ready"
    })
  } catch (cause) {
    if (cause instanceof Error && "code" in cause && cause.code === "disconnected") return
    thread(sessionId, (state) => void (state.phase = "missing"))
  }
}

export async function send(sessionId: string, text: string) {
  const current = app.threads[sessionId] ?? blank()
  const item: Pending = { id: crypto.randomUUID(), text, seq: userCount(current.entries) + current.pending.length }
  thread(sessionId, (state) => {
    state.phase = "ready"
    state.pending = [...state.pending, item]
    state.error = null
  })
  const known = app.sessions.find((session) => session.id === sessionId)
  upsertSession({
    id: sessionId,
    busy: true,
    meta: known?.meta ?? noMeta,
    title: known?.title || text,
    preview: text,
    messageCount: (known?.messageCount ?? 0) + 1,
    updatedAt: Date.now(),
  })
  const queued: Queued = { ...item, sessionId }
  await idb.put("outbox", item.id, queued)
  await deliver(queued)
}

interface Queued extends Pending {
  readonly sessionId: string
}

const delivering = new Set<string>()

/**
 * A send lives in the IndexedDB outbox until the server accepts it, so a reload or a dropped connection never loses it.
 * A lost connection keeps it queued for the next open; any other refusal drops it and says why.
 */
async function deliver(item: Queued) {
  if (delivering.has(item.id)) return
  delivering.add(item.id)
  try {
    await socket.request("chat.send", { sessionId: item.sessionId, text: item.text, operationId: item.id })
    void idb.del("outbox", item.id)
  } catch (cause) {
    if (cause instanceof RequestError && cause.code === "disconnected") return
    void idb.del("outbox", item.id)
    const error = cause instanceof Error ? cause.message : "Message not sent. Check your connection and send it again."
    thread(item.sessionId, (state) => {
      state.pending = state.pending.filter((entry) => entry.id !== item.id)
      state.error = error
    })
  } finally {
    delivering.delete(item.id)
  }
}

/** Sends what the outbox still holds, once the thread's entries are fresh: a send the server already has is dropped by its seq, not sent twice. */
async function flushOutbox() {
  for (const item of await idb.all<Queued>("outbox")) {
    const state = app.threads[item.sessionId]
    if (state && userCount(state.entries) > item.seq) {
      void idb.del("outbox", item.id)
      continue
    }
    thread(item.sessionId, (next) => {
      if (!next.pending.some((entry) => entry.id === item.id)) next.pending = [...next.pending, { id: item.id, text: item.text, seq: item.seq }].sort((a, b) => a.seq - b.seq)
      if (next.phase === "loading" && next.entries.length === 0) next.phase = "ready"
    })
    if (socket.state === "open") void deliver(item)
  }
}

export async function answerAsk(sessionId: string, answer: string) {
  try {
    await socket.request("ask.answer", { sessionId, answer })
  } catch (cause) {
    thread(sessionId, (state) => {
      state.error = cause instanceof Error ? cause.message : "Answer not sent. Check your connection and answer again."
    })
  }
}

export async function abort(sessionId: string) {
  try {
    await socket.request("chat.abort", { sessionId })
    await reload(sessionId)
  } catch {
    return
  }
}

export async function updateThread(threadId: string, patch: Partial<ThreadMeta>) {
  const before = app.sessions.find((session) => session.id === threadId)
  if (!before) return
  const apply = (meta: ThreadMeta) =>
    setApp((s) => {
      const target = s.sessions.find((session) => session.id === threadId)
      if (target) (target as { meta: ThreadMeta }).meta = meta
      ordered(s.sessions)
    })
  const pinnedAt = patch.pinned === undefined ? before.meta.pinnedAt : patch.pinned ? (before.meta.pinnedAt ?? Date.now()) : null
  apply({ ...before.meta, ...patch, pinnedAt })
  try {
    const result = await socket.request<{ meta: ThreadMeta }>("thread.update", { threadId, ...patch })
    apply(result.meta)
  } catch {
    apply(before.meta)
  }
  void idb.put("sessions", "list", snapshot(app.sessions))
}

/** Pinned chats, newest pin first, as TDS px2 renderPins. */
export const pinnedSessions = () =>
  app.sessions.filter((session) => session.meta.pinned && !session.meta.archived).sort((a, b) => (b.meta.pinnedAt ?? 0) - (a.meta.pinnedAt ?? 0))

/** Pins hold up to limit.pins chats in a wrapping grid; pinning past it drops the oldest back into the list. */
export function pinThread(threadId: string) {
  const pins = pinnedSessions()
  const oldest = pins.length >= tokens.limit.pins ? pins[pins.length - 1] : undefined
  if (oldest) void updateThread(oldest.id, { pinned: false })
  return updateThread(threadId, { pinned: true })
}

export interface PeekLine {
  readonly key: string
  readonly me: boolean
  readonly text: string
}

const peekCache = new Map<string, readonly PeekLine[]>()

const linesOf = (entries: readonly EntryRecord[]): PeekLine[] =>
  entries
    .flatMap((entry) => entry.model ?? [])
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message, index) => {
      const content = (message as { content?: unknown }).content
      const text =
        typeof content === "string"
          ? content
          : Array.isArray(content)
            ? content.map((part) => (isRecord(part) && part.type === "text" && typeof part.text === "string" ? part.text : "")).join(" ")
            : ""
      return { key: String(index), me: message.role === "user", text: plainText(text) }
    })
    .filter((line) => line.text !== "")
    .slice(-3)

/** The last three messages of a chat for the peek card, without subscribing (which would mark it read). */
export async function peekLines(sessionId: string): Promise<readonly PeekLine[]> {
  const loaded = app.threads[sessionId]?.entries
  if (loaded?.length) return linesOf(loaded)
  const cached = peekCache.get(sessionId)
  if (cached) return cached
  try {
    const lines = linesOf(await socket.request<readonly EntryRecord[]>("session.messages", { sessionId }))
    peekCache.set(sessionId, lines)
    return lines
  } catch {
    return []
  }
}

export async function deleteThread(threadId: string) {
  const index = app.sessions.findIndex((session) => session.id === threadId)
  if (index < 0) return
  const removed = app.sessions[index]!
  setApp((s) => void s.sessions.splice(index, 1))
  try {
    await socket.request("thread.delete", { threadId })
    void idb.put("sessions", "list", snapshot(app.sessions))
  } catch {
    setApp((s) => void s.sessions.splice(index, 0, removed))
  }
}

export const newThreadId = (): string => crypto.randomUUID()

export const isThreadId = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)

const FILE_LINK = /\[([^\]\n]+)\]\(tock-file:[\w-]+\)/g

export const plainText = (text: string) => {
  const words = text.replace(FILE_LINK, "").replace(/\[([^\]\n]+)\]\(tock-thread:[\w-]+\)/g, "$1").replace(/\[(@[^\]\n]*)(\]\([^)\s]*)?…?$/, "$1").replace(/\[[^\]\n]*(\]\(tock-file:[\w-]*)?…?$/, "").replace(/\s+/g, " ").trim()
  return words || [...text.matchAll(FILE_LINK)].map((match) => match[1]).join(", ")
}

export const titleOf = (session: Session | undefined) => session?.meta?.title || plainText(session?.title ?? "").replace(/^\[routine:[^\]]*\]\s*/, "") || "New chat"

/** Dev-only: repeats a thread's real entries `copies` times in place, so the perf journey can load a transcript of hundreds of messages without a server round trip per message. */
if (import.meta.env.DEV || import.meta.env.VITE_TOCK_SEED)
  Object.assign(window, {
    __tockSeed: (sessionId: string, copies: number) =>
      thread(sessionId, (state) => {
        const base = snapshot(state.entries)
        state.entries = Array.from({ length: copies }, (_, copy) => base.map((entry) => ({ ...entry, id: `${entry.id}~${copy}` }))).flat()
      }),
  })

export const isWorking = (state: ThreadState | undefined) => state !== undefined && (state.live?.run !== undefined || state.pending.length > 0)
