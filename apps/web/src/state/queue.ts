import type { QueuedSend } from "@tock/protocol"

/**
 * A send the transcript does not hold yet, keyed by the operationId the composer minted. `sending`: in the outbox, not
 * acked. `queued`: the server holds it behind the running work. `placed`: acked and not queued, so the next entries carry
 * it and it goes then.
 */
export interface Pending {
  readonly id: string
  readonly text: string
  readonly status: "sending" | "queued" | "placed"
}

/**
 * Settles pending bubbles against the server's queue, by id and never by counting messages. A queued send that left the
 * queue was placed, and the entries that carry it arrived first; a send just acked and not queued waits for the next
 * entries, unless the server already had it (a resend after reload), in which case the entries already show it.
 */
export function settleQueue(pending: readonly Pending[], queued: readonly QueuedSend[], acked?: { readonly id: string; readonly fresh: boolean }): Pending[] {
  const held = new Set(queued.map((send) => send.operationId))
  const rest = pending.flatMap((item): Pending[] => {
    if (held.has(item.id)) return []
    if (item.id === acked?.id) return acked.fresh ? [{ ...item, status: "placed" }] : []
    return item.status === "queued" ? [] : [item]
  })
  return [
    ...rest.filter((item) => item.status === "placed"),
    ...queued.map((send): Pending => ({ id: send.operationId, text: send.text, status: "queued" })),
    ...rest.filter((item) => item.status === "sending"),
  ]
}
