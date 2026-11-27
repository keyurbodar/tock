#!/usr/bin/env bun
/**
 * Bundle budget for the web app: gzip sizes of what the first page load pulls (the entry script, every modulepreload and the CSS)
 * and of each lazy chunk. Run after `bun run build`; exits 1 when a budget is blown. Usage: bun scripts/budget.ts
 */
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { gzipSync } from "node:zlib"

const DIST = join(import.meta.dir, "../apps/web/dist")
const KB = 1024
/** Today's numbers with a little headroom; lower them as ui-sdk and marked move behind import() (target: initial JS under 150 KB gz). The editor chunk (TipTap, ProseMirror) loads right after first paint under the composer's static shell, so it has its own budget. */
const BUDGET = { initialJs: 310 * KB, css: 36 * KB, lazyChunk: 60 * KB, editor: 135 * KB }

const html = readFileSync(join(DIST, "index.html"), "utf8")
const initial = new Set([...html.matchAll(/(?:src|href)="\/assets\/([^"]+\.(?:js|css))"/g)].map((match) => match[1]!))
const gz = (file: string) => gzipSync(readFileSync(join(DIST, "assets", file))).length
const rows = readdirSync(join(DIST, "assets"))
  .filter((file) => /\.(js|css)$/.test(file))
  .map((file) => ({ file, gz: gz(file), initial: initial.has(file) }))
  .sort((a, b) => b.gz - a.gz)

const initialJs = rows.filter((row) => row.initial && row.file.endsWith(".js")).reduce((sum, row) => sum + row.gz, 0)
const css = rows.filter((row) => row.file.endsWith(".css")).reduce((sum, row) => sum + row.gz, 0)
/** Decoders that load only when a file needs them (a HEIC photo, a PDF) carry their own wasm or worker and are exempt from the lazy budget. */
const ON_DEMAND = /^(heic-to|pdf)/
const EDITOR = /^editor-kit/
const fat = rows.filter((row) => !row.initial && row.file.endsWith(".js") && !ON_DEMAND.test(row.file) && row.gz > (EDITOR.test(row.file) ? BUDGET.editor : BUDGET.lazyChunk))
const kb = (bytes: number) => (bytes / KB).toFixed(1).padStart(7) + " KB"

for (const row of rows) console.log(`${kb(row.gz)}  ${row.initial ? "initial " : ON_DEMAND.test(row.file) ? "on demand" : "lazy    "}  ${row.file}`)
console.log(`initial JS ${kb(initialJs)} gz (budget ${kb(BUDGET.initialJs)}), CSS ${kb(css)} gz (budget ${kb(BUDGET.css)})`)

const blown: string[] = [
  initialJs > BUDGET.initialJs && `initial JS is ${kb(initialJs)} gz, over ${kb(BUDGET.initialJs)}`,
  css > BUDGET.css && `CSS is ${kb(css)} gz, over ${kb(BUDGET.css)}`,
  ...fat.map((row) => `lazy chunk ${row.file} is ${kb(row.gz)} gz, over ${kb(EDITOR.test(row.file) ? BUDGET.editor : BUDGET.lazyChunk)}`),
].filter((line): line is string => Boolean(line))
/** With TOCK_URL set (a running app), also budget Core Web Vitals as the app reports them through web-vitals (window.__tockVitals). */
const url = process.env.TOCK_URL
if (url) {
  const ab = (...args: string[]) => Bun.spawnSync(["agent-browser", ...args]).stdout.toString().trim()
  ab("open", url)
  Bun.sleepSync(3000)
  ab("click", "body")
  Bun.sleepSync(1000)
  ab("open", url)
  Bun.sleepSync(1500)
  const vitals = JSON.parse(JSON.parse(ab("eval", "JSON.stringify(window.__tockVitals ?? {})") || '"{}"')) as Record<string, { value: number }>
  const limits: Record<string, number> = { LCP: 2500, CLS: 0.1, INP: 200 }
  for (const [name, limit] of Object.entries(limits)) {
    const value = vitals[name]?.value
    console.log(`${name.padEnd(4)} ${value === undefined ? "not reported" : value.toFixed(name === "CLS" ? 3 : 0)} (budget ${limit})`)
    if (value !== undefined && value > limit) blown.push(`${name} is ${value.toFixed(3)}, over ${limit}`)
  }
}
for (const line of blown) console.error("budget: " + line)
process.exit(blown.length ? 1 : 0)
