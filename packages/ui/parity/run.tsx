import { Glob } from "bun"
import { join } from "node:path"
import { renderToStaticMarkup } from "react-dom/server"
import { compare } from "./canon"
import type { Case } from "./case"

const dir = import.meta.dir
const fixtures: Record<string, { html: string; cap: string }> = await Bun.file(join(dir, "fixtures/specimens.json")).json()
const only = process.argv[2]
const verbose = Number(process.env.VERBOSE ?? 4)
const tokens = (text: string) => text.match(/[\w-]+="[^"]*"|\S+/g) ?? []
const differing = (expected: string, actual: string): [string, string] => {
  const a = tokens(expected)
  const b = tokens(actual)
  if (a[0] !== b[0] || a[0] === "text") return [expected, actual]
  return [`${a[0]} … ${a.filter((t) => !b.includes(t)).join(" ")}`, `${b[0]} … ${b.filter((t) => !a.includes(t)).join(" ")}`]
}
let failed = 0
let total = 0

for (const file of [...new Glob("cases/*.tsx").scanSync(dir)].sort()) {
  if (only && !file.includes(only)) continue
  const mod: { default: ReadonlyArray<Case & { component: string }> } = await import(join(dir, file))
  for (const item of mod.default) {
    total += 1
    const fixture = fixtures[item.ref]
    if (!fixture) {
      failed += 1
      console.log(`MISSING ${item.component} ${item.ref} ${item.name}`)
      continue
    }
    const frame = (item.measured ?? []).reduce((html, property) => html.replace(new RegExp(`\\s*${property}:[^;"]*;?`, "g"), ""), fixture.html)
    const result = compare(frame, renderToStaticMarkup(item.render()).replace(/<link rel="preload"[^>]*>/g, ""))
    if (result.mismatches.length === 0) {
      const note = item.measured ? `, ${item.measured.join(", ")} set at run time` : ""
      console.log(`pass ${item.component} ${item.ref} ${item.name} (${result.nodes} nodes${note})`)
      continue
    }
    failed += 1
    console.log(`FAIL ${item.component} ${item.ref} ${item.name}: ${result.mismatches.length}/${result.nodes}`)
    for (const m of result.mismatches.slice(0, verbose)) {
      const [frame, ours] = differing(m.expected, m.actual)
      console.log(`  ${m.path}\n    frame ${frame.slice(0, 600)}\n    ours  ${ours.slice(0, 600)}`)
    }
  }
}

console.log(`${total - failed}/${total} variants match their frame`)
process.exit(failed === 0 ? 0 : 1)
