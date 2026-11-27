import { createSignal, Show } from "solid-js"
import { Icon } from "@tock/ui/icon"
import { socket } from "../lib/socket"

export function Gate() {
  const [key, setKey] = createSignal("")
  const [state, setState] = createSignal<"idle" | "checking" | "wrong" | "empty">("idle")
  const unlock = async (e: SubmitEvent) => {
    e.preventDefault()
    if (state() === "checking") return
    if (!key().trim()) return setState("empty")
    setState("checking")
    const res = await fetch("/api/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: key() }) }).catch(() => null)
    if (!res?.ok) return setState("wrong")
    socket.start()
  }
  return (
    <div class="fixed inset-0 z-lightbox grid place-items-center bg-scrim">
      <form class="tds-dialog tds-over" novalidate onSubmit={unlock} data-shake={state() === "wrong" ? "" : undefined}>
        <img src="/brand/toast-mascot-128.svg" alt="" class="size-mascot-dialog mb-8 rounded-small" />
        <b class="text-dialog text-tx">Unlock Tock</b>
        <span>Enter your access key to open your chats.</span>
        <label for="gate-key" class="tds-field-label mt-14">
          Access key
        </label>
        <div class="tds-key-field">
          <Icon name="key" size="menu" class="text-muted" />
          <input id="gate-key" type="password" name="key" autocomplete="current-password" placeholder="Paste your key" aria-invalid={state() === "wrong" || state() === "empty" ? "true" : undefined} aria-describedby={state() === "wrong" || state() === "empty" ? "gate-error" : undefined} value={key()} onInput={(e) => (setKey(e.currentTarget.value), setState("idle"))} autofocus />
        </div>
        <Show when={state() === "wrong" || state() === "empty"}>
          <span id="gate-error" role="alert" class="text-caption text-failed">{state() === "empty" ? "Enter your access key." : "That key didn’t work. Check it and try again."}</span>
        </Show>
        <button type="submit" class="tds-key tds-key-cream mt-8 w-full" aria-disabled={state() === "checking" ? "true" : undefined}>
          {state() === "checking" ? "Checking…" : "Unlock"}
        </button>
      </form>
    </div>
  )
}
