/// <reference types="bun" />
import { describe, expect, test } from "bun:test"
import { settleQueue, type Pending } from "./queue"

const sending = (id: string): Pending => ({ id, text: id, status: "sending" })
const queued = (id: string): Pending => ({ id, text: id, status: "queued" })
const send = (id: string) => ({ operationId: id, text: id })

describe("settleQueue", () => {
  test("an ack keeps a fresh send until the entries carry it, and a send still queued stays queued", () => {
    expect(settleQueue([sending("a")], [], { id: "a", fresh: true })).toEqual([{ id: "a", text: "a", status: "placed" }])
    expect(settleQueue([sending("a")], [send("a")], { id: "a", fresh: true })).toEqual([queued("a")])
  })

  test("a resend the server already had is dropped at once, since the entries already show it", () => {
    expect(settleQueue([sending("a")], [], { id: "a", fresh: false })).toEqual([])
  })

  test("settles by id, never by position: a queued send that left the queue goes, the others stay in server order", () => {
    expect(settleQueue([queued("a"), queued("b"), sending("c")], [send("b")])).toEqual([queued("b"), sending("c")])
  })

  test("Stop keeps queued sends: the queue in the abort reply restores them, and unacked sends survive", () => {
    expect(settleQueue([queued("a"), sending("b")], [send("a")])).toEqual([queued("a"), sending("b")])
  })

  test("a reload restores queued sends from the server, beside the outbox", () => {
    expect(settleQueue([sending("outbox")], [send("held")])).toEqual([queued("held"), sending("outbox")])
  })
})
