import { createSignal, For, onCleanup } from "solid-js"
import { useNavigate, useParams } from "@solidjs/router"
import { Dialog, DialogBackdrop, DialogContent, DialogTitle } from "@ui-sdk/solid/dialog"
import { app, newThreadId } from "../state/app"

const mac = /Mac|iPhone|iPad/.test(navigator.platform)
const mod = mac ? "⌘" : "Ctrl"
const alt = mac ? "⌥" : "Alt"

const list: readonly (readonly [string, readonly string[]])[] = [
  ["Search chats", [mod, "K"]],
  ["New chat", [alt, "N"]],
  ["Previous or next chat", [alt, "↑", "↓"]],
  ["Send", ["↵"]],
  ["New line", ["⇧", "↵"]],
  ["Close a panel or menu", ["esc"]],
  ["Keyboard shortcuts", ["?"]],
]

const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA")

export function Shortcuts() {
  const navigate = useNavigate()
  const params = useParams<{ id?: string }>()
  const [open, setOpen] = createSignal(false)

  const step = (delta: number) => {
    const rows = app.sessions.filter((session) => !session.meta.archived)
    if (rows.length === 0) return
    const at = rows.findIndex((session) => session.id === params.id)
    const next = rows[at < 0 ? 0 : Math.min(rows.length - 1, Math.max(0, at + delta))]
    if (next) navigate(`/t/${next.id}`)
  }

  const onKey = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing) return
    if (event.altKey && event.code === "KeyN") return event.preventDefault(), navigate(`/t/${newThreadId()}`)
    if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) return event.preventDefault(), step(event.key === "ArrowUp" ? -1 : 1)
    if (event.key === "?" && !typing(event.target) && !event.metaKey && !event.ctrlKey) return event.preventDefault(), setOpen((value) => !value)
  }
  addEventListener("keydown", onKey)
  onCleanup(() => removeEventListener("keydown", onKey))

  return (
    <Dialog open={open()} onOpenChange={(next) => setOpen(next)}>
      <DialogBackdrop class="tds-scrim" />
      <DialogContent class="tds-keys">
        <div class="tds-keys-head">
          <DialogTitle class="tds-dialog-title">Keyboard shortcuts</DialogTitle>
          <kbd class="tds-kbd">?</kbd>
        </div>
        <For each={list} keyed={false}>
          {(entry) => (
            <div class="tds-keys-row">
              <span>{entry()[0]}</span>
              <span class="tds-keys-combo">
                <For each={entry()[1]} keyed={false}>{(key) => <kbd class="tds-kbd">{key()}</kbd>}</For>
              </span>
            </div>
          )}
        </For>
      </DialogContent>
    </Dialog>
  )
}
