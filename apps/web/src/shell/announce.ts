/** One shared polite live region, as T3Code's BackgroundThreadAnnouncer: screen readers hear runs finish, ask for you or fail. */
let region: HTMLElement | undefined

export function announce(text: string) {
  if (!region) {
    region = document.createElement("div")
    region.className = "sr-only"
    region.setAttribute("role", "status")
    region.setAttribute("aria-live", "polite")
    region.setAttribute("aria-atomic", "true")
    document.body.append(region)
  }
  const live = region
  live.textContent = ""
  requestAnimationFrame(() => (live.textContent = text))
}
