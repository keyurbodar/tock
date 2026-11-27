import { createMemo, createSignal, For, Show } from "solid-js"
import { Dialog, DialogBackdrop, DialogContent, DialogTitle } from "@ui-sdk/solid/dialog"
import { Icon } from "@tock/ui/icon"
import { app, titleOf, updateThread } from "../state/app"
import { moving, setMoving } from "./thread-menu"
import { toast } from "./toasts"

interface Choice {
  readonly key: string
  readonly name: string
  readonly count: number
  readonly fresh: boolean
}

/** Move to…, TDS px2 Dialogs.move: a 420 menu dialog with a search row, folders with counts, New Folder, and key hints. */
export function MoveDialog() {
  const [query, setQuery] = createSignal("")
  const [index, setIndex] = createSignal(0)
  const choices = createMemo<Choice[]>(() => {
    const counts = new Map<string, number>()
    for (const session of app.sessions) if (session.meta.folder) counts.set(session.meta.folder, (counts.get(session.meta.folder) ?? 0) + 1)
    const q = query().trim()
    const hits = [...counts].filter(([name]) => name.toLowerCase().includes(q.toLowerCase())).map(([name, count]) => ({ key: `f:${name}`, name, count, fresh: false }))
    const exact = hits.some((hit) => hit.name.toLowerCase() === q.toLowerCase())
    return q && !exact ? [...hits, { key: `n:${q}`, name: q, count: 0, fresh: true }] : hits
  })
  const close = () => (setMoving(undefined), setQuery(""), setIndex(0))
  const pick = (choice: Choice | undefined) => {
    const session = moving()
    if (!choice || !session) return
    void updateThread(session.id, { folder: choice.name })
    toast(`Moved to ${choice.name}`, { description: titleOf(session), icon: "folder-simple" })
    close()
  }
  return (
    <Dialog open={moving() !== undefined} onOpenChange={(next) => !next && close()}>
      <DialogBackdrop class="tds-palette-scrim" />
      <DialogContent class="tds-move tds-over">
        <DialogTitle class="sr-only">Move to a folder</DialogTitle>
        <div class="tds-move-search">
          <Icon name="magnifying-glass" size="menu" />
          <input
            ref={(el) => queueMicrotask(() => el.focus())}
            value={query()}
            placeholder={`Move “${titleOf(moving())}” to…`}
            aria-label="Folder name"
            onInput={(e) => (setQuery(e.currentTarget.value), setIndex(0))}
            onKeyDown={(e) => {
              const count = choices().length
              if (e.key === "ArrowDown" && count) (e.preventDefault(), setIndex((i) => (i + 1) % count))
              if (e.key === "ArrowUp" && count) (e.preventDefault(), setIndex((i) => (i - 1 + count) % count))
              if (e.key === "Enter") (e.preventDefault(), pick(choices()[index()]))
            }}
          />
        </div>
        <div class="tds-move-list tds-scroll" data-edge-fade="y" data-material="solid" role="listbox" aria-label="Folders">
          <div class="tds-move-head">Folders</div>
          <Show when={choices().length > 0} fallback={<div class="tds-move-empty">Type a name to make a folder</div>}>
            <For each={choices()} keyed={(choice) => choice.key}>
              {(choice, i) => (
                <div
                  class="tds-move-item"
                  role="option"
                  aria-selected={index() === i() ? "true" : "false"}
                  data-on={index() === i() ? "" : undefined}
                  onPointerEnter={() => setIndex(i())}
                  onClick={() => pick(choice())}
                >
                  <Icon name={choice().fresh ? "plus" : "folder-simple"} size="menu" />
                  <span>{choice().fresh ? `New Folder “${choice().name}”` : choice().name}</span>
                  <Show when={!choice().fresh}>
                    <span class="tds-move-trail num">{moving()?.meta.folder === choice().name ? "Here now" : `${choice().count} chats`}</span>
                  </Show>
                </div>
              )}
            </For>
          </Show>
        </div>
        <div class="tds-palette-foot" aria-hidden="true">
          <span>
            <span class="tds-kbds"><kbd>↑</kbd><kbd>↓</kbd></span> Move
          </span>
          <span>
            <span class="tds-kbds"><kbd>↵</kbd></span> Choose
          </span>
          <span>
            <span class="tds-kbds"><kbd>esc</kbd></span> Close
          </span>
        </div>
      </DialogContent>
    </Dialog>
  )
}
