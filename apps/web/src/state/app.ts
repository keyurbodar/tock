import { createStore, reconcile, snapshot } from "solid-js"
import type { ConversationView, EntryRecord, LiveState, QueuedSend, ReactionsByRef, SessionSummary, ThreadMeta } from "@tock/protocol"
import { idb } from "../lib/idb"
import { RequestError, socket, type ConnectionState } from "../lib/socket"
import { addNote, needsNote } from "./notes"
import { settleQueue, type Pending } from "./queue"
import { mergeSessions } from "./sessions"
import { loadReactions } from "./reactions"
import { finishedElsewhere } from "../shell/finished"
import { announce } from "../shell/announce"
import { tokens } from "@tock/tokens"
import { authorOf, excerpt, parseQuote } from "../chat/quote"
import { Lexer, type Token, type Tokens } from "marked"

const LIVE_DOC = "pi.live"

export interface ThreadState {
  phase: "loading" | "ready" | "missing"
  entries: readonly EntryRecord[]
  live: LiveState | null
  pending: readonly Pending[]
  error: string | null
  /** Real reasoning times from the server: "<assistant message timestamp>:<block index>" -> ms. */
  thinking: Readonly<Record<string, number>>
  /** The entries came from the server this session, not only from the IndexedDB cache of an earlier visit. */
  fresh: boolean
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

const blank = (): ThreadState => ({ phase: "loading", entries: [], live: null, pending: [], error: null, thinking: {}, fresh: false })

export const [app, setApp] = createStore<AppState>({ connection: "connecting", sessionsLoaded: false, sessions: [], threads: {} })

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null

function thread(sessionId: string, update: (state: ThreadState) => void) {
  setApp((s) => {
    s.threads[sessionId] ??= blank()
    update(s.threads[sessionId]!)
  })
}

/** The transcript is cached per chat for the next cold open, written once the run is idle rather than on every streamed delta. */
function withEntries(sessionId: string, state: ThreadState, entries: readonly EntryRecord[]) {
  state.entries = entries
  state.fresh = true
  state.pending = state.pending.filter((item) => item.status !== "placed")
  if (state.live?.run === undefined) void idb.put("threads", sessionId, entries)
}

/** Chats held in memory, most recently opened or previewed first. Past limit.threads-kept the oldest are dropped, unless open, working or failed. */
const recent: string[] = []
const openChat = () => /^\/t\/([^/]+)$/.exec(location.pathname)?.[1]

function touch(sessionId: string) {
  const at = recent.indexOf(sessionId)
  if (at >= 0) recent.splice(at, 1)
  recent.unshift(sessionId)
  const open = openChat()
  const dropped = recent.filter((id, index) => {
    const state = app.threads[id]
    return index >= tokens.limit["threads-kept"] && id !== open && !isWorking(state) && !state?.error
  })
  if (dropped.length === 0) return
  for (const id of dropped) recent.splice(recent.indexOf(id), 1)
  setApp((s) => {
    for (const id of dropped) delete s.threads[id]
  })
}

const isQueue = (value: unknown): value is QueuedSend[] =>
  Array.isArray(value) && value.every((send) => isRecord(send) && typeof send.operationId === "string" && typeof send.text === "string")

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
  const open = openChat()
  const waiting = Object.keys(app.threads).filter((sessionId) => sessionId !== open && app.threads[sessionId]!.pending.length > 0)
  void Promise.all([...(open ? [subscribe(open)] : []), ...waiting.map(reload)]).then(flushOutbox)
})

/**
 * Live deltas arrive per token; the store takes them in order on a frame, at most once per word-step (the reveal's own
 * cadence), so a streaming reply renders and lays out once per reveal step instead of once per token. Arrived words are
 * hidden until the reveal reaches them, so applying them a step later never shows.
 */
