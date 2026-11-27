import { createMemo, createSignal, onCleanup } from "solid-js"
import { highlight, type TokenType } from "sugar-high"
import { lang } from "sugar-high/lang"
import { Icon } from "@tock/ui/icon"
import { MorphIcon } from "@tock/ui/morph-icon"
import { tokens } from "@tock/tokens"

/** The fence's first word, as T3Code's languageOfInfoString: `ts title=a.ts` is ts. */
export const fenceLanguage = (info: string | null | undefined) => (info ?? "").trim().split(/\s+/)[0]?.toLowerCase() ?? ""

const grammar = (info: string | null | undefined) => lang(fenceLanguage(info))

/** Finished blocks never change, so their highlighted HTML is shared by every mount (T3Code highlightedCodeCache). */
const cache = new Map<string, string>()

/** The one highlighter: agent replies, user bubbles, the lightbox and the composer all colour code here. */
export function highlightCode(code: string, info?: string | null, keep = true): string {
  const key = `${fenceLanguage(info)}\u0000${code}`
  const hit = cache.get(key)
  if (hit !== undefined) {
    cache.delete(key)
    cache.set(key, hit)
    return hit
  }
  const html = highlight(code, { lang: grammar(info) })
  if (!keep) return html
  cache.set(key, html)
  if (cache.size > tokens.size["code-cache"]) cache.delete(cache.keys().next().value!)
  return html
}

/** The same tokens as ranges into the code, for an editor that colours text it does not own (ProseMirror decorations). */
export function codeRanges(code: string, info?: string | null): { from: number; to: number; type: TokenType }[] {
  const out: { from: number; to: number; type: TokenType }[] = []
  let at = 0
  highlight(code, {
    lang: grammar(info),
    mark: (token) => {
      if (!token.value) return
      const from = code.indexOf(token.value, at)
      if (from < 0) return
      at = from + token.value.length
      if (token.type !== "space" && token.type !== "break") out.push({ from, to: at, type: token.type })
    },
  })
  return out
}

/**
 * One code block for every surface, after T3Code's MarkdownCodeBlock: a header with the language and the wrap and copy
 * actions, lines that scroll sideways instead of wrapping, and a height cap past which the block scrolls inside itself.
 * While open (its fence has not closed yet) only whole lines are highlighted, so a token landing mid-line re-renders
 * nothing above it.
 */
export function CodeBlock(props: { code: string; lang?: string | null; open?: boolean }) {
  const [copied, setCopied] = createSignal(false)
  const [wrapped, setWrapped] = createSignal(false)
  let timer: ReturnType<typeof setTimeout> | undefined
  onCleanup(() => clearTimeout(timer))
  const settled = createMemo(() => {
    if (!props.open) return props.code
    const cut = props.code.lastIndexOf("\n")
    return cut < 0 ? "" : props.code.slice(0, cut + 1)
  })
  const html = createMemo(() => highlightCode(settled(), props.lang, !props.open))
  const tail = () => props.code.slice(settled().length)
  const label = () => fenceLanguage(props.lang) || "text"
  const copy = async () => {
    await navigator.clipboard.writeText(props.code.replace(/\n$/, ""))
    setCopied(true)
    clearTimeout(timer)
    timer = setTimeout(() => setCopied(false), tokens.motion.duration.confirm)
  }
  return (
    <figure class="tds-code" dir="ltr" data-language={label()} data-wrap={wrapped() ? "" : undefined} data-streaming={props.open ? "" : undefined}>
      <figcaption class="tds-code-head">
        <span>{label()}</span>
        <span class="tds-code-actions" role="toolbar" aria-label="Code block actions">
          <button
            type="button"
            class="tds-code-action tds-press"
            aria-pressed={wrapped() ? "true" : "false"}
            aria-label={wrapped() ? "Disable line wrap" : "Wrap lines"}
            onClick={() => setWrapped((on) => !on)}
          >
            <Icon name="arrow-u-down-left" size="code-action" />
          </button>
          <button type="button" class="tds-code-action tds-press" aria-label={copied() ? "Copied" : "Copy code"} onClick={copy}>
            <MorphIcon name={copied() ? "check" : "copy"} size="code-action" class="tds-code-copy" />
          </button>
        </span>
      </figcaption>
      <pre class="tds-code-body" data-edge-fade="both" tabindex="0"><code><span innerHTML={html()} />{tail()}</code></pre>
    </figure>
  )
}
