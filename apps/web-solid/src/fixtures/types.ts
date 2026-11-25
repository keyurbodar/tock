export type FixtureAuthor = "user" | "assistant" | "system"
export type FixtureMessageState = "complete" | "streaming" | "failed"

export interface FixtureAttachment {
  id: string
  name: string
  kind: "image" | "document" | "archive" | "code"
  size: string
  preview?: string
}

export interface FixtureToolCall {
  id: string
  name: string
  status: "collapsed" | "expanded" | "running" | "failed"
  input: string
  output: string
}

export interface FixtureMessage {
  id: string
  author: FixtureAuthor
  body: string
  createdAt: string
  turn: number
  state: FixtureMessageState
  attachments?: FixtureAttachment[]
  replyTo?: { id: string; author: FixtureAuthor; excerpt: string }
  toolCalls?: FixtureToolCall[]
}

export interface FixtureConversation {
  id: string
  title: string
  preview: string
  updatedAt: string
  unread?: number
  pinned?: boolean
  messages: FixtureMessage[]
}

export interface FixtureFile {
  id: string
  name: string
  path: string
  kind: "folder" | "markdown" | "image" | "code" | "spreadsheet" | "archive"
  size: string
  updatedAt: string
}

export interface FixtureRecipe {
  id: string
  name: string
  schedule: string
  enabled: boolean
  lastRun: string
  summary: string
}

export interface FixtureSettingSection {
  id: string
  title: string
  description: string
  fields: Array<{ id: string; label: string; value: string; kind: "text" | "select" | "toggle" }>
}