const deltas: { sessionId: string; value: ConversationView }[] = []
let appliedAt = 0
function applyDeltas() {
  appliedAt = performance.now()
  for (const { sessionId, value: view } of deltas.splice(0)) {
    const doc = view.docs[LIVE_DOC]
    const live = isRecord(doc) ? (doc as LiveState) : null
    thread(sessionId, (state) => {
      state.live = live
      if (view.before === undefined) withEntries(sessionId, state, view.entries)
      state.phase = "ready"
      const failure = live?.runFailure && live.runFailure.reason !== "aborted" ? (live.runFailure.detail ?? live.runFailure.reason) : undefined
      if (failure) state.error = failure
    })
    if (view.before !== undefined || live?.run === undefined) void reload(sessionId)
    setApp((s) => {
      const known = s.sessions.find((session) => session.id === sessionId)
      if (known) Object.assign(known, { busy: live?.run !== undefined })
    })
    if (live?.run === undefined) void refreshSessions()
  }
}

socket.onEvent(({ event, payload }) => {
  if (event === "notification.push" && isRecord(payload) && typeof payload.title === "string") {
    return addNote({ chat: undefined, tone: payload.urgency === "urgent" ? "needs" : "done", title: payload.title, body: typeof payload.body === "string" ? payload.body : "" })
  }
  if (!isRecord(payload) || typeof payload.sessionId !== "string") return
  const sessionId = payload.sessionId
  if (event === "session.delta" && isRecord(payload.value)) {
    if (deltas.length === 0) {
      if (document.hidden) queueMicrotask(applyDeltas)
      else setTimeout(() => requestAnimationFrame(applyDeltas), Math.max(0, appliedAt + tokens.motion.duration["word-step"] - performance.now()))
    }
    deltas.push({ sessionId, value: payload.value as unknown as ConversationView })
    return
  }
  if (event === "session.needs") {
    const needs = typeof payload.needs === "string" ? payload.needs : null
    if (!app.sessions.some((session) => session.id === sessionId)) void refreshSessions()
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
  if (event === "chat.queue" && isQueue(payload.queued)) {
    const queued = payload.queued
    return thread(sessionId, (state) => void (state.pending = settleQueue(state.pending, queued)))
  }
  if (event === "session.error" && typeof payload.error === "string") {
    const error = payload.error
    announce(`Error: ${error}`)
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
    const asked = Date.now()
    const list = await socket.request<(SessionSummary & { busy?: boolean; meta?: ThreadMeta })[]>("session.list")
    const fromServer = list.map((session) => ({ ...session, busy: Boolean(session.busy), meta: { ...noMeta, ...session.meta } }))
    const sessions = ordered(mergeSessions(fromServer, snapshot(app.sessions), asked, (id) => (app.threads[id]?.pending.length ?? 0) > 0))
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
  const named = titleOf(app.sessions.find((item) => item.id === sessionId))
  announce(failure ? `Run failed in ${named}: ${failure.detail ?? failure.reason}` : `${named}: run finished`)
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
    thread(sessionId, (state) => withEntries(sessionId, state, entries))
  } catch {
    return
  }
}

async function warm(sessionId: string) {
  touch(sessionId)
  if (app.threads[sessionId]) return
  const cached = await idb.get<readonly EntryRecord[]>("threads", sessionId)
  thread(sessionId, (state) => {
    if (cached?.length && state.entries.length === 0) {
      state.entries = cached
      state.phase = "ready"
    }
  })
}

/**
 * Loads a chat ahead of opening it (hover intent) without subscribing: the server streams one chat per socket, and
 * subscribing is what opening a chat means, so a preview neither marks it read nor steals the open chat's stream.
 */
export async function preload(sessionId: string) {
  const known = app.threads[sessionId]?.phase === "ready"
  await warm(sessionId)
  if (known) return
  try {
    const entries = await socket.request<readonly EntryRecord[]>("session.messages", { sessionId })
    thread(sessionId, (state) => {
      withEntries(sessionId, state, entries)
      state.phase = "ready"
    })
  } catch {
    return
  }
}

/** Opens a chat: marks it read, and makes it the one chat this socket streams. */
export async function subscribe(sessionId: string) {
  if (app.sessions.find((session) => session.id === sessionId)?.meta.unread) queueMicrotask(() => void updateThread(sessionId, { unread: false }))
  await warm(sessionId)
  try {
    const result = await socket.request<{ messages: readonly EntryRecord[]; thinking?: Record<string, number>; queued?: QueuedSend[]; reactions?: ReactionsByRef }>("chat.subscribe", { sessionId })
    loadReactions(sessionId, result.reactions)
    thread(sessionId, (state) => {
      withEntries(sessionId, state, result.messages)
      state.pending = settleQueue(state.pending, result.queued ?? [])
      state.thinking = { ...state.thinking, ...result.thinking }
      state.phase = "ready"
    })
  } catch (cause) {
    if (cause instanceof Error && "code" in cause && cause.code === "disconnected") return
    thread(sessionId, (state) => void (state.phase = "missing"))
  }
}

export async function send(sessionId: string, text: string) {
  const item: Pending = { id: crypto.randomUUID(), text, status: "sending" }
  thread(sessionId, (state) => {
    state.phase = "ready"
    state.pending = [...state.pending, item]
    state.error = null
  })
  const known = app.sessions.find((session) => session.id === sessionId)
  upsertSession({
    id: sessionId,
    busy: app.connection === "open",
    meta: known?.meta ?? noMeta,
    title: known?.title || text,
    preview: text,
    messageCount: (known?.messageCount ?? 0) + 1,
    updatedAt: Date.now(),
  })
  const outgoing: Outgoing = { id: item.id, text, sessionId, at: Date.now() }
  await idb.put("outbox", item.id, outgoing)
  await deliver(outgoing)
}

interface Outgoing {
  readonly id: string
  readonly text: string
  readonly sessionId: string
  readonly at: number
}

const delivering = new Set<string>()

/**
 * A send lives in the IndexedDB outbox until the server accepts it, so a reload or a dropped connection never loses it.
 * A lost connection keeps it queued for the next open; any other refusal drops it and says why.
 */
async function deliver(item: Outgoing) {
  if (delivering.has(item.id)) return
  delivering.add(item.id)
  try {
    const receipt = await socket.request<{ accepted: boolean; queued?: QueuedSend[] }>("chat.send", { sessionId: item.sessionId, text: item.text, operationId: item.id })
    void idb.del("outbox", item.id)
    thread(item.sessionId, (state) => void (state.pending = settleQueue(state.pending, receipt.queued ?? [], { id: item.id, fresh: receipt.accepted })))
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

/** Sends what the outbox still holds, oldest first. The server dedupes by operationId, so a send it already has is acked again, never doubled. */
async function flushOutbox() {
  for (const item of (await idb.all<Outgoing>("outbox")).sort((a, b) => (a.at ?? 0) - (b.at ?? 0))) {
    thread(item.sessionId, (next) => {
      if (!next.pending.some((entry) => entry.id === item.id)) next.pending = [...next.pending, { id: item.id, text: item.text, status: "sending" }]
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
    const result = await socket.request<{ queued?: QueuedSend[] }>("chat.abort", { sessionId })
    thread(sessionId, (state) => void (state.pending = settleQueue(state.pending, result.queued ?? [])))
    await reload(sessionId)
  } catch {
    return
  }
}

export async function updateThread(threadId: string, patch: Partial<ThreadMeta>) {
  const before = app.sessions.find((session) => session.id === threadId)
  if (!before) return
  const optimistic: Partial<ThreadMeta> = patch.pinned === undefined ? patch : { ...patch, pinnedAt: patch.pinned ? (before.meta.pinnedAt ?? Date.now()) : null }
  const keys = Object.keys(optimistic) as (keyof ThreadMeta)[]
  const prior: Partial<ThreadMeta> = Object.fromEntries(keys.map((key) => [key, before.meta[key]]))
  /** Writes only this update's keys, so an edit made while it was in flight survives; a rollback skips keys changed since. */
  const apply = (values: Partial<ThreadMeta>, rollback = false) =>
    setApp((s) => {
      const target = s.sessions.find((session) => session.id === threadId) as { meta: ThreadMeta } | undefined
      if (!target) return
      const next: Record<string, unknown> = { ...target.meta }
      for (const key of keys) if (!rollback || target.meta[key] === optimistic[key]) next[key] = values[key]
      target.meta = next as unknown as ThreadMeta
      ordered(s.sessions)
    })
  apply(optimistic)
  try {
    const result = await socket.request<{ meta: ThreadMeta }>("thread.update", { threadId, ...patch })
    apply(result.meta)
  } catch {
    apply(prior, true)
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
  /** A quoted reply's quote: who said it and one line of what they said. */
  readonly quote?: { readonly author: string; readonly excerpt: string }
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
      const quoted = parseQuote(text)
      return { key: String(index), me: message.role === "user", text: plainText(text), quote: quoted && { author: authorOf(quoted.ref), excerpt: excerpt(quoted.excerpt) } }
    })
    .filter((line) => line.text !== "" || line.quote)
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
  const removed = app.sessions.find((session) => session.id === threadId)
  if (!removed) return
  const restore = snapshot(removed)
  setApp((s) => {
    const index = s.sessions.findIndex((session) => session.id === threadId)
    if (index >= 0) s.sessions.splice(index, 1)
  })
  try {
    await socket.request("thread.delete", { threadId })
    void idb.put("sessions", "list", snapshot(app.sessions))
    void idb.del("threads", threadId)
  } catch {
    setApp((s) => {
      if (s.sessions.some((session) => session.id === threadId)) return
      s.sessions.push(restore)
      ordered(s.sessions)
    })
  }
}

export const newThreadId = (): string => crypto.randomUUID()

export const isThreadId = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)

const FILE_LINK = /\[([^\]\n]+)\]\(tock-file:[\w-]+\)/g

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" }

/** The words a reader sees once markdown is rendered: marks, list bullets, quote markers, escapes and tags dropped. */
function flatten(list: readonly Token[]): string {
  return list
    .map((token) => {
      if (token.type === "list") return (token as Tokens.List).items.map((item) => flatten(item.tokens)).join(" ")
      if (token.type === "table") return [...(token as Tokens.Table).header, ...(token as Tokens.Table).rows.flat()].map((cell) => flatten(cell.tokens)).join(" ")
      if (token.type === "html" || token.type === "hr" || token.type === "space" || token.type === "checkbox") return " "
      if ("tokens" in token && token.tokens) return flatten(token.tokens) + (token.type === "paragraph" || token.type === "heading" || token.type === "blockquote" ? " " : "")
      return "text" in token ? String(token.text).replace(/&(amp|lt|gt|quot|#39);/g, (match) => ENTITIES[match] ?? match) : ""
    })
    .join("")
}

/** A reply's leading quote line (chat/quote.ts) is context, not what the message says. */
const QUOTE_LEAD = /^> \[(?:\\.|[^\]\\\n])*\]\(tock-quote:[^)\s]+\)[ \t]*\n*/
export const plainText = (text: string) => {
  const linked = text.replace(QUOTE_LEAD, "").replace(FILE_LINK, "").replace(/\[([^\]\n]+)\]\(tock-thread:[\w-]+\)/g, "$1").replace(/\[(@[^\]\n]*)(\]\([^)\s]*)?…?$/, "$1").replace(/\[[^\]\n]*(\]\(tock-file:[\w-]*)?…?$/, "")
  const words = flatten(Lexer.lex(linked, { gfm: true })).replace(/\s+/g, " ").trim()
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

/** A run is live, or a send is on its way. A send held while offline isn't work yet: the chat stays idle until the server takes it. */
export const isWorking = (state: ThreadState | undefined) =>
  state !== undefined && (state.live?.run !== undefined || state.pending.some((item) => item.status !== "sending" || app.connection === "open"))
