import type { FileCheck } from "../lint-tokens"

const why = "A + or ~ after a bare tag or * makes Chrome restyle the following siblings with their whole subtrees on every element insertion in the page (650-bubble chat: 44ms per mounted slice). Key the left side on a class, attribute or &, or use :not(:first-child)."

export const check: FileCheck = (file, text) => {
  if (!file.endsWith(".css")) return []
  const source = text.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "))
  const hits: ReturnType<FileCheck> = []
  for (const match of source.matchAll(/[^{};]+(?=\{)/g)) {
    const prelude = match[0].trim()
    if (prelude.startsWith("@")) continue
    const line = source.slice(0, match.index + match[0].indexOf(prelude)).split("\n").length
    for (const selector of prelude.split(",")) {
      let flat = selector
      while (/\([^()]*\)/.test(flat)) flat = flat.replace(/\([^()]*\)/g, "")
      const lefts = flat.split(/\s*[+~]\s*/).slice(0, -1)
      if (lefts.some((part) => !/[.#[&]/.test(part.trim().split(/[\s>]+/).at(-1) ?? ""))) hits.push({ line, name: "sibling-bare", found: selector.trim(), why })
    }
  }
  return hits
}
