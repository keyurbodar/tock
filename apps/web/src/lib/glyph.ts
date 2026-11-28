import type { IconName } from "@tock/ui/icon"

/** A channel's icon, its text hue class, and the matching Tock palette key for its animated duet icon. */
const glyphs: readonly { icon: IconName; hue: string; tone: string }[] = [
  { icon: "code", hue: "text-hue-blue", tone: "sky" },
  { icon: "calendar-check", hue: "text-hue-rose", tone: "rose" },
  { icon: "chart-line-up", hue: "text-hue-sage", tone: "sage" },
  { icon: "hash", hue: "text-hue-violet", tone: "lilac" },
  { icon: "globe", hue: "text-hue-sand", tone: "sand" },
  { icon: "broom", hue: "text-hue-butter", tone: "ochre" },
  { icon: "currency-dollar", hue: "text-hue-teal", tone: "teal" },
  { icon: "airplane-tilt", hue: "text-hue-sky", tone: "slate" },
  { icon: "palette", hue: "text-hue-pink", tone: "plum" },
]

export const glyphFor = (id: string) => glyphs[[...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % glyphs.length]!
