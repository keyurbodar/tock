export interface PushDevice {
  readonly endpoint: string
  readonly label: string
  readonly lastSeenAt: number
  readonly lastDeliveredAt: number | null
  readonly failedAt: number | null
}

const BROWSERS: readonly (readonly [RegExp, string])[] = [
  [/Edg\//, "Edge"],
  [/OPR\//, "Opera"],
  [/Firefox\//, "Firefox"],
  [/Chrome\//, "Chrome"],
  [/Safari\//, "Safari"],
]

function platform(userAgent: string, touchPoints: number): string {
  if (/iPhone/.test(userAgent)) return "iPhone"
  if (/iPad/.test(userAgent) || (/Macintosh/.test(userAgent) && touchPoints > 1)) return "iPad"
  if (/Android/.test(userAgent)) return "Android"
  if (/Macintosh/.test(userAgent)) return "Mac"
  if (/Windows/.test(userAgent)) return "Windows"
  if (/Linux/.test(userAgent)) return "Linux"
  return "this device"
}

export function deviceLabel(userAgent: string, touchPoints: number): string {
  const browser = BROWSERS.find(([pattern]) => pattern.test(userAgent))?.[1] ?? "Browser"
  return `${browser} on ${platform(userAgent, touchPoints)}`
}

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY
const YEAR = 365 * DAY

function ago(elapsed: number): string {
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`
  if (elapsed < WEEK) return `${Math.floor(elapsed / DAY)}d ago`
  if (elapsed < YEAR) return `${Math.floor(elapsed / WEEK)}w ago`
  return `${Math.floor(elapsed / YEAR)}y ago`
}

export function deviceStatus(device: PushDevice, now: number): string {
  if (device.failedAt !== null && (device.lastDeliveredAt === null || device.failedAt > device.lastDeliveredAt)) return "Last push failed"
  const elapsed = now - (device.lastDeliveredAt ?? device.lastSeenAt)
  return elapsed < MINUTE ? "Active now" : `Active ${ago(elapsed)}`
}
