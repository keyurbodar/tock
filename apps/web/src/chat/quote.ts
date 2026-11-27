import { createSignal } from "solid-js"
import { tokens } from "@tock/tokens"

/** A message (or a selection inside one) the next send replies to. ref is the message's durable address from chat/items.ts. */
export interface Quote {
  readonly ref: string
  readonly text: string
}

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
export const withQuote = (quote: Quote | undefined, body: string) => (quote ? `> [${escape(excerpt(quote.text))}](tock-quote:${quote.ref})\n\n${body}` : body)

const LEAD = /^> \[((?:\\.|[^\]\\\n])*)\]\(tock-quote:([^)\s]+)\)[ \t]*(?:\n+|$)/
export function parseQuote(text: string): { ref: string; excerpt: string; body: string } | undefined {
  const match = LEAD.exec(text)
  if (!match) return undefined
  return { ref: match[2]!, excerpt: unescape(match[1]!), body: text.slice(match[0].length) }
}
