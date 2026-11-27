import { createEffect, getOwner, onCleanup, runWithOwner, untrack } from "solid-js"
import type { JSX } from "@solidjs/web"
import { Reveal } from "skullet"
import { tokens } from "@tock/tokens"

/** JSX may arrive lazily (a component call is a function in Solid 2): settle it to one node skullet can lay out. */
function node(value: unknown): Node {
  while (typeof value === "function") value = (value as () => unknown)()
  if (value instanceof Node) return value
  if (!Array.isArray(value)) return document.createTextNode(value == null ? "" : String(value))
  const fragment = document.createDocumentFragment()
  for (const part of value) fragment.append(node(part))
  return fragment
}

type Internals = { options: { id?: string }; memory: { save(): void; destroy(): void } | null; arrival: Promise<void> }

/**
 * The content's own layout as its placeholder (skullet). While `loading`, `sample()` is rendered by the real components, laid out unseen and
 * drawn as bones; when loading ends the real content is revealed into the same box, so nothing moves. `children` must be one element: it is
 * created once and kept, so its refs and effects run as usual. After a reveal (and the text morphs it starts) skullet remembers the shape under
 * `id` with one save, then its watcher stops, so live text inside never re-serialises; the next load under that `id` draws that shape. Without an id nothing is remembered and every load draws the sample.
 */
export function Skeleton(props: { loading: boolean; sample: () => JSX.Element; children: JSX.Element; id?: string; label?: string; fill?: boolean; inline?: boolean; class?: string }) {
  let host!: HTMLDivElement
  let reveal: Reveal | undefined
  let settle: ReturnType<typeof setTimeout> | undefined
  const owner = getOwner()
  const content = untrack(() => node(props.children))
  createEffect(
    () => ({ loading: props.loading, id: props.id, label: props.label, sample: props.sample }),
    ({ loading, id, label, sample }) => {
      if (!loading && !reveal) return void host.append(content)
      reveal ??= new Reveal(host, { label })
      const inside = reveal as unknown as Internals
      inside.options.id = id
      clearTimeout(settle)
      if (loading) {
        content.parentNode?.removeChild(content)
        return void reveal.load(runWithOwner(owner, () => untrack(() => node(sample()))))
      }
      if (content.parentNode?.parentNode === host) return
      reveal.show(content)
      if (!id && inside.memory) {
        inside.memory.save = () => {}
        inside.memory.destroy()
        inside.memory = null
        return
      }
      void inside.arrival.then(() => {
        settle = setTimeout(() => {
          inside.memory?.destroy()
          inside.memory = null
        }, tokens.motion.duration.swap)
      })
    },
  )
  onCleanup(() => {
    clearTimeout(settle)
    reveal?.destroy()
  })
  return <div ref={host} class={`tds-skeleton ${props.class ?? ""}`} data-fill={props.fill ? "" : undefined} data-inline={props.inline ? "" : undefined} />
}
