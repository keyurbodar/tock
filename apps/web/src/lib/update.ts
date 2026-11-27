import { app } from "../state/app"

/** How long nobody has typed or pointed before a waiting update may reload a visible tab. */
const QUIET_MS = 30_000
const CHECK_MS = 5_000

let lastInput = Date.now()
let waiting = false

const busy = () =>
  Boolean(document.querySelector(".ProseMirror")?.textContent?.trim()) ||
  Boolean(document.querySelector('[role="dialog"], [role="menu"], [role="listbox"], .tds-row-rename, .tds-pin-rename')) ||
  Object.values(app.threads).some((thread) => (thread?.pending.length ?? 0) > 0 || thread?.live?.run !== undefined)

/**
 * A new build is live (the service worker took over, or a lazy chunk of the old build is gone). Reload, but only
 * when it can't cost anything: nothing typed, no send in flight, no run streaming, no menu or dialog open, and the
 * tab either hidden or untouched for QUIET_MS.
 */
export function reloadWhenIdle() {
  if (waiting) return
  waiting = true
  document.documentElement.dataset.updateWaiting = ""
  const attempt = () => {
    if (busy()) return
    if (document.hidden || Date.now() - lastInput >= QUIET_MS) location.reload()
  }
  for (const type of ["pointerdown", "keydown", "wheel"]) addEventListener(type, () => (lastInput = Date.now()), { capture: true, passive: true })
  document.addEventListener("visibilitychange", attempt)
  setInterval(attempt, CHECK_MS)
  attempt()
}

/** Register the app-shell worker, look for a new build whenever the tab comes back, and reload into it when idle. */
export function installServiceWorker() {
  if (!("serviceWorker" in navigator)) return
  const hadController = Boolean(navigator.serviceWorker.controller)
  navigator.serviceWorker.addEventListener("controllerchange", () => hadController && reloadWhenIdle())
  addEventListener("vite:preloadError", (event) => (event.preventDefault(), reloadWhenIdle()))
  addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && void registration.update().catch(() => undefined)))
      .catch(() => undefined)
  })
}
