import { expect, test } from "vitest"
import type { EntryRecord } from "../api/types"
import { buildItems } from "./items"

const call = (stopReason: string): EntryRecord => ({
  id: "a",
  kind: "pi.assistant",
  model: [
    {
      role: "assistant",
      content: [{ type: "toolCall", id: "c1", name: "search", arguments: { query: "tides" } }],
      stopReason,
    },
  ],
})

const result = (code: string): EntryRecord => ({
  id: "r",
  kind: "pi.tool-result",
  model: [{ role: "toolResult", toolCallId: "c1", toolName: "search", content: [], isError: true }],
  data: { diagnostics: [{ severity: "error", code, message: "Tool search" }] },
})

const status = (entries: readonly EntryRecord[]) => {
  const item = buildItems(entries, null, [])[0]
  return item?.kind === "work" && item.steps[0]?.kind === "tool" ? item.steps[0].status : undefined
}

test("a call the harness aborted is cancelled, not failed", () => {
  expect(status([call("toolUse"), result("aborted")])).toBe("cancelled")
})

test("a call that failed for another reason stays failed", () => {
  expect(status([call("toolUse"), result("blocked")])).toBe("failed")
})

test("a call cut off by Stop before it ran is cancelled", () => {
  expect(status([call("aborted")])).toBe("cancelled")
})

test("a call a provider error left without a result is not cancelled", () => {
  expect(status([call("error")])).toBe("done")
})
