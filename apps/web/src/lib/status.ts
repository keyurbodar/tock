import { hasPendingAsk } from "../chat/items"
import { app, type Session } from "../state/app"

/** One status per chat, the same on every surface: a chat waiting on you outranks a run, which outranks a failure. */
export type ChatStatus = "needs" | "working" | "failed" | "idle"

export const STATUS_LABEL: Record<ChatStatus | "done", string> = { needs: "Needs you", working: "Working", failed: "Failed", done: "Done", idle: "Idle" }

export function statusOf(session: Session | undefined): ChatStatus {
  if (!session) return "idle"
  const thread = app.threads[session.id]
  if (session.needs || (thread?.fresh && hasPendingAsk(thread.entries))) return "needs"
  if (session.busy) return "working"
  if (thread?.error) return "failed"
  return "idle"
}
