import { Show } from "solid-js"
import { Icon } from "@tock/ui/icon"

const ART = {
  hi: { title: "Say hi to toast", body: "Start a thread about anything. toast keeps working on it while you get on with your day." },
  search: { title: "Nothing matches that", body: "Try fewer words, or search inside a thread. Archived threads are searched too." },
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
