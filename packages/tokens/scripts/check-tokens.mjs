import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

const root = new URL("../../..", import.meta.url).pathname
const scanRoots = ["apps/web-solid/src", "packages/ui-solid/src"]
const extensions = new Set([".css", ".ts", ".tsx"])
const failures = []

function extensionOf(file) {
  const index = file.lastIndexOf(".")
  return index === -1 ? "" : file.slice(index)
}

function walk(dir, out = []) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const entry of entries) {
    const file = join(dir, entry)
    if (statSync(file).isDirectory()) walk(file, out)
    else if (extensions.has(extensionOf(file))) out.push(file)
  }
  return out
}

const checks = [
  {
    label: "raw color",
    pattern: /#[0-9a-fA-F]{3,8}\b|\b(?:oklch|oklab|rgb|rgba|hsl|hsla)\(/g,
  },
  {
    label: "raw pixel dimension",
    pattern: /(?<![-\w])\d+(?:\.\d+)?px\b/g,
  },
  {
    label: "raw z-index",
    pattern: /(?:z-index\s*:\s*\d|zIndex\s*:\s*\d)/g,
  },
]

for (const scanRoot of scanRoots) {
  for (const file of walk(join(root, scanRoot))) {
    const text = readFileSync(file, "utf8")
    for (const check of checks) {
      check.pattern.lastIndex = 0
      let match
      while ((match = check.pattern.exec(text))) {
        const line = text.slice(0, match.index).split("\n").length
        failures.push(`${relative(root, file)}:${line} ${check.label}: ${match[0]}`)
      }
    }
  }
}

if (failures.length) {
  console.error(`token check failed:\n${failures.join("\n")}`)
  process.exit(1)
}

console.log("token check passed")
