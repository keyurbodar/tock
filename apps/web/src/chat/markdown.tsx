import { clamp } from "./clamp"
import { createMemo, createSignal, For, Match, Show, Switch, onCleanup } from "solid-js"
import type { JSX } from "@solidjs/web"
import { Lexer, type Token, type Tokens } from "marked"
import { highlight } from "sugar-high"
import { Icon } from "@tock/ui/icon"
import { MorphIcon } from "@tock/ui/morph-icon"
import { tokens } from "@tock/tokens"
import { FileChip, ThreadChip } from "./chip"
import { ExternalLink, shortUrl, webHost } from "./link"
import { createReveal } from "./stream"

/** Hands out word numbers in reading order, so each streamed word keeps its own fade across re-renders. */
interface Words {
  next(): number
  delay(i: number): string | undefined
}

function words(text: string, clock: Words | undefined): JSX.Element {
  if (!clock) return text
  return text.split(/(\s+)/).map((part) => {
    if (part === "" || /^\s+$/.test(part)) return part
    const delay = clock.delay(clock.next())
    return delay ? <span class="tds-word" style={{ "animation-delay": delay }}>{part}</span> : part
  })
}

function inline(tokens: readonly Token[] | undefined, clock?: Words): JSX.Element[] {
  return (tokens ?? []).map((token): JSX.Element => {
    switch (token.type) {
      case "strong":
        return <strong>{inline(token.tokens, clock)}</strong>
      case "em":
        return <em>{inline(token.tokens, clock)}</em>
      case "del":
        return <del>{inline(token.tokens, clock)}</del>
      case "codespan":
        return <code class="tds-inline-code">{decode(token.text)}</code>
      case "br":
        return <br />
      case "link":
        return <Reference href={token.href} text={token.text} raw={token.raw}>{inline(token.tokens, clock)}</Reference>
      case "text":
        return "tokens" in token && token.tokens ? inline(token.tokens, clock) : words(decode(token.text), clock)
      default:
        return "text" in token ? words(decode(String(token.text)), clock) : token.raw
    }
  })
}

const plainLabel = (text: string) => decode(text.replace(/[*_`~]/g, ""))

/** One place decides what a link becomes, as T3Code's MarkdownAnchor: a file chip, a thread chip, a web link with its favicon, or plain text. */
export function Reference(props: { href: string; text: string; raw: string; children: JSX.Element }) {
  const file = /^tock-file:([\w-]+)$/.exec(props.href)
  if (file) return <FileChip id={file[1]!} name={plainLabel(props.text)} />
  const thread = /^tock-thread:([\w-]+)$/.exec(props.href)
  if (thread) return <ThreadChip id={thread[1]!} label={plainLabel(props.text).replace(/^@/, "")} />
  const host = webHost(props.href)
  if (!host) return <span>{props.children}</span>
  const autolink = props.raw === props.href || props.raw === `<${props.href}>`
  return <ExternalLink href={props.href} host={host} text={autolink ? shortUrl(props.href) : !/[*_`~]/.test(props.raw) ? plainLabel(props.text) : null}>{props.children}</ExternalLink>
}

