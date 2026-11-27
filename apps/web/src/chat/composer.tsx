import { createSignal } from "solid-js"
import { Icon } from "@tock/ui/icon"
import { MorphIcon } from "@tock/ui/morph-icon"
import { Swap } from "@tock/ui/swap"
import { tokens } from "@tock/tokens"

export function Composer(props: { working: boolean; onSend: (text: string) => void; onStop: () => void }) {
  const [text, setText] = createSignal("")
  const [tall, setTall] = createSignal(false)
  let field!: HTMLTextAreaElement
  const empty = () => text().trim() === ""
  const stop = () => props.working && empty()

  const grow = () => {
    field.style.height = "auto"
    const max = tokens.size["composer-max"]
    field.style.height = `${Math.min(field.scrollHeight, max)}px`
    setTall(field.scrollHeight > tokens.size.composer)
  }
  const submit = () => {
    if (stop()) return props.onStop()
    if (empty()) return
    props.onSend(text().trim())
    setText("")
    field.value = ""
    grow()
  }

  return (
    <div class="tds-composer-wrap">
      <form class="flex items-end gap-8" onSubmit={(e) => (e.preventDefault(), submit())}>
        <button type="button" class="tds-press tds-composer-plus" aria-label="Add">
          <MorphIcon name="plus" />
        </button>
        <div class="tds-field" data-tall={tall() ? "" : undefined}>
          <div class="flex min-h-composer items-end pr-6 pl-18">
            <textarea
              ref={field}
              rows={1}
              class="tds-input"
              placeholder="Message toast"
              aria-label="Message toast"
              value={text()}
              onInput={(e) => (setText(e.currentTarget.value), grow())}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
                  e.preventDefault()
                  submit()
                }
              }}
            />
            <button type="button" class="tds-press grid size-mic flex-none place-items-center rounded-pill text-muted my-6" aria-label="Dictate">
              <Icon name="waveform" size="composer" />
            </button>
          </div>
        </div>
        <button type="submit" class="tds-press tds-send" data-empty={empty() && !stop() ? "" : undefined} data-stop={stop() ? "" : undefined} aria-label={stop() ? "Stop" : "Send"}>
          <Swap on={stop()} a={<MorphIcon name="arrow-up" class="tds-optical-up" weight={1.8} />} b={<Icon name="stop:fill" size="toast" />} />
        </button>
      </form>
    </div>
  )
}
