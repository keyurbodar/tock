const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const dayFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" })
const stampFormat = new Intl.DateTimeFormat(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })
const fullFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" })

export function relativeTime(timestamp: number | null, now = Date.now()): string {
  if (timestamp === null) return ""
  const elapsed = now - timestamp
  if (elapsed < MINUTE) return "now"
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m`
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h`
  if (elapsed < 7 * DAY) return `${Math.floor(elapsed / DAY)}d`
  return dayFormat.format(timestamp)
}

export const stamp = (timestamp: number) => stampFormat.format(timestamp)

export const dateTime = (timestamp: number | null) => (timestamp === null ? "Never" : fullFormat.format(timestamp))

const UNITS = ["B", "KB", "MB", "GB"] as const

export function fileSize(size: number): string {
  const exponent = Math.min(UNITS.length - 1, size === 0 ? 0 : Math.floor(Math.log(size) / Math.log(1024)))
  const value = size / 1024 ** exponent
  return `${exponent === 0 ? value : value.toFixed(1)} ${UNITS[exponent]}`
}

export const titleCase = (value: string) =>
  value
    .replace(/[_-]+/g, " ")
    .replace(/^\w/, (letter) => letter.toUpperCase())
