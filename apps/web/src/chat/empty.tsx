import { Show } from "solid-js"
import { Icon } from "@tock/ui/icon"

const ART = {
  hi: { title: "Say hi to toast", body: "Start a chat about anything. toast keeps working on it while you get on with your day." },
  search: { title: "No chats match", body: "Try fewer letters, or search files instead." },
  quiet: { title: "Quiet for now", body: "No new notifications. toast is resting until something happens." },
  error: { title: "That one got burnt", body: "toast couldn’t draw this chat. Your messages are safe. Try again in a moment." },
  inbox: { title: "All caught up", body: "Nothing needs you right now. toast will tap you when something does." },
  archive: { title: "Archive is empty", body: "Finished chats you put away land here. Nothing has been archived yet." },
  loading: { title: "Warming up…", body: "toast is getting ready. This only takes a moment the first time." },
  offline: { title: "You are offline", body: "toast keeps working in the cloud. You will see the updates as soon as you are back." },
} as const

/** TDS empty states: the toast mascot for roomy places, the hairline object alone for dense lists (EmptyToast, EmptyObjects). */
export function Empty(props: { art: keyof typeof ART; small?: boolean; action?: { label: string; run: () => void } }) {
  return (
    <div class="tds-empty" data-small={props.small ? "" : undefined}>
      <img src={`/brand/empty/${props.small ? "obj" : "toast"}-${props.art}.svg`} alt="" draggable={false} />
      <b>{ART[props.art].title}</b>
      <span>{ART[props.art].body}</span>
      <Show when={props.action}>
        {(action) => (
          <button type="button" class="tds-empty-button tds-press" onClick={() => action().run()}>
            <Icon name="plus" size="chip" />
            {action().label}
          </button>
        )}
      </Show>
    </div>
  )
}
