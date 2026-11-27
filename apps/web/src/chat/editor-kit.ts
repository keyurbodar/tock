import { Extension, Node, mergeAttributes } from "@tiptap/core"
import { NodeSelection, Plugin, Selection, type EditorState as State } from "@tiptap/pm/state"
import type { EditorView } from "@tiptap/pm/view"
import type { IconName } from "@tock/ui/icon"
import { iconUrl } from "./link"
import { tokenText, type TokenAttrs } from "./tokens"

/** Everything the composer's editor needs, in one chunk the composer loads after first paint (TipTap and ProseMirror stay out of the initial JS). */
export { Editor } from "@tiptap/core"
export { default as StarterKit } from "@tiptap/starter-kit"
export { Markdown } from "@tiptap/markdown"
export { Placeholder } from "@tiptap/extensions"
export { EditorState } from "@tiptap/pm/state"
export { Fragment, Slice } from "@tiptap/pm/model"
export { CodeHighlight } from "./code-highlight"
export { convertCodeFenceOnEnter, exitCodeBlockOnClosingFence, linkSelection, RichTextExtensions, splitOrLiftListItem } from "./rich-text"

const SVG = "http://www.w3.org/2000/svg svg"

const icons: Record<Exclude<TokenAttrs["kind"], "link">, `${IconName}:duotone`> = { thread: "chat-circle:duotone", command: "lightning:duotone", file: "file-text:duotone", skill: "sparkle:duotone" }

/**
 * An inline chip in the draft (TDS PxChips "Tokens"): one atom, so it moves and deletes as a unit. Same markup as a sent
 * chip (chip.tsx): the 14px slot, then the label; every kind but a command opens the shared hover card.
 */
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
    const host = attrs.kind === "link" ? (attrs.label.split("/")[0] ?? "") : ""
    const slot =
      attrs.kind === "link"
        ? ["span", { class: "tds-chip-slot", "aria-hidden": "true" }, [SVG, { class: "tds-icon tds-link-fav-glyph" }, ["use", { href: "#i-globe" }]], ["img", { src: iconUrl(host), alt: "", draggable: "false", decoding: "async", "data-host": host }]]
        : ["span", { class: "tds-chip-slot", "aria-hidden": "true" }, [SVG, { class: "tds-icon" }, ["use", { href: `#i-${icons[attrs.kind]}` }]]]
    const card = attrs.kind === "command" ? {} : { "data-card": attrs.kind, "data-card-id": attrs.id, "data-card-label": attrs.label }
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-token": "", "data-kind": attrs.kind, "data-id": attrs.id, ...card, class: attrs.kind === "link" ? "tds-chip tds-link-token" : "tds-chip", contenteditable: "false", style: `--tds-chip-accent: var(--tds-chip-${attrs.kind})` }),
      slot,
      ["span", { class: "tds-chip-label" }, attrs.kind === "command" ? `/${attrs.label}` : attrs.label],
    ]
  },
  renderText: ({ node }) => tokenText(node.attrs as TokenAttrs),
  renderMarkdown: (node) => tokenText(node.attrs as TokenAttrs),
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

const touchesCode = (state: State) => {
  const code = state.schema.marks.code
  const { $from } = state.selection
  return !!code && [$from.nodeBefore, $from.nodeAfter].some((node) => node && code.isInSet(node.marks))
}

/**
 * Inline code never traps the caret: clearing the last code character drops the code mark instead of keeping it for the next keystroke,
 * typing over a selection that starts where code starts replaces it with plain text, and typing a backtick while in code steps out of it
 * (ArrowRight at the end already exits, as the mark is exitable).
 */
export const CodeExit = Extension.create({
  name: "codeExit",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleTextInput(view, from, to, text) {
            const code = view.state.schema.marks.code
            if (text !== "`" || from !== to || !code) return false
            const active = (view.state.storedMarks ?? view.state.selection.$from.marks()).some((mark) => mark.type === code)
            if (!active) return false
            view.dispatch(view.state.tr.removeStoredMark(code))
            return true
          },
        },
        appendTransaction(transactions, before, after) {
          const code = after.schema.marks.code
          if (!code || !transactions.some((tr) => tr.docChanged) || !after.selection.empty) return null
          const { empty } = before.selection
          const start = Selection.findFrom(before.selection.$from, 1, true)?.$from ?? before.selection.$from
          const end = Selection.findFrom(before.selection.$to, -1, true)?.$to ?? before.selection.$to
          if (!empty && !before.storedMarks && code.isInSet(start.marksAcross(end) ?? []) && !(start.nodeBefore && code.isInSet(start.nodeBefore.marks))) {
            const from = transactions.reduce((pos, tr) => tr.mapping.map(pos, -1), start.pos)
            if (after.selection.from > from && after.doc.rangeHasMark(from, after.selection.from, code)) return after.tr.removeMark(from, after.selection.from, code).setStoredMarks(code.removeFromSet(after.selection.$from.marks()))
          }
          const stored = after.storedMarks ?? after.selection.$from.marks()
          if (!stored.some((mark) => mark.type === code) || touchesCode(after) || !touchesCode(before)) return null
          return after.tr.setStoredMarks(stored.filter((mark) => mark.type !== code))
        },
      }),
    ]
  },
})
