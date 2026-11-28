import { hidePeek } from "./peek"
import { setCentreOpen } from "./centre"

/** The last input kind on :root, so a surface opened from the keyboard (a menu via Enter or Shift+F10) can skip its open animation. */
const input = (kind: "keyboard" | "pointer") => () => {
  if (document.documentElement.dataset.input !== kind) document.documentElement.dataset.input = kind
}
addEventListener("keydown", input("keyboard"), true)
addEventListener("pointerdown", input("pointer"), true)

/**
 * One call that clears every transient layer (the peek, open menus, the notification centre, the session stack)
 * before a new top-level surface such as the palette opens, so nothing stays open, stale, underneath it.
 */
export function dismissLayers() {
  hidePeek()
  setCentreOpen(false)
  for (const menu of document.querySelectorAll<HTMLElement>('[role="menu"]')) menu.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }))
  document.dispatchEvent(new CustomEvent("tds-dismiss-layers"))
}
