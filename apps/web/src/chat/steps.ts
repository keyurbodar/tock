import type { IconName } from "@tock/ui/icon"
import type { ToolCallBlock } from "@tock/protocol"

/** Kinds of step from TDS CxKinds: each has one glyph and one hue, and the row reads as a sentence. */
export type Kind = "think" | "read" | "search" | "run" | "write" | "ask" | "split" | "connect" | "msg" | "browse" | "memory" | "app" | "schedule"

export const kinds: Record<Kind, { readonly icon: IconName; readonly hue: string }> = {
  think: { icon: "brain", hue: "var(--color-hue-violet)" },
  read: { icon: "file-text", hue: "var(--color-hue-blue)" },
  search: { icon: "globe", hue: "var(--color-hue-sand)" },
  run: { icon: "terminal-window", hue: "var(--color-hue-sage)" },
  write: { icon: "pencil-simple", hue: "var(--color-hue-rose)" },
  ask: { icon: "hand", hue: "var(--tds-status-needs)" },
  split: { icon: "git-branch", hue: "var(--color-hue-split)" },
  connect: { icon: "plugs-connected", hue: "var(--color-hue-blue)" },
  msg: { icon: "paper-plane-tilt", hue: "var(--color-hue-blue)" },
  browse: { icon: "browser", hue: "var(--color-hue-blue)" },
  memory: { icon: "bookmark-simple", hue: "var(--color-hue-rose)" },
  app: { icon: "plug", hue: "var(--color-hue-sage)" },
  schedule: { icon: "clock", hue: "var(--color-hue-sand)" },
}

export interface StepLabel {
  readonly kind: Kind
  /** The muted verb, past tense once it's done. */
  readonly verb: string
  readonly object?: string
  /** What the activity line says while this step runs. */
  readonly live: string
}

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : undefined)
const host = (value: unknown) => {
  const url = text(value)
  if (!url) return undefined
  try {
    const parsed = new URL(url)
    return parsed.host.replace(/^www\./, "") + parsed.pathname.replace(/\/$/, "")
  } catch {
    return url
  }
}

type Verbs = readonly [kind: Kind, live: string, done: string, object?: (args: Readonly<Record<string, unknown>>) => string | undefined]

const verbs: Record<string, Verbs> = {
  memory_search: ["memory", "Searching memory", "Searched memory for", (args) => text(args.query)],
  memory_save: ["memory", "Saving to memory", "Saved to memory"],
  open_item_set: ["memory", "Noting an open item", "Noted", (args) => text(args.title)],
  codemode: ["run", "Running code", "Ran code"],
  dev_plugin_run: ["run", "Running a plugin", "Ran", (args) => text(args.name)],
  http_request: ["browse", "Fetching", "Fetched", (args) => host(args.url)],
  file_read: ["read", "Reading a file", "Read a file"],
  file_list: ["read", "Looking at files", "Looked at files"],
  skill_read: ["read", "Reading a skill", "Read the skill", (args) => text(args.name)],
  file_write: ["write", "Writing", "Wrote", (args) => text(args.name)],
  spawn_subagent: ["split", "Starting a helper", "Started a helper for", (args) => text(args.task)],
  schedule_followup: ["schedule", "Scheduling a follow-up", "Scheduled a follow-up", (args) => text(args.note)],
  routine_upsert: ["schedule", "Setting up a routine", "Set up the routine", (args) => text(args.name)],
  routine_list: ["schedule", "Checking routines", "Checked routines"],
  routine_delete: ["schedule", "Removing a routine", "Removed a routine"],
  notify_owner: ["msg", "Sending you a note", "Sent you", (args) => text(args.title)],
  mcp_call: ["app", "Using", "Used", (args) => text(args.server) ?? text(args.tool)],
  mcp_discover: ["connect", "Looking at apps", "Looked at", (args) => text(args.server) ?? "apps"],
}

export function stepLabel(call: ToolCallBlock): StepLabel {
  const entry = verbs[call.name]
  if (!entry) {
    const name = call.name.replace(/[_-]+/g, " ")
    return { kind: "app", verb: "Used", object: name, live: `Using ${name}` }
  }
  const object = entry[3]?.(call.arguments)
  return { kind: entry[0], verb: entry[2], object, live: object ? `${entry[1]}${entry[0] === "memory" || entry[0] === "browse" ? " for" : ""} ${object}`.replace(" for for", " for") : entry[1] }
}

export interface Plan {
  readonly steps: readonly string[]
  readonly current: number
}

export const isPlan = (call: ToolCallBlock) => call.name === "update_plan"

export function planOf(call: ToolCallBlock): Plan | undefined {
  const steps = call.arguments.steps
  if (!Array.isArray(steps) || !steps.every((step) => typeof step === "string")) return undefined
  const current = typeof call.arguments.current === "number" ? call.arguments.current : 0
  return { steps, current: Math.max(0, Math.min(steps.length, Math.floor(current))) }
}
