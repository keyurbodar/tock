import type { EditorView } from "@tiptap/pm/view"
import type { ChipKind } from "./chip"

export interface TokenAttrs {
  readonly kind: Extract<ChipKind, "thread" | "command" | "link" | "file" | "skill">
  readonly id: string
  readonly label: string
}

/** What a token sends: the model and the transcript read the same markdown link the chips render from. */
export function tokenText(attrs: TokenAttrs) {
  if (attrs.kind === "thread") return `[@${attrs.label.replace(/[[\]]/g, "")}](tock-thread:${attrs.id})`
  if (attrs.kind === "link") return attrs.id
  if (attrs.kind === "skill") return `[${attrs.label}](tock-skill:${attrs.id})`
  return attrs.label
}

export interface Trigger {
  readonly char: "@" | "/"
  readonly query: string
  readonly from: number
  readonly to: number
}

/** The @ or / the caret is typing after, if any: it must start the line or follow a space. */
export function triggerAt(view: EditorView): Trigger | null {
  const { selection } = view.state
  if (!selection.empty) return null
  const { $from } = selection
  const text = $from.parent.textBetween(0, $from.parentOffset, undefined, "\ufffc")
  const match = /(?:^|\s)([@/])([^\s@/\ufffc]{0,40})$/.exec(text)
  if (!match) return null
  if (match[1] === "/" && text.slice(0, match.index).trim() !== "") return null
  const query = match[2]!
  return { char: match[1] as "@" | "/", query, from: selection.from - query.length - 1, to: selection.from }
}

const URL_TYPED = /(?:^|\s)(https?:\/\/[^\s\ufffc]+[^\s\ufffc.,;:!?)'"])\s$/

/** A URL followed by a space becomes a link chip, as TDS PxChips "Typed". */
export function linkTyped(view: EditorView): boolean {
  const { selection } = view.state
  if (!selection.empty) return false
  const { $from } = selection
  const text = $from.parent.textBetween(0, $from.parentOffset, undefined, "\ufffc")
  const match = URL_TYPED.exec(text)
  if (!match) return false
  const href = match[1]!
  const end = selection.from - 1
  const start = end - href.length
  const attrs = linkToken(href)
  if (!attrs) return false
  const node = view.state.schema.nodes.token!.create(attrs)
  view.dispatch(view.state.tr.replaceWith(start, end, node))
  return true
}

/** A URL as a link token: host and path, no scheme or trailing slash. */
export function linkToken(href: string): TokenAttrs | null {
  try {
    const url = new URL(href)
    return { kind: "link", id: href, label: (url.hostname.replace(/^www\./, "") + url.pathname).replace(/\/$/, "") }
  } catch {
    return null
  }
}
