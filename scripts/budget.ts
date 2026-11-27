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
/** Today's numbers with a little headroom; lower them as tiptap and ui-sdk move behind import() (target: initial JS under 150 KB gz). */
const BUDGET = { initialJs: 420 * KB, css: 34 * KB, lazyChunk: 60 * KB }

const html = readFileSync(join(DIST, "index.html"), "utf8")
const initial = new Set([...html.matchAll(/(?:src|href)="\/assets\/([^"]+\.(?:js|css))"/g)].map((match) => match[1]!))
const gz = (file: string) => gzipSync(readFileSync(join(DIST, "assets", file))).length
const rows = readdirSync(join(DIST, "assets"))
  .filter((file) => /\.(js|css)$/.test(file))
  .map((file) => ({ file, gz: gz(file), initial: initial.has(file) }))
  .sort((a, b) => b.gz - a.gz)

const initialJs = rows.filter((row) => row.initial && row.file.endsWith(".js")).reduce((sum, row) => sum + row.gz, 0)
const css = rows.filter((row) => row.file.endsWith(".css")).reduce((sum, row) => sum + row.gz, 0)
const fat = rows.filter((row) => !row.initial && row.file.endsWith(".js") && row.gz > BUDGET.lazyChunk)
const kb = (bytes: number) => (bytes / KB).toFixed(1).padStart(7) + " KB"

for (const row of rows) console.log(`${kb(row.gz)}  ${row.initial ? "initial" : "lazy   "}  ${row.file}`)
console.log(`initial JS ${kb(initialJs)} gz (budget ${kb(BUDGET.initialJs)}), CSS ${kb(css)} gz (budget ${kb(BUDGET.css)})`)

const blown = [
  initialJs > BUDGET.initialJs && `initial JS is ${kb(initialJs)} gz, over ${kb(BUDGET.initialJs)}`,
  css > BUDGET.css && `CSS is ${kb(css)} gz, over ${kb(BUDGET.css)}`,
  ...fat.map((row) => `lazy chunk ${row.file} is ${kb(row.gz)} gz, over ${kb(BUDGET.lazyChunk)}`),
].filter(Boolean)
for (const line of blown) console.error("budget: " + line)
process.exit(blown.length ? 1 : 0)
