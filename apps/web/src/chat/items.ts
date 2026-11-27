import type {
  AssistantMessage,
  EntryRecord,
  ImageBlock,
  LiveState,
  Message,
  ToolCallBlock,
  ToolResultMessage,
  ToolSlot,
} from "@tock/protocol"
import { FOLLOWUPS_TOOL, followupsOf, type Followup } from "@tock/protocol"
import { tokens } from "@tock/tokens"
import { isPlan, planOf, type Plan } from "./steps"

export type Step =
  | { readonly kind: "thinking"; readonly key: string; readonly text: string; readonly active: boolean; readonly at: number | null; readonly ms: number | undefined }
  | {
      readonly kind: "tool"
      readonly key: string
      readonly call: ToolCallBlock
      readonly result: ToolResultMessage | undefined
      readonly status: "running" | "done" | "failed" | "cancelled"
      /** Output the tool is printing while it runs. */
      readonly output: string | undefined
      readonly at: number | null
    }

export type Item =
  /** ref: the message's durable address, "<entry id>:<message index>" (user) or "<entry id>:<message index>:<block index>" (agent text). Reactions and replies point at it; key stays the render key. Queued bubbles have none yet. */
  | { readonly kind: "user"; readonly key: string; readonly ref?: string; readonly text: string; readonly images: readonly ImageBlock[]; readonly at: number | null; readonly queued?: boolean }
  | { readonly kind: "routine"; readonly key: string; readonly name: string; readonly text: string; readonly at: number | null }
  | {
      readonly kind: "work"
      readonly key: string
      readonly steps: readonly Step[]
      readonly plan: Plan | undefined
      readonly active: boolean
      readonly startedAt: number | null
      readonly endedAt: number | null
    }
  | { readonly kind: "typing"; readonly key: string }
  | { readonly kind: "text"; readonly key: string; readonly ref?: string; readonly text: string; readonly streaming: boolean; readonly at: number | null }
  | { readonly kind: "error"; readonly key: string; readonly title: string; readonly detail: string; readonly retry?: string }
  | { readonly kind: "caption"; readonly key: string; readonly text: string; readonly side: "me" | "agent" }
  | { readonly kind: "divider"; readonly key: string; readonly text: string; readonly tone?: "passed" | "new" }
  | { readonly kind: "ask"; readonly key: string; readonly ask: Ask; readonly answer: string | undefined; readonly pending: boolean }

export interface Ask {
  readonly kind: "approval" | "question"
  readonly question: string
  readonly summary: string | undefined
  readonly options: readonly string[]
  readonly questions: readonly { readonly question: string; readonly options: readonly string[] }[]
}

export const askOf = (call: ToolCallBlock): Ask => {
  const args = call.arguments
  const strings = (value: unknown) => (Array.isArray(value) ? value.filter((option): option is string => typeof option === "string").slice(0, 4) : [])
  const asked = Array.isArray(args.questions)
    ? args.questions.flatMap((entry: unknown) =>
        typeof entry === "object" && entry !== null && "question" in entry && typeof entry.question === "string" && "options" in entry && strings(entry.options).length
          ? [{ question: entry.question, options: strings(entry.options) }]
          : [],
      )
    : []
  const question = typeof args.question === "string" ? args.question : ""
  const options = strings(args.options).length ? strings(args.options) : (asked[0]?.options ?? [])
  const kind = args.kind === "question" || (args.kind !== "approval" && options.length) ? "question" : "approval"
  return {
    kind,
    question,
    summary: typeof args.summary === "string" ? args.summary : undefined,
    options: kind === "approval" ? ["Approve", "Deny"] : options,
    questions: kind === "approval" ? [] : asked.length ? asked : [{ question, options }],
  }
}

/** The follow-ups the agent proposed in the latest turn, keyed by their call; none once that turn errored or was stopped. */
export const followupsIn = (entries: readonly EntryRecord[]): { readonly key: string; readonly items: readonly Followup[] } | undefined => {
  const messages = entries.flatMap((entry) => entry.model ?? [])
  const turn = messages.slice(messages.findLastIndex((message) => message.role === "user") + 1)
  const last = turn.findLast((message) => message.role === "assistant")
  if (!last || last.role !== "assistant" || last.stopReason === "error" || last.stopReason === "aborted") return undefined
  const call = turn.flatMap((message) => (message.role === "assistant" ? message.content : [])).findLast((block) => block.type === "toolCall" && block.name === FOLLOWUPS_TOOL)
  if (!call || call.type !== "toolCall") return undefined
  const items = followupsOf(call.arguments)
  return items.length ? { key: call.id, items } : undefined
}

export const hasPendingAsk = (entries: readonly EntryRecord[]) => {
  const messages = entries.flatMap((entry) => entry.model ?? [])
  const answered = new Set(messages.flatMap((message) => (message.role === "toolResult" ? [message.toolCallId] : [])))
  return messages.some((message) => message.role === "assistant" && message.stopReason !== "aborted" && message.content.some((block) => block.type === "toolCall" && block.name === "ask_owner" && !answered.has(block.id)))
}

