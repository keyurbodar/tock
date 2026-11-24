import { Glob } from "bun"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { EFFECT_LIGHT } from "../src/effects"
import { COLOR_THEME_SHARED, DARK, DESKTOP, FONT, LIGHT, PROPERTIES, SHELL, THEME } from "../src/tokens"

const root = join(import.meta.dir, "../../..")
const defined = new Set([
  ...[THEME, FONT, SHELL, EFFECT_LIGHT, LIGHT, DARK, DESKTOP, COLOR_THEME_SHARED.light, COLOR_THEME_SHARED.dark].flatMap((table) => Object.keys(table)),
  ...PROPERTIES.map((property) => property.name),
])
const inputs = new Set(["shimmer-surface-base", "shimmer-surface-gradient", "available-height", "transform-origin", "anchor-width"])
const missing = new Map<string, Set<string>>()

for (const pattern of ["packages/ui/src/**/*.{css,tsx,ts}", "web/src/**/*.{css,tsx,ts}"]) {
  for (const file of new Glob(pattern).scanSync(root)) {
    const text = readFileSync(join(root, file), "utf8")
    const local = new Set([...text.matchAll(/(?:^|[\s;{"'[])--([a-z0-9-]+)["']?\s*:/g)].map((m) => m[1]))
    for (const [, name, fallback] of text.matchAll(/var\(--([a-z0-9-]+)\s*(,?)/g)) {
      if (!name || fallback || defined.has(name) || inputs.has(name) || local.has(name) || name.startsWith("tw-")) continue
      if (!missing.has(name)) missing.set(name, new Set())
      missing.get(name)?.add(file)
    }
  }
}

if (missing.size > 0) {
  for (const [name, files] of missing) console.error(`--${name}: ${[...files].join(", ")}`)
  process.exit(1)
}
console.log(`tokens ok: ${defined.size} defined`)
