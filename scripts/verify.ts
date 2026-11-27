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
    until(() => js<number>("return document.querySelectorAll('.tds-worklog .tds-plan-item').length"), (n) => n === 3, "the three plan steps from update_plan")
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
    const count = js<number>("return document.querySelectorAll('.tds-row-wrap:not([data-archived])').length")
    openRow()
    choose("Delete")
    until(() => exists(".tds-dialog"), Boolean, "the delete dialog")
    wait(300)
    shot("delete-dialog")
    choose("Cancel")
    until(() => exists(".tds-dialog"), (open) => !open, "the dialog to close")
    check(js<number>("return document.querySelectorAll('.tds-row-wrap:not([data-archived])').length") === count, "Cancel must not delete")
  },
  shortcuts() {
    ab("eval", "document.activeElement?.blur()")
    ab("press", "?")
    until(() => exists(".tds-keys"), Boolean, "the shortcuts dialog")
    wait(300)
    shot("shortcuts")
    ab("press", "Escape")
    until(() => exists(".tds-keys"), (open) => !open, "the shortcuts dialog to close")
    ab("click", ".tds-row-wrap:first-child .tds-row")
    until(() => js<boolean>("return location.pathname.startsWith('/t/')"), Boolean, "a chat to open")
    ab("eval", "document.activeElement?.blur()")
    const unread = () => js<boolean>("return document.querySelector('.tds-row[aria-current=page]')?.hasAttribute('data-unread') ?? false")
    const before = unread()
    ab("press", "Control+u")
    until(unread, (now) => now !== before, "Ctrl+U to toggle unread on the open chat")
    ab("press", "Control+u")
    until(unread, (now) => now === before, "Ctrl+U to toggle unread back")
  },
  notifications() {
    const unread = () => js<number>("return Number(document.querySelector('[data-bell] .tds-badge:not([data-zero])')?.textContent?.trim() || 0)")
    const before = unread()
    ab("click", "button[aria-label='New chat']")
    until(() => js<string>("return location.pathname"), (p) => /^\/t\/[0-9a-f-]{36}$/.test(p), "a fresh chat")
    ab("click", ".ProseMirror")
    ab("keyboard", "type", "Check the weather in Tokyo and summarise it")
    ab("press", "Enter")
    until(() => exists(".tds-bubble[data-side='me']"), Boolean, "my bubble")
    const fresh = js<string>("return location.pathname")
    ab("eval", "[...document.querySelectorAll('.tds-row:not([aria-current])')][0]?.click()")
    until(() => js<string>("return location.pathname"), (p) => p !== fresh, "another chat to open")
    until(unread, (now) => now > before, "a bell badge once the run finishes elsewhere", 20000)
    ab("click", "[data-bell]")
    until(() => exists(".tds-centre[data-open]"), Boolean, "the notification centre to open")
    until(() => exists(".tds-centre .tds-note"), Boolean, "a note in the centre")
    wait(400)
    shot("notifications")
    ab("click", ".tds-centre .tds-centre-read")
    until(unread, (now) => now === 0, "Mark All Read to clear the badge")
    ab("press", "Escape")
    until(() => exists(".tds-centre[data-open]"), (open) => !open, "Escape to close the centre")
  },
  palette() {
    ab("press", "Control+k")
    until(() => exists(".tds-palette"), Boolean, "the palette on Ctrl+K")
    check(js<boolean>("return document.activeElement?.getAttribute('aria-label') === 'Search or run a command'"), "the palette input should take focus")
    const chats = js<number>("return document.querySelectorAll('.tds-palette-list .tds-palette-item').length")
    check(chats >= 3, `palette should list actions and chats, got ${chats}`)
    wait(250)
    shot("palette")
    ab("keyboard", "type", "keyboard short")
    until(() => js<string[]>("return [...document.querySelectorAll('.tds-palette-list .tds-palette-item:not([hidden])')].map((e) => e.textContent.trim())"), (items) => items.length === 1 && items[0]!.startsWith("Keyboard Shortcuts"), "filtering to Keyboard Shortcuts")
    ab("press", "Enter")
    until(() => exists(".tds-keys"), Boolean, "Enter to run the action")
    until(() => exists(".tds-palette"), (open) => !open, "the palette to close when an action runs")
    ab("press", "Escape")
    until(() => exists(".tds-keys"), (open) => !open, "the shortcuts dialog to close")
    ab("press", "Control+k")
    until(() => exists(".tds-palette"), Boolean, "the palette again")
    ab("press", "Escape")
    until(() => exists(".tds-palette"), (open) => !open, "Escape to close the palette")
  },
  links() {
    ab("click", "button[aria-label='New chat']")
    until(() => js<string>("return location.pathname"), (p) => /^\/t\//.test(p), "a new chat")
    ab("click", ".ProseMirror")
    ab("keyboard", "type", "see https://github.com/keyurbodar/tock ")
    until(() => exists(".tds-input .tds-chip[data-kind='link']"), Boolean, "a typed URL plus space to become a link chip")
    check(js<string>("return document.querySelector('.tds-input .tds-chip[data-kind=link]').textContent") === "github.com/keyurbodar/tock", "the link chip reads host and path")
    shot("links-typed")
    ab("keyboard", "type", "for the repo")
    ab("press", "Enter")
    until(() => exists(".tds-bubble[data-side='me'] a.tds-link[data-link='web']"), Boolean, "the sent link")
    const link = ".tds-bubble[data-side='me'] a.tds-link[data-link='web']"
    check(exists(`${link} .tds-link-fav`), "the link leads with the site's mark")
    check(js<string>(`return document.querySelector(${JSON.stringify(link)}).textContent`) === "github.com/keyurbodar/tock", "the link reads host and path")
    check(js<string>(`return document.querySelector(${JSON.stringify(link)}).getAttribute('href')`) === "https://github.com/keyurbodar/tock", "the link keeps the full URL")
    ab("hover", link)
    wait(700)
    check(!exists(".tds-hover-card, .tds-thread-card"), "plain links get no hover card")
    shot("links-hover")
    const at = rect(link)!
    ab("mouse", "move", String(at.x + at.w / 2), String(at.y + at.h / 2))
    ab("mouse", "down", "right")
    ab("mouse", "up", "right")
    until(() => js<string[]>("return [...document.querySelectorAll('.tds-menu .tds-menu-item')].map((e) => e.textContent.trim())"), (items) => items.includes("Open Link") && items.includes("Copy Link"), "the link context menu")
    shot("links-menu")
    choose("Copy Link")
    until(() => js<string>("return [...document.querySelectorAll('.tds-toast-title')].map((e) => e.textContent).join('|')"), (t) => t.includes("Link copied"), "the Link copied toast")
    wait(450)
    shot("links-toast")
  },
  mention() {
    const target = js<string>("return document.querySelector('.tds-row .tds-row-title, .tds-row b')?.textContent?.trim() ?? ''")
    ab("click", "button[aria-label='New chat']")
    until(() => js<string>("return location.pathname"), (p) => /^\/t\//.test(p), "a new chat")
    ab("click", ".ProseMirror")
    ab("keyboard", "type", "ask @")
    until(() => exists(".tds-suggest .tds-menu-item"), Boolean, "the @ menu")
    const query = js<string>("return document.querySelector('.tds-suggest .tds-menu-item .tds-suggest-label').textContent").split(" ")[0]!.slice(0, 4)
    ab("keyboard", "type", query)
    const first = until(() => js<string>("return document.querySelector('.tds-suggest [data-highlighted] .tds-suggest-label')?.textContent ?? ''"), (t) => t.toLowerCase().includes(query.toLowerCase()), "the filtered mention")
    shot("mention-menu")
    ab("press", "Enter")
    until(() => exists(".tds-input .tds-chip[data-kind='thread']"), Boolean, "the thread token")
    check(!exists(".tds-suggest"), "the menu closes after choosing")
    ab("press", "Backspace")
    ab("press", "Backspace")
    check(exists(".tds-input .tds-chip.ProseMirror-selectednode"), "the first Backspace after the space selects the token")
    ab("press", "Backspace")
    check(!exists(".tds-input .tds-chip[data-kind='thread']"), "the second Backspace deletes it")
    ab("keyboard", "type", `@${query}`)
    until(() => exists(".tds-suggest .tds-menu-item"), Boolean, "the @ menu again")
    ab("press", "Tab")
    ab("keyboard", "type", "to check")
    ab("press", "Enter")
    until(() => exists(".tds-bubble[data-side='me'] .tds-chip[data-kind='thread']"), Boolean, "the sent thread chip")
    check(js<string>("return document.querySelector('.tds-bubble[data-side=me] .tds-chip[data-kind=thread]').textContent") === first, "the chip shows the chat title")
    ab("hover", ".tds-bubble[data-side='me'] .tds-chip[data-kind='thread']")
    check(!exists(".tds-thread-card"), "the thread card waits for hover intent")
    until(() => exists(".tds-thread-card"), Boolean, "the thread card", 2500)
    wait(250)
    shot("mention-card")
    ab("mouse", "move", "5", "5")
    until(() => exists(".tds-thread-card"), (open) => !open, "the thread card to leave", 2500)
    void target
  },
  command() {
    ab("click", "button[aria-label='New chat']")
    until(() => exists(".ProseMirror"), Boolean, "the composer")
    ab("click", ".ProseMirror")
    ab("keyboard", "type", "/sho")
    until(() => js<string[]>("return [...document.querySelectorAll('.tds-suggest .tds-suggest-label')].map((e) => e.textContent)"), (items) => items.length === 1 && items[0] === "/shortcuts", "the / menu filtered to /shortcuts")
    shot("command-menu")
    ab("press", "Enter")
    until(() => exists(".tds-keys"), Boolean, "the command to run")
    check(js<string>("return document.querySelector('.ProseMirror').textContent") === "", "the command text is cleared")
    ab("press", "Escape")
    until(() => exists(".tds-keys"), (open) => !open, "the shortcuts dialog to close")
  },
  toasts() {
    const title = js<string>("return document.querySelector('.tds-row-wrap .tds-row')?.getAttribute('aria-label') ?? document.querySelector('.tds-row-wrap')?.textContent ?? ''")
    const before = js<number>("return document.querySelectorAll('.tds-row-wrap:not([data-archived])').length")
    openRow()
    choose("Archive")
    until(() => js<string>("return [...document.querySelectorAll('.tds-toast-title')].map((e) => e.textContent).join('|')"), (t) => t.includes("Archived"), "the Archived toast")
    wait(450)
    shot("toast-archived")
    check(exists(".tds-toast-action"), "the toast offers Undo")
    js<boolean>("const b = [...document.querySelectorAll('.tds-toast-action')].find((e) => e.textContent.trim() === 'Undo'); b?.click(); return !!b")
    until(() => js<string>("return [...document.querySelectorAll('.tds-toast-title')].map((e) => e.textContent).join('|')"), (t) => t.includes("Restored"), "Undo to restore")
    until(() => js<number>("return document.querySelectorAll('.tds-row-wrap:not([data-archived])').length"), (n) => n === before, "the row back in the list")
    void title
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
    until(() => exists(".tds-sent-image img") && exists(".tds-file-card[data-side='me'] .tds-attach-glyph[data-kind='code']"), Boolean, "the sent image and file card")
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

const order = ["doctor", "shell", "resize", "send", "worklog", "menu", "pin", "rename", "dialog", "shortcuts", "palette", "notifications", "plus", "attach", "links", "mention", "command", "toasts", "diagnostics"]
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