export const answerOf = (result: ToolResultMessage | undefined): string | undefined => {
  const text = (result?.content ?? []).flatMap((block) => (block.type === "text" ? [block.text] : [])).join("")
  try {
    const parsed: unknown = JSON.parse(text)
    return typeof parsed === "object" && parsed !== null && "answer" in parsed && typeof parsed.answer === "string" ? parsed.answer : undefined
  } catch {
    return undefined
  }
}

const HOUR = 3_600_000
const day = (at: number) => new Date(at).toDateString()
const dayLabel = (at: number, now: number) => {
  if (day(at) === day(now)) return "Today"
  if (day(at) === day(now - 24 * HOUR)) return "Yesterday"
  return new Date(at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
}
const MINUTE = 60_000
/**
 * TDS CxDividersTime: a day divider once per day; a wavy "2 hours later" for a gap inside the same sitting
 * (limit.divider-passed-min up to limit.divider-sitting-hours); the day with the time after a longer gap.
 */
export function timeDivider(previous: number | null, at: number, now: number): { text: string; tone?: "passed" } | undefined {
  if (previous === null || day(previous) !== day(at)) return { text: dayLabel(at, now) }
  const gap = at - previous
  if (gap < tokens.limit["divider-passed-min"] * MINUTE) return undefined
  if (gap < tokens.limit["divider-sitting-hours"] * HOUR) {
    const hours = Math.floor(gap / HOUR)
    const minutes = Math.floor(gap / MINUTE)
    return { text: hours ? `${hours} ${hours === 1 ? "hour" : "hours"} later` : `${minutes} minutes later`, tone: "passed" }
  }
  const time = new Date(at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  return { text: `${new Date(at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}, ${time}` }
}

interface Work {
  kind: "work"
  key: string
  steps: Step[]
  plan: Plan | undefined
  active: boolean
  startedAt: number | null
  endedAt: number | null
}

const userText = (message: Extract<Message, { role: "user" }>) =>
  typeof message.content === "string"
    ? message.content
    : message.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("\n")

const routineName = (entry: EntryRecord) => {
  if (entry.kind !== "tock.routine") return undefined
  const data = entry.data
  return typeof data === "object" && data !== null && "name" in data && typeof data.name === "string" ? data.name : undefined
}

const abortedResult = (data: unknown) => {
  if (typeof data !== "object" || data === null || !("diagnostics" in data) || !Array.isArray(data.diagnostics)) return false
  return data.diagnostics.some(
    (diagnostic: unknown) => typeof diagnostic === "object" && diagnostic !== null && "code" in diagnostic && diagnostic.code === "aborted",
  )
}

const userImages = (message: Extract<Message, { role: "user" }>) =>
  typeof message.content === "string" ? [] : message.content.filter((block) => block.type === "image")

export function buildItems(
  entries: readonly EntryRecord[],
  live: LiveState | null,
  pending: readonly { readonly text: string; readonly status?: string }[],
  online = true,
  now = Date.now(),
  thinking: Readonly<Record<string, number>> = {},
): Item[] {
  const items: (Exclude<Item, { kind: "work" }> | Work)[] = []
  let lastAt: number | null = null
  const stamp = (key: string, at: number | null) => {
    if (at === null) return
    const divider = timeDivider(lastAt, at, now)
    lastAt = at
    if (divider) items.push({ kind: "divider", key: `divider:${key}`, ...divider })
  }
  const results = new Map<string, ToolResultMessage>()
  const slots = new Map<string, ToolSlot>((live?.tools ?? []).map((slot) => [slot.callId, slot]))
  const running = live?.run !== undefined
  const aborted = new Set<string>()
  for (const entry of entries)
    for (const message of entry.model ?? []) {
      if (message.role !== "toolResult") continue
      results.set(message.toolCallId, message)
      if (abortedResult(entry.data)) aborted.add(message.toolCallId)
    }

  let turn: Work | undefined
  let turnAt = 0
  let turnStart: number | null = null
  let turnKey = "work:start"
  const work = (): Work => {
    if (turn) return turn
    turn = { kind: "work", key: turnKey, steps: [], plan: undefined, active: false, startedAt: turnStart, endedAt: null }
    items.splice(turnAt, 0, turn)
    return turn
  }
  const startTurn = (key: string, at: number | null) => {
    turn = undefined
    turnKey = `work:${key}`
    turnAt = items.length
    turnStart = at
  }

  const assistant = (message: AssistantMessage, key: string, streaming: boolean) => {
    message.content.forEach((block, index) => {
      const blockKey = `${key}:${index}`
      if (block.type === "text") {
        if (block.text.trim() !== "") items.push({ kind: "text", key: blockKey, ref: streaming ? undefined : blockKey, text: block.text, streaming, at: message.timestamp ?? null })
        return
      }
      if (block.type === "thinking") {
        if (block.thinking.trim() === "") return
        const group = work()
        const active = streaming && index === message.content.length - 1
        group.steps.push({ kind: "thinking", key: blockKey, text: block.thinking, active, at: message.timestamp ?? null, ms: message.timestamp === undefined ? undefined : thinking[`${message.timestamp}:${index}`] })
        group.active ||= active
        return
      }
      const result = results.get(block.id)
      const slot = slots.get(block.id)
      const unfinished = result === undefined && (streaming || (running && slot?.status !== "done"))
      const cancelled = result === undefined ? !unfinished && message.stopReason === "aborted" : aborted.has(block.id)
      if (block.name === FOLLOWUPS_TOOL) return
      const group = work()
      if (isPlan(block)) {
        group.plan = planOf(block) ?? group.plan
        return
      }
      group.steps.push({
        output: unfinished ? slot?.output : undefined,
        at: message.timestamp ?? null,
        kind: "tool",
        key: blockKey,
        call: block,
        result,
        status: unfinished ? "running" : cancelled ? "cancelled" : result?.isError ? "failed" : "done",
      })
      group.active ||= unfinished
      if (block.name === "ask_owner" && !streaming) items.push({ kind: "ask", key: `${blockKey}:ask`, ask: askOf(block), answer: answerOf(result), pending: result === undefined && !cancelled })
    })
    const open = turn as Work | undefined
    if (open && message.timestamp) open.endedAt = message.timestamp
    if (!streaming && message.stopReason === "aborted") items.push({ kind: "caption", key: `${key}:stopped`, text: "Stopped", side: "agent" })
    if (!streaming && message.stopReason === "error" && message.errorMessage)
      items.push({ kind: "error", key: `${key}:error`, title: "The model returned an error", detail: message.errorMessage, retry: asked })
  }

  let users = 0
  let asked: string | undefined
  for (const entry of entries) {
    (entry.model ?? []).forEach((message, index) => {
      const key = `${entry.id}:${index}`
      if (message.role === "user") {
        const bubble = `user:${users++}`
        const text = userText(message)
        const routine = routineName(entry)
        asked = text
        stamp(key, message.timestamp ?? null)
        if (routine === undefined) {
          items.push({ kind: "user", key: bubble, ref: key, text, images: userImages(message), at: message.timestamp ?? null })
          startTurn(key, message.timestamp ?? null)
        } else {
          const tag = `[routine:${routine}] `
          items.push({ kind: "routine", key: bubble, name: routine, text: text.startsWith(tag) ? text.slice(tag.length) : text, at: message.timestamp ?? null })
          startTurn(key, message.timestamp ?? null)
        }
      } else if (message.role === "assistant") {
        assistant(message, key, false)
      }
    })
  }
  if (live?.generation?.message) assistant(live.generation.message, "live", true)
  const current = turn as Work | undefined
  if (running && current) current.active = true
  if (running && !current && items.at(-1)?.kind !== "text") items.splice(turnAt, 0, { kind: "typing", key: "typing" })
  pending.forEach(({ text }, index) => items.push({ kind: "user", key: `user:${users + index}`, text, images: [], at: null, queued: true }))
  const held = running || pending.some((item) => item.status === "queued")
  if (pending.length > 0 && !online) items.push({ kind: "caption", key: "caption:offline", text: "Sends when you’re back online", side: "me" })
  else if (pending.length > 0 && held) items.push({ kind: "caption", key: "caption:queued", text: "Waiting for toast to finish this step", side: "me" })
  if (pending.length > 0 && !held && online) items.push({ kind: "typing", key: "typing" })
  if (!running && live?.runFailure?.reason === "aborted" && items.at(-1)?.kind !== "caption" && items.some((item) => item.kind === "user"))
    items.push({ kind: "caption", key: "caption:stopped", text: "Stopped", side: "agent" })
  if (live?.generation?.retry)
    items.push({ kind: "error", key: "retry", title: "Retrying", detail: live.generation.retry.error })
  const failure = live?.runFailure
  const told = items.at(-1)?.kind === "error" && (items.at(-1) as { detail: string }).detail === (failure?.detail ?? failure?.reason)
  if (!running && failure && failure.reason !== "aborted" && !told)
    items.push({
      kind: "error",
      key: "failure",
      title: "The run stopped",
      detail: live.runFailure.detail ?? live.runFailure.reason,
      retry: asked,
    })
  const last = items.findLastIndex((item) => item.kind === "error" && item.retry !== undefined)
  return running || pending.length > 0 || items.slice(last + 1).some((item) => item.kind === "user")
    ? items.map((item) => (item.kind === "error" && item.retry !== undefined ? { ...item, retry: undefined } : item))
    : items.map((item, index) => (item.kind === "error" && index !== last && item.retry !== undefined ? { ...item, retry: undefined } : item))
}
