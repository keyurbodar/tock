import type { FileCheck, LineRule } from "../lint-tokens"

export const rules: LineRule[] = [
  { name: "viewport-100vh", test: /\b100vh\b|\bh-screen\b/g, why: "Use 100dvh (better-layout). 100vh ignores mobile browser toolbars and clips the bottom of the pane." },
  { name: "viewport-100vw", test: /\bwidth\s*:\s*100vw\b|\bw-screen\b/g, why: "Use 100% (better-layout). 100vw includes the scrollbar and scrolls horizontally on desktop." },
  { name: "scale-from-zero", test: /\bscale\(\s*0\s*\)|\bscale\s*:\s*0\s*[;}]|\bscale:\s*0\s*\}/g, why: "Never animate from scale(0) (emil-design-eng). Start at scale(0.95) with opacity 0." },
  { name: "icon-hex-paint", test: /\b(?:fill|stroke)=["']#/g, files: /\.tsx$/, why: "Icons paint with currentColor so CSS drives every state (better-ui)." },
]

type Block = { prelude: string; body: string; start: number; ancestors: string[] }

function blocks(text: string): Block[] {
  const clean = text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
  const out: Block[] = []
  const stack: { prelude: string; open: number; start: number }[] = []
  let mark = 0
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i]
    if (c === "{") {
      stack.push({ prelude: clean.slice(mark, i).trim(), open: i, start: mark })
      mark = i + 1
    } else if (c === "}") {
      const top = stack.pop()
      if (top) out.push({ prelude: top.prelude, body: clean.slice(top.open + 1, i), start: top.open, ancestors: stack.map((s) => s.prelude) })
      mark = i + 1
    } else if (c === ";") mark = i + 1
  }
  return out
}

const own = (body: string) => body.replace(/\{[^{}]*\}/g, "").replace(/\{[^{}]*\}/g, "")
const hoverQuery = /@media[^{]*\(\s*hover\s*:\s*hover\s*\)/
const overlay = /menu|dialog|palette|centre|move-list|lightbox|popover|sheet|drawer|peek|suggest/

export const check: FileCheck = (file, text) => {
  if (!file.endsWith(".css")) return []
  const hits: ReturnType<FileCheck> = []
  const lineOf = (index: number) => text.slice(0, index).split("\n").length
  for (const block of blocks(text)) {
    if (block.prelude.startsWith("@")) continue
    const line = lineOf(block.start)
    if (text.split("\n")[line - 1]?.includes("lint-tokens-ignore")) continue
    const chain = [...block.ancestors, block.prelude]
    if (/:hover/.test(block.prelude) && !chain.some((p) => hoverQuery.test(p)))
      hits.push({ line, name: "ungated-hover", found: block.prelude.slice(0, 80), why: "Wrap it in @media (hover: hover) and (pointer: fine) (better-ui, emil-design-eng). On touch, :hover latches after a tap and reads as a stuck state." })
    const body = own(block.body)
    const scroll = /(?:^|[;\s])overflow(?:-[xy])?\s*:\s*[^;]*\b(?:auto|scroll)\b/.test(body)
    if (scroll && overlay.test(block.ancestors.concat(block.prelude).join(" ")) && !/overscroll-behavior/.test(body))
      hits.push({ line, name: "overlay-overscroll", found: block.prelude.slice(0, 80), why: "A scrolling menu, dialog or panel needs overscroll-behavior: contain (better-ui) so reaching its end never scrolls what is behind it." })
  }
  return hits
}
