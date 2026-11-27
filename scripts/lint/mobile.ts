import { readFileSync } from "node:fs"
import type { FileCheck, LineRule } from "../lint-tokens"

export const rules: LineRule[] = [
  { name: "mobile-100vh", test: /\b100vh\b/g, why: "100vh is the largest viewport on a phone, so the shell overflows under the URL bar (ek mobile-native). Use 100dvh." },
  { name: "mobile-body-select", test: /\bbody\s*\{[^}]*user-select\s*:\s*none/g, why: "Content must stay selectable; put user-select: none on controls only (ek mobile-native)." },
  { name: "mobile-touchmove", test: /addEventListener\(\s*["']touchmove["']/g, why: "A touchmove + preventDefault listener blocks scrolling and costs frames. Use overscroll-behavior or touch-action (ek mobile-native)." },
]

let html = false
export const check: FileCheck = () => {
  if (html) return []
  html = true
  const text = readFileSync("apps/web/index.html", "utf8")
  const meta = text.match(/<meta name="viewport" content="([^"]*)"/)?.[1] ?? ""
  const hits: ReturnType<FileCheck> = []
  if (/user-scalable=no|maximum-scale/.test(meta)) hits.push({ line: 1, name: "mobile-zoom", found: meta, why: "Never disable zoom; fix the input font size instead (ek mobile-native, jk better-accessibility)." })
  if (!/viewport-fit=cover/.test(meta)) hits.push({ line: 1, name: "mobile-viewport-fit", found: meta, why: "Without viewport-fit=cover every env(safe-area-inset-*) is 0 (ek mobile-native)." })
  return hits.map((hit) => ({ ...hit, file: "apps/web/index.html", line: text.slice(0, text.indexOf("viewport")).split("\n").length }))
}
