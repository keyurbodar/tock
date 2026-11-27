#!/usr/bin/env bun
/**
 * Drives the running web app through agent-browser the way a person would and
 * fails loudly. Usage: bun scripts/verify.ts [journey ...]
 * Needs Vite on :5199 and wrangler dev on :8787 (see .agents/skills/verify-tock).
 */
import { mkdirSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const BASE = process.env.TOCK_URL ?? "http://localhost:5199"
const OUT = process.env.TOCK_VERIFY_OUT ?? join(homedir(), ".capy/work/verify", new Date().toISOString().replace(/[:.]/g, "-"))
mkdirSync(OUT, { recursive: true })

function ab(...args: string[]): string {
  const run = Bun.spawnSync(["agent-browser", ...args], { stdout: "pipe", stderr: "pipe" })
  const out = run.stdout.toString().trim()
  if (run.exitCode !== 0) throw new Error(`agent-browser ${args.join(" ")} failed: ${run.stderr.toString().trim() || out}`)
  return out
}
const js = <T>(code: string): T => JSON.parse(ab("eval", `JSON.stringify((() => { ${code} })())`).replace(/^"|"$/g, "").replace(/\\"/g, '"')) as T
const wait = (ms: number) => Bun.sleepSync(ms)
const shot = (name: string) => ab("screenshot", join(OUT, `${name}.png`))
function check(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message)
}
function until<T>(read: () => T, ok: (value: T) => boolean, what: string, ms = 8000): T {
  const end = Date.now() + ms
  let value = read()
  while (!ok(value)) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what} (last: ${JSON.stringify(value)})`)
    wait(150)
    value = read()
  }
  return value
}
const rect = (sel: string) => js<{ x: number; y: number; w: number; h: number } | null>(
  `const r = document.querySelector(${JSON.stringify(sel)})?.getBoundingClientRect(); return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null`,
)
const exists = (sel: string) => js<boolean>(`return !!document.querySelector(${JSON.stringify(sel)})`)
const style = (sel: string, prop: string) => js<string | null>(`const e = document.querySelector(${JSON.stringify(sel)}); return e ? getComputedStyle(e)[${JSON.stringify(prop)}] : null`)
const transparent = (value: string | null) => value === "rgba(0, 0, 0, 0)" || value === "transparent"
const choose = (label: string) =>
  check(
    js<boolean>(`const e = [...document.querySelectorAll('.tds-menu-item, .tds-button')].find((el) => el.textContent.trim() === ${JSON.stringify(label)}); e?.click(); return !!e`),
    `no "${label}" item`,
  )
const openRow = () => {
  ab("hover", ".tds-row-wrap")
  ab("click", ".tds-row-wrap .tds-row-more")
  until(() => exists(".tds-menu"), Boolean, "the thread menu")
}

const journeys: Record<string, () => void> = {
  doctor() {
    for (const url of [BASE, `${BASE}/api/health`]) check(Bun.spawnSync(["curl", "-sf", "-o", "/dev/null", url]).exitCode === 0, `${url} is not answering`)
    ab("open", BASE)
    ab("set", "viewport", "1440", "900")
    ab("errors", "--clear")
    ab("console", "--clear")
  },
  shell() {
    ab("eval", "localStorage.removeItem('tock.sidebar.width')")
    ab("open", BASE)
    until(() => exists(".tds-row"), Boolean, "sidebar rows")
    check(rect(".tds-sidebar")?.w === 320, `sidebar should start at 320px, got ${rect(".tds-sidebar")?.w}`)
    shot("shell")
  },
  resize() {
    const handle = rect(".tds-sidebar-handle")
    check(handle, "no resize handle")
    const x = handle.x + handle.w / 2
    const y = handle.y + handle.h / 2
    ab("mouse", "move", String(x), String(y))
    ab("mouse", "down")
    ab("mouse", "move", String(x + 60), String(y), "--steps", "8")
    ab("mouse", "up")
    check(rect(".tds-sidebar")?.w === 380, `drag +60 should give 380px, got ${rect(".tds-sidebar")?.w}`)
    ab("mouse", "move", String(x + 400), String(y))
    ab("open", BASE)
    until(() => rect(".tds-sidebar")?.w, (w) => w === 380, "the saved width after reload")
    ab("dblclick", ".tds-sidebar-handle")
    check(rect(".tds-sidebar")?.w === 320, "double-click should reset to 320px")
    ab("open", BASE)
    until(() => rect(".tds-sidebar")?.w, (w) => w === 320, "the reset width after reload")
    ab("focus", ".tds-sidebar-handle")
    ab("press", "ArrowRight")
    check(rect(".tds-sidebar")?.w === 336, `ArrowRight should widen by 16px, got ${rect(".tds-sidebar")?.w}`)
    ab("press", "ArrowLeft")
    shot("resize")
  },
  send() {
    ab("click", "button[aria-label='New chat']")
    const path = until(() => js<string>("return location.pathname"), (p) => /^\/t\/[0-9a-f-]{36}$/.test(p), "a UUID thread url")
    ab("click", ".ProseMirror")
    ab("keyboard", "type", "Check the weather in Tokyo and summarise it")
    ab("press", "Enter")
    until(() => exists(".tds-bubble[data-side='me']"), Boolean, "my bubble")
    until(() => exists(".tds-bubble[data-side='agent']"), Boolean, "an agent reply", 15000)
    check(js<string>("return location.pathname") === path, "the thread url changed after sending")
    shot("send")
  },
  worklog() {
    until(() => exists(".tds-act-button"), Boolean, "an activity line", 15000)
    check(transparent(style(".tds-act-button", "backgroundColor")), "the activity line must have no background")
    check(transparent(style(".tds-act-caret", "backgroundColor")), "the activity caret must have no background")
    ab("hover", ".tds-act-button")
    check(transparent(style(".tds-act-button", "backgroundColor")), "the activity line must have no hover background")
    ab("click", ".tds-act-button")
    until(() => exists(".tds-worklog .tds-ws-line"), Boolean, "the work log rows")
    check(js<boolean>("return [...document.querySelectorAll('.tds-ws-line')].every((e) => ['rgba(0, 0, 0, 0)', 'transparent'].includes(getComputedStyle(e).backgroundColor))"), "work log rows must have no background")
    ab("hover", ".tds-ws-line")
    check(transparent(style(".tds-ws-line", "backgroundColor")), "work log rows must have no hover background")
    shot("worklog-open")
    ab("press", "Escape")
    until(() => exists(".tds-worklog"), (open) => !open, "the work log to close")
  },
  menu() {
    openRow()
    const items = js<string[]>("return [...document.querySelectorAll('.tds-menu .tds-menu-item')].map((e) => e.textContent.trim())")
    check(items.includes("Rename") && items.includes("Delete"), `menu items: ${items.join(", ")}`)
    shot("menu")
    ab("press", "Escape")
    until(() => exists(".tds-menu"), (open) => !open, "the menu to close")
  },
  pin() {
    openRow()
    const before = js<boolean>("return !!document.querySelector('.tds-row-wrap .tds-row-pin')")
    choose(before ? "Unpin" : "Pin")
    until(() => js<boolean>("return !!document.querySelector('.tds-row-wrap .tds-row-pin')"), (now) => now !== before, "the pin to toggle")
    openRow()
    choose(before ? "Pin" : "Unpin")
    until(() => js<boolean>("return !!document.querySelector('.tds-row-wrap .tds-row-pin')"), (now) => now === before, "the pin to toggle back")
  },
  rename() {
    const before = js<string>("return document.querySelector('.tds-row-wrap .tds-row-title').textContent.trim()")
    openRow()
    choose("Rename")
    until(() => js<boolean>("return document.activeElement?.classList.contains('tds-row-rename') ?? false"), Boolean, "the rename field to focus")
    ab("keyboard", "type", "Renamed by verify")
    ab("press", "Enter")
    until(() => js<string>("return document.querySelector('.tds-row-wrap .tds-row-title').textContent.trim()"), (t) => t === "Renamed by verify", "the new title")
    ab("open", BASE)
    until(() => js<string>("return document.querySelector('.tds-row-wrap .tds-row-title')?.textContent.trim() ?? ''"), (t) => t === "Renamed by verify", "the title after reload")
    openRow()
    choose("Rename")
    until(() => js<boolean>("return document.activeElement?.classList.contains('tds-row-rename') ?? false"), Boolean, "the rename field to focus")
    ab("press", "Control+a")
    ab("keyboard", "type", before)
    ab("press", "Enter")
  },
  dialog() {
    const count = js<number>("return document.querySelectorAll('.tds-row-wrap').length")
    openRow()
    choose("Delete")
    until(() => exists(".tds-dialog"), Boolean, "the delete dialog")
    wait(300)
    shot("delete-dialog")
    choose("Cancel")
    until(() => exists(".tds-dialog"), (open) => !open, "the dialog to close")
    check(js<number>("return document.querySelectorAll('.tds-row-wrap').length") === count, "Cancel must not delete")
  },
  shortcuts() {
    ab("eval", "document.activeElement?.blur()")
    ab("press", "?")
    until(() => exists(".tds-keys"), Boolean, "the shortcuts dialog")
    wait(300)
    shot("shortcuts")
    ab("press", "Escape")
    until(() => exists(".tds-keys"), (open) => !open, "the shortcuts dialog to close")
  },
  search() {
    ab("press", "Control+k")
    check(js<boolean>("return document.activeElement?.getAttribute('aria-label') === 'Search chats'"), "Ctrl+K should focus search")
    ab("press", "Escape")
  },
  plus() {
    ab("click", "button[aria-label='New chat']")
    ab("click", ".tds-composer-plus")
    until(() => exists(".tds-menu"), Boolean, "the plus menu")
    const items = js<string[]>("return [...document.querySelectorAll('.tds-menu .tds-menu-item')].map((e) => e.textContent.trim())")
    check(items.some((t) => t.startsWith("Photos and Files")) && items.includes("Paste from Clipboard"), `plus menu items: ${items.join(", ")}`)
    shot("plus-menu")
    ab("press", "Escape")
    until(() => exists(".tds-menu"), (open) => !open, "the plus menu to close")
  },
  attach() {
    const work = join(homedir(), ".capy/work")
    ab("click", "button[aria-label='New chat']")
    until(() => exists(".tds-composer-wrap input[type=file]"), Boolean, "the composer")
    ab("upload", ".tds-composer-wrap input[type=file]", join(work, "verify-notes.md"), join(work, "verify-pixel.png"))
    until(() => js<string[]>("return [...document.querySelectorAll('.tds-attach')].map((e) => e.dataset.status)"), (s) => s.length === 2 && s.every((x) => x === "done"), "both uploads to finish", 15000)
    shot("attach-tray")
    ab("click", ".ProseMirror")
    ab("keyboard", "type", "Here are two files")
    ab("press", "Enter")
    until(() => exists(".tds-sent-image img") && exists(".tds-file-card"), Boolean, "the sent image and file card")
    check(!exists(".tds-attach"), "the tray should clear after sending")
    until(() => js<boolean>("const img = document.querySelector('.tds-sent-image img'); return !!img && img.complete && img.naturalWidth > 0"), Boolean, "the sent image to load")
    check(!js<string>("return document.querySelector('.tds-bubble[data-side=me]:last-of-type')?.textContent ?? ''").includes("tock-file:"), "raw file links must not show in the bubble")
    check(!js<string>("return document.querySelector('.tds-header-pill')?.textContent ?? ''").includes(".png"), "the title should not list file names when there is text")
    until(() => rect(".tds-field")?.h, (h) => h === 38, "the composer to shrink back after sending")
    shot("attach-sent")
  },
  diagnostics() {
    const logs = ab("console")
    const bad = logs.split("\n").filter((line) => /REACTIVITY|STRICT_READ|UNSTABLE_LIST|CLEANUP_IN|\[error\]/.test(line))
    check(bad.length === 0, `console diagnostics:\n${bad.slice(0, 5).join("\n")}`)
    const errors = ab("errors")
    check(!/Error/.test(errors), `page errors:\n${errors.slice(0, 600)}`)
  },
}

const order = ["doctor", "shell", "resize", "send", "worklog", "menu", "pin", "rename", "dialog", "shortcuts", "search", "plus", "attach", "diagnostics"]
const picked = process.argv.slice(2)
const run = picked.length ? ["doctor", ...picked.filter((name) => name !== "doctor")] : order
let failed = 0
for (const name of run) {
  const journey = journeys[name]
  if (!journey) throw new Error(`unknown journey ${name}; known: ${order.join(", ")}`)
  const started = Date.now()
  try {
    journey()
    console.log(`ok    ${name.padEnd(12)} ${Date.now() - started}ms`)
  } catch (error) {
    failed++
    console.log(`FAIL  ${name.padEnd(12)} ${(error as Error).message}`)
    try {
      shot(`fail-${name}`)
    } catch {}
  }
}
console.log(`evidence: ${OUT}`)
process.exit(failed ? 1 : 0)
