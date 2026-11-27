import type { FileCheck } from "../lint-tokens"

const why = "The tray has one card, Card in chat/composer.tsx: flat, a hairline, a type pill and a bottom progress bar. The old ring, glyph and meta card (and the old sent-image and file-card classes) must not come back through a second render path."
const LEGACY = /tds-attach-ring|tds-attach-glyph|tds-attach-meta|tds-file-card|tds-sent-images?\b|tds-attach-veil/

export const check: FileCheck = (file, text) => {
  if (!/apps\/web\/src\/.*\.(tsx?|css)$/.test(file) || /dev\//.test(file)) return []
  const hits: ReturnType<FileCheck> = []
  text.split("\n").forEach((line, index) => {
    const found = LEGACY.exec(line)?.[0]
    if (found) hits.push({ line: index + 1, name: "attach-legacy", found, why })
  })
  return hits
}
