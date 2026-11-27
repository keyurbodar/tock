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
function png(path: string, width: number, height: number, rgb: readonly [number, number, number]) {
  const { deflateSync } = require("node:zlib") as typeof import("node:zlib")
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3).map((_, i) => rgb[i % 3]!)])
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data])
    const out = Buffer.alloc(12 + data.length)
    out.writeUInt32BE(data.length, 0)
    body.copy(out, 4)
    out.writeUInt32BE(Bun.hash.crc32(body), 8 + data.length)
    return out
  }
  const head = Buffer.alloc(13)
  head.writeUInt32BE(width, 0)
  head.writeUInt32BE(height, 4)
  head.set([8, 2, 0, 0, 0], 8)
  Bun.write(path, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", head), chunk("IDAT", deflateSync(Buffer.concat(Array.from({ length: height }, () => row)))), chunk("IEND", Buffer.alloc(0))]))
  return path
}
const lightboxCount = () => js<string>("return document.querySelector('.tds-lightbox-count')?.textContent ?? ''")
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
  code() {
    until(() => exists(".tds-code .tds-code-action"), Boolean, "a code block", 15000)
    check(js<string>("return document.querySelector('.tds-code-head span')?.textContent ?? ''") === "ts", "the code block should be labelled with its language")
    ab("eval", "Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.resolve() }, configurable: true })")
    ab("click", ".tds-code .tds-code-action")
    until(() => exists(".tds-code .tds-swap[data-on]"), Boolean, "the copy icon to morph into a check")
    wait(150)
    const mid = js<{ a: number; b: number }>("const s = document.querySelector('.tds-swap[data-on]'); return { a: +getComputedStyle(s.children[0]).opacity, b: +getComputedStyle(s.children[1]).opacity }")
    check(mid.a < 1 && mid.b > 0, `both icons should be mid-morph, got ${JSON.stringify(mid)}`)
    shot("code-copied")
    until(() => exists(".tds-code .tds-swap[data-on]"), (on) => !on, "the check to morph back", 4000)
  },
  divider() {
    until(() => exists(".tds-divider"), Boolean, "a time divider")
    check(js<string>("return document.querySelector('.tds-divider-text')?.textContent ?? ''") === "Today", "the first divider should read Today")
    shot("divider")
  },
  expand() {
    ab("click", "button[aria-label='New chat']")
    until(() => js<string>("return location.pathname"), (p) => /^\/t\//.test(p), "a thread url")
    ab("click", ".ProseMirror")
    ab("keyboard", "type", "Show a long code block please")
    ab("press", "Enter")
    until(() => exists(".tds-code-more"), Boolean, "the show-all button", 15000)
    const collapsed = rect(".tds-code pre")!.h
    const pre = js<{ sw: number; cw: number }>("const p = document.querySelector('.tds-code pre'); return { sw: p.scrollWidth, cw: p.clientWidth }")
    check(pre.sw > pre.cw, "long lines should scroll sideways, not wrap")
    shot("code-collapsed")
    ab("click", ".tds-code-more")
    until(() => rect(".tds-code pre")!.h, (h) => h > collapsed + 100, "the block to expand")
    check(js<string>("return document.querySelector('.tds-code-more').textContent") === "Show less", "the button should offer Show less")
    shot("code-expanded")
  },
  stopped() {
    ab("click", "button[aria-label='New chat']")
    until(() => js<string>("return location.pathname"), (p) => /^\/t\//.test(p), "a thread url")
    ab("click", ".ProseMirror")
    ab("keyboard", "type", "Plan a long trip through Japan for me")
    ab("press", "Enter")
    until(() => exists("button[aria-label='Stop']"), Boolean, "the stop button")
    ab("click", "button[aria-label='Stop']")
    until(() => js<string[]>("return [...document.querySelectorAll('.tds-caption')].map((e) => e.textContent)"), (c) => c.includes("Stopped"), "the Stopped caption", 8000)
    shot("stopped")
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
  toaststack() {
    const titles = () => js<string>("return [...document.querySelectorAll('.tds-toast:not([data-gone]) .tds-toast-title [torph-sr]')].map((e) => e.textContent).join('|')")
    const live = () => js<number>("return document.querySelectorAll('.tds-toast:not([data-gone])').length")
    until(live, (n) => n === 0, "earlier toasts to clear", 12000)
    const rows = () => js<number>("return document.querySelectorAll('.tds-row-wrap:not([data-archived])').length")
    while (rows() < 2) journeys.send!()
    const before = rows()
    openRow()
    choose("Archive")
    until(titles, (t) => t === "Archived", "the first Archived toast")
    openRow()
    choose("Archive")
    until(titles, (t) => t === "Archived 2 chats", "the archive toasts to merge with a rolling count")
    check(live() === 1, "merged into one toast")
    openRow()
    choose("Pin")
    until(live, (n) => n === 2, "a second toast to stack")
    wait(500)
    const rest = js<number[]>("return [...document.querySelectorAll('.tds-toast:not([data-gone])')].map((e) => e.getBoundingClientRect().top)")
    check(rest[1]! - rest[0]! > 0 && rest[1]! - rest[0]! < 20, `stacked 10px apart at rest (${rest.join(", ")})`)
    shot("toaststack-rest")
    ab("hover", ".tds-toast[data-front]")
    until(() => exists(".tds-toasts[data-expanded]"), Boolean, "the stack to fan on hover")
    wait(500)
    const fanned = js<{ top: number; bottom: number }[]>("return [...document.querySelectorAll('.tds-toast:not([data-gone])')].map((e) => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom } })")
    check(fanned[1]!.top >= fanned[0]!.bottom, "fanned toasts do not overlap")
    check(style(".tds-toast-progress", "opacity") === "1", "the progress line shows while hovered")
    const paused = js<string[]>("return [...document.querySelectorAll('.tds-toast-progress i')].flatMap((e) => e.getAnimations().map((a) => a.playState))")
    check(paused.every((s) => s === "paused"), `timers pause on hover (${paused.join(",")})`)
    shot("toaststack-fanned")
    js<boolean>("const b = [...document.querySelectorAll('.tds-toast-action')].find((e) => e.textContent.trim() === 'Undo'); b?.click(); return !!b")
    until(titles, (t) => t.includes("Restored 2 chats"), "Undo to restore both chats")
    until(() => js<number>("return document.querySelectorAll('.tds-row-wrap:not([data-archived])').length"), (n) => n === before, "both rows back")
    ab("mouse", "move", "700", "500")
    ab("press", "Escape")
    until(live, (n) => n === 1, "Esc to dismiss the newest toast")
    ab("press", "Escape")
    until(live, (n) => n === 0, "Esc to dismiss the next toast")
    openRow()
    choose("Unpin")
    until(live, (n) => n === 1, "the Unpinned toast")
    const box = rect(".tds-toast[data-front]")!
    ab("mouse", "move", String(box.x + 40), String(box.y + box.h / 2))
    ab("mouse", "down")
    ab("mouse", "move", String(box.x + 140), String(box.y + box.h / 2))
    ab("mouse", "up")
    until(live, (n) => n === 0, "swipe right to dismiss")
  },
  morph() {
    ab("click", "button[aria-label='New chat']")
    ab("click", ".tds-composer-plus")
    until(() => exists(".tds-menu"), Boolean, "the plus menu")
    wait(400)
    check(style(".tds-composer-plus svg.tds-morph", "rotate") === "45deg", "plus rotates 45deg into x")
    shot("morph-plus-x")
    ab("press", "Escape")
    until(() => style(".tds-composer-plus svg.tds-morph", "rotate"), (r) => r === "0deg", "x rotates back to plus")
    ab("click", ".tds-rail-button[data-bell]")
    const layers = js<string[]>("return [...document.querySelectorAll('.tds-rail-button[data-bell] .tds-glyph-layer')].map((e) => e.dataset.phase)")
    check(layers.includes("out") && layers.includes("in"), `the bell swaps with a blur-scale morph (${layers.join(",")})`)
    until(() => js<string>("return document.querySelector('.tds-rail-button[data-bell] .tds-glyph').dataset.glyph"), (g) => g === "bell:fill", "the filled bell")
    until(() => js<number>("return document.querySelectorAll('.tds-rail-button[data-bell] .tds-glyph-layer').length"), (n) => n === 1, "the old bell to leave")
    shot("morph-bell")
    ab("click", ".tds-rail-button[data-bell]")
    until(() => js<string>("return document.querySelector('.tds-rail-button[data-bell] .tds-glyph').dataset.glyph"), (g) => g === "bell", "the outline bell")
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
  lightbox() {
    const work = join(homedir(), ".capy/work")
    const files = [png(join(work, "verify-rose.png"), 640, 420, [229, 143, 180]), png(join(work, "verify-teal.png"), 420, 640, [80, 190, 170]), png(join(work, "verify-gold.png"), 600, 600, [230, 190, 90])]
    wait(200)
    ab("click", "button[aria-label='New chat']")
    until(() => exists(".tds-composer-wrap input[type=file]"), Boolean, "the composer")
    ab("upload", ".tds-composer-wrap input[type=file]", ...files)
    until(() => js<string[]>("return [...document.querySelectorAll('.tds-attach')].map((e) => e.dataset.status)"), (s) => s.length === 3 && s.every((x) => x === "done"), "three uploads to finish", 15000)
    ab("click", ".ProseMirror")
    ab("keyboard", "type", "Three pictures")
    ab("press", "Enter")
    until(() => js<boolean>("const imgs = [...document.querySelectorAll('.tds-sent-images[data-count=\"3\"] .tds-sent-image img')]; return imgs.length === 3 && imgs.every((i) => i.complete && i.naturalWidth > 0)"), Boolean, "a row of three loaded images")
    const row = js<{ w: number; h: number; first: string; inner: string; last: string }>("const t = [...document.querySelectorAll('.tds-sent-images[data-count=\"3\"] .tds-sent-image')]; const s = (e) => getComputedStyle(e); const r = t[0].getBoundingClientRect(); return { w: r.width, h: r.height, first: s(t[0]).borderTopLeftRadius + ' ' + s(t[0]).borderTopRightRadius, inner: s(t[1]).borderTopLeftRadius, last: s(t[2]).borderBottomRightRadius }")
    check(row.w === 130 && row.h === 130 && row.first === "18px 6px" && row.inner === "6px" && row.last === "18px", `image row of three: ${JSON.stringify(row)}`)
    shot("media-row-3")
    ab("click", ".tds-sent-images[data-count='3'] .tds-sent-image:nth-child(2)")
    until(() => exists(".tds-lightbox[data-ready]"), Boolean, "the lightbox to open")
    wait(300)
    check(lightboxCount() === "2 of 3", `count should read 2 of 3, got "${lightboxCount()}"`)
    check(js<number>("return document.querySelectorAll('.tds-lightbox-film button').length") === 3, "three filmstrip thumbs")
    check(js<boolean>("return document.querySelectorAll('.tds-lightbox-film button')[1].hasAttribute('data-on')"), "the second thumb is current")
    check(style(".tds-sent-images[data-count='3'] .tds-sent-image:nth-child(2)", "visibility") === "hidden", "the source thumbnail hides while it is grown")
    until(() => js<string>("return document.querySelector('.tds-lightbox-bar em')?.textContent ?? ''"), (t) => /B$/.test(t), "the size in the bar")
    shot("lightbox-open")
    ab("press", "ArrowRight")
    until(lightboxCount, (t) => t === "3 of 3", "ArrowRight to go to 3 of 3")
    ab("press", "ArrowRight")
    wait(350)
    check(lightboxCount() === "3 of 3", "ArrowRight at the end bounces and stays on 3 of 3")
    ab("click", ".tds-lightbox-nav[data-dir='prev']")
    until(lightboxCount, (t) => t === "2 of 3", "the prev button")
    ab("click", ".tds-lightbox-film button:nth-child(1)")
    until(lightboxCount, (t) => t === "1 of 3", "the filmstrip")
    ab("press", "ArrowRight")
    until(lightboxCount, (t) => t === "2 of 3", "back to the opened image")
    wait(350)
    shot("lightbox-nav")
    ab("press", "Escape")
    until(() => exists(".tds-lightbox"), (open) => !open, "Escape to shrink the lightbox away")
    check(style(".tds-sent-images[data-count='3'] .tds-sent-image:nth-child(2)", "visibility") === "visible", "the thumbnail shows again")
    check(exists(".tds-sent-image"), "the transcript is still there")
  },
  finished() {
    ab("click", "button[aria-label='New chat']")
    until(() => exists(".ProseMirror"), Boolean, "the composer")
    ab("click", ".ProseMirror")
    ab("keyboard", "type", "Search the web for the history of toast and write a long summary")
    ab("press", "Enter")
    const chat = until(() => js<string>("return location.pathname.startsWith('/t/') ? location.pathname.slice(3) : ''"), Boolean, "the chat to get an id")
    until(() => exists(`.tds-row[href="/t/${chat}"][data-status="working"]`), Boolean, "chat A to start working", 10000)
    ab("click", "button[aria-label='New chat']")
    until(() => js<string>("return location.pathname") !== `/t/${chat}`, Boolean, "leaving chat A")
    check(js<string>("return location.pathname") !== `/t/${chat}`, "chat B is open")
    ab("mouse", "move", "700", "500")
    until(() => exists(`.tds-row[href="/t/${chat}"]:not([data-status="working"])`), Boolean, "chat A to finish", 60000)
    const title = until(() => js<string>(`return [...document.querySelectorAll('.tds-toast .tds-toast-title')].map((t) => t.textContent).join('|')`), (t) => t.includes("history of toast"), "chat A's finished toast")
    shot("finished-toast")
    until(() => exists(`.tds-flight-dot[data-chat="${chat}"]`), Boolean, "the dot to fly home", 60000)
    wait(250)
    shot("finished-flight")
    until(() => exists(`.tds-flight-dot`), (flying) => !flying, "the dot to land", 3000)
    until(() => exists(`.tds-row[href="/t/${chat}"][data-unread] .tds-unread`), Boolean, "chat A's row to show unread")
    shot("finished-landed")
    void title
  },
  empty() {
    ab("open", BASE)
    until(() => exists(".tds-empty img[src*='toast-hi']"), Boolean, "the home empty state")
    check(js<string>("return document.querySelector('.tds-empty b')?.textContent") === "Say hi to toast", "home empty title")
    shot("empty-home")
    ab("click", ".tds-empty-button")
    until(() => js<string>("return location.pathname"), (p) => /^\/t\/[0-9a-f-]{36}$/.test(p), "a new thread url")
    until(() => exists(".tds-empty img[src*='toast-hi']") && !exists(".tds-empty-button"), Boolean, "the empty thread state")
    shot("empty-thread")
    ab("click", ".tds-search input")
    ab("keyboard", "type", "zzqx nothing here")
    until(() => exists(".tds-sidebar .tds-empty img[src*='obj-search']"), Boolean, "the sidebar no-results state")
    check(js<string>("return document.querySelector('.tds-sidebar .tds-empty b')?.textContent") === "Nothing matches that", "no-results title")
    shot("empty-search")
    ab("press", "Escape")
  },
  header() {
    until(() => exists(".tds-row"), Boolean, "sidebar rows")
    ab("click", ".tds-row")
    until(() => exists(".tds-bubble[data-side='agent']"), Boolean, "a thread with a reply", 15000)
    check(rect(".tds-header-pill")?.h === 31, `header pill should be 31 tall, got ${rect(".tds-header-pill")?.h}`)
    check(style(".tds-header-pill", "fontSize") === "14px", "header title is 14px")
    check(rect(".tds-header .size-header-avatar")?.w === 50, "header avatar is 50")
    ab("click", "button[aria-label='Share']")
    until(() => js<boolean>("return document.body.innerText.includes('Link copied')"), Boolean, "the link copied toast")
    ab("click", "button[aria-label='Search in chat']")
    until(() => exists(".tds-find input"), Boolean, "the find bar")
    const word = js<string>("return (document.querySelector('.tds-bubble[data-side=agent]')?.textContent ?? '').trim().split(/\\s+/).find((w) => /^[a-z]{5,}$/i.test(w)) ?? ''")
    check(word, "no word to search for")
    ab("keyboard", "type", word.slice(0, 5))
    until(() => js<string>("return document.querySelector('.tds-find-count [torph-sr]')?.textContent ?? ''"), (t) => /^1 of \d+$/.test(t), "a match count")
    check(js<number>("return CSS.highlights.get('tds-find-on')?.size ?? 0") === 1, "the current match is highlighted")
    shot("header-find")
    ab("keyboard", "type", "zzqx")
    until(() => js<string>("return document.querySelector('.tds-find-count [torph-sr]')?.textContent ?? ''"), (t) => t === "No matches", "no matches")
    ab("press", "Escape")
    until(() => exists(".tds-find"), (open) => !open, "the find bar to close")
    check(js<number>("return CSS.highlights.size") === 0, "highlights cleared on close")
  },
  offline() {
    check(js<string>("return document.querySelector('.tds-banner')?.dataset.state ?? ''") === "off", "the banner starts hidden")
    ab("set", "offline", "on")
    try {
      until(() => js<string>("return document.querySelector('.tds-banner')?.dataset.state ?? ''"), (s) => s === "on", "the offline banner", 12000)
      wait(400)
      check(rect(".tds-banner")?.y === 96, `banner sits 96 from the top, got ${rect(".tds-banner")?.y}`)
      shot("offline-banner")
    } finally {
      ab("set", "offline", "off")
    }
    until(() => js<string>("return document.querySelector('.tds-banner')?.dataset.state ?? ''"), (s) => s === "ok", "back online", 15000)
    shot("offline-back")
  },
  diagnostics() {
    const logs = ab("console")
    const bad = logs.split("\n").filter((line) => /REACTIVITY|STRICT_READ|UNSTABLE_LIST|CLEANUP_IN|\[error\]/.test(line))
    check(bad.length === 0, `console diagnostics:\n${bad.slice(0, 5).join("\n")}`)
    const errors = ab("errors")
    check(!/Error/.test(errors), `page errors:\n${errors.slice(0, 600)}`)
  },
}

const order = ["doctor", "shell", "resize", "send", "code", "divider", "worklog", "menu", "pin", "rename", "dialog", "shortcuts", "palette", "notifications", "plus", "attach", "lightbox", "finished", "links", "mention", "command", "toasts", "expand", "stopped", "empty", "header", "offline", "toaststack", "morph", "diagnostics"]
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
