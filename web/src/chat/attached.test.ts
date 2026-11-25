import { expect, test } from "vitest"
import { splitAttachments, withAttachments } from "./attached"

const files = [
  { name: "kiko-design-system-kds (1).zip", id: "3f6c1a52-0b7e-4c57-9d0e-6a1f6f2c9b11" },
  { name: "screenshot.png", id: "b2a0c7de-58c1-4a35-8f55-0d5b0f3a4e22" },
]

test("a sent message splits back into its text and its attached files", () => {
  expect(splitAttachments(withAttachments("Compare these\n\nthen summarise", files))).toEqual({ text: "Compare these\n\nthen summarise", refs: files })
})

test("a message of attachments only has no text", () => {
  expect(splitAttachments(withAttachments("", files))).toEqual({ text: "", refs: files })
})

test("text that only mentions an attachment line is left alone", () => {
  const quoted = "the marker is\n[attached file: a.txt (id-1)]\nas you can see"
  expect(splitAttachments(quoted)).toEqual({ text: quoted, refs: [] })
  const inline = "see\n[attached file: a.txt (id-1)]"
  expect(splitAttachments(inline)).toEqual({ text: inline, refs: [] })
})
