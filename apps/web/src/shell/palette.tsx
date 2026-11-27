import { createSignal, For, onCleanup, Show } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { Command, CommandEmpty, CommandGroup, CommandGroupLabel, CommandInput, CommandItem, CommandItemIcon, CommandList } from "@ui-sdk/solid/command"
import { Dialog, DialogBackdrop, DialogContent, DialogTitle } from "@ui-sdk/solid/dialog"
import { Icon, type IconName } from "@tock/ui/icon"
import { app, newThreadId, plainText, titleOf } from "../state/app"
import { glyphFor } from "../lib/glyph"
import { shortTime } from "../lib/time"
import { setShortcutsOpen } from "./shortcuts"

const [open, setOpen] = createSignal(false)
export const setPaletteOpen = setOpen

const actions: readonly { value: string; label: string; icon: IconName; keys: readonly string[] }[] = [
  { value: "action:new", label: "New Chat", icon: "note-pencil", keys: ["⌥", "N"] },
  { value: "action:shortcuts", label: "Keyboard Shortcuts", icon: "keyboard", keys: ["?"] },
]

/** ⌘K: one searchable list of what you can do and every chat, as T3Code's CommandPalette (actions first, then threads by recency). */
export function Palette() {
  const navigate = useNavigate()
  const run = (value: string) => {
    setOpen(false)
    if (value === "action:new") return navigate(`/t/${newThreadId()}`)
    if (value === "action:shortcuts") return setShortcutsOpen(true)
    navigate(`/t/${value.slice("chat:".length)}`)
  }
  const onKey = (event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault()
      setOpen((current) => !current)
    }
  }
  addEventListener("keydown", onKey)
  onCleanup(() => removeEventListener("keydown", onKey))
  return (
    <Dialog open={open()} onOpenChange={(next) => setOpen(next)}>
      <DialogBackdrop class="tds-scrim" />
      <DialogContent class="tds-palette tds-over">
        <DialogTitle class="sr-only">Search chats and actions</DialogTitle>
        <Command onAction={(value) => run(String(value))}>
          <div class="tds-palette-search">
            <Icon name="magnifying-glass" size="menu" />
            <CommandInput aria-label="Search chats and actions" placeholder="Search chats and actions" />
          </div>
          <CommandList class="tds-palette-list tds-scroll">
            <CommandEmpty class="tds-palette-empty">No chats or actions match</CommandEmpty>
            <CommandGroup>
              <CommandGroupLabel class="tds-menu-label">Actions</CommandGroupLabel>
              <For each={actions} keyed={false}>
                {(action) => (
                  <CommandItem value={action().value} class="tds-menu-item">
                    <CommandItemIcon class="tds-menu-icon">
                      <Icon name={action().icon} size="menu" />
                    </CommandItemIcon>
                    {action().label}
                    <span class="tds-menu-keys">
                      <For each={action().keys} keyed={false}>{(key) => <kbd class="tds-kbd">{key()}</kbd>}</For>
                    </span>
                  </CommandItem>
                )}
              </For>
            </CommandGroup>
            <Show when={app.sessions.length > 0}>
              <CommandGroup>
                <CommandGroupLabel class="tds-menu-label">Chats</CommandGroupLabel>
                <For each={app.sessions} keyed={(session) => session.id}>
                  {(session) => (
                    <CommandItem value={`chat:${session().id}`} keywords={[plainText(session().preview)]} class="tds-menu-item">
                      <CommandItemIcon class={`tds-menu-icon ${glyphFor(session().id).hue}`}>
                        <Icon name={glyphFor(session().id).icon} size="menu" />
                      </CommandItemIcon>
                      <span class="tds-suggest-label">{titleOf(session())}</span>
                      <span class="tds-suggest-hint">{session().meta.archived ? "Archived" : shortTime(session().updatedAt)}</span>
                    </CommandItem>
                  )}
                </For>
              </CommandGroup>
            </Show>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
