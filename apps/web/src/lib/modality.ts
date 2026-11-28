/**
 * Input modality: html[data-kbd] is on while the person is driving with the keyboard and off the moment they press with
 * a pointer. Focus rings are drawn only under it (app.css), so clicking, tapping or focus moved by code never shows one,
 * while Tab, Shift+Tab, the arrows, Home/End, Enter/Space on a focused control and Escape keep them.
 */
const NAV = new Set(["Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown", "Escape"])

export function trackModality(root: HTMLElement = document.documentElement) {
  const key = (event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return
    // Typing into a field is not navigation: only keys that move focus count, and Tab always does.
    const typing = (event.target as HTMLElement | null)?.closest?.("input, textarea, [contenteditable='true'], .ProseMirror")
    if (event.key === "Tab" || (!typing && NAV.has(event.key))) root.setAttribute("data-kbd", "")
  }
  const pointer = () => root.removeAttribute("data-kbd")
  window.addEventListener("keydown", key, true)
  window.addEventListener("pointerdown", pointer, true)
  return () => {
    window.removeEventListener("keydown", key, true)
    window.removeEventListener("pointerdown", pointer, true)
  }
}
