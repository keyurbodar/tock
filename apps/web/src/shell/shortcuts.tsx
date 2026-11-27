import { createSignal, For, onCleanup } from "solid-js"
import { useNavigate, useParams } from "@solidjs/router"
import { Dialog, DialogBackdrop, DialogContent, DialogTitle } from "@ui-sdk/solid/dialog"
import { abort, app, isWorking, newThreadId } from "../state/app"
import { threadAction } from "./thread-menu"

const mac = /Mac|iPhone|iPad/.test(navigator.platform)
const mod = mac ? "⌘" : "Ctrl"
const alt = mac ? "⌥" : "Alt"

/** TDS px2 keys(): the same list, in the same order. New chat sits on ⌥N because browsers keep ⌘N for a window. */
const list: readonly (readonly [string, readonly string[]])[] = [
  ["Search chats", [mod, "K"]],
  ["New chat", [alt, "N"]],
  ["Previous or next chat", [alt, "↑", "↓"]],
  ["Rename the chat", ["↵"]],
  ["Archive", [mod, "E"]],
  ["Mark as unread", [mod, "U"]],
  ["Attach files", [mod, "O"]],
  ["Stop toast", ["esc"]],
  ["Keyboard shortcuts", ["?"]],
]

const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA")
const overlayOpen = () => document.querySelector("[role=dialog], [role=menu], .tds-worklog") !== null

const [open, setOpen] = createSignal(false)
export const setShortcutsOpen = setOpen

export function Shortcuts() {
  const navigate = useNavigate()
  const params = useParams<{ id?: string }>()

  const step = (delta: number) => {
    const rows = app.sessions.filter((session) => !session.meta.archived)
    if (rows.length === 0) return
    const at = rows.findIndex((session) => session.id === params.id)
    const next = rows[at < 0 ? 0 : Math.min(rows.length - 1, Math.max(0, at + delta))]
    if (next) navigate(`/t/${next.id}`)
  }
  const current = () => app.sessions.find((session) => session.id === params.id)

  const onKey = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing) return
    const command = event.metaKey || event.ctrlKey
    if (event.altKey && event.code === "KeyN") return event.preventDefault(), navigate(`/t/${newThreadId()}`)
    if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) return event.preventDefault(), step(event.key === "ArrowUp" ? -1 : 1)
    if (command && !event.shiftKey && (event.code === "KeyE" || event.code === "KeyU")) {
      const session = current()
      if (!session) return
      event.preventDefault()
      return threadAction(event.code === "KeyE" ? "archive" : "unread", session, params.id, navigate)
    }
    if (event.key === "Enter" && event.target instanceof HTMLElement && event.target.matches(".tds-row")) {
      const session = app.sessions.find((item) => event.target instanceof HTMLElement && item.id === event.target.getAttribute("href")?.slice("/t/".length))
      if (!session) return
      event.preventDefault()
      return threadAction("rename", session, params.id, navigate)
    }
    if (event.key === "Escape" && params.id && !overlayOpen() && isWorking(app.threads[params.id])) return event.preventDefault(), void abort(params.id)
    if (event.key === "?" && !typing(event.target) && !command) return event.preventDefault(), setOpen((value) => !value)
  }
  addEventListener("keydown", onKey)
  onCleanup(() => removeEventListener("keydown", onKey))

  return (
    <Dialog open={open()} onOpenChange={(next) => setOpen(next)}>
      <DialogBackdrop class="tds-scrim" />
      <DialogContent class="tds-keys tds-over">
        <div class="tds-keys-head">
          <DialogTitle class="tds-dialog-title">Keyboard shortcuts</DialogTitle>
          <span class="tds-kbds">
            <kbd>?</kbd>
          </span>
        </div>
        <For each={list} keyed={false}>
          {(entry) => (
            <div class="tds-keys-row">
              <span>{entry()[0]}</span>
              <span class="tds-kbds">
                <For each={entry()[1]} keyed={false}>{(key) => <kbd>{key()}</kbd>}</For>
              </span>
            </div>
          )}
        </For>
      </DialogContent>
    </Dialog>
  )
}
