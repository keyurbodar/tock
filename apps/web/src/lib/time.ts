const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR
const weekday = new Intl.DateTimeFormat("en", { weekday: "short" })
const monthDay = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" })

export function shortTime(at: number | null | undefined, now = Date.now()): string {
  if (!at) return ""
  const diff = Math.max(0, now - at)
  if (diff < MIN) return "now"
  if (diff < HOUR) return `${Math.floor(diff / MIN)}m`
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h`
  if (diff < 6 * DAY) return weekday.format(at)
  return monthDay.format(at)
}

export function elapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}
