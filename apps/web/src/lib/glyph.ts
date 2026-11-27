import type { IconName } from "@tock/ui/icon"

const glyphs: readonly { icon: IconName; hue: string }[] = [
  { icon: "code", hue: "text-hue-blue" },
  { icon: "calendar-check", hue: "text-hue-rose" },
  { icon: "chart-line-up", hue: "text-hue-sage" },
  { icon: "hash", hue: "text-hue-violet" },
  { icon: "globe", hue: "text-hue-sand" },
  { icon: "broom", hue: "text-hue-butter" },
  { icon: "currency-dollar", hue: "text-hue-teal" },
  { icon: "airplane-tilt", hue: "text-hue-sky" },
  { icon: "palette", hue: "text-hue-pink" },
]

export const glyphFor = (id: string) => glyphs[[...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % glyphs.length]!
