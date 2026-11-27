import { clamp } from "./clamp"
import { createMemo, For, Match, Switch } from "solid-js"
import type { JSX } from "@solidjs/web"
import { Lexer, type Token, type Tokens } from "marked"
import { tokens } from "@tock/tokens"
import { FileChip, ThreadChip } from "./chip"
import { CodeBlock } from "./code"
import { Attachments, type SentFile } from "./files"
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
  return <CodeBlock code={props.token.text} lang={props.token.lang} open={!isClosedFence(props.token.raw, props.token.text)} />
}

/** A paragraph that is only file links is an attachment group, not prose: the agent returned files. */
function filesOnly(token: Token): SentFile[] | null {
  if (token.type !== "paragraph") return null
  const files: SentFile[] = []
  for (const part of (token as Tokens.Paragraph).tokens) {
    if (part.type === "link" && /^tock-file:[\w-]+$/.test(part.href)) files.push({ id: part.href.slice("tock-file:".length), name: plainLabel(part.text) })
    else if (!((part.type === "text" || part.type === "br") && !("text" in part && String(part.text).trim()))) return null
  }
  return files.length > 0 ? files : null
}

function Block(props: { token: Token; clock?: () => Words | undefined }) {
  return (
    <Switch fallback={<div ref={(el) => clamp(el)} class="tds-bubble" data-side="agent">{props.token.raw.trim()}</div>}>
      <Match when={props.token.type === "code"}>
        <CodeCard token={props.token as Tokens.Code} />
      </Match>
      <Match when={filesOnly(props.token)}>{(files) => <Attachments files={files()} side="agent" />}</Match>
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
