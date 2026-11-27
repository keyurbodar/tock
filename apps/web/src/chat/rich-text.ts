import { Extension, InputRule, wrappingInputRule, type Editor } from "@tiptap/core"
import { Blockquote } from "@tiptap/extension-blockquote"
import { CodeBlock } from "@tiptap/extension-code-block"
import { Heading } from "@tiptap/extension-heading"
import { HorizontalRule } from "@tiptap/extension-horizontal-rule"
import { BulletList, ListItem, OrderedList } from "@tiptap/extension-list"
import { TaskItem } from "@tiptap/extension-task-item"
import { TaskList } from "@tiptap/extension-task-list"
import { Fragment, type Node as ProseMirrorNode, type NodeType } from "@tiptap/pm/model"
import { Plugin, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state"

/** What you type is what is sent: text goes out as typed, never backslash-escaped or entity-encoded (t3code serializes source the same way, composer-rich-text-doc.ts serializeEditorDoc). */
export const SourceText = Extension.create({
  name: "sourceText",
  onCreate() {
    const manager = this.editor.markdown as unknown as { encodeTextForMarkdown: (text: string) => string } | undefined
    if (manager) manager.encodeTextForMarkdown = (text) => text
  },
})

/** t3code ComposerPromptEditorTiptap.tsx listMarkerInputRule: `- ` waits for the next character so `- [ ] ` reaches the task rule first; only top-level paragraphs, as nested lists serialize flat. */
function listMarkerInputRule(find: RegExp, listType: "bulletList" | "orderedList"): InputRule {
  return new InputRule({
    find,
    handler: ({ state, range, match, chain }) => {
      const marker = match.groups?.marker ?? "-"
      const carried = match.groups?.carried ?? ""
      const $from = state.doc.resolve(range.from)
      if ($from.parent.type.name !== "paragraph" || $from.depth !== 1) return null
      const command = chain().deleteRange(range).wrapInList(listType, listType === "orderedList" ? { start: Number.parseInt(marker, 10) || 1 } : {})
      ;(carried ? command.insertContent(carried) : command).run()
      return undefined
    },
  })
}

/** t3code composer-rich-text-doc.ts convertBulletItemToTask: `[ ] ` at the start of a bullet turns that item into a task. */
function convertBulletItemToTask(tr: Transaction, from: number, to: number, checked: boolean) {
  tr.delete(from, to)
  const $pos = tr.doc.resolve(from)
  const item = $pos.node(-1)
  const list = $pos.node(-2)
  const index = $pos.index(-2)
  const { schema } = tr.doc.type
  const before: ProseMirrorNode[] = []
  const after: ProseMirrorNode[] = []
  list.forEach((child, _, childIndex) => {
    if (childIndex < index) before.push(child)
    else if (childIndex > index) after.push(child)
  })
  const lists = [
    ...(before.length > 0 ? [list.copy(Fragment.from(before))] : []),
    schema.nodes.taskList!.create(null, schema.nodes.taskItem!.create({ checked }, item.content)),
    ...(after.length > 0 ? [list.copy(Fragment.from(after))] : []),
  ]
  const listStart = $pos.before(-2)
  tr.replaceWith(listStart, listStart + list.nodeSize, lists)
  tr.setSelection(TextSelection.create(tr.doc, listStart + (before.length > 0 ? lists[0]!.nodeSize : 0) + 3))
}

/** t3code ComposerPromptEditorTiptap.tsx bulletToTaskInputRule. */
const bulletToTaskInputRule = new InputRule({
  find: /^\[([ xX])\] $/,
  handler: ({ state, range, match, chain }) => {
    const $from = state.doc.resolve(range.from)
    if ($from.parent.type.name !== "paragraph" || $from.node(-1)?.type.name !== "listItem" || $from.node(-2)?.type.name !== "bulletList") return null
    const checked = (match[1] ?? " ").toLowerCase() === "x"
    chain().command(({ tr }) => (convertBulletItemToTask(tr, range.from, range.to, checked), true)).run()
    return undefined
  },
})

/** t3code ComposerPromptEditorTiptap.tsx taskInputRule. */
function taskInputRule(type: NodeType): InputRule {
  const rule = wrappingInputRule({ find: /^- \[([ xX])\] $/, type, getAttributes: (match) => ({ checked: match[1]?.toLowerCase() === "x" }) })
  return new InputRule({ find: rule.find, handler: (props) => (props.state.doc.resolve(props.range.from).depth === 1 ? rule.handler(props) : null) })
}

/** t3code ComposerPromptEditorTiptap.tsx blockquoteInputRule. */
const blockquoteInputRule = new InputRule({
  find: /^>(\s)$/,
  handler: ({ state, range, chain }) => {
    const $from = state.doc.resolve(range.from)
    if ($from.parent.type.name !== "paragraph" || $from.depth !== 1) return null
    chain().deleteRange(range).wrapIn("blockquote").run()
    return undefined
  },
})

/** t3code ComposerPromptEditorTiptap.tsx horizontalRuleInputRule: *** and ___ need a trailing space so bold typing survives. */
const horizontalRuleInputRule = new InputRule({
  find: /^(---|\*\*\*|___)\s?$/,
  handler: ({ state, range, match, chain }) => {
    const source = match[0] ?? "---"
    if (!source.startsWith("---") && !/\s$/.test(source)) return null
    const $from = state.doc.resolve(range.from)
    if ($from.parent.type.name !== "paragraph" || $from.depth !== 1) return null
    chain().deleteRange(range).setHorizontalRule().run()
    return undefined
  },
})

/** t3code ComposerPromptEditorTiptap.tsx headingInputRule: a space is required, so an issue reference stays text. */
const headingInputRule = new InputRule({
  find: /^(#{1,3})(\s)$/,
  handler: ({ state, range, match, chain }) => {
    const $from = state.doc.resolve(range.from)
    if ($from.parent.type.name !== "paragraph" || $from.depth !== 1) return null
    chain().deleteRange(range).setNode("heading", { level: match[1]?.length ?? 1 }).run()
    return undefined
  },
})

/** \`\`\`lang and a space opens a code block too, but only at the top level: lists and quotes cannot serialize fences (t3code ComposerPromptEditorTiptap.tsx drops Tiptap's rule for this reason). */
const fenceSpaceInputRule = new InputRule({
  find: /^(`{3,}|~{3,})([\w-]*)\s$/,
  handler: ({ state, range, match, chain }) => {
    const $from = state.doc.resolve(range.from)
    if ($from.parent.type.name !== "paragraph" || $from.depth !== 1) return null
    chain().deleteRange(range).setNode("codeBlock", { language: match[2] || null }).run()
    return undefined
  },
})

const LINK = /\[([^\]\n]+)\]\(((?:https?:\/\/|mailto:)[^)\s]+)\)/g

/** `[text](url)` becomes a link once the caret is not inside it, whether typed, pasted or wrapped by Mod-K. */
const LinkSource = Extension.create({
  name: "linkSource",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction(transactions, _, state) {
          const link = state.schema.marks.link
          if (!link || !transactions.some((tr) => tr.docChanged)) return null
          const tr = state.tr
          const caret = state.selection.empty ? state.selection.from : -1
          state.doc.descendants((node, pos) => {
            if (!node.isTextblock) return true
            if (node.type.spec.code) return false
            const text = node.textBetween(0, node.content.size, undefined, "\ufffc")
            for (const match of text.matchAll(LINK)) {
              const from = pos + 1 + match.index
              const to = from + match[0].length
              if (caret > from && caret < to) continue
              if (state.doc.rangeHasMark(from, to, link) || state.doc.rangeHasMark(from, to, state.schema.marks.code!)) continue
              const at = tr.mapping.map(from)
              tr.replaceWith(at, tr.mapping.map(to), state.schema.text(match[1]!, [link.create({ href: match[2] })]))
            }
            return false
          })
          return tr.docChanged ? tr.removeStoredMark(link) : null
        },
      }),
    ]
  },
})

/** Mod-K wraps the selection as `[selection](|)`; the link forms when the caret leaves it. Without a selection it opens `[|]()`. */
export function linkSelection(editor: Editor): boolean {
  const { state } = editor
  if (state.selection.$from.parent.type.spec.code || editor.isActive("code")) return false
  const { from, to, empty } = state.selection
  const label = state.doc.textBetween(from, to, " ")
  const tr = state.tr.insertText(empty ? "[]()" : `[${label}]()`, from, to)
  editor.view.dispatch(tr.setSelection(TextSelection.create(tr.doc, from + (empty ? 1 : label.length + 3))))
  return true
}

const noChords = () => ({})

export const RichTextExtensions = [
  Blockquote.extend({ content: "paragraph+", addInputRules: () => [blockquoteInputRule], addKeyboardShortcuts: noChords }),
  HorizontalRule.extend({ addInputRules: () => [horizontalRuleInputRule] }),
  Heading.extend({ addInputRules: () => [headingInputRule], addKeyboardShortcuts: noChords }).configure({ levels: [1, 2, 3] }),
  BulletList.extend({
    addInputRules: () => [listMarkerInputRule(/^(?<marker>[*+])(?<space>\s)$/, "bulletList"), listMarkerInputRule(/^(?<marker>-)(?<space>[ \t]+)(?<carried>[^\s[])$/, "bulletList")],
    addKeyboardShortcuts: noChords,
  }),
  OrderedList.extend({ addInputRules: () => [listMarkerInputRule(/^(?<marker>\d+[.)])(?<space>\s)$/, "orderedList")], addKeyboardShortcuts: noChords }),
  ListItem,
  TaskList.extend({ addKeyboardShortcuts: noChords }),
  TaskItem.extend({
    addInputRules() {
      return [taskInputRule(this.type), bulletToTaskInputRule]
    },
  }).configure({ nested: true }),
  CodeBlock.extend({ addInputRules: () => [fenceSpaceInputRule] }).configure({ HTMLAttributes: { "data-edge-fade": "both" } }),
  LinkSource,
  SourceText,
]

/** t3code composer-rich-text-doc.ts parseOpeningFence. */
export function parseOpeningFence(line: string): { fence: string; language: string } | null {
  const match = /^(`{3,}|~{3,})([^\n]*)$/.exec(line)
  if (!match) return null
  const fence = match[1]!
  const language = match[2]!.trim()
  if (fence.startsWith("`") && language.includes("`")) return null
  return { fence, language }
}

/** t3code composer-code-block.ts convertCodeFenceOnEnter: Enter at the end of a top-level \`\`\`lang line opens a code block instead of sending. */
export function convertCodeFenceOnEnter(state: EditorState, dispatch?: (transaction: Transaction) => void): boolean {
  const { $from, empty } = state.selection
  if (!empty || $from.parent.type.name !== "paragraph" || $from.depth !== 1) return false
  if ($from.parentOffset !== $from.parent.content.size) return false
  const opening = parseOpeningFence($from.parent.textContent)
  const codeBlock = state.schema.nodes.codeBlock
  if (!opening || !codeBlock) return false
  if (dispatch) {
    const blockStart = $from.before()
    const transaction = state.tr.replaceWith(blockStart, blockStart + $from.parent.nodeSize, codeBlock.create({ language: opening.language || null }))
    transaction.setSelection(TextSelection.create(transaction.doc, blockStart + 1))
    dispatch(transaction.scrollIntoView())
  }
  return true
}

/** t3code composer-code-block.ts exitCodeBlockOnClosingFence: a closing fence typed on the last line closes the block. */
export function exitCodeBlockOnClosingFence(state: EditorState, dispatch?: (transaction: Transaction) => void): boolean {
  const { $from, empty } = state.selection
  if (!empty || $from.parent.type.name !== "codeBlock" || $from.parentOffset !== $from.parent.content.size) return false
  const text = $from.parent.textContent
  const lineStart = text.lastIndexOf("\n") + 1
  if (!/^(`{3,}|~{3,})[ \t]*$/.test(text.slice(lineStart))) return false
  if (dispatch) {
    const { schema } = state
    const code = text.slice(0, Math.max(0, lineStart - 1))
    const start = $from.before()
    const closed = $from.parent.type.create($from.parent.attrs, code ? schema.text(code) : null)
    const transaction = state.tr.replaceWith(start, start + $from.parent.nodeSize, [closed, schema.nodes.paragraph!.create()])
    transaction.setSelection(TextSelection.create(transaction.doc, start + closed.nodeSize + 1))
    dispatch(transaction.scrollIntoView())
  }
  return true
}

/** t3code composer-rich-text-doc.ts splitOrLiftListItem: a new item, or out of the list from an empty one. */
export function splitOrLiftListItem(editor: Editor): boolean {
  const $from = editor.state.selection.$from
  const name = $from.depth > 1 ? $from.node(-1).type.name : null
  if (name !== "listItem" && name !== "taskItem") return false
  const empty = $from.parent.content.size === 0
  return empty ? editor.commands.liftListItem(name) : editor.commands.splitListItem(name, name === "taskItem" ? { checked: false } : undefined)
}
