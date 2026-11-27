import { createMemo, createSignal, For, Match, Switch, onCleanup } from "solid-js"
import type { JSX } from "@solidjs/web"
import { Lexer, type Token, type Tokens } from "marked"
import { highlight } from "sugar-high"
import { Icon } from "@tock/ui/icon"
import { tokens } from "@tock/tokens"
import { FileChip, ThreadChip } from "./chip"
import { ExternalLink, shortUrl, webHost } from "./link"

function inline(tokens: readonly Token[] | undefined): JSX.Element[] {
  return (tokens ?? []).map((token): JSX.Element => {
    switch (token.type) {
      case "strong":
        return <strong>{inline(token.tokens)}</strong>
      case "em":
        return <em>{inline(token.tokens)}</em>
      case "del":
        return <del>{inline(token.tokens)}</del>
      case "codespan":
        return <code class="tds-inline-code">{decode(token.text)}</code>
      case "br":
        return <br />
      case "link":
        return <Reference href={token.href} text={token.text} raw={token.raw}>{inline(token.tokens)}</Reference>
      case "text":
        return "tokens" in token && token.tokens ? inline(token.tokens) : decode(token.text)
      default:
        return "text" in token ? decode(String(token.text)) : token.raw
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

function CodeCard(props: { token: Tokens.Code }) {
  const [copied, setCopied] = createSignal(false)
  let timer: ReturnType<typeof setTimeout> | undefined
  onCleanup(() => clearTimeout(timer))
  const html = createMemo(() => highlight(props.token.text))
  const copy = async () => {
    await navigator.clipboard.writeText(props.token.text)
    setCopied(true)
    clearTimeout(timer)
    timer = setTimeout(() => setCopied(false), tokens.motion.duration.confirm)
  }
  return (
    <figure class="tds-code">
      <figcaption class="tds-code-head">
        <span>{props.token.lang || "code"}</span>
        <button type="button" class="tds-code-action tds-press" aria-label={copied() ? "Copied" : "Copy code"} onClick={copy}>
          <Icon name={copied() ? "check" : "copy"} size="code-action" />
        </button>
      </figcaption>
      <pre class="tds-scroll"><code innerHTML={html()} /></pre>
    </figure>
  )
}

function Block(props: { token: Token }) {
  return (
    <Switch fallback={<div class="tds-bubble" data-side="agent">{props.token.raw.trim()}</div>}>
      <Match when={props.token.type === "code"}>
        <CodeCard token={props.token as Tokens.Code} />
      </Match>
      <Match when={props.token.type === "paragraph" || props.token.type === "heading"}>
        <div class="tds-bubble" data-side="agent" data-heading={props.token.type === "heading" ? "" : undefined}>
          {inline((props.token as Tokens.Paragraph).tokens)}
        </div>
      </Match>
      <Match when={props.token.type === "list"}>
        <div class="tds-bubble" data-side="agent">
          <ul class="tds-list" data-ordered={(props.token as Tokens.List).ordered ? "" : undefined}>
            <For each={(props.token as Tokens.List).items} keyed={false}>{(item) => <li>{inline(item().tokens.flatMap((t) => ("tokens" in t && t.tokens ? t.tokens : [t])))}</li>}</For>
          </ul>
        </div>
      </Match>
    </Switch>
  )
}

export function Markdown(props: { text: string }) {
  const blocks = createMemo(() => Lexer.lex(props.text, { gfm: true, breaks: true }).filter((token) => token.type !== "space"))
  return <For each={blocks()} keyed={false}>{(token) => <Block token={token()} />}</For>
}