const entities: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" }
const decode = (text: string) => text.replace(/&(amp|lt|gt|quot|#39);/g, (match) => entities[match] ?? match)

/** Finished blocks never change, so their highlighted HTML is shared by every mount (T3Code highlightedCodeCache). */
const highlighted = new Map<string, string>()
const highlightOnce = (code: string) => {
  const hit = highlighted.get(code)
  if (hit !== undefined) {
    highlighted.delete(code)
    highlighted.set(code, hit)
    return hit
  }
  const html = highlight(code)
  highlighted.set(code, html)
  if (highlighted.size > tokens.size["code-cache"]) highlighted.delete(highlighted.keys().next().value!)
  return html
}

/** As T3Code isClosedCodeFence: a block is done only when its closing fence has arrived, not when the stream pauses. */
export function isClosedFence(raw: string, code: string): boolean {
  const source = raw.replace(/\n+$/, "")
  const opening = /^ {0,3}(`{3,}|~{3,})/.exec(source)?.[1]
  const closing = /(?:^|\n)[ \t]*(`{3,}|~{3,})[ \t]*$/.exec(source)?.[1]
  return (
    opening !== undefined &&
    closing !== undefined &&
    opening[0] === closing[0] &&
    closing.length >= opening.length &&
    source.split("\n").length > code.split("\n").length + 1
  )
}

function CodeCard(props: { token: Tokens.Code }) {
  const [copied, setCopied] = createSignal(false)
  const [expanded, setExpanded] = createSignal(false)
  const [wrapped, setWrapped] = createSignal(false)
  let timer: ReturnType<typeof setTimeout> | undefined
  onCleanup(() => clearTimeout(timer))
  const closed = createMemo(() => isClosedFence(props.token.raw, props.token.text))
  /** While the fence is open only whole lines are highlighted, so a token that lands mid-line re-renders nothing above it. */
  const settled = createMemo(() => {
    const text = props.token.text
    if (closed()) return text
    const cut = text.lastIndexOf("\n")
    return cut < 0 ? "" : text.slice(0, cut + 1)
  })
  const html = createMemo(() => (closed() ? highlightOnce(settled()) : highlight(settled())))
  const tail = () => (closed() ? "" : props.token.text.slice(settled().length))
  const lines = createMemo(() => props.token.text.split("\n").length)
  const long = () => lines() * tokens.type.code[1] > tokens.size["code-collapsed"]
  const copy = async () => {
    await navigator.clipboard.writeText(props.token.text.replace(/\n$/, ""))
    setCopied(true)
    clearTimeout(timer)
    timer = setTimeout(() => setCopied(false), tokens.motion.duration.confirm)
  }
  return (
    <figure class="tds-code" data-wrap={wrapped() ? "" : undefined} data-streaming={closed() ? undefined : ""}>
      <figcaption class="tds-code-head">
        <span>{props.token.lang || "code"}</span>
        <span class="tds-code-actions">
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
      <pre class="tds-scroll" data-collapsed={long() && !expanded() ? "" : undefined}><code><span innerHTML={html()} />{tail()}</code></pre>
      <Show when={long()}>
        <button type="button" class="tds-code-more tds-press" aria-expanded={expanded() ? "true" : "false"} onClick={() => setExpanded((open) => !open)}>
          {expanded() ? "Show less" : `Show all ${lines()} lines`}
        </button>
      </Show>
    </figure>
  )
}

function Block(props: { token: Token; clock?: () => Words | undefined }) {
  return (
    <Switch fallback={<div ref={(el) => clamp(el)} class="tds-bubble" data-side="agent">{props.token.raw.trim()}</div>}>
      <Match when={props.token.type === "code"}>
        <CodeCard token={props.token as Tokens.Code} />
      </Match>
      <Match when={props.token.type === "paragraph" || props.token.type === "heading"}>
        <div ref={(el) => clamp(el)} class="tds-bubble" data-side="agent" data-heading={props.token.type === "heading" ? "" : undefined}>
          {inline((props.token as Tokens.Paragraph).tokens, props.clock?.())}
        </div>
      </Match>
      <Match when={props.token.type === "list"}>
        <div ref={(el) => clamp(el)} class="tds-bubble" data-side="agent">
          <ul class="tds-list" data-ordered={(props.token as Tokens.List).ordered ? "" : undefined}>
            <For each={(props.token as Tokens.List).items} keyed={false}>{(item) => <li>{inline(item().tokens.flatMap((t) => ("tokens" in t && t.tokens ? t.tokens : [t])), props.clock?.())}</li>}</For>
          </ul>
        </div>
      </Match>
    </Switch>
  )
}

/**
 * Lexes a reply block by block, as T3Code's markdownStreamBlocks: blank lines outside a fence end a block, finished
 * blocks are lexed once and keep their token objects, so a streaming reply re-lexes only its open last block and the
 * blocks above it never re-render.
 */
const lexed = new Map<string, Token[]>()
function lexBlocks(text: string): Token[] {
  const parts: string[] = []
  let fence: string | undefined
  let start = 0
  let at = 0
  for (const line of text.split("\n")) {
    const end = at + line.length + 1
    const mark = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1]
    if (mark && (!fence || mark.startsWith(fence))) fence = fence ? undefined : mark
    else if (!fence && line.trim() === "" && at > start) {
      parts.push(text.slice(start, end))
      start = end
    }
    at = end
  }
  if (start < text.length) parts.push(text.slice(start))
  if (lexed.size > tokens.limit["lex-cache"]) lexed.clear()
  return parts.flatMap((part, index) => {
    const cached = lexed.get(part)
    if (cached) return cached
    const out = Lexer.lex(part, { gfm: true, breaks: true }).filter((token) => token.type !== "space")
    if (index < parts.length - 1) lexed.set(part, out)
    return out
  })
}

/** A reply. While it streams, words arrive one at a time and each fades in from a slight blur (TDS streaming words). */
export function Markdown(props: { text: string; streaming?: boolean }) {
  const reveal = createReveal(() => props.text, () => props.streaming ?? false)
  const blocks = createMemo(() => lexBlocks(reveal.text()))
  /** Word numbers restart for every render pass; blocks render in order, so block i counts after the blocks before it. */
  const offsets = createMemo(() => {
    let total = 0
    return blocks().map((token) => {
      const start = total
      total += (token.type === "code" ? "" : token.raw).match(/\S+/g)?.length ?? 0
      return start
    })
  })
  const clockFor = (index: number): Words | undefined => {
    if (!reveal.revealing() && !props.streaming) return undefined
    let i = offsets()[index] ?? 0
    return { next: () => i++, delay: reveal.delay }
  }
  return <For each={blocks()} keyed={false}>{(token, index) => <Block token={token()} clock={() => clockFor(index)} />}</For>
}
