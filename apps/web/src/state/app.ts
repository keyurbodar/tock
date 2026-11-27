import { createStore, reconcile, snapshot } from "solid-js"
import type { ConversationView, EntryRecord, LiveState, SessionSummary, ThreadMeta } from "@tock/protocol"
import { idb } from "../lib/idb"
import { socket, type ConnectionState } from "../lib/socket"
import { addNote } from "./notes"

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
}

export interface Session extends SessionSummary {
  readonly busy: boolean
  readonly meta: ThreadMeta
}

const noMeta: ThreadMeta = { title: null, pinned: false, archived: false, unread: false }

const ordered = (sessions: Session[]) =>
  sessions.sort((a, b) => Number(b.meta.pinned) - Number(a.meta.pinned) || (b.updatedAt ?? 0) - (a.updatedAt ?? 0))

interface AppState {
  connection: ConnectionState
  sessionsLoaded: boolean
  sessions: Session[]
  threads: Record<string, ThreadState>
}

const blank = (): ThreadState => ({ phase: "loading", entries: [], live: null, pending: [], error: null })

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
  for (const sessionId of Object.keys(app.threads)) void subscribe(sessionId)
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
  if (cached?.length && !app.sessionsLoaded) setApp((s) => void (s.sessions = cached.map((session) => ({ ...session, meta: session.meta ?? noMeta }))))
  socket.start()
}

export async function refreshSessions() {
  try {
    const list = await socket.request<(SessionSummary & { busy?: boolean; meta?: ThreadMeta })[]>("session.list")
    const sessions = ordered(list.map((session) => ({ ...session, busy: Boolean(session.busy), meta: session.meta ?? noMeta })))
    setApp((s) => {
      reconcile(sessions, "id")(s.sessions)
      s.sessionsLoaded = true
    })
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
  addNote({
    chat: sessionId,
    tone: failure ? "failed" : "done",
    title: titleOf(session),
    body: failure ? (failure.detail ?? failure.reason) : plainText(session?.preview ?? "") || "Finished",
  })
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
  if (app.sessions.find((session) => session.id === sessionId)?.meta.unread) void updateThread(sessionId, { unread: false })
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
    const result = await socket.request<{ messages: readonly EntryRecord[] }>("chat.subscribe", { sessionId })
    thread(sessionId, (state) => {
      withEntries(state, result.messages)
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
  try {
    await socket.request("chat.send", { sessionId, text, operationId: item.id })
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : "Message failed to send"
    thread(sessionId, (state) => {
      state.pending = state.pending.filter((entry) => entry.id !== item.id)
      state.error = error
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
  apply({ ...before.meta, ...patch })
  try {
    const result = await socket.request<{ meta: ThreadMeta }>("thread.update", { threadId, ...patch })
    apply(result.meta)
  } catch {
    apply(before.meta)
  }
  void idb.put("sessions", "list", snapshot(app.sessions))
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

export const isWorking = (state: ThreadState | undefined) => state !== undefined && (state.live?.run !== undefined || state.pending.length > 0)
