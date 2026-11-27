import { Extension } from "@tiptap/core"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"
import { tokens } from "@tock/tokens"
import { codeRanges } from "./code"

const key = new PluginKey<DecorationSet>("tds-code-highlight")

/** Colours every fence in the draft as you type, after T3Code's composerCodeBlockHighlight: one cache entry per block's language and text, so a keystroke re-tokenizes only the block it lands in. */
export const CodeHighlight = Extension.create({
  name: "codeHighlight",
  addProseMirrorPlugins() {
    const cache = new Map<string, ReturnType<typeof codeRanges>>()
    const build = (doc: ProseMirrorNode) => {
      const live = new Set<string>()
      const all: Decoration[] = []
      doc.descendants((node, pos) => {
        if (node.type.name !== "codeBlock") return true
        const text = node.textContent
        if (text.length > tokens.limit["code-highlight"]) return false
        const signature = `${node.attrs.language ?? ""}\u0000${text}`
        live.add(signature)
        let ranges = cache.get(signature)
        if (!ranges) {
          ranges = codeRanges(text, node.attrs.language as string | null)
          cache.set(signature, ranges)
        }
        for (const range of ranges) all.push(Decoration.inline(pos + 1 + range.from, pos + 1 + range.to, { class: `sh__token--${range.type}`, style: `color: var(--sh-${range.type})` }))
        return false
      })
      for (const signature of cache.keys()) if (!live.has(signature)) cache.delete(signature)
      return DecorationSet.create(doc, all)
    }
    return [
      new Plugin<DecorationSet>({
        key,
        state: {
          init: (_, state) => build(state.doc),
          apply: (tr, value) => (tr.docChanged ? build(tr.doc) : value),
        },
        props: { decorations: (state) => key.getState(state) },
      }),
    ]
  },
})
