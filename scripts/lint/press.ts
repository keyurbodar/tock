import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import type { FileCheck } from "../lint-tokens"

/**
 * Press release: every button scales to --tds-press on :active and eases back on its resting transition. A component
 * rule that writes its own transition without scale drops that ease, so the release snaps from .96 to 1 in one frame.
 * Pressable classes are those on a <button> or beside tds-press in JSX; their transitions must carry
 * var(--tds-press-transition) (or name scale themselves).
 */
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : /\.tsx$/.test(name) ? [path] : []
  })

const pressable = new Set<string>()
for (const file of [...walk("apps/web/src"), ...walk("packages/ui/src")]) {
  const text = readFileSync(file, "utf8")
  const lists = [
    ...[...text.matchAll(/class=["`]([^"`]*\btds-press\b[^"`]*)["`]/g)].map((m) => m[1]!),
    ...[...text.matchAll(/<(?:button|\w*Button|(?:Menu|Popover|Dialog)Trigger)\b(?:[^<>]|=>)*?\bclass=\{?["`]([^"`]+)["`]/g)].map((m) => m[1]!),
  ]
  for (const list of lists) for (const name of list.split(/\s+/)) if (/^tds-[\w-]+$/.test(name) && name !== "tds-press") pressable.add(name)
}

const subject = (selector: string) => {
  const last = selector.trim().split(/\s+|>|~|\+/).filter(Boolean).at(-1) ?? ""
  return [...last.replace(/:not\([^)]*\)/g, "").matchAll(/\.(tds-[\w-]+)/g)].map((m) => m[1]!)
}

const OK = /var\(--tds-press-transition\)|\bscale\b|^\s*none\b|\binherit\b/

export const check: FileCheck = (file, text) => {
  if (!file.endsWith(".css")) return []
  const hits: ReturnType<FileCheck> = []
  const stack: string[][] = []
  let buffer = ""
  let line = 1
  let start = 1
  const resolve = (raw: string) => {
    const parts = raw.split(",").map((s) => s.trim()).filter(Boolean)
    const parent = stack.at(-1)
    if (!parent || raw.trim().startsWith("@")) return raw.trim().startsWith("@") ? (parent ?? [""]) : parts
    return parent.flatMap((p) => parts.map((s) => (s.includes("&") ? s.replaceAll("&", p) : `${p} ${s}`)))
  }
  for (const ch of text) {
    if (ch === "\n") line++
    if (ch === "{") {
      stack.push(resolve(buffer))
      buffer = ""
      start = line
      continue
    }
    if (ch === ";" || ch === "}") {
      const decl = buffer.trim()
      const m = /^transition(?:-property)?\s*:\s*([\s\S]+)$/.exec(decl)
      const selectors = stack.at(-1) ?? []
      if (m && !OK.test(m[1]!) && !text.split("\n")[start - 1]?.includes("lint-tokens-ignore")) {
        const hit = selectors.filter((s) => !/:active|\[data-dragging\]|\[data-moving\]|\[data-swiping\]/.test(s)).flatMap(subject).find((c) => pressable.has(c))
        if (hit) hits.push({ line, name: "press-release-snaps", found: `.${hit}`, why: "This button scales on :active, and this transition has no scale, so the release snaps back in one frame. Start the list with var(--tds-press-transition)." })
      }
      if (ch === "}") stack.pop()
      buffer = ""
      start = line
      continue
    }
    buffer += ch
  }
  return hits
}
