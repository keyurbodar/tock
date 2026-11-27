import type { IconName } from "@tock/ui/icon"
import type { ToolCallBlock } from "@tock/protocol"

const icons: Record<string, IconName> = {
  memory_search: "brain",
  memory_save: "brain",
  codemode: "code",
  http_request: "globe",
  file_read: "file-text",
  file_write: "pencil-simple",
  file_list: "folder-simple",
  spawn_subagent: "sparkle",
  schedule_followup: "clock",
  notify_owner: "bell",
  mcp_call: "plug",
  mcp_discover: "plug",
}

export const stepIcon = (name: string): IconName => icons[name] ?? "lightning"

export interface StepLabel {
  readonly verb: string
  readonly object?: string
}

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : undefined)
const host = (value: unknown) => {
  const url = text(value)
  if (!url) return undefined
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

const verbs: Record<string, readonly [running: string, done: string, object?: (args: Readonly<Record<string, unknown>>) => string | undefined]> = {
  memory_search: ["Searching memory for", "Searched memory for", (args) => text(args.query)],
  memory_save: ["Saving to memory", "Saved to memory"],
  codemode: ["Running code", "Ran code"],
  http_request: ["Fetching", "Fetched", (args) => host(args.url)],
  file_read: ["Reading a file", "Read a file"],
  file_write: ["Writing", "Wrote", (args) => text(args.name) ?? text(args.path)],
  file_list: ["Looking at files", "Looked at files"],
  spawn_subagent: ["Starting a helper", "Helper finished"],
  schedule_followup: ["Scheduling a follow-up", "Scheduled a follow-up"],
  notify_owner: ["Sending you a note", "Sent you a note"],
  mcp_call: ["Using", "Used", (args) => text(args.server) ?? text(args.tool)],
  mcp_discover: ["Looking at apps", "Looked at apps"],
}

export function stepLabel(call: ToolCallBlock, running: boolean): StepLabel {
  const entry = verbs[call.name]
  if (!entry) return { verb: running ? "Using" : "Used", object: call.name.replace(/[_-]+/g, " ") }
  const object = entry[2]?.(call.arguments)
  return { verb: running ? entry[0] : entry[1], object: object && `${object}` }
}
