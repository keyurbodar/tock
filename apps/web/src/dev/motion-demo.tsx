import { createSignal, For, Show } from "solid-js"
import { tokens } from "@tock/tokens"
import { backdrop, growFrom, MorphIcon, raise, scrub, shrinkInto, spring, TextMorph, watchLayout } from "@tock/ui/motion"

/** Dev-only catalogue of the motion primitives (route /__motion). Each card is the smallest working use of one primitive. */
export default function MotionDemo() {
  const [open, setOpen] = createSignal(false)
  const [items, setItems] = createSignal([1, 2, 3, 4, 5, 6])
  const [count, setCount] = createSignal(12)
  const [icon, setIcon] = createSignal(false)
  const [dim, setDim] = createSignal(false)
  let trigger: HTMLButtonElement | undefined
  let sheet: HTMLDivElement | undefined
  const close = () => {
    if (sheet && trigger) shrinkInto(sheet.cloneNode(true) as HTMLElement, sheet.getBoundingClientRect(), trigger.getBoundingClientRect())
    setOpen(false)
  }
  return (
    <main class="tds-motion-demo" data-backdrop-layer>
      <h1>Motion primitives</h1>
      <section class="tds-raise-1">
        <h2>Morph</h2>
        <button ref={trigger} type="button" class="tds-motion-chip tds-raise-2" onClick={() => (open() ? close() : setOpen(true))}>Open</button>
        <Show when={open()}>
          <div ref={(el) => ((sheet = el), requestAnimationFrame(() => trigger && growFrom(el, trigger)))} class="tds-motion-card tds-over" onClick={close}>Grown from its trigger. Click to shrink back.</div>
        </Show>
      </section>
      <section class="tds-raise-1">
        <h2>Flip</h2>
        <button type="button" class="tds-motion-chip tds-raise-2" onClick={() => setItems((list) => [...list].sort(() => Math.random() - 0.5))}>Shuffle</button>
        <button type="button" class="tds-motion-chip tds-raise-2" onClick={() => setItems((list) => (list.length > 2 ? list.slice(1) : [...list, list.length + 1]))}>Add / remove</button>
        <div class="tds-motion-grid" ref={(el) => watchLayout(el, ".tds-motion-tile")}>
          <For each={items()} keyed={(n) => String(n)}>{(n) => <div class="tds-motion-tile tds-raise-2" data-id={String(n())}>{n()}</div>}</For>
        </div>
      </section>
      <section class="tds-raise-1">
        <h2>Presence + Spring</h2>
        <button type="button" class="tds-motion-chip tds-raise-2" onClick={(e) => spring(e.currentTarget, [{ scale: String(tokens.motion["press-tight"]) }, { scale: "1" }], "press")}>Press spring</button>
      </section>
      <section class="tds-raise-1">
        <h2>Glide</h2>
        <div class="tds-menu tds-over" role="menu">
          <For each={["Rename", "Pin", "Archive"]}>{(label) => <div class="tds-menu-item" role="menuitem" tabindex="-1" onPointerEnter={(e) => e.currentTarget.setAttribute("data-highlighted", "")} onPointerLeave={(e) => e.currentTarget.removeAttribute("data-highlighted")}>{label}</div>}</For>
        </div>
      </section>
      <section class="tds-raise-1">
        <h2>Gesture</h2>
        <div class="tds-motion-track" ref={(el) => scrub(el, { axis: "x", distance: 160, onProgress: (p) => el.style.setProperty("--p", String(p)), onRelease: (on) => el.style.setProperty("--p", on ? "1" : "0") })}>
          <i class="tds-motion-knob tds-raise-3" />
        </div>
      </section>
      <section class="tds-raise-1">
        <h2>Text and icon morphs</h2>
        <button type="button" class="tds-motion-chip tds-raise-2" onClick={() => setCount((n) => n + 7)}><TextMorph value={count()} numbers /></button>
        <button type="button" class="tds-motion-chip tds-raise-2" aria-label="Toggle icon" onClick={() => setIcon((on) => !on)}><MorphIcon name={icon() ? "stop" : "arrow-up"} /></button>
      </section>
      <section class="tds-raise-1">
        <h2>Raise and Backdrop</h2>
        <For each={[raise[1], raise[2], raise[3]]}>{(cls) => <div class={`tds-motion-tile ${cls}`}>{cls}</div>}</For>
        <button type="button" class="tds-motion-chip tds-raise-2" onClick={() => (backdrop(!dim()), setDim((on) => !on))}>Backdrop</button>
      </section>
    </main>
  )
}
