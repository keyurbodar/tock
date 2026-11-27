import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"

const roots = ["apps/web/src", "packages/ui/src"]
const rules: { name: string; test: RegExp; why: string }[] = [
  { name: "arbitrary-utility", test: /(?<![\w-])[a-z][\w:-]*-\[[^\]]+\](?!:)/g, why: "Tailwind arbitrary values bypass tokens. Add a token to tokens.json instead." },
  { name: "hex-colour", test: /#[0-9a-fA-F]{3,8}\b(?![\w-])/g, why: "Colours live in tokens.json." },
  { name: "rgb-colour", test: /\b(rgba?|hsla?)\(/g, why: "Colours live in tokens.json." },
  { name: "raw-duration", test: /\b\d{2,4}ms\b/g, why: "Durations live in tokens.json (motion.duration)." },
  { name: "cubic-bezier", test: /cubic-bezier\(/g, why: "Curves live in tokens.json (motion.curve)." },
  { name: "jsx-number", test: /\w=\{-?(?:[1-9]\d*(?:\.\d+)?|0?\.\d+)\}/g, why: "Numbers in JSX props are tweakable values. Read them from tokens (import { tokens } from \"@tock/tokens\")." },
  { name: "timer-literal", test: /setTimeout\([^)]*,\s*\d+\s*\)/g, why: "Timer delays are motion durations. Use tokens.motion.duration." },
]
const allow = /icons\.gen\.ts$/

async function* walk(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(path)
    else if (/\.(tsx?|css)$/.test(entry.name) && !allow.test(path)) yield path
  }
}

let failures = 0
for (const root of roots) {
  for await (const file of walk(root)) {
    const lines = (await readFile(file, "utf8")).split("\n")
    lines.forEach((line, i) => {
      if (line.includes("lint-tokens-ignore")) return
      for (const rule of rules) {
        for (const match of line.matchAll(rule.test)) {
          failures++
          console.error(`${file}:${i + 1}  ${rule.name}  ${match[0]}  ${rule.why}`)
        }
      }
    })
  }
}
if (failures) {
  console.error(`\n${failures} token violation(s)`)
  process.exit(1)
}
console.log("tokens: no loose values")
