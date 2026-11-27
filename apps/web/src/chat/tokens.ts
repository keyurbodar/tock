import { Node, mergeAttributes } from "@tiptap/core"
import type { EditorView } from "@tiptap/pm/view"
import { NodeSelection } from "@tiptap/pm/state"
import type { IconName } from "@tock/ui/icon"
import type { ChipKind } from "./chip"

export interface TokenAttrs {
  readonly kind: Extract<ChipKind, "thread" | "command" | "link" | "file">
  readonly id: string
  readonly label: string
}

const icons: Record<TokenAttrs["kind"], `${IconName}` | `${IconName}:duotone`> = { thread: "chat-circle:duotone", command: "lightning:duotone", link: "link-simple", file: "file-text:duotone" }

/** What a token sends: the model and the transcript read the same markdown link the chips render from. */
export function tokenText(attrs: TokenAttrs) {
  if (attrs.kind === "thread") return `[@${attrs.label.replace(/[[\]]/g, "")}](tock-thread:${attrs.id})`
  if (attrs.kind === "link") return attrs.id
  return attrs.label
}

/** An inline chip in the draft (TDS PxChips "Tokens"): one atom, so it moves and deletes as a unit. */
export const Token = Node.create({
  name: "token",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes: () => ({ kind: { default: "thread" }, id: { default: "" }, label: { default: "" } }),
  parseHTML: () => [{ tag: "span[data-token]", getAttrs: (el) => ({ kind: el.dataset.kind, id: el.dataset.id, label: el.textContent ?? "" }) }],
  renderHTML: ({ node, HTMLAttributes }) => {
    const attrs = node.attrs as TokenAttrs
    if (attrs.kind === "link") {
      const host = attrs.label.split("/")[0] ?? ""
      return [
        "span",
        mergeAttributes(HTMLAttributes, { "data-token": "", "data-kind": "link", "data-id": attrs.id, class: "tds-chip tds-link-token", contenteditable: "false" }),
        ["span", { class: "tds-token-fav", "data-letter": host.charAt(0).toUpperCase(), "aria-hidden": "true" }, ["img", { src: `https://${host}/favicon.ico`, alt: "", draggable: "false", loading: "lazy" }]],
        ["span", { class: "tds-chip-label" }, attrs.label],
      ]
    }
    const label = attrs.kind === "command" ? `/${attrs.label}` : attrs.label
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-token": "", "data-kind": attrs.kind, "data-id": attrs.id, class: "tds-chip", contenteditable: "false", style: `--tds-chip-accent: var(--tds-chip-${attrs.kind})` }),
      ["svg", { class: "tds-icon tds-chip-icon", "aria-hidden": "true" }, ["use", { href: `#i-${icons[attrs.kind]}` }]],
      ["span", { class: "tds-chip-label" }, label],
    ]
  },
  renderText: ({ node }) => tokenText(node.attrs as TokenAttrs),
})

/** The first Backspace after a token selects it; the second deletes it. */
export function selectTokenBefore(view: EditorView): boolean {
  const { selection } = view.state
  if (!selection.empty) return false
  const before = selection.$from.nodeBefore
  if (before?.type.name !== "token") return false
  view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, selection.from - before.nodeSize)))
  return true
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
