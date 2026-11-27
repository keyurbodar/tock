import { createEffect, createSignal, Show, untrack } from "solid-js"
import { Dynamic, type JSX } from "@solidjs/web"
import { opening } from "./chat/lightbox-state"
import { injectIconSprite } from "@tock/ui/icon"
import { app, boot } from "./state/app"
import { Rail } from "./shell/rail"
import { Centre } from "./shell/centre"
import { loadNotes } from "./state/notes"
import { Sidebar } from "./shell/sidebar"
import { narrow } from "./shell/narrow"
import { Gate } from "./shell/gate"
import { Shortcuts } from "./shell/shortcuts"
import { Toasts } from "./shell/toasts"
import { Palette } from "./shell/palette"
import { Router } from "./router"
import { Boundary } from "./shell/boundary"
import { whenIdle } from "./lib/idle"
import { HotkeysProvider } from "@tanstack/solid-hotkeys"
import { appHotkeys } from "./shell/hotkeys"

/** The viewer is its own chunk: it loads once the app is idle, or at once if something opens before that. */
const [Viewer, setViewer] = createSignal<() => JSX.Element>()
const loadViewer = () => void import("./chat/lightbox").then((module) => setViewer(() => module.Lightbox))

function Shell(props: { children?: JSX.Element }) {
  whenIdle(loadViewer)
  createEffect(opening, (open) => {
    if (open && !untrack(Viewer)) loadViewer()
  })
  return (
    <div class="relative flex h-full overflow-hidden bg-main" data-narrow={narrow() ? "" : undefined}>
      <a class="tds-skip" href="#main" onClick={(e) => (e.preventDefault(), document.getElementById("main")?.focus())}>
        Skip to chat
      </a>
      <Rail />
      <Centre />
      <Boundary surface="sidebar">
        <Sidebar />
      </Boundary>
      {props.children}
      <Shortcuts />
      <Toasts />
      <Palette />
      <Show when={Viewer()}>{(viewer) => <Dynamic component={viewer()} />}</Show>
      <Show when={app.connection === "unauthorized"}>
        <Gate />
      </Show>
    </div>
  )
}

export function App() {
  injectIconSprite()
  void boot()
  void loadNotes()
  return (
    <HotkeysProvider appHotkeys={appHotkeys} defaultOptions={{ hotkey: { ignoreDefaultPrevented: true } }}>
      <Router>{(props) => <Shell>{props.children}</Shell>}</Router>
    </HotkeysProvider>
  )
}
