import { createStore } from "solid-js"
import type { Comment, CommentsByRef, Reaction, ReactionActor, ReactionPreview, ReactionsByRef } from "@tock/protocol"
import { socket } from "../lib/socket"
import { app, setApp, titleOf } from "./app"
import { addNote } from "./notes"
import { tokens } from "@tock/tokens"

/** One pill: an emoji on a message with how many reacted and whether you did. */
export interface Pill {
  readonly emoji: string
  readonly count: number
  readonly mine: boolean
}

export const [reactions, setReactions] = createStore<{ chats: Record<string, Record<string, Reaction[]>> }>({ chats: {} })

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null

const loadedAt = new Map<string, number>()

/** Pills pop in only for reactions that land after a chat's reactions loaded, so opening a chat shows them at rest. */
export const settledSince = (sessionId: string) => performance.now() - (loadedAt.get(sessionId) ?? Infinity) > tokens.motion.duration.menu

/** Comments on message units, held like reactions: grouped by chat, then by ref. */
export const [comments, setComments] = createStore<{ chats: Record<string, Record<string, Comment[]>> }>({ chats: {} })

/** chat.subscribe hands the chat's reactions and comments over grouped by ref; they replace what was held, so a reload is the truth. */
export function loadReactions(sessionId: string, byRef: ReactionsByRef | undefined, notes?: CommentsByRef) {
  if (!loadedAt.has(sessionId)) loadedAt.set(sessionId, performance.now())
  setReactions((s) => void (s.chats[sessionId] = Object.fromEntries(Object.entries(byRef ?? {}).map(([ref, list]) => [ref, [...list]]))))
  setComments((s) => void (s.chats[sessionId] = Object.fromEntries(Object.entries(notes ?? {}).map(([ref, list]) => [ref, [...list]]))))
}

function applyComment(sessionId: string, comment: Comment, on: boolean) {
  setComments((s) => {
    const chat = (s.chats[sessionId] ??= {})
    const list = (chat[comment.ref] ?? []).filter((item) => item.id !== comment.id)
    chat[comment.ref] = on ? [...list, comment].sort((a, b) => a.at - b.at) : list
  })
}

export const commentsOf = (sessionId: string, ref: string): readonly Comment[] => comments.chats[sessionId]?.[ref] ?? []

/** Saves a comment; the server's copy (with its id) replaces nothing locally until it answers, so a refusal leaves no ghost. */
export async function addComment(sessionId: string, ref: string, text: string): Promise<boolean> {
  try {
    const comment = await socket.request<Comment>("comment.add", { sessionId, ref, text })
    applyComment(sessionId, comment, true)
    return true
  } catch {
    return false
  }
}

/** Removes a comment at once; a refusal puts it back. */
export async function deleteComment(sessionId: string, comment: Comment) {
  applyComment(sessionId, comment, false)
  try {
    await socket.request("comment.delete", { sessionId, commentId: comment.id })
  } catch {
    applyComment(sessionId, comment, true)
  }
}

socket.onEvent(({ event, payload }) => {
  if (event !== "comment" || !isRecord(payload) || typeof payload.sessionId !== "string" || !isRecord(payload.comment)) return
  const comment = payload.comment as unknown as Comment
  if (typeof comment.id === "string" && typeof comment.ref === "string") applyComment(payload.sessionId, comment, payload.on === true)
})

function apply(sessionId: string, reaction: Reaction, on: boolean) {
  setReactions((s) => {
    const chat = (s.chats[sessionId] ??= {})
    const list = chat[reaction.ref] ?? []
    const has = list.some((item) => item.emoji === reaction.emoji && item.by === reaction.by)
    if (on && !has) chat[reaction.ref] = [...list, reaction]
    if (!on && has) chat[reaction.ref] = list.filter((item) => !(item.emoji === reaction.emoji && item.by === reaction.by))
  })
}

/** A message's reactions grouped by emoji, in the order each emoji first landed. */
export function pillsOf(sessionId: string, ref: string | undefined): Pill[] {
  const list = ref ? (reactions.chats[sessionId]?.[ref] ?? []) : []
  const pills = new Map<string, { emoji: string; count: number; mine: boolean }>()
  for (const item of list) {
    const pill = pills.get(item.emoji) ?? { emoji: item.emoji, count: 0, mine: false }
    pill.count++
    pill.mine ||= item.by === "me"
    pills.set(item.emoji, pill)
  }
  return [...pills.values()]
}

export const reacted = (sessionId: string, ref: string, emoji: string) =>
  (reactions.chats[sessionId]?.[ref] ?? []).some((item) => item.emoji === emoji && item.by === "me")

/** Adds or removes your reaction at once and tells the server; a refusal puts it back. */
export async function setReaction(sessionId: string, ref: string, emoji: string, on: boolean) {
  apply(sessionId, { ref, emoji, by: "me", at: Date.now() }, on)
  try {
    await socket.request("reaction.set", { sessionId, ref, emoji, on })
  } catch {
    apply(sessionId, { ref, emoji, by: "me", at: Date.now() }, !on)
  }
}

/** The sidebar row's words for a chat whose newest activity is a reaction, as the row's "you: …" grammar. */
export const reactionLine = (reaction: ReactionPreview) => `${reaction.by === "me" ? "you" : "toast"} reacted ${reaction.emoji} to “${reaction.excerpt}”`

socket.onEvent(({ event, payload }) => {
  if (event !== "reaction" || !isRecord(payload) || typeof payload.sessionId !== "string" || typeof payload.ref !== "string" || typeof payload.emoji !== "string") return
  const sessionId = payload.sessionId
  const by: ReactionActor = payload.by === "toast" ? "toast" : "me"
  const on = payload.on === true
  const latest = isRecord(payload.latest) ? (payload.latest as unknown as ReactionPreview) : null
  apply(sessionId, { ref: payload.ref, emoji: payload.emoji, by, at: typeof payload.at === "number" ? payload.at : Date.now() }, on)
  setApp((s) => {
    const known = s.sessions.find((session) => session.id === sessionId)
    if (known) Object.assign(known, { reaction: latest })
  })
  if (by !== "toast" || !on || (!document.hidden && location.pathname === `/t/${sessionId}`)) return
  addNote({ chat: sessionId, tone: "done", title: titleOf(app.sessions.find((session) => session.id === sessionId)), body: latest ? reactionLine(latest) : `toast reacted ${payload.emoji}` })
})
