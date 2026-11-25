import { Component, type ComponentProps, Fragment, type CSSProperties, type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from "react"
import { Button } from "./button"
import { disposeHighlight, highlight, type HighlightState } from "./code/highlight"
import type { Token } from "./code/protocol"
import { Check, glyphs } from "./glyph"

const COPIED_MS = 2000
const WRAP_KEY = "tock.code-wrap"
const listeners = new Set<() => void>()

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  window.addEventListener("storage", listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener("storage", listener)
  }
}

const readWrap = () => {
  try {
    return localStorage.getItem(WRAP_KEY) === "true"
  } catch {
    return false
  }
}

const writeWrap = (next: boolean) => {
  try {
    localStorage.setItem(WRAP_KEY, String(next))
  } catch {}
  for (const listener of listeners) listener()
}

interface Chunks {
  readonly generation: number
  readonly count: number
  readonly chunks: readonly ReactNode[]
}

const styleOf = (source: string) => {
  const style: Record<string, string> = {}
  for (const part of source.split(";")) {
    const colon = part.indexOf(":")
    if (colon >= 0) style[part.slice(0, colon).trim()] = part.slice(colon + 1).trim()
  }
  return style as CSSProperties
}

const span = (token: Token, key: number) => (token[1] ? <span key={key} style={styleOf(token[1])}>{token[0]}</span> : <span key={key}>{token[0]}</span>)

const chunksOf = (previous: Chunks | undefined, state: HighlightState): Chunks => {
  if (previous && previous.generation === state.generation) {
    if (previous.count === state.stable.length) return previous
    if (previous.count < state.stable.length) {
      const added = state.stable.slice(previous.count).map((token, index) => span(token, previous.count + index))
      return {
        generation: previous.generation,
        count: state.stable.length,
        chunks: [...previous.chunks, <Fragment key={previous.chunks.length}>{added}</Fragment>],
      }
    }
  }
  const all = state.stable.map(span)
  return { generation: state.generation, count: state.stable.length, chunks: all.length > 0 ? [<Fragment key={0}>{all}</Fragment>] : [] }
}

class Boundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  override render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

export function CopyCodeButton({ text, onClick, ...props }: { text: string } & Omit<ComponentProps<typeof Button>, "children">) {
  const [copied, setCopied] = useState(false)
  const timer = useRef(0)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label={copied ? "Copied" : "Copy code"}
      {...props}
      onClick={(event) => {
        onClick?.(event)
        void navigator.clipboard?.writeText(text)
        setCopied(true)
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => setCopied(false), COPIED_MS)
      }}
    >
      {copied ? <Check /> : glyphs.clipboard}
    </Button>
  )
}

export function MarkdownCode({ text, language, complete, blockKey }: { text: string; language?: string; complete: boolean; blockKey: string }) {
  const [highlighted, setHighlighted] = useState<{ state: HighlightState; stable: Chunks }>()
  const wrap = useSyncExternalStore(subscribe, readWrap, () => false)

  useEffect(() => {
    let cancelled = false
    void highlight(blockKey, text, language ?? "text", complete).then((result) => {
      if (cancelled || result.type !== "tokens") return
      setHighlighted((previous) => ({ state: result.state, stable: chunksOf(previous?.stable, result.state) }))
    })
    return () => {
      cancelled = true
    }
  }, [blockKey, text, language, complete])

  useEffect(() => () => disposeHighlight(blockKey), [blockKey])

  const current = highlighted !== undefined && text.startsWith(highlighted.state.source) ? highlighted : undefined
  const rest = current === undefined ? text : text.slice(current.state.source.length)

  return (
    <div data-component="markdown-code" data-wrap={wrap ? "" : undefined}>
      <div data-slot="markdown-code-header">
        <span data-slot="markdown-code-language">{language ?? "text"}</span>
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={wrap ? "Disable line wrapping" : "Wrap lines"}
            aria-pressed={wrap}
            data-selected={wrap ? "" : undefined}
            onClick={() => writeWrap(!wrap)}
          >
            {glyphs.wrap}
          </Button>
          <CopyCodeButton text={text} />
        </div>
      </div>
      <Boundary
        fallback={
          <pre>
            <code>{text}</code>
          </pre>
        }
      >
        <pre>
          <code>
            {current?.stable.chunks}
            {current?.state.unstable.map(span)}
            {rest ? <span>{rest}</span> : null}
          </code>
        </pre>
      </Boundary>
    </div>
  )
}
