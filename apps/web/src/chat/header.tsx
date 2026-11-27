import { Show } from "solid-js"
import { Orb } from "@tock/ui/orb"
import { TextMorph } from "@tock/ui/text-morph"

export function Header(props: { title: string; working: boolean }) {
  return (
    <header class="tds-header">
      <div class="tds-header-stack">
        <span class="grid size-header-avatar place-items-center rounded-pill bg-glass shadow-glass">
          <img src="/brand/toast-face-center.svg" alt="" class="size-header-face" draggable={false} />
        </span>
        <span class="tds-header-pill">
          <TextMorph value={props.title} />
          <Show when={props.working}>
            <span class="flex items-center gap-6 text-caption font-regular text-muted">
              <Orb status="working" surface="main" size="orb-sm" />
              working
            </span>
          </Show>
        </span>
      </div>
    </header>
  )
}
