import { createSignal, For, onCleanup, Show } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { Command, CommandEmpty, CommandGroup, CommandGroupLabel, CommandInput, CommandItem, CommandList } from "@ui-sdk/solid/command"
import { Dialog, DialogBackdrop, DialogContent, DialogTitle } from "@ui-sdk/solid/dialog"
import { Icon, type IconName } from "@tock/ui/icon"
import { Orb } from "@tock/ui/orb"
import { tokens } from "@tock/tokens"
import { app, newThreadId, plainText, titleOf } from "../state/app"
import { glyphFor } from "../lib/glyph"
import { shortTime } from "../lib/time"
import { now } from "../lib/clock"
import { setShortcutsOpen } from "./shortcuts"

const [open, setOpen] = createSignal(false)
export const setPaletteOpen = setOpen

const actions: readonly { value: string; label: string; icon: IconName; keys: readonly string[] }[] = [
  { value: "action:new", label: "New chat", icon: "note-pencil", keys: ["⌥", "N"] },
  { value: "action:shortcuts", label: "Keyboard shortcuts", icon: "keyboard", keys: ["?"] },
]

function Keys(props: { keys: readonly string[] }) {
  return (
    <span class="tds-kbds">
      <For each={props.keys} keyed={false}>{(key) => <kbd>{key()}</kbd>}</For>
    </span>
  )
}

/**
 * ⌘K, TDS SysPalette: one glass sheet, 560 wide, that appears at once because people open it all day. Type to filter,
 * arrows to move, Return opens (the row flashes rose), esc closes. Groups are separated by space, never rules.
 */
export function Palette() {
  const navigate = useNavigate()
  const [hit, setHit] = createSignal<string>()
  const run = (value: string) => {
    setHit(value)
    setTimeout(() => {
      setHit(undefined)
      setOpen(false)
      if (value === "action:new") return navigate(`/t/${newThreadId()}`)
      if (value === "action:shortcuts") return setShortcutsOpen(true)
      navigate(`/t/${value.slice("chat:".length)}`)
    }, tokens.motion.duration["palette-hit"])
  }
  const onKey = (event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault()
      setOpen((current) => !current)
    }
  }
  addEventListener("keydown", onKey)
  onCleanup(() => removeEventListener("keydown", onKey))
  const sessions = () => app.sessions.filter((session) => !session.meta.archived)
  return (
    <Dialog open={open()} onOpenChange={(next) => setOpen(next)}>
      <DialogBackdrop class="tds-palette-scrim" />
      <DialogContent class="tds-palette tds-over">
        <DialogTitle class="sr-only">Search or run a command</DialogTitle>
        <Command onAction={(value) => run(String(value))}>
          <div class="tds-palette-search">
            <Icon name="magnifying-glass" size="menu" />
            <CommandInput aria-label="Search or run a command" placeholder="Search or run a command" />
          </div>
          <CommandList class="tds-palette-list tds-scroll">
            <CommandEmpty class="tds-palette-empty">No matches. Try a chat name or a command.</CommandEmpty>
            <CommandGroup>
              <CommandGroupLabel class="tds-palette-label">Actions</CommandGroupLabel>
              <For each={actions} keyed={false}>
                {(action) => (
                  <CommandItem value={action().value} class="tds-palette-item" data-hit={hit() === action().value ? "" : undefined}>
                    <span class="tds-palette-icon">
                      <Icon name={action().icon} size="menu" />
                    </span>
                    <span class="tds-palette-title">{action().label}</span>
                    <span class="tds-palette-trail">
                      <Keys keys={action().keys} />
                    </span>
                  </CommandItem>
                )}
              </For>
            </CommandGroup>
            <Show when={sessions().length > 0}>
              <CommandGroup>
                <CommandGroupLabel class="tds-palette-label">Chats</CommandGroupLabel>
                <For each={sessions()} keyed={(session) => session.id}>
                  {(session) => (
                    <CommandItem
                      value={`chat:${session().id}`}
                      keywords={[plainText(session().preview)]}
                      class="tds-palette-item"
                      data-hit={hit() === `chat:${session().id}` ? "" : undefined}
                    >
                      <span class={`tds-palette-icon ${glyphFor(session().id).hue}`}>
                        <Icon name={glyphFor(session().id).icon} size="menu" />
                      </span>
                      <span class="tds-palette-title">{titleOf(session())}</span>
                      <span class="tds-palette-trail num">
                        <Show when={session().busy} fallback={shortTime(session().updatedAt, now())}>
                          <Orb status="working" surface="side" size="orb-sm" />
                        </Show>
                      </span>
                    </CommandItem>
                  )}
                </For>
              </CommandGroup>
            </Show>
          </CommandList>
          <div class="tds-palette-foot" aria-hidden="true">
            <span>
              <Keys keys={["↑", "↓"]} /> Move
            </span>
            <span>
              <Keys keys={["↵"]} /> Open
            </span>
            <span>
              <Keys keys={["esc"]} /> Close
            </span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
