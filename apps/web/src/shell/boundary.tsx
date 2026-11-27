import { Errored } from "solid-js"
import type { JSX } from "@solidjs/web"
import { Icon } from "@tock/ui/icon"

type Surface = "transcript" | "sidebar" | "composer"

const COPY: Record<Surface, { title: string; body: string }> = {
  transcript: { title: "This chat didn’t load", body: "Something broke while drawing it. Try again, or open another chat." },
  sidebar: { title: "Your chats didn’t load", body: "Something broke while drawing the list. Try again." },
  composer: { title: "The composer hit a problem", body: "Your draft is saved. Try again to keep typing." },
}

/** Dev-only: `sessionStorage["tock.fault"] = "<surface>"` makes that surface throw once, so the verify journey can prove its boundary. */
function Fault(props: { surface: Surface }) {
  if (import.meta.env.DEV && sessionStorage.getItem("tock.fault") === props.surface) {
    sessionStorage.removeItem("tock.fault")
    throw new Error(`tock.fault: ${props.surface}`)
  }
  return null
}

/** One surface failing never takes the app with it: it shows a TDS error state with Try again, and the rest keeps working. */
export function Boundary(props: { surface: Surface; children: JSX.Element }) {
  return (
    <Errored
      fallback={(_, reset) => (
        <div class="tds-fault" role="alert" data-surface={props.surface}>
          <Icon name="warning-circle" size="menu" />
          <b>{COPY[props.surface].title}</b>
          <span>{COPY[props.surface].body}</span>
          <button type="button" class="tds-empty-button tds-press" onClick={() => reset()}>
            Try again
          </button>
        </div>
      )}
    >
      <Fault surface={props.surface} />
      {props.children}
    </Errored>
  )
}
