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

export interface MemoryItem {
  readonly id: string
  readonly kind: "fact" | "decision" | "summary" | "preference"
  readonly content: string
  readonly createdAt: number
}

export interface OpenItem {
  readonly id: string
  readonly title: string
  readonly context: string
  readonly status: "open" | "resolved"
  readonly dueAt: number | null
  readonly updatedAt: number
}

export interface MemorySnapshot {
  readonly core: { readonly content: string; readonly version: number; readonly updatedAt: number }
  readonly openItems: readonly OpenItem[]
  readonly recent: readonly MemoryItem[]
}

export interface MemoryRevision {
  readonly id: number
  readonly version: number
  readonly content: string
  readonly reason?: string
  readonly createdAt: number
}

export interface SecretMeta {
  readonly name: string
  readonly description: string
  readonly scopes: string
  readonly origin: string
  readonly updatedAt: number
}

export type ScheduleType = "cron" | "interval" | "delayed"

export interface RoutineRecord {
  readonly id: string
  readonly name: string
  readonly schedule: string
  readonly scheduleType: ScheduleType
  readonly prompt: string
  readonly checkScript: string | null
  readonly quietIfUnchanged: boolean
  readonly enabled: boolean
  readonly lastRunAt: number | null
  readonly updatedAt: number
}

export type McpAuthMode = "headers" | "oauth" | "sse"

export interface McpServerRecord {
  readonly id: string
  readonly name: string
  readonly url: string
  readonly authMode: McpAuthMode
  readonly enabled: boolean
  readonly updatedAt: number
  readonly toolCount: number | null
  readonly checkedAt: number | null
  readonly lastError: string | null
  readonly headerNames: readonly string[]
}

export interface DevPluginRecord {
  readonly id: string
  readonly name: string
  readonly kind: "tool" | "webhook_filter"
  readonly description: string
  readonly schemaJson: string
  readonly tsSource: string
  readonly enabled: boolean
  readonly updatedAt: number
}

export interface FileMeta {
  readonly id: string
  readonly name: string
  readonly mime: string
  readonly size: number
  readonly sessionId: string | null
  readonly createdAt: number
}

export interface SkillRecord {
  readonly name: string
  readonly description: string
  readonly source: string
  readonly bodyMd: string
  readonly enabled: boolean
  readonly updatedAt: number
}
