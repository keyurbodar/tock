import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { Button } from "./button"
import { Check, glyphs } from "./glyph"

const COPIED_MS = 2000
const listeners = new Set<() => void>()
let wrapped = false

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const setWrapped = (next: boolean) => {
  wrapped = next
  for (const listener of listeners) listener()
}

function CopyCodeButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef(0)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label={copied ? "Copied" : "Copy code"}
      onClick={() => {
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

export function MarkdownCode({ text, language }: { text: string; language?: string }) {
  const wrap = useSyncExternalStore(
    subscribe,
    () => wrapped,
    () => false,
  )
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
            onClick={() => setWrapped(!wrap)}
          >
            {glyphs.wrap}
          </Button>
          <CopyCodeButton text={text} />
        </div>
      </div>
      <pre>
        <code>{text === "" ? null : <span>{text}</span>}</code>
      </pre>
    </div>
  )
}
