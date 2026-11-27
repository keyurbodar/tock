import { For, Show, untrack } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { narrow } from "./narrow"
import { MorphIcon } from "@tock/ui/morph-icon"
import type { IconName } from "@tock/ui/icon"
import { TextMorph } from "@tock/ui/text-morph"
import { app } from "../state/app"
import { unreadNotes } from "../state/notes"
import { centreOpen, setCentreOpen } from "./centre"
import { setShortcutsOpen } from "./shortcuts"

function Badge(props: { count: number }) {
  return (
    <span class="tds-badge num" data-zero={props.count === 0 ? "" : undefined} aria-hidden="true">
      <TextMorph value={String(Math.max(props.count, 1))} mode="roll" />
    </span>
  )
}

function RailButton(props: { icon: IconName; label: string; on?: boolean; count?: number; bell?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      class="tds-rail-button"
      aria-label={props.count ? `${props.label}, ${props.count} new` : props.label}
      title={props.label}
      aria-pressed={props.on ? "true" : "false"}
      data-on={props.on ? "" : undefined}
      data-bell={props.bell ? "" : undefined}
      onClick={() => props.onClick?.()}
    >
      <MorphIcon name={props.on ? (`${props.icon}:fill` as IconName) : props.icon} size="rail" />
      <Show when={props.count !== undefined}>
        <Badge count={props.count!} />
      </Show>
    </button>
  )
}

const unreadChats = () => app.sessions.filter((session) => session.meta.unread && !session.meta.archived).length

/** TDS px4 mount: Chats, Files, Bell, then Keyboard and Settings at the foot. */
export function Rail() {
  const navigate = useNavigate()
  const top: () => { icon: IconName; label: string; on?: boolean; count?: number; bell?: boolean; onClick?: () => void }[] = () => [
    { icon: "chat-circle", label: "Chats", on: !centreOpen(), count: unreadChats(), onClick: () => (setCentreOpen(false), untrack(narrow) && navigate("/")) },
    { icon: "folder-simple", label: "Files" },
    { icon: "bell", label: "Notifications", on: centreOpen(), count: unreadNotes(), bell: true, onClick: () => setCentreOpen((value) => !value) },
  ]
  return (
    <nav class="tds-rail" aria-label="Spaces">
      <For each={top()} keyed={(item) => item.label}>{(item) => <RailButton {...item()} />}</For>
      <span class="tds-rail-space" />
      <RailButton icon="keyboard" label="Keyboard Shortcuts" onClick={() => setShortcutsOpen(true)} />
      <RailButton icon="gear-six" label="Settings" />
    </nav>
  )
}
