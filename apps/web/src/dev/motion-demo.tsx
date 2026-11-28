import "../styles/motion-demo.css"
import { createSignal, For, Show } from "solid-js"
import { tokens } from "@tock/tokens"
import { Orb, type OrbStatus } from "@tock/ui/orb"
import { StatusGrid, type GridHue, type GridPattern } from "@tock/ui/status-grid"
import { backdrop, drive, edgeFade, growFrom, MorphIcon, morphFrom, morphInto, raise, recede, scrub, shrinkInto, spring, TextMorph, watchLayout } from "@tock/ui/motion"

const ORB_STATES: OrbStatus[] = ["working", "thinking", "needs", "failed", "done"]
const GRID_VIDEO: [GridPattern, GridHue][] = [
  ["embers", "red"], ["ring", "blue"], ["diamond", "amber"], ["arc", "violet"], ["spiral", "blue"], ["arrow", "amber"], ["comet", "violet"], ["glider", "pink"],
]

/** Dev-only catalogue of the motion primitives (route /__motion). Each card is the smallest working use of one primitive. */
export default function MotionDemo() {
  const [open, setOpen] = createSignal(false)
  const [items, setItems] = createSignal([1, 2, 3, 4, 5, 6])
  const [count, setCount] = createSignal(12)
  const [icon, setIcon] = createSignal(false)
  const [busy, setBusy] = createSignal(true)
  const [dim, setDim] = createSignal(false)
  const [place, setPlace] = createSignal("Pick a city")
  let pane: HTMLDivElement | undefined
  let trigger: HTMLButtonElement | undefined
  let sheet: HTMLDivElement | undefined
  let behind: HTMLDivElement | undefined
  let pull: ReturnType<typeof drive> | undefined
  const reach = tokens.size.pin * 2
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
        <h2>Container morph</h2>
        <For each={["Tokyo", "Lisbon", "Oslo"]}>{(city) => <button type="button" class="tds-motion-chip tds-raise-2" onClick={(e) => (morphFrom(e.currentTarget), setPlace(city), requestAnimationFrame(() => pane && morphInto(pane)))}>{city}</button>}</For>
        <div ref={pane} class="tds-motion-card tds-over"><TextMorph value={place()} mode="morph" /></div>
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
        <div class="tds-menu tds-over" data-edge-fade="y" role="menu">
          <For each={["Rename", "Pin", "Archive"]}>{(label) => <div class="tds-menu-item" role="menuitem" tabindex="-1" onPointerEnter={(e) => e.currentTarget.setAttribute("data-highlighted", "")} onPointerLeave={(e) => e.currentTarget.removeAttribute("data-highlighted")}>{label}</div>}</For>
        </div>
      </section>
      <section class="tds-raise-1">
        <h2>Gesture + Drive (drag, wheel, or double-click mid-flight)</h2>
        <div
          class="tds-motion-track"
          ref={(el) => {
            const p = drive(el)
            scrub(el, { axis: "x", distance: tokens.size.pin * 3, from: () => p.value, onProgress: (v) => p.set(v), onRelease: (on, v) => p.to(on ? 1 : 0, on ? "pop-open" : "pop-close", v) })
            el.addEventListener("dblclick", () => p.to(p.value > 0.5 ? 0 : 1))
          }}
        >
          <i class="tds-motion-knob tds-raise-3" />
        </div>
      </section>
      <section class="tds-raise-1">
        <h2>Drive + recede</h2>
        <div ref={behind} class="tds-motion-tile tds-raise-2">Behind</div>
        <button
          type="button"
          class="tds-motion-drive tds-raise-2"
          ref={(el) => {
            const d = (pull = drive(el, { preset: "glide", tracks: [recede(() => behind)] }))
            scrub(el, { axis: "y", direction: -1, distance: reach, from: () => d.value, onProgress: (p) => d.set(p), onRelease: (on, v) => d.to(on ? 1 : 0, "glide", (v * 1000) / reach) })
          }}
          onClick={() => pull?.to(pull.value > 0.5 ? 0 : 1, "glide")}
        >
          Drag up, or tap twice fast
        </button>
      </section>
      <section class="tds-raise-1">
        <h2>Text and icon morphs</h2>
        <For each={["roll", "morph", "calm", "swap"] as const}>{(mode) => <button type="button" class="tds-motion-chip tds-raise-2" onClick={() => setCount((n) => n + 7)}>{mode} <TextMorph value={count() + "%"} mode={mode} /></button>}</For>
        <button type="button" class="tds-motion-chip tds-raise-2" aria-label="Toggle icon" onClick={() => setIcon((on) => !on)}><MorphIcon name={icon() ? "stop" : "arrow-up"} /></button>
        <button type="button" class="tds-motion-chip tds-raise-2 tds-motion-step" aria-label="Toggle step" onClick={() => setBusy((on) => !on)}><MorphIcon name={busy() ? "spinner" : "check"} /></button>
      </section>
      <section class="tds-raise-1">
        <h2>Edge fade (scroll either list)</h2>
        <div class="tds-motion-scroll tds-scroll" data-edge-fade="y">
          <For each={Array.from({ length: 16 }, (_, i) => i + 1)} keyed={false}>{(n) => <div class="tds-motion-row">Row {n()}</div>}</For>
        </div>
        <div class="tds-motion-strip tds-scroll" ref={(el) => edgeFade(el, { axis: "x" })}>
          <For each={Array.from({ length: 12 }, (_, i) => i + 1)} keyed={false}>{(n) => <div class="tds-motion-tile tds-raise-2">{n()}</div>}</For>
        </div>
      </section>
      <section class="tds-raise-1">
        <h2>Raise and Backdrop</h2>
        <For each={[raise[1], raise[2], raise[3]]}>{(cls) => <div class={`tds-motion-tile ${cls}`}>{cls}</div>}</For>
        <button type="button" class="tds-motion-chip tds-raise-2" onClick={() => (backdrop(!dim()), setDim((on) => !on))}>Backdrop</button>
      </section>
      <section class="tds-raise-1 tds-motion-grids">
        <h2>Status grid (the eight reference patterns)</h2>
        <For each={GRID_VIDEO}>
          {([pattern, hue]) => (
            <div class="tds-motion-pill" data-pattern={pattern}>
              <StatusGrid pattern={pattern} hue={hue} size={tokens.size["grid-demo"]} label={pattern} />
              <span class="tds-act-text" data-shimmer="" style={{ "--grid-tint": tokens.color.grid[hue].tint }}>Thinking</span>
            </div>
          )}
        </For>
      </section>
      <section class="tds-raise-1 tds-motion-orbs">
        <h2>Orb (row and pin corner)</h2>
        <For each={ORB_STATES}>
          {(status) => (
            <div class="tds-motion-orb" data-status={status}>
              <Orb status={status} label={status} />
              <span class="tds-motion-tile tds-raise-2">
                <Orb status={status} size="corner" />
              </span>
              <span>{status}</span>
            </div>
          )}
        </For>
      </section>
    </main>
  )
}
