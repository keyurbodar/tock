import { describe, expect, it } from "vitest"
import { deviceLabel, deviceStatus, type PushDevice } from "./device"

const CHROME = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"
const EDGE = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0"
const SAFARI = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15"
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
const FIREFOX_ANDROID = "Mozilla/5.0 (Android 15; Mobile; rv:140.0) Gecko/140.0 Firefox/140.0"

describe("deviceLabel", () => {
  it("names the browser and the platform", () => {
    expect(deviceLabel(CHROME, 0)).toBe("Chrome on Linux")
    expect(deviceLabel(EDGE, 0)).toBe("Edge on Windows")
    expect(deviceLabel(SAFARI, 0)).toBe("Safari on Mac")
    expect(deviceLabel(IPHONE, 5)).toBe("Safari on iPhone")
    expect(deviceLabel(FIREFOX_ANDROID, 5)).toBe("Firefox on Android")
  })

  it("treats a touch Mac as an iPad", () => {
    expect(deviceLabel(SAFARI, 5)).toBe("Safari on iPad")
  })

  it("falls back when nothing matches", () => {
    expect(deviceLabel("curl/8.0", 0)).toBe("Browser on this device")
  })
})

describe("deviceStatus", () => {
  const now = 1_800_000_000_000
  const device = (patch: Partial<PushDevice>): PushDevice => ({
    endpoint: "https://push.test/a",
    label: "Chrome on Linux",
    lastSeenAt: now,
    lastDeliveredAt: null,
    failedAt: null,
    ...patch,
  })

  it("is active now within a minute of the last contact", () => {
    expect(deviceStatus(device({ lastSeenAt: now - 59_000 }), now)).toBe("Active now")
  })

  it("prefers the last delivery over the last visit", () => {
    expect(deviceStatus(device({ lastSeenAt: now, lastDeliveredAt: now - 3 * 3_600_000 }), now)).toBe("Active 3h ago")
  })

  it("steps through minutes, days, weeks and years", () => {
    expect(deviceStatus(device({ lastSeenAt: now - 60_000 }), now)).toBe("Active 1m ago")
    expect(deviceStatus(device({ lastSeenAt: now - 2 * 86_400_000 }), now)).toBe("Active 2d ago")
    expect(deviceStatus(device({ lastSeenAt: now - 15 * 86_400_000 }), now)).toBe("Active 2w ago")
    expect(deviceStatus(device({ lastSeenAt: now - 800 * 86_400_000 }), now)).toBe("Active 2y ago")
  })

  it("reports a failure newer than the last delivery", () => {
    expect(deviceStatus(device({ failedAt: now - 1000 }), now)).toBe("Last push failed")
    expect(deviceStatus(device({ failedAt: now - 1000, lastDeliveredAt: now - 5000 }), now)).toBe("Last push failed")
    expect(deviceStatus(device({ failedAt: now - 5000, lastDeliveredAt: now - 1000 }), now)).toBe("Active now")
  })
})
