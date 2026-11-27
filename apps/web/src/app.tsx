import { createSignal } from "solid-js"
import { Toggle } from "@ui-sdk/solid/toggle"

export function App() {
  const [n, setN] = createSignal(0)
  return (
    <main class="grid h-full place-items-center bg-main text-tx">
      <Toggle class="h-key rounded-field bg-raise px-14 shadow-key text-menu data-pressed:text-rose" onPressedChange={() => setN(n() + 1)}>
        Tock {n()}
      </Toggle>
    </main>
  )
}
