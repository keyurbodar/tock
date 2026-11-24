import type {
  AssistantMessage,
  EntryRecord,
  ImageBlock,
  LiveState,
  Message,
  ToolCallBlock,
  ToolResultMessage,
  ToolSlot,
} from "../api/types"

export type Step =
  | { readonly kind: "thinking"; readonly key: string; readonly text: string; readonly active: boolean }
  | {
      readonly kind: "tool"
      readonly key: string
      readonly call: ToolCallBlock
      readonly result: ToolResultMessage | undefined
      readonly status: "running" | "done" | "failed"
    }

export type Item =
  | { readonly kind: "user"; readonly key: string; readonly text: string; readonly images: readonly ImageBlock[]; readonly at: number | null }
  | { readonly kind: "work"; readonly key: string; readonly steps: readonly Step[]; readonly active: boolean }
  | { readonly kind: "text"; readonly key: string; readonly text: string; readonly streaming: boolean }
  | { readonly kind: "error"; readonly key: string; readonly title: string; readonly detail: string }

interface Work {
  kind: "work"
  key: string
  steps: Step[]
  active: boolean
}

const userText = (message: Extract<Message, { role: "user" }>) =>
  typeof message.content === "string"
    ? message.content
    : message.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("\n")

const userImages = (message: Extract<Message, { role: "user" }>) =>
  typeof message.content === "string" ? [] : message.content.filter((block) => block.type === "image")

export function buildItems(entries: readonly EntryRecord[], live: LiveState | null, pending: readonly string[]): Item[] {
  const items: (Exclude<Item, { kind: "work" }> | Work)[] = []
  const results = new Map<string, ToolResultMessage>()
  const slots = new Map<string, ToolSlot>((live?.tools ?? []).map((slot) => [slot.callId, slot]))
  const running = live?.run !== undefined
  for (const entry of entries)
    for (const message of entry.model ?? []) if (message.role === "toolResult") results.set(message.toolCallId, message)

  const work = (key: string): Work => {
    const last = items.at(-1)
    if (last?.kind === "work") return last
    const created: Work = { kind: "work", key, steps: [], active: false }
    items.push(created)
    return created
  }

  const assistant = (message: AssistantMessage, key: string, streaming: boolean) => {
    message.content.forEach((block, index) => {
      const blockKey = `${key}:${index}`
      if (block.type === "text") {
        if (block.text.trim() !== "") items.push({ kind: "text", key: blockKey, text: block.text, streaming })
        return
      }
      const group = work(blockKey)
      if (block.type === "thinking") {
        if (block.thinking.trim() === "") return
        const active = streaming && index === message.content.length - 1
        group.steps.push({ kind: "thinking", key: blockKey, text: block.thinking, active })
        group.active ||= active
        return
      }
      const result = results.get(block.id)
      const slot = slots.get(block.id)
      const unfinished = result === undefined && (streaming || (running && slot?.status !== "done"))
      group.steps.push({
        kind: "tool",
        key: blockKey,
        call: block,
        result,
        status: unfinished ? "running" : result?.isError ? "failed" : "done",
      })
      group.active ||= unfinished
    })
    if (!streaming && message.stopReason === "error" && message.errorMessage)
      items.push({ kind: "error", key: `${key}:error`, title: "The model returned an error", detail: message.errorMessage })
  }

  for (const entry of entries) {
    (entry.model ?? []).forEach((message, index) => {
      const key = `${entry.id}:${index}`
      if (message.role === "user") {
        items.push({ kind: "user", key, text: userText(message), images: userImages(message), at: message.timestamp ?? null })
      } else if (message.role === "assistant") {
        assistant(message, key, false)
      }
    })
  }
  pending.forEach((text, index) => items.push({ kind: "user", key: `pending:${index}`, text, images: [], at: null }))
  if (live?.generation?.message) assistant(live.generation.message, "live", true)
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
