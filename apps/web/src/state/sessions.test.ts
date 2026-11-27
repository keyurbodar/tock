import { describe, expect, it } from "bun:test"
import { mergeSessions } from "./sessions"

const s = (id: string, updatedAt: number) => ({ id, updatedAt })

describe("mergeSessions", () => {
  it("keeps a chat created after the list was asked for", () => {
    expect(mergeSessions([s("a", 1)], [s("new", 20), s("a", 1)], 10, () => false).map((x) => x.id)).toEqual(["new", "a"])
  })
  it("keeps a chat whose first send is still in flight", () => {
    expect(mergeSessions([s("a", 1)], [s("new", 5)], 10, (id) => id === "new").map((x) => x.id)).toEqual(["new", "a"])
  })
  it("drops a chat the server no longer lists once nothing is pending", () => {
    expect(mergeSessions([s("a", 1)], [s("gone", 5), s("a", 1)], 10, () => false).map((x) => x.id)).toEqual(["a"])
  })
  it("takes the server copy when both know the chat", () => {
    expect(mergeSessions([s("a", 9)], [s("a", 1)], 10, () => true)).toEqual([s("a", 9)])
  })
})
