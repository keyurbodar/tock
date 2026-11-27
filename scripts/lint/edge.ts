import type { FileCheck } from "../lint-tokens"

const why = "Every scroll box fades its edges with edgeFade from @tock/ui/motion. Add data-edge-fade=\"y\" | \"x\" | \"both\" to the element and put [data-edge-fade] on this selector, so the overflow only applies where the fade does."
const scrolls = /^overflow(?:-x|-y|-block|-inline)?$/
const scrolling = /\b(?:auto|scroll|overlay)\b/

/** apps/web: a rule that lets a box scroll must select it by [data-edge-fade]. A rule that draws its own mask-image (the transcript's column fade) owns its edges. */
export const check: FileCheck = (file, text) => {
  if (!file.startsWith("apps/web/")) return []
  const hits: ReturnType<FileCheck> = []
  if (file.endsWith(".tsx")) {
    text.split("\n").forEach((line, i) => {
      if (line.includes("lint-tokens-ignore") || line.includes("data-edge-fade")) return
      for (const m of line.matchAll(/(?<![\w-])overflow-(?:x-|y-)?(?:auto|scroll)(?![\w-])/g)) hits.push({ line: i + 1, name: "edge-fade", found: m[0], why })
    })
    return hits
  }
  if (!file.endsWith(".css")) return hits
  const lines = text.split("\n")
  const source = text.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "))
  const stack: { selector: string; overflow?: { line: number; found: string }; masked: boolean }[] = []
  let chunk = ""
  let line = 1
  let chunkLine = 1
  const declare = () => {
    const decl = chunk.trim()
    const top = stack[stack.length - 1]
    const colon = decl.indexOf(":")
    chunk = ""
    if (!top || colon <= 0) return
    const prop = decl.slice(0, colon).trim()
    if (scrolls.test(prop) && scrolling.test(decl.slice(colon + 1))) top.overflow ??= { line: chunkLine, found: decl.replace(/\s+/g, " ") }
    if (/^(?:-webkit-)?mask(?:-image)?$/.test(prop)) top.masked = true
  }
  for (const ch of source) {
    if (ch === "{") {
      stack.push({ selector: chunk.trim(), masked: false })
      chunk = ""
    } else if (ch === "}") {
      declare()
      const block = stack.pop()
      if (block?.overflow && !block.masked && !block.selector.startsWith("@") && !lines[block.overflow.line - 1]?.includes("lint-tokens-ignore")) {
        const bare = block.selector.split(",").map((part) => part.trim()).filter((part) => !part.includes("[data-edge-fade"))
        if (bare.length) hits.push({ line: block.overflow.line, name: "edge-fade", found: bare.join(", ") + " { " + block.overflow.found + " }", why })
      }
    } else if (ch === ";") declare()
    else {
      if (!chunk.trim() && ch.trim()) chunkLine = line
      chunk += ch
    }
    if (ch === "\n") line++
  }
  return hits
}
