import { motion } from "@tock/theme/motion"
import { type RefObject, useLayoutEffect, useRef } from "react"

const { steps: STEPS, duration: DURATION, merge: MERGE, fresh: FRESH, curve: CURVE } = motion.reveal
const SKIPPED = "pre, code, button, svg, math, .katex, [data-math-pending]"
const CONTAINERS = new Set(["UL", "OL", "DL", "TABLE", "THEAD", "TBODY", "TFOOT", "TR"])
const BLOCKS = new Set([
  "BLOCKQUOTE",
  "DIV",
  "DL",
  "DT",
  "DD",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HR",
  "LI",
  "OL",
  "P",
  "PRE",
  "TABLE",
  "UL",
])
const BLANK = /^[\t\n\f\r ]+$/

interface Piece {
  readonly range: Range
  readonly buckets: readonly Highlight[]
}

interface Wave {
  start: number
  end: number
  readonly started: number
  bucket: number
  pieces: Piece[]
}

interface Span {
  readonly node: Text
  readonly start: number
  readonly end: number
}

function accept(node: Node): number {
  const parent = node.parentElement
  if (!parent || parent.closest(SKIPPED)) return NodeFilter.FILTER_REJECT
  const between =
    BLANK.test(node.nodeValue ?? "") &&
    (CONTAINERS.has(parent.tagName) ||
      BLOCKS.has(node.previousSibling?.nodeName ?? "") ||
      BLOCKS.has(node.nextSibling?.nodeName ?? ""))
  return between ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
}

function spans(root: HTMLElement): { text: string; list: Span[] } {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: accept })
  const list: Span[] = []
  let text = ""
  while (walker.nextNode()) {
    const node = walker.currentNode as Text
    const start = text.length
    text += node.data
    list.push({ node, start, end: text.length })
  }
  return { text, list }
}

const drop = (wave: Wave) => wave.pieces.forEach(({ range, buckets }) => buckets[wave.bucket]?.delete(range))

function fader(root: HTMLElement, owner: string) {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)")
  const palettes = new Map<string, readonly Highlight[]>()
  const names: string[] = []
  let previous: { text: string; streaming: boolean } | undefined
  let waves: Wave[] = []
  let frame = 0
  let sheet: HTMLStyleElement | undefined

  const clear = () => {
    cancelAnimationFrame(frame)
    frame = 0
    waves = []
    for (const name of names) CSS.highlights.delete(name)
    names.length = 0
    palettes.clear()
    sheet?.remove()
    sheet = undefined
  }

  const step = (now: number) => {
    frame = 0
    if (reduced.matches) return clear()
    waves = waves.filter((wave) => {
      const bucket = Math.min(STEPS, Math.floor(((now - wave.started) / DURATION) * STEPS))
      if (bucket !== wave.bucket) {
        drop(wave)
        wave.bucket = bucket
        for (const { range, buckets } of wave.pieces) buckets[bucket]?.add(range)
      }
      return bucket < STEPS
    })
    if (waves.length > 0) frame = requestAnimationFrame(step)
    else clear()
  }

  const palette = (rules: CSSStyleSheet, color: string) => {
    const known = palettes.get(color)
    if (known) return known
    const created = Array.from({ length: STEPS }, (_, index) => {
      const name = `md-fade-${owner}-${names.length}`
      const opacity = (1 - (1 - index / STEPS) ** CURVE) * 100
      rules.insertRule(
        `[data-md-fade-owner="${CSS.escape(owner)}"] ::highlight(${CSS.escape(name)}) { color: color-mix(in srgb, ${color} ${opacity}%, transparent) }`,
        rules.cssRules.length,
      )
      const highlight = new Highlight()
      CSS.highlights.set(name, highlight)
      names.push(name)
      return highlight
    })
    palettes.set(color, created)
    return created
  }

  const update = (streaming: boolean) => {
    if (reduced.matches) {
      previous = undefined
      return clear()
    }
    const { text, list } = spans(root)
    const before = previous
    previous = { text, streaming }
    const from = before?.text.length ?? (streaming && text.length <= FRESH ? 0 : text.length)
    const appended = before === undefined || text.startsWith(before.text)
    if (before && !appended) {
      let shared = 0
      while (shared < before.text.length && before.text[shared] === text[shared]) shared += 1
      waves = waves.filter((wave) => {
        wave.end = Math.min(wave.end, shared)
        if (wave.start < wave.end) return true
        drop(wave)
        return false
      })
    }
    if ((streaming || before?.streaming) && appended && text.length > from) {
      const now = performance.now()
      const last = waves.at(-1)
      const midword = /\S/.test(text[from - 1] ?? " ") && /\S/.test(text[from] ?? " ")
      if (last !== undefined && last.end === from && midword && now - last.started < DURATION * MERGE) last.end = text.length
      else waves.push({ start: from, end: text.length, started: now, bucket: -1, pieces: [] })
    }
    if (waves.length === 0) return clear()
    cancelAnimationFrame(frame)
    if (!sheet) {
      sheet = document.createElement("style")
      document.head.append(sheet)
    }
    const rules = sheet.sheet
    if (!rules) return clear()
    const colors = new Map<HTMLElement, string>()
    for (const { node, start, end } of list) {
      const parent = node.parentElement
      if (parent && !colors.has(parent) && waves.some((wave) => end > wave.start && start < wave.end))
        colors.set(parent, getComputedStyle(parent).color)
    }
    for (const wave of waves) {
      drop(wave)
      wave.bucket = -1
      wave.pieces = []
      for (const { node, start, end } of list) {
        if (end <= wave.start || start >= wave.end || !node.parentElement) continue
        const color = colors.get(node.parentElement)
        if (color === undefined) continue
        const range = new Range()
        range.setStart(node, Math.max(0, wave.start - start))
        range.setEnd(node, Math.min(end, wave.end) - start)
        wave.pieces.push({ range, buckets: palette(rules, color) })
      }
    }
    step(performance.now())
  }

  const settle = () => {
    if (reduced.matches) clear()
  }
  reduced.addEventListener("change", settle)
  return {
    update,
    dispose: () => {
      reduced.removeEventListener("change", settle)
      clear()
    },
  }
}

export function useStreamFade(source: string, streaming: boolean, owner: string): RefObject<HTMLDivElement | null> {
  const root = useRef<HTMLDivElement>(null)
  const update = useRef<((streaming: boolean) => void) | undefined>(undefined)
  useLayoutEffect(() => {
    const element = root.current
    if (!element || typeof Highlight === "undefined" || !CSS.highlights) return
    const instance = fader(element, owner)
    update.current = instance.update
    return () => {
      update.current = undefined
      instance.dispose()
    }
  }, [owner])
  useLayoutEffect(() => {
    update.current?.(streaming)
  }, [source, streaming])
  return root
}
