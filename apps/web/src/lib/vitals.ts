type Vital = { readonly name: string; readonly value: number; readonly rating: string }

declare global {
  interface Window {
    __tockVitals?: Record<string, Vital>
  }
}

/** Core Web Vitals (INP, LCP, CLS): the console in dev, a beacon to /api/vitals in prod, and window.__tockVitals for the budget script. */
export function reportVitals() {
  void import("web-vitals").then(({ onCLS, onINP, onLCP }) => {
    const report = ({ name, value, rating }: Vital) => {
      window.__tockVitals = { ...window.__tockVitals, [name]: { name, value, rating } }
      if (import.meta.env.DEV) return console.info(`[vitals] ${name} ${Math.round(name === "CLS" ? value * 1000 : value) / (name === "CLS" ? 1000 : 1)} ${rating}`)
      navigator.sendBeacon("/api/vitals", JSON.stringify({ name, value, rating, path: location.pathname.replace(/[0-9a-f-]{36}/, ":id") }))
    }
    onCLS(report, { reportAllChanges: true })
    onINP(report, { reportAllChanges: true })
    onLCP(report, { reportAllChanges: true })
  })
}
