import type { FixtureConversationSummary } from "./types"
const stamp = (minute: number) => `2026-11-24T${String(9 + Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}:00Z`

export const fixtureConversationSummaries: FixtureConversationSummary[] = [
  {
    id: "c-showcase",
    title: "Doop shell parity",
    preview: "Tables, code, replies, attachments, tool calls",
    updatedAt: stamp(21),
    pinned: true,
    unread: 2,
  },
  {
    id: "c-bulk",
    title: "Large deterministic thread",
    preview: "220 messages for scrolling and typing benchmarks",
    updatedAt: stamp(250),
  },
  {
    id: "c-empty",
    title: "Empty conversation",
    preview: "No messages yet",
    updatedAt: stamp(260),
  },
]
