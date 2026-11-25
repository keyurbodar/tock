import type { FixtureFile } from "./types"

const kinds = ["markdown", "image", "code", "spreadsheet", "archive"] as const

export const fixtureFiles: FixtureFile[] = Array.from({ length: 56 }, (_, index) => {
  const number = index + 1
  const kind = kinds[index % kinds.length] ?? "markdown"
  return {
    id: `file-${String(number).padStart(3, "0")}`,
    name: `${kind}-${String(number).padStart(2, "0")}`,
    path: `/vault/projects/tock/${kind}-${String(number).padStart(2, "0")}`,
    kind,
    size: `${18 + ((index * 37) % 420)} KB`,
    updatedAt: `2026-11-${String((index % 24) + 1).padStart(2, "0")}T10:00:00Z`,
  }
})

export const emptyFilesCopy = {
  title: "No files yet",
  body: "Drop files into Tock or connect a folder. They will be indexed here.",
  action: "Upload file",
}
