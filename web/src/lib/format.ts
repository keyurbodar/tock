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

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" })
const thisYearFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
const otherYearFormat = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })

export function messageTime(timestamp: number, now = Date.now()): string {
  const date = new Date(timestamp)
  const today = new Date(now)
  if (date.toDateString() === today.toDateString()) return timeFormat.format(date)
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday ${timeFormat.format(date)}`
  if (now - timestamp < 6 * DAY) return stampFormat.format(date)
  return (date.getFullYear() === today.getFullYear() ? thisYearFormat : otherYearFormat).format(date)
}

export const stamp = (timestamp: number) => stampFormat.format(timestamp)

export const dateTime = (timestamp: number | null) => (timestamp === null ? "Never" : fullFormat.format(timestamp))

const UNITS = ["KB", "MB", "GB", "TB"] as const

export function fileSize(size: number): string {
  if (!Number.isFinite(size) || size < 0) return "—"
  if (size < 1024) return `${size} B`
  const unit = Math.min(Math.floor(Math.log(size) / Math.log(1024)) - 1, UNITS.length - 1)
  const value = size / 1024 ** (unit + 1)
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${UNITS[unit]}`
}

export const titleCase = (value: string) =>
  value
    .replace(/[_-]+/g, " ")
    .replace(/^\w/, (letter) => letter.toUpperCase())
