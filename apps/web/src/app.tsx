import { Show } from "solid-js"
import type { JSX } from "@solidjs/web"
import { injectIconSprite } from "@tock/ui/icon"
import { app, boot } from "./state/app"
import { Rail } from "./shell/rail"
import { Centre } from "./shell/centre"
import { loadNotes } from "./state/notes"
import { Sidebar } from "./shell/sidebar"
import { Gate } from "./shell/gate"
import { Shortcuts } from "./shell/shortcuts"
import { Toasts } from "./shell/toasts"
import { Palette } from "./shell/palette"
import { Lightbox } from "./chat/lightbox"
import { Router } from "./router"

function Shell(props: { children?: JSX.Element }) {
  return (
    <div class="relative flex h-full overflow-hidden bg-main">
      <Rail />
      <Centre />
      <Sidebar />
      {props.children}
      <Shortcuts />
      <Toasts />
      <Palette />
      <Lightbox />
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
    <Router>{(props) => <Shell>{props.children}</Shell>}</Router>
  )
}
