import { createSignal, Show } from "solid-js"
import { Icon } from "@tock/ui/icon"
import { socket } from "../lib/socket"

export function Gate() {
  const [key, setKey] = createSignal("")
  const [state, setState] = createSignal<"idle" | "checking" | "wrong">("idle")
  const unlock = async (e: SubmitEvent) => {
    e.preventDefault()
    setState("checking")
    const res = await fetch("/api/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: key() }) }).catch(() => null)
    if (!res?.ok) return setState("wrong")
    socket.start()
  }
  return (
    <div class="fixed inset-0 z-lightbox grid place-items-center bg-scrim">
      <form class="tds-dialog tds-over" onSubmit={unlock} data-shake={state() === "wrong" ? "" : undefined}>
        <img src="/brand/toast-mascot-128.svg" alt="" class="size-mascot-dialog mb-8 rounded-small" />
        <b class="text-dialog text-tx">Unlock Tock</b>
        <span>Enter your access key to open your chats.</span>
        <label class="tds-key-field mt-14">
          <Icon name="key" size="menu" class="text-muted" />
          <input type="password" autocomplete="current-password" placeholder="Access key" value={key()} onInput={(e) => (setKey(e.currentTarget.value), setState("idle"))} autofocus />
        </label>
        <Show when={state() === "wrong"}>
          <span class="text-caption text-failed">That key didn’t work. Check it and try again.</span>
        </Show>
        <button type="submit" class="tds-key tds-key-cream mt-8 w-full" disabled={!key() || state() === "checking"}>
          {state() === "checking" ? "Checking…" : "Unlock"}
        </button>
      </form>
    </div>
  )
}
