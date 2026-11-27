import { createSignal, For, onCleanup, untrack } from "solid-js"
import { useNavigate, useParams } from "@solidjs/router"
import { Dialog, DialogBackdrop, DialogContent, DialogTitle } from "@ui-sdk/solid/dialog"
import { createAppHotkeyList, createHotkey } from "@tanstack/solid-hotkeys"
import { abort, app, isWorking, newThreadId } from "../state/app"
import { threadAction, selected, setSelected } from "./thread-menu"
import { hidePeek, peeking } from "./peek"
import { appHotkeys, keysFor, sheet, typing } from "./hotkeys"

const overlayOpen = () => document.querySelector("[role=dialog], [role=menu], [role=listbox], .tds-worklog, .tds-centre[data-open], .tds-stack[data-open]") !== null

const [open, setOpen] = createSignal(false)
export const setShortcutsOpen = setOpen

/** Binds the app-wide shortcuts from the registry in ./hotkeys and renders the sheet from the same registry. */
export function Shortcuts() {
  const navigate = useNavigate()
  const params = useParams<{ id?: string }>()
  const live = untrack(createAppHotkeyList)

  const step = (delta: number) => {
    const rows = app.sessions.filter((session) => !session.meta.archived)
    if (rows.length === 0) return
    const at = rows.findIndex((session) => session.id === params.id)
    const next = rows[at < 0 ? 0 : Math.min(rows.length - 1, Math.max(0, at + delta))]
    if (next) navigate(`/t/${next.id}`)
  }
  const current = () => app.sessions.find((session) => session.id === params.id)
  const onChat = (action: "archive" | "unread") => (event: KeyboardEvent) => {
    const session = current()
    if (!session || event.shiftKey) return
    event.preventDefault()
    threadAction(action, session, params.id, navigate)
  }

  createHotkey(appHotkeys["chats.new"], () => navigate(`/t/${newThreadId()}`))
  createHotkey(appHotkeys["chats.previous"], () => step(-1))
  createHotkey(appHotkeys["chats.next"], () => step(1))
  createHotkey(appHotkeys["chat.archive"], onChat("archive"))
  createHotkey(appHotkeys["chat.unread"], onChat("unread"))
  createHotkey(appHotkeys["chat.rename"], (event) => {
    const row = event.target instanceof HTMLElement && event.target.matches(".tds-row") ? event.target : undefined
    const session = row && app.sessions.find((item) => item.id === row.getAttribute("href")?.slice("/t/".length))
    if (!session || event.isComposing) return
    event.preventDefault()
    threadAction("rename", session, params.id, navigate)
  })
  /** Esc stops a run only when nothing on screen took it: overlays close themselves on the same key, so look before they do. */
  let overlayAtEscape = false
  const onEscapeFirst = (event: KeyboardEvent) => void (event.key === "Escape" && (overlayAtEscape = overlayOpen()))
  addEventListener("keydown", onEscapeFirst, { capture: true })
  onCleanup(() => removeEventListener("keydown", onEscapeFirst, { capture: true }))
  createHotkey(appHotkeys["layer.escape"], (event) => {
    if (event.isComposing) return
    if (selected().length) return setSelected([])
    if (peeking()) return hidePeek()
    if (params.id && !overlayAtEscape && isWorking(app.threads[params.id])) return event.preventDefault(), void abort(params.id)
  })
  createHotkey(appHotkeys["help.shortcuts"], (event) => {
    if (typing(event.target) || event.metaKey || event.ctrlKey) return
    event.preventDefault()
    setOpen((value) => !value)
  })

  const status = (ids: readonly string[]) => (ids.every((id) => live().find((item) => item.appHotkey.id === id)?.status === "active") ? "active" : "inactive")

  return (
    <Dialog modal="trap-focus" open={open()} onOpenChange={(next) => setOpen(next)}>
      <DialogBackdrop class="tds-scrim" />
      <DialogContent class="tds-keys tds-over">
        <div class="tds-keys-head">
          <DialogTitle class="tds-dialog-title">Keyboard shortcuts</DialogTitle>
          <span class="tds-kbds">
            <kbd>?</kbd>
          </span>
        </div>
        <For each={sheet} keyed={false}>
          {(entry) => (
            <div class="tds-keys-row" data-hotkeys={entry().ids.join(" ")} data-status={status(entry().ids)}>
              <span>{entry().label}</span>
              <span class="tds-kbds">
                <For each={keysFor(entry().ids)} keyed={false}>{(key) => <kbd>{key()}</kbd>}</For>
              </span>
            </div>
          )}
        </For>
      </DialogContent>
    </Dialog>
  )
}
