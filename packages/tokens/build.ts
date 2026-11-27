import { mkdir, writeFile } from "node:fs/promises"
import source from "./tokens.json" with { type: "json" }

type Tokens = typeof source
const t: Tokens = source
const px = (n: number) => (n === 0 ? "0" : `${n}px`)
const rem = (n: number) => `${+(n / 16).toFixed(5)}rem`
const lines: string[] = []
const theme: string[] = []
const v = (name: string, value: string | number) => lines.push(`  --tds-${name}: ${value};`)
const th = (name: string, value: string) => theme.push(`  --${name}: ${value};`)

const colorNames = new Set<string>()
const color = (tailwind: string, cssVar: string) => {
  if (colorNames.has(tailwind)) throw new Error(`duplicate colour token ${tailwind}`)
  colorNames.add(tailwind)
  th(`color-${tailwind}`, `var(--tds-${cssVar})`)
}

for (const [k, val] of Object.entries(t.color.surface)) { v(`surface-${k}`, val); color(k, `surface-${k}`) }
for (const [k, val] of Object.entries(t.color.text)) {
  v(`text-${k}`, val)
  color(k in t.color.surface || k in t.color.accent ? `on-${k}` : k, `text-${k}`)
}
for (const [k, val] of Object.entries(t.color.accent)) { v(`accent-${k}`, val); color(k, `accent-${k}`) }
for (const [k, val] of Object.entries(t.color.status)) { v(`status-${k}`, val); color(k, `status-${k}`) }
for (const [k, val] of Object.entries(t.color.wash)) { v(`wash-${k}`, val); color(`wash-${k}`, `wash-${k}`) }
for (const [k, val] of Object.entries(t.color.swipe)) { v(`swipe-${k}`, val); color(`swipe-${k}`, `swipe-${k}`) }
for (const [k, val] of Object.entries(t.color.overlay)) { v(`overlay-${k}`, val); color(k, `overlay-${k}`) }
for (const [k, val] of Object.entries(t.color.code)) { v(`code-${k}`, val); color(`code-${k}`, `code-${k}`) }
for (const [k, val] of Object.entries(t.color.hue)) { v(`hue-${k}`, val); color(`hue-${k}`, `hue-${k}`) }
for (const [k, val] of Object.entries(t.color.chip)) { v(`chip-${k}`, val); color(`chip-${k}`, `chip-${k}`) }
th("color-transparent", "transparent")
th("color-current", "currentColor")

const m = t.material
v("glass-fill", m.glass.fill); v("glass-fill-on", m.glass["fill-on"]); v("glass-shadow", m.glass.shadow)
v("over-fill", m.over.fill); v("over-blur", m.over.blur); v("over-saturate", m.over.saturate); v("over-shadow", m.over.shadow)
v("cap-fill", m.cap.fill); v("cap-shadow", m.cap.shadow); v("cap-lift", m.cap.lift)
v("key-fill", m.key.fill); v("key-shadow", m.key.shadow)
v("key-cream-fill", m["key-cream"].fill); v("key-cream-shadow", m["key-cream"].shadow)
v("focus-outline", m.focus.outline)
for (const [k, val] of Object.entries(m.raise)) v(`raise-${k}`, val)
for (const [k, val] of Object.entries(m.backdrop)) v(`backdrop-${k}`, val)
for (const [k, val] of Object.entries(m.lift)) v(`lift-${k}`, val)
for (const [k, val] of Object.entries(m.tip)) v(`tip-${k}`, val)
v("veil-blur", m.veil.blur); v("veil-saturate", m.veil.saturate)
v("pill-blur", m.pill.blur); v("pill-saturate", m.pill.saturate)
for (const [k, val] of Object.entries(m.followup)) v(`followup-${k}`, val)
for (const [k, val] of Object.entries(m.ring)) { v(`ring-${k}`, val); th(`shadow-ring-${k}`, `var(--tds-ring-${k})`) }
for (const [k, val] of Object.entries(t.optical)) if (typeof val === "number") v(`optical-${k}`, px(val))
color("glass", "glass-fill"); color("glass-on", "glass-fill-on"); color("over", "over-fill")
for (const [name, cssVar] of [["glass", "glass-shadow"], ["over", "over-shadow"], ["cap", "cap-shadow"], ["cap-lift", "cap-lift"], ["key", "key-shadow"], ["cream", "key-cream-shadow"], ["ghost", "lift-ghost"], ["media", "lift-media"], ["fan", "lift-fan"], ["remove", "lift-remove"]] as const)
  th(`shadow-${name}`, `var(--tds-${cssVar})`)

