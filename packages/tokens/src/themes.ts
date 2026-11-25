export type ThemeMode = "dark" | "light" | "system"

export function applyThemeMode(mode: ThemeMode, root: HTMLElement = document.documentElement): void {
  const prefersLight = typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: light)").matches
  const resolved = mode === "system" ? (prefersLight ? "light" : "dark") : mode
  if (resolved === "dark") {
    root.removeAttribute("data-theme")
  } else {
    root.setAttribute("data-theme", resolved)
  }
  root.style.colorScheme = resolved
}
