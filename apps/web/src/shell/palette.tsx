import { createSignal, For, Show, untrack } from "solid-js"
import { createHotkey } from "@tanstack/solid-hotkeys"
import { dismissLayers } from "./layers"
import { useNavigate } from "@solidjs/router"
import { Command, CommandEmpty, CommandGroup, CommandGroupLabel, CommandInput, CommandItem, CommandList } from "@ui-sdk/solid/command"
import { Dialog, DialogBackdrop, DialogContent, DialogTitle } from "@ui-sdk/solid/dialog"
import { Icon, type IconName } from "@tock/ui/icon"
import { Orb } from "@tock/ui/orb"
import { tokens } from "@tock/tokens"
import { app, newThreadId, plainText, titleOf } from "../state/app"
import { glyphFor } from "../lib/glyph"
import { dirOf } from "../lib/dir"
import { shortTime } from "../lib/time"
import { minute } from "../lib/clock"
import { setShortcutsOpen } from "./shortcuts"
import { appHotkeys, keysFor } from "./hotkeys"

const [open, setOpen] = createSignal(false)
export const setPaletteOpen = setOpen

/** SysPalette's Actions. Search Files and Open Settings stay disabled until those surfaces exist (TG-02). */
const actions: readonly { value: string; label: string; icon: IconName; keys: readonly string[]; disabled?: boolean }[] = [
  { value: "action:new", label: "New Chat", icon: "note-pencil", keys: keysFor(["chats.new"]) },
  { value: "action:files", label: "Search Files…", icon: "folder-simple", keys: ["⌘", "⇧", "F"], disabled: true },
  { value: "action:settings", label: "Open Settings…", icon: "gear-six", keys: ["⌘", ","], disabled: true },
  { value: "action:shortcuts", label: "Keyboard Shortcuts", icon: "keyboard", keys: keysFor(["help.shortcuts"]) },
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
  createHotkey(appHotkeys["chats.search"], () => {
    if (!untrack(open)) dismissLayers()
    setOpen((current) => !current)
  })
  const sessions = () => app.sessions.filter((session) => !session.meta.archived)
  return (
    <Dialog modal="trap-focus" open={open()} onOpenChange={(next) => setOpen(next)}>
      <DialogBackdrop class="tds-scrim tds-palette-scrim tds-backdrop" />
      <DialogContent class="tds-palette tds-over">
        <DialogTitle class="sr-only">Search or run a command</DialogTitle>
        <Command onAction={(value) => run(String(value))}>
          <div class="tds-palette-search">
            <Icon name="magnifying-glass" size="menu" />
            <CommandInput aria-label="Search or run a command" placeholder="Search or run a command" />
          </div>
          <CommandList class="tds-palette-list tds-scroll" data-edge-fade="y">
            <CommandEmpty class="tds-palette-empty">No matches. Try a chat name or a command.</CommandEmpty>
            <CommandGroup>
              <CommandGroupLabel class="tds-palette-label">Actions</CommandGroupLabel>
              <For each={actions} keyed={false}>
                {(action) => (
                  <CommandItem value={action().value} disabled={action().disabled} class="tds-palette-item" data-hit={hit() === action().value ? "" : undefined}>
                    <span class="tds-palette-icon">
                      <Icon name={action().icon} size="menu" />
                    </span>
                    <span class="tds-palette-title" dir="auto">{action().label}</span>
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
                      <span class="tds-palette-title" dir={dirOf(titleOf(session()))}>{titleOf(session())}</span>
                      <span class="tds-palette-trail num">
                        <Show when={session().busy} fallback={shortTime(session().updatedAt, minute())}>
                          <Orb status="working" />
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
