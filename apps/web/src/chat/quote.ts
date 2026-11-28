import { createSignal } from "solid-js"
import { tokens } from "@tock/tokens"

/** A message (or a selection inside one) the next send replies to. ref is the message's durable address from chat/items.ts. */
export interface Quote {
  readonly ref: string
  readonly text: string
  /** What was replied to: words, a code block or media (a photo, a video, a file). Drawn differently in the quote card. */
  readonly kind?: QuoteKind
  /** A selection inside the message rather than the whole of it: Telegram marks these with a quote glyph. */
  readonly partial?: boolean
}
export type QuoteKind = "text" | "code" | "media"

/** Agent text refs carry a block index ("<entry>:<message>:<block>"); user messages don't. */
export const authorOf = (ref: string) => (ref.split(":").length > 2 ? "toast" : "You")

const [quotes, setQuotes] = createSignal<Readonly<Record<string, Quote | undefined>>>({})
export const quoteFor = (sessionId: string) => quotes()[sessionId]
export const setQuote = (sessionId: string, quote: Quote | undefined) => setQuotes((all) => ({ ...all, [sessionId]: quote }))

/** One line of the quoted words, cut at limit.quote-chars with one ellipsis. */
export const excerpt = (text: string) => {
  const line = text.replace(/\s+/g, " ").trim()
  const max = tokens.limit["quote-chars"]
  return line.length > max ? `${line.slice(0, max).trimEnd()}…` : line
}

const escape = (text: string) => text.replace(/[\\[\]]/g, (char) => `\\${char}`)
const unescape = (text: string) => text.replace(/\\([\\[\]])/g, "$1")

/** The quote leads the message as a blockquote line the agent reads as context and the client turns back into a chip. */
const tag = (quote: Quote) => [quote.kind && quote.kind !== "text" ? quote.kind : "", quote.partial ? "part" : ""].filter(Boolean).join(",")
export const withQuote = (quote: Quote | undefined, body: string) =>
  quote ? `> [${escape(excerpt(quote.text))}](tock-quote:${quote.ref}${tag(quote) ? `#${tag(quote)}` : ""})\n\n${body}` : body

const LEAD = /^> \[((?:\\.|[^\]\\\n])*)\]\(tock-quote:([^)\s]+)\)[ \t]*(?:\n+|$)/
export function parseQuote(text: string): { ref: string; excerpt: string; body: string; kind: QuoteKind; partial: boolean } | undefined {
  const match = LEAD.exec(text)
  if (!match) return undefined
  const [ref, flags = ""] = match[2]!.split("#") as [string, string?]
  const kind: QuoteKind = flags.includes("code") ? "code" : flags.includes("media") ? "media" : "text"
  return { ref, excerpt: unescape(match[1]!), body: text.slice(match[0].length), kind, partial: flags.includes("part") }
}
