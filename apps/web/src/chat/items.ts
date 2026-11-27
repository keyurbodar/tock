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
import { isPlan, planOf, type Plan } from "./steps"

export type Step =
  | { readonly kind: "thinking"; readonly key: string; readonly text: string; readonly active: boolean }
  | {
      readonly kind: "tool"
      readonly key: string
      readonly call: ToolCallBlock
      readonly result: ToolResultMessage | undefined
      readonly status: "running" | "done" | "failed" | "cancelled"
      /** Output the tool is printing while it runs. */
      readonly output: string | undefined
    }

export type Item =
  | { readonly kind: "user"; readonly key: string; readonly text: string; readonly images: readonly ImageBlock[]; readonly at: number | null }
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
  | { readonly kind: "text"; readonly key: string; readonly text: string; readonly streaming: boolean; readonly at: number | null }
  | { readonly kind: "error"; readonly key: string; readonly title: string; readonly detail: string }

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

export function buildItems(entries: readonly EntryRecord[], live: LiveState | null, pending: readonly { readonly text: string }[]): Item[] {
  const items: (Exclude<Item, { kind: "work" }> | Work)[] = []
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
  const work = (key: string): Work => {
    if (turn) return turn
    turn = { kind: "work", key, steps: [], plan: undefined, active: false, startedAt: turnStart, endedAt: null }
    items.splice(turnAt, 0, turn)
    return turn
  }
  const startTurn = (at: number | null) => {
    turn = undefined
    turnAt = items.length
    turnStart = at
  }

  const assistant = (message: AssistantMessage, key: string, streaming: boolean) => {
    message.content.forEach((block, index) => {
      const blockKey = `${key}:${index}`
      if (block.type === "text") {
        if (block.text.trim() !== "") items.push({ kind: "text", key: blockKey, text: block.text, streaming, at: message.timestamp ?? null })
        return
      }
      if (block.type === "thinking") {
        if (block.thinking.trim() === "") return
        const group = work(blockKey)
        const active = streaming && index === message.content.length - 1
        group.steps.push({ kind: "thinking", key: blockKey, text: block.thinking, active })
        group.active ||= active
        return
      }
      const result = results.get(block.id)
      const slot = slots.get(block.id)
      const unfinished = result === undefined && (streaming || (running && slot?.status !== "done"))
      const cancelled = result === undefined ? !unfinished && message.stopReason === "aborted" : aborted.has(block.id)
      const group = work(blockKey)
      if (isPlan(block)) {
        group.plan = planOf(block) ?? group.plan
        return
      }
      group.steps.push({
        output: unfinished ? slot?.output : undefined,
        kind: "tool",
        key: blockKey,
        call: block,
        result,
        status: unfinished ? "running" : cancelled ? "cancelled" : result?.isError ? "failed" : "done",
      })
      group.active ||= unfinished
    })
    const open = turn as Work | undefined
    if (open && message.timestamp) open.endedAt = message.timestamp
    if (!streaming && message.stopReason === "error" && message.errorMessage)
      items.push({ kind: "error", key: `${key}:error`, title: "The model returned an error", detail: message.errorMessage })
  }

  for (const entry of entries) {
    (entry.model ?? []).forEach((message, index) => {
      const key = `${entry.id}:${index}`
      if (message.role === "user") {
        const text = userText(message)
        const routine = routineName(entry)
        if (routine === undefined) {
          items.push({ kind: "user", key, text, images: userImages(message), at: message.timestamp ?? null })
          startTurn(message.timestamp ?? null)
        } else {
          const tag = `[routine:${routine}] `
          items.push({ kind: "routine", key, name: routine, text: text.startsWith(tag) ? text.slice(tag.length) : text, at: message.timestamp ?? null })
          startTurn(message.timestamp ?? null)
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
  pending.forEach(({ text }, index) => items.push({ kind: "user", key: `pending:${index}`, text, images: [], at: null }))
  if (pending.length > 0 && !running) items.push({ kind: "typing", key: "typing" })
  if (live?.generation?.retry)
    items.push({ kind: "error", key: "retry", title: "Retrying", detail: live.generation.retry.error })
  if (!running && live?.runFailure && live.runFailure.reason !== "aborted")
    items.push({
      kind: "error",
      key: "failure",
      title: "The run stopped",
      detail: live.runFailure.detail ?? live.runFailure.reason,
    })
  return items
}