v("font-sans", t.font.sans); v("font-mono", t.font.mono)
th("font-sans", "var(--tds-font-sans)"); th("font-mono", "var(--tds-font-mono)")
for (const [k, w] of Object.entries(t.weight)) { v(`weight-${k}`, w); th(`font-weight-${k}`, `var(--tds-weight-${k})`) }
for (const [role, [size, lh, weight, tracking]] of Object.entries(t.type) as [string, [number, number, number, string]][]) {
  v(`type-${role}-size`, rem(size)); v(`type-${role}-leading`, px(lh)); v(`type-${role}-lh`, `calc(${lh} / ${size})`); v(`type-${role}-weight`, weight); v(`type-${role}-tracking`, tracking)
  th(`text-${role}`, `var(--tds-type-${role}-size)`)
  th(`text-${role}--line-height`, `var(--tds-type-${role}-lh)`)
  th(`text-${role}--letter-spacing`, `var(--tds-type-${role}-tracking)`)
  th(`text-${role}--font-weight`, `var(--tds-type-${role}-weight)`)
}

for (const n of t.space) { v(`space-${n}`, px(n)); th(`spacing-${n}`, `var(--tds-space-${n})`) }
th("spacing-full", "100%")
const textBox = new Set<string>(t["text-box"])
for (const [k, n] of Object.entries(t.size)) { v(`size-${k}`, textBox.has(k) ? rem(n) : px(n)); th(`spacing-${k}`, `var(--tds-size-${k})`) }
for (const [k, n] of Object.entries(t.radius)) { v(`radius-${k}`, k === "pill" ? "9999px" : typeof n === "number" ? px(n) : n); th(`radius-${k}`, `var(--tds-radius-${k})`) }

for (const [k, c] of Object.entries(t.motion.curve)) { v(`ease-${k}`, c); th(`ease-${k}`, `var(--tds-ease-${k})`) }
for (const [k, d] of Object.entries(t.motion.duration)) v(`dur-${k}`, `${d}ms`)
v("press", t.motion.press); v("press-row", t.motion["press-row"]); v("press-tight", t.motion["press-tight"]); v("stagger", `${t.motion.stagger}ms`)
for (const [k, b] of Object.entries(t.motion.blur)) { v(`blur-${k}`, b); th(`blur-${k}`, `var(--tds-blur-${k})`) }
th("blur-over", "var(--tds-over-blur)"); th("blur-veil", "var(--tds-veil-blur)")
for (const [k, z] of Object.entries(t.z)) v(`z-${k}`, z)
for (const [k, s] of Object.entries(t.icon)) v(`icon-${k}`, k === "weight-boost" || k.startsWith("stroke-") ? s : px(s))

th("breakpoint-md", "48rem"); th("breakpoint-lg", "64rem"); th("breakpoint-xl", "80rem")
th("animate-shimmer", "tds-shimmer var(--tds-dur-loop) linear infinite")
th("animate-breathe", "tds-breathe var(--tds-dur-loop) ease-in-out infinite")
th("animate-spin", "tds-spin var(--tds-dur-spin) linear infinite")

const banner = "/* generated by packages/tokens/build.ts from tokens.json, do not edit */\n"
const css = `${banner}:root {\n${lines.join("\n")}\n}\n`
const utilities = Object.keys(t.motion.duration).map((k) => `@utility duration-${k} {\n  transition-duration: var(--tds-dur-${k});\n}`)
const themeCss = `${banner}@theme inline {\n  --*: initial;\n${theme.join("\n")}\n}\n${utilities.join("\n")}\n`
const ts = `${banner.replace("/*", "//").replace(" */", "")}export const tokens = ${JSON.stringify(t, null, 2)} as const\n\nexport type Tokens = typeof tokens\nexport type Duration = keyof Tokens["motion"]["duration"]\nexport type Curve = keyof Tokens["motion"]["curve"]\nexport type Spring = keyof Tokens["motion"]["spring"]\nexport const duration = (name: Duration): number => tokens.motion.duration[name]\nexport const curve = (name: Curve): string => tokens.motion.curve[name]\nexport const spring = (name: Spring) => tokens.motion.spring[name]\nexport const cssVar = (name: string) => \`var(--tds-\${name})\`\n`

await mkdir(new URL("./dist/", import.meta.url), { recursive: true })
await writeFile(new URL("./dist/tokens.css", import.meta.url), css)
await writeFile(new URL("./dist/theme.css", import.meta.url), themeCss)
await writeFile(new URL("./dist/tokens.ts", import.meta.url), ts)
console.log(`tokens: ${lines.length} custom properties, ${theme.length} theme keys`)
