import { hidePeek } from "./peek"
import { setCentreOpen } from "./centre"

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
