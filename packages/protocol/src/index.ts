export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max"

export interface OwnerSettings {
  readonly devMode: boolean
  readonly maxSubagents: number
  readonly model: string | null
  readonly backgroundModel: string | null
  readonly fallbackModel: string | null
  readonly timezone: string
  readonly updatedAt: number
}

export interface ModelInfo {
  readonly provider: string
  readonly id: string
  readonly name: string
  readonly reasoning: boolean
  readonly thinkingLevels: readonly ThinkingLevel[]
  readonly contextWindow: number
  readonly cost: { readonly input: number; readonly output: number }
}

export interface ProviderInfo {
  readonly id: string
  readonly name: string
  readonly configured: boolean
}

export interface SessionSummary {
  readonly id: string
  readonly busy: boolean
  readonly title: string
  readonly preview: string
  readonly messageCount: number
  readonly updatedAt: number | null
  /** The preview is the owner's own message (the row reads "you: …"). */
  readonly mine?: boolean
  /** The question toast is waiting on you for, while an ask is pending. */
  readonly needs?: string | null
  /** The chat's newest reaction; the row prefers it when it is newer than updatedAt. */
  readonly reaction?: ReactionPreview | null
}

export interface TextBlock {
  readonly type: "text"
  readonly text: string
}

export interface ThinkingBlock {
  readonly type: "thinking"
  readonly thinking: string
}

export interface ImageBlock {
  readonly type: "image"
  readonly data: string
  readonly mimeType: string
}

export interface ToolCallBlock {
  readonly type: "toolCall"
  readonly id: string
  readonly name: string
  readonly arguments: Readonly<Record<string, unknown>>
}

export interface UserMessage {
  readonly role: "user"
  readonly content: string | readonly (TextBlock | ImageBlock)[]
  readonly timestamp?: number
}

export interface AssistantMessage {
  readonly role: "assistant"
  readonly content: readonly (TextBlock | ThinkingBlock | ToolCallBlock)[]
  readonly model?: string
  readonly stopReason?: string
  readonly errorMessage?: string
  readonly timestamp?: number
}

export interface ToolResultMessage {
  readonly role: "toolResult"
  readonly toolCallId: string
  readonly toolName: string
  readonly content: readonly (TextBlock | ImageBlock)[]
  readonly isError: boolean
  readonly timestamp?: number
}

export type Message = UserMessage | AssistantMessage | ToolResultMessage

export interface EntryRecord {
  readonly id: string
  readonly kind: string
  readonly model?: readonly Message[]
  readonly data?: unknown
}

export interface ToolSlot {
  readonly callId: string
  readonly name: string
  readonly status: "pending" | "running" | "sleeping" | "waiting" | "done"
  readonly output?: string
}

export interface LiveState {
  readonly run?: { readonly taskId: string; readonly turns: number }
  readonly generation?: {
    readonly attempt: number
    readonly message?: AssistantMessage
    readonly retry?: { readonly at: number; readonly error: string }
  }
  readonly tools?: readonly ToolSlot[]
  readonly runFailure?: { readonly reason: string; readonly detail?: string }
}

export interface ConversationView {
  readonly entries: readonly EntryRecord[]
  readonly before?: string
  readonly docs: Readonly<Record<string, unknown>>
}

export interface FileMeta {
  readonly id: string
  readonly name: string
  readonly mime: string
  readonly size: number
  readonly sessionId: string | null
  readonly createdAt: number
}

export type ThreadStatus = "idle" | "working" | "needs" | "failed" | "done"

/** A send the server holds queued behind the running work, keyed by the client's operationId. */
export interface QueuedSend {
  readonly operationId: string
  readonly text: string
}

export interface ThreadMeta {
  readonly pinned: boolean
  /** Epoch ms the chat was pinned at, null when it is not pinned. Orders the pins strip, newest first. */
  readonly pinnedAt: number | null
  readonly folder: string | null
  readonly snoozedUntil: number | null
  readonly archived: boolean
  readonly unread: boolean
  readonly title: string | null
}

export interface ThreadSummary extends SessionSummary {
  readonly status: ThreadStatus
  readonly meta: ThreadMeta
}

export interface ServerEvent {
  readonly seq: number
  readonly event: string
  readonly payload: unknown
}

export type ServerFrame =
  | { readonly id?: string; readonly type: "ok"; readonly data?: unknown }
  | { readonly id?: string; readonly type: "error"; readonly code: string; readonly message: string }
  | { readonly type: "event"; readonly seq: number; readonly event: string; readonly payload: unknown }
  | { readonly id?: string; readonly type: "pong"; readonly ts: number }

export type ReactionActor = "me" | "toast"

/** One emoji on one message, by one actor. ref is the message's durable address (see chat/items.ts). */
export interface Reaction {
  readonly ref: string
  readonly emoji: string
  readonly by: ReactionActor
  readonly at: number
}

/** A chat's reactions grouped by message ref, oldest first within a ref. Sent with chat.subscribe. */
export type ReactionsByRef = Readonly<Record<string, readonly Reaction[]>>

/** The newest reaction in a chat, with a short excerpt of the message it landed on, for the sidebar row. */
export interface ReactionPreview {
  readonly by: ReactionActor
  readonly emoji: string
  readonly excerpt: string
  readonly at: number
}

/** Broadcast (never persisted) whenever a reaction is added or removed. */
export interface ReactionEvent {
  readonly sessionId: string
  readonly ref: string
  readonly emoji: string
  readonly by: ReactionActor
  readonly on: boolean
  readonly at: number
  readonly latest: ReactionPreview | null
}

