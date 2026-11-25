import type { FixtureConversation, FixtureMessage } from "./types"

const stamp = (minute: number) => `2026-11-24T${String(9 + Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}:00Z`

const typescriptBlock = `\`\`\`ts
interface ChatTurn {
  id: string
  author: "user" | "assistant"
  body: string
}

export function lastTurn(turns: ChatTurn[]): ChatTurn | undefined {
  return turns.at(-1)
}
\`\`\``

const pythonBlock = `\`\`\`py
def summarize(items):
    total = sum(item.cost for item in items)
    return {"count": len(items), "total": total}
\`\`\``

const rustBlock = `\`\`\`rs
fn compact<T: Clone>(items: &[Option<T>]) -> Vec<T> {
    items.iter().flatten().cloned().collect()
}
\`\`\``

const markdownTable = `| Surface | Desktop | Mobile |
| --- | ---: | ---: |
| Rail | 60 | overlay |
| Sidebar | 280 | 260 |
| Header | 48 | 48 |
| Thread | 768 | fluid |`

const longBody = Array.from(
  { length: 18 },
  (_, index) =>
    `Paragraph ${index + 1}: the migration keeps navigation immediate, preserves optimistic writes, and verifies each visual state against deterministic fixture data before the backend is connected.`,
).join("\n\n")

export const showcaseMessages: FixtureMessage[] = [
  {
    id: "m-001",
    author: "user",
    body: "Can you compare the shell measurements and point out what changed on mobile?",
    createdAt: stamp(4),
    turn: 1,
    state: "complete",
  },
  {
    id: "m-002",
    author: "assistant",
    body: `The rail leaves the normal mobile shell and returns inside the overlay drawer. The thread becomes fluid while the composer keeps the same capsule geometry.\n\n${markdownTable}`,
    createdAt: stamp(5),
    turn: 1,
    state: "complete",
  },
  {
    id: "m-003",
    author: "user",
    body: "Use this response as the reference for the table spacing.",
    createdAt: stamp(8),
    turn: 2,
    state: "complete",
    replyTo: { id: "m-002", author: "assistant", excerpt: "The rail leaves the normal mobile shell..." },
  },
  {
    id: "m-004",
    author: "assistant",
    body: `I kept the row rhythm and moved the controls into token-sized hit areas.\n\n${typescriptBlock}`,
    createdAt: stamp(9),
    turn: 2,
    state: "complete",
    toolCalls: [
      {
        id: "tc-001",
        name: "read measurements",
        status: "collapsed",
        input: "DOOP_MEASURE.md",
        output: "rail, sidebar, header, thread, composer",
      },
      {
        id: "tc-002",
        name: "compare shell",
        status: "expanded",
        input: "desktop and mobile frames",
        output: "drawer split is rail plus panel",
      },
    ],
  },
  {
    id: "m-005",
    author: "assistant",
    body: `Two more language samples keep highlighting honest.\n\n${pythonBlock}\n\n${rustBlock}`,
    createdAt: stamp(10),
    turn: 2,
    state: "complete",
  },
  {
    id: "m-006",
    author: "user",
    body: longBody,
    createdAt: stamp(16),
    turn: 3,
    state: "complete",
    attachments: [
      { id: "a-001", name: "shell-reference.png", kind: "image", size: "240 KB", preview: "shell" },
      { id: "a-002", name: "port-notes.md", kind: "document", size: "18 KB" },
    ],
  },
  {
    id: "m-007",
    author: "assistant",
    body: "I am streaming the remainder of the audit and will collapse the noisy tool output when it finishes.",
    createdAt: stamp(21),
    turn: 3,
    state: "streaming",
    toolCalls: [
      {
        id: "tc-003",
        name: "scan bundle",
        status: "running",
        input: "vite manifest",
        output: "waiting for final chunk sizes",
      },
    ],
  },
]

function generatedMessage(index: number): FixtureMessage {
  const author = index % 2 === 0 ? "user" : "assistant"
  const turn = Math.floor(index / 2) + 1
  return {
    id: `bulk-${String(index).padStart(3, "0")}`,
    author,
    body:
      author === "user"
        ? `Fixture prompt ${index}: keep the thread stable while this long deterministic conversation scrolls.`
        : `Fixture answer ${index}: the response keeps local state optimistic, groups nearby rows, and leaves network work outside fixture mode.`,
    createdAt: stamp(30 + index),
    turn,
    state: "complete",
  }
}

export const bulkMessages: FixtureMessage[] = Array.from({ length: 220 }, (_, index) => generatedMessage(index + 1))

export const fixtureConversations: FixtureConversation[] = [
  {
    id: "c-showcase",
    title: "Doop shell parity",
    preview: "Tables, code, replies, attachments, tool calls",
    updatedAt: stamp(21),
    pinned: true,
    unread: 2,
    messages: showcaseMessages,
  },
  {
    id: "c-bulk",
    title: "Large deterministic thread",
    preview: "220 messages for scrolling and typing benchmarks",
    updatedAt: stamp(250),
    messages: bulkMessages,
  },
  {
    id: "c-empty",
    title: "Empty conversation",
    preview: "No messages yet",
    updatedAt: stamp(260),
    messages: [],
  },
]

export const emptyChatCopy = {
  title: "Start a conversation",
  body: "Ask Tock to investigate, write, or remember something. The conversation appears here.",
  action: "New chat",
}
