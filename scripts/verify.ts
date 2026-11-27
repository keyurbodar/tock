#!/usr/bin/env bun
/**
 * Drives the running web app through agent-browser the way a person would and
 * fails loudly. Usage: bun scripts/verify.ts [journey ...]
 * Needs Vite on :5199 and wrangler dev on :8787 (see .agents/skills/verify-tock).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { tokens } from "../packages/tokens/dist/tokens"

const BASE = process.env.TOCK_URL ?? "http://localhost:5199"
const OUT = process.env.TOCK_VERIFY_OUT ?? join(homedir(), ".capy/work/verify", new Date().toISOString().replace(/[:.]/g, "-"))
mkdirSync(OUT, { recursive: true })
const FIXTURES = join(homedir(), ".capy/work")
mkdirSync(FIXTURES, { recursive: true })
await Bun.write(join(FIXTURES, "verify-notes.md"), "# Notes\n\nExport is a scan.\nFacts stay append-only.\n")
await Bun.write(join(FIXTURES, "verify-data.json"), '{ "a": 1, "b": [1, 2] }\n')
await Bun.write(join(FIXTURES, "verify-app.exe"), "MZ")
await Bun.write(join(FIXTURES, "verify-big.zip"), new Uint8Array(31 * 1024 * 1024))
if (!(await Bun.file(join(FIXTURES, "verify-pixel.png")).exists())) {
  const canvas = "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAQ0lEQVR4nO3OQQ0AIBDAsEnHOsKwwGdpIqHt7Bk6PwCvBEgJkBIgJUBKgJQAKQFSAqQESAmQEiAlQEqAlAApAVICpBYk4QHFm1Q0rgAAAABJRU5ErkJggg=="
  await Bun.write(join(FIXTURES, "verify-pixel.png"), Buffer.from(canvas, "base64"))
}

function ab(...args: string[]): string {
  const run = Bun.spawnSync(["agent-browser", ...args], { stdout: "pipe", stderr: "pipe" })
  const out = run.stdout.toString().trim()
  if (run.exitCode !== 0) throw new Error(`agent-browser ${args.join(" ")} failed: ${run.stderr.toString().trim() || out}`)
  return out
}
/** agent-browser prints the eval result as a JSON string literal; decode that, then the JSON our wrapper made. (Unescaping quotes by hand broke on any page text containing a double quote.) */
const decode = (out: string): string => (out.startsWith('"') ? (JSON.parse(out) as string) : out)
const js = <T>(code: string): T => JSON.parse(decode(ab("eval", `JSON.stringify((() => { ${code} })())`))) as T
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
const text = (sel: string) => js<string>(`return document.querySelector(${JSON.stringify(sel)})?.textContent ?? ''`)
const rect = (sel: string) => js<{ x: number; y: number; w: number; h: number } | null>(
  `const r = document.querySelector(${JSON.stringify(sel)})?.getBoundingClientRect(); return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null`,
)
const exists = (sel: string) => js<boolean>(`return [...document.querySelectorAll(${JSON.stringify(sel)})].some((e) => !e.closest("[data-ghost], [aria-busy='true']"))`)
const style = (sel: string, prop: string) => js<string | null>(`const e = document.querySelector(${JSON.stringify(sel)}); return e ? getComputedStyle(e)[${JSON.stringify(prop)}] : null`)
const transparent = (value: string | null) => value === "rgba(0, 0, 0, 0)" || value === "transparent"
const choose = (label: string) =>
  check(
    js<boolean>(`const e = [...document.querySelectorAll('.tds-menu-item, .tds-button')].find((el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim() === ${JSON.stringify(label)} || el.textContent.trim() === ${JSON.stringify(label)}); e?.click(); return !!e`),
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
/** The value a TextMorph shows, whatever its mode: torph's screen-reader copy for roll and morph, the plain text for calm and swap. */
const morphed = (sel: string) => js<string>(`const e = document.querySelector(${JSON.stringify(sel)}); const t = e?.matches('.tds-morph-text') ? e : (e?.querySelector('.tds-morph-text') ?? e); return (t?.querySelector('[torph-sr]') ?? t)?.textContent ?? ''`)
const lightboxCount = () => morphed(".tds-lightbox-count")
const openRow = () => {
  until(() => exists(".tds-row-wrap[data-leaving]"), (busy) => !busy, "leaving rows to go")
  ab("hover", ".tds-row-wrap .tds-row")
  ab("click", ".tds-row-wrap .tds-row-more")
  until(() => exists(".tds-menu"), Boolean, "the thread menu")
  until(() => js<number>("return document.querySelector('.tds-menu')?.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length ?? 0"), (n) => n === 0, "the thread menu to finish growing in")
}

/** Delays every socket message by ?slow=ms and records, per key element, its box on the last frame its skeleton was up and once loaded. */
const SLOW_PROBE = `(() => {
  const delay = Number(new URLSearchParams(location.search).get("slow") || 0)
  if (!delay) return
  const Native = window.WebSocket
  window.WebSocket = class extends Native {
    addEventListener(type, fn, opts) {
      if (type !== "message") return super.addEventListener(type, fn, opts)
      return super.addEventListener(type, (e) => setTimeout(() => fn.call(this, e), delay), opts)
    }
  }
  const keys = { row: ".tds-row", me: ".tds-bubble[data-side='me']", act: ".tds-act", pill: ".tds-header-pill", title: ".tds-header-title", column: ".tds-column", composer: ".tds-composer-row" }
  const box = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } }
  const busy = (el) => !!el.closest("[aria-busy='true']") || !!el.querySelector("[aria-busy='true']")
  const probe = (window.__skel = { skel: {}, last: {}, busyFrames: 0 })
  const tick = () => {
    const any = !!document.querySelector("[aria-busy='true']")
    if (any) probe.busyFrames++
    for (const [name, sel] of Object.entries(keys)) {
      const all = [...document.querySelectorAll(sel)].filter((el) => !el.closest("[skullet-exiting]") && el.getBoundingClientRect().width > 0)
      const loading = all.find(busy)
      const real = all.find((el) => !busy(el) && !el.closest("[skullet-loading]"))
      if (loading) probe.skel[name] = box(loading)
      else if (any && real) probe.skel[name] = box(real)
      else if (real && probe.skel[name]) probe.last[name] = box(real)
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})()`

const WEATHER = "Check the weather in Tokyo and summarise it"
const liveRows = () => js<number>("return document.querySelectorAll('.tds-row-wrap:not([data-archived])').length")
/** Every journey starts here: a reload clears overlays, toasts, sidebar search and hover. */
const gated = () => exists("input[autocomplete='current-password']")
function reset() {
  ab("open", BASE)
  // A journey that closes the browser (mobile swaps the device) drops the auth cookie; sign back in instead of failing every journey after it.
  if (process.env.TOCK_KEY && gated()) (unlock(), ab("open", BASE))
  ab("mouse", "move", "900", "450")
  until(() => exists(".tds-row, .tds-sidebar .tds-empty"), Boolean, "the sidebar to load", 12000)
}
/** A brand-new chat of the journey's own at /t/<uuid>, composer ready. */
function fresh(): string {
  const id = crypto.randomUUID()
  ab("open", `${BASE}/t/${id}`)
  until(() => exists(".tds-input") && exists(".tds-header"), Boolean, "a fresh chat")
  return id
}
function say(text: string) {
  field()
  ab("keyboard", "type", text)
  ab("press", "Enter")
  until(() => exists(".tds-bubble[data-side='me']"), Boolean, "my bubble")
}
/** Waits for the run to finish: an agent reply on screen and no Stop button. */
/** The composer editor, once its chunk has loaded over the static shell. */
const field = () => (until(() => exists(".ProseMirror"), Boolean, "the composer editor"), ab("click", ".ProseMirror"))
const settled = () => until(() => exists(".tds-bubble[data-side='agent']") && !exists("button[aria-label='Stop'], .tds-send[data-stop]") && js<string>("return document.querySelector('.tds-act')?.dataset.state ?? 'done'") === "done", Boolean, "the run to finish", 20000)
/** A fresh chat with one finished exchange. */
/** Wait until an element has not moved for a few frames: the reply keeps revealing after the run settles, and a bottom-aligned transcript lifts everything above it. */
function steady(sel: string, ms = 6000) {
  let last = ""
  let since = Date.now()
  until(() => {
    const r = rect(sel)
    const k = r ? r.x + "," + r.y : ""
    if (k !== last) (last = k), (since = Date.now())
    return k !== "" && Date.now() - since > 400
  }, Boolean, sel + " to stop moving", ms)
}
function seeded(text = WEATHER): string {
  const id = fresh()
  say(text)
  settled()
  return id
}
/** At least n live rows in the sidebar, creating chats if the store has fewer, then back home. */
function ensureRows(n: number) {
  // The roster is virtual, so only the rows in view are in the DOM: a list that already scrolls has enough rows.
  const enough = () => liveRows() >= n || js<boolean>("const s = document.querySelector('.tds-sidebar .tds-scroll'); return !!s && s.scrollHeight > s.clientHeight + 1")
  for (let i = 0; !enough() && i < n; i++) {
    seeded(WEATHER)
    reset()
  }
  until(enough, Boolean, `${n} sidebar rows (or a roster that scrolls)`)
}

const tapSocket = () => ab("eval", "window.__frames = []; window.__drop = false; const send = WebSocket.prototype.send; WebSocket.prototype.send = function (data) { window.__ws = this; window.__frames.push(String(data)); if (!window.__drop) send.call(this, data) }; true")
const framesOf = (type: string) => js<number>(`return window.__frames.filter((f) => f.includes('"type":"${type}"')).length`)
const bannerText = () => js<string>("const e = document.querySelector('.tds-banner'); return e?.dataset.state === 'off' ? '' : ((e?.querySelector('[torph-sr]') ?? e)?.textContent ?? '')")
const unreadRow = (id: string) => exists(`.tds-row-wrap[data-id="${id}"] [data-unread], .tds-row-wrap[data-id="${id}"][data-unread]`)

/** Scrolls the open transcript from its end to its top at 60px per frame, sampling after each paint (rAF then setTimeout), until the top is reached and nothing more mounts. `over` counts every sample past 50ms; `long` counts the ones where the page itself was busy: a long animation frame with a task over 50ms, or over 16ms of script, style, layout and paint. Headless Chrome on a 2-CPU machine composites in software, so an odd frame lands late with no page work behind it (no long animation frame, or one with no script and 1ms of render; trace: rAF gaps max 41ms and draws 43ms while one timer sample read 58ms). Those are logged in `slow` but are not the page's cost. */
function scrollUp() {
  const out = ab("eval", `new Promise((done) => {
    const s = document.querySelector('.tds-transcript'), frames = [], slow = [], loafs = []
    const count = () => document.querySelectorAll('.tds-column .tds-bubble').length
    const po = new PerformanceObserver((list) => { for (const e of list.getEntries()) if (e.duration > 50) loafs.push(e) })
    po.observe({ type: 'long-animation-frame' })
    s.scrollTop = s.scrollHeight
    let last = 0, still = 0, seen = count()
    const step = () => {
      s.scrollTop = Math.max(0, s.scrollTop - 60)
      setTimeout(() => {
        const t = performance.now(), n = count()
        if (last) frames.push(t - last)
        if (last && t - last > 50) slow.push({ from: last, to: t, at: Math.round(s.scrollTop), bubbles: n })
        last = t
        still = s.scrollTop < 1 && n === seen ? still + 1 : 0
        seen = n
        if (still < 30) return requestAnimationFrame(step)
        loafs.push(...po.takeRecords().filter((e) => e.duration > 50))
        po.disconnect()
        const cause = (f) => loafs.find((e) => e.startTime < f.to && e.startTime + e.duration > f.from)
        const shown = slow.map((f) => { const e = cause(f); return { ms: Math.round(f.to - f.from), at: f.at, bubbles: f.bubbles, loaf: e ? { ms: Math.round(e.duration), blocking: Math.round(e.blockingDuration), work: Math.round(e.scripts.reduce((sum, x) => sum + x.duration, 0) + (e.renderStart ? e.startTime + e.duration - e.renderStart : 0)), scripts: e.scripts.map((x) => x.invoker + ' ' + (x.sourceFunctionName || x.sourceCharPosition) + ' ' + Math.round(x.duration)) } : null } })
        const sorted = [...frames].sort((a, b) => a - b), at = (p) => Math.round(sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))])
        done(JSON.stringify({ frames: frames.length, p50: at(0.5), p95: at(0.95), max: Math.round(sorted.at(-1)), over: slow.length, long: shown.filter((f) => f.loaf && (f.loaf.blocking > 0 || f.loaf.work > 16)).length, bubbles: n, slow: shown.slice(0, 8) }))
      })
    }
    requestAnimationFrame(step)
  })`)
  return JSON.parse(JSON.parse(out)) as { frames: number; p50: number; p95: number; max: number; over: number; long: number; bubbles: number; slow: unknown[] }
}

/**
 * Budget for the jank journey, at CDP 4× CPU throttle on the 4-core cloud VM with headless Chrome and no GPU. The aim
 * is 20ms (one 60Hz vsync plus timer noise), but on this VM single frames still land on 33ms or 50ms run to run with no
 * script in them (raster and compositor work on the CPU), so the budget that holds without flaking is: no animated
 * frame over 50ms (three vsyncs), p95 at one missed vsync (34ms) at most, and zero forced layouts from app code outside
 * input handlers. The three frames after each pointerdown/up or keydown are the response (mounting the surface and
 * rasterising it on the CPU), reported as mount, not animation. JANK_KNOWN lists what is still over and why (renders/TOCK-3/jank-report.md); it reports, never passes silently.
 */
const JANK_FRAME_MS = 50
const JANK_P95_MS = 34
const JANK_KNOWN: Record<string, string> = {
  streaming: "frame: each streamed token re-renders the reply and reflows the column under 4x throttle",
  "composer sheet": "frame and forced: the sheet animates the field's height (layout every frame) and the transcript's scroll handler reads scrollHeight inside it",
  "work log": "forced: the pane's ResizeObserver fit() reads heights after other observers wrote",
  palette: "frame (not yet traced to a cause): one 67-83ms frame after open or close; both are backdrop sources, and backdrop() toggles :root[data-backdrop], which restyles the whole document",
  dialog: "frame (not yet traced to a cause): one 67ms frame after open or close; same backdrop path as the palette",
  centre: "frame: since b25f77d the sidebar and main scale back as two viewport-sized layers promoted at open; on this VM's software compositor each frame of that scale costs 50-130ms (2 dropped frames before it, 43 after)",
}

/** CDP session on the page agent-browser drives: CPU throttling and DevTools traces for the jank journey. */
async function cdpPage() {
  const ws = new WebSocket(ab("get", "cdp-url"))
  await new Promise((ok, fail) => ((ws.onopen = ok), (ws.onerror = fail)))
  let next = 0
  const waiting = new Map<number, (msg: { result?: any; error?: { message: string } }) => void>()
  const listeners: ((msg: { method: string; params: any; sessionId?: string }) => void)[] = []
  ws.onmessage = (e) => {
    const msg = JSON.parse(String(e.data))
    if (msg.id !== undefined) waiting.get(msg.id)?.(msg)
    else listeners.forEach((fn) => fn(msg))
  }
  const send = (method: string, params: object = {}, sessionId?: string) =>
    new Promise<any>((ok, fail) => {
      const id = ++next
      waiting.set(id, (msg) => (waiting.delete(id), msg.error ? fail(new Error(method + ": " + msg.error.message)) : ok(msg.result)))
      ws.send(JSON.stringify({ id, method, params, sessionId }))
    })
  const href = js<string>("return location.href")
  const { targetInfos } = await send("Target.getTargets")
  const page = (targetInfos as { type: string; url: string; targetId: string }[]).find((t) => t.type === "page" && t.url === href)
  check(page, "no CDP page target for " + href)
  const { sessionId } = await send("Target.attachToTarget", { targetId: page.targetId, flatten: true })
  const on = (method: string) => new Promise<any>((ok) => listeners.push((m) => m.method === method && m.sessionId === sessionId && ok(m.params)))
  return {
    send: (method: string, params: object = {}) => send(method, params, sessionId),
    async trace(act: () => void): Promise<TraceEvent[]> {
      await send("Tracing.start", { transferMode: "ReturnAsStream", traceConfig: { includedCategories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "disabled-by-default-devtools.timeline.stack", "v8.execute", "blink.user_timing"] } }, sessionId)
      act()
      const done = on("Tracing.tracingComplete")
      await send("Tracing.end", {}, sessionId)
      const { stream } = await done
      let text = ""
      for (;;) {
        const chunk = await send("IO.read", { handle: stream, size: 1 << 20 }, sessionId)
        text += chunk.base64Encoded ? atob(chunk.data) : chunk.data
        if (chunk.eof) break
      }
      await send("IO.close", { handle: stream }, sessionId)
      const parsed = JSON.parse(text)
      return Array.isArray(parsed) ? parsed : parsed.traceEvents
    },
    close: () => ws.close(),
  }
}
type TraceEvent = { name: string; ph: string; ts: number; dur?: number; pid: number; tid: number; args?: any }
type JankRow = { name: string; frames: number; dropped: number; worst: number; p95: number; mount: number; long: number; forced: number; forcedAtInput: number; vendor: number; paint: number; culprits: string[] }

/** Reads one interaction's trace and in-page frame intervals into the numbers the jank budget checks. */
function jankOf(name: string, events: TraceEvent[], intervals: number[]): Omit<JankRow, "mount"> {
  const threads = events.filter((e) => e.ph === "M" && e.name === "thread_name" && e.args?.name === "CrRendererMain")
  const busiest = threads
    .map((t) => ({ t, n: events.filter((e) => e.pid === t.pid && e.tid === t.tid && e.ph === "X").length }))
    .sort((a, b) => b.n - a.n)[0]?.t
  const main = events.filter((e) => busiest && e.pid === busiest.pid && e.tid === busiest.tid && e.ph === "X")
  const scripts = new Set(["FunctionCall", "EvaluateScript", "FireAnimationFrame", "TimerFire", "EventDispatch", "v8.callFunction", "RunMicrotasks", "v8.run"])
  const inputs = main.filter((e) => e.name === "EventDispatch" && /^(pointer|mouse|key|click|wheel|touch|focus|blur)/.test(e.args?.data?.type ?? ""))
  const within = (e: TraceEvent, outer: TraceEvent) => e.ts >= outer.ts && e.ts <= outer.ts + (outer.dur ?? 0)
  const jsSpans = main.filter((e) => scripts.has(e.name))
  const app = (e: TraceEvent) => {
    const top = e.args?.beginData?.stackTrace?.[0]
    return top && /\/assets\/|\/src\//.test(top.url ?? "") ? top : undefined
  }
  const forced = main.filter((e) => e.name === "Layout" && jsSpans.some((s) => within(e, s)) && app(e))
  const atInput = forced.filter((e) => inputs.some((s) => within(e, s)))
  const vendor = forced.filter((e) => !atInput.includes(e) && /\/ui-[\w-]+\.js/.test(app(e)!.url))
  const late = forced.filter((e) => !atInput.includes(e) && !vendor.includes(e))
  const culprits = [...new Set(late.map((e) => { const f = app(e)!; return (f.functionName || "?") + "@" + String(f.url).split("/").pop() + ":" + f.lineNumber + ":" + f.columnNumber }))]
  const long = main.filter((e) => (e.name === "RunTask" || e.name === "ThreadControllerImpl::RunTask") && (e.dur ?? 0) > 50000).length
  let paint = 0
  for (const e of main) {
    if (e.name !== "Paint") continue
    const q = e.args?.data?.clip as number[] | undefined
    if (!q || q.length < 8) continue
    const xs = [q[0]!, q[2]!, q[4]!, q[6]!].map((x) => Math.min(1440, Math.max(0, x)))
    const ys = [q[1]!, q[3]!, q[5]!, q[7]!].map((y) => Math.min(900, Math.max(0, y)))
    paint += (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys))
  }
  const sorted = [...intervals].sort((a, b) => a - b)
  return {
    name,
    frames: intervals.length,
    dropped: intervals.reduce((n, dt) => n + Math.max(0, Math.round(dt / (1000 / 60)) - 1), 0),
    worst: Math.round(sorted.at(-1) ?? 0),
    p95: Math.round(sorted[Math.floor(sorted.length * 0.95)] ?? 0),
    long,
    forced: late.length,
    forcedAtInput: atInput.length,
    vendor: vendor.length,
    paint: +(paint / (1440 * 900)).toFixed(2),
    culprits,
  }
}

/** A fresh browser (after ab("close")) has no session cookie: on a deployed Tock, POST TOCK_KEY again before loading the app. */
function unlock() {
  const key = process.env.TOCK_KEY
  if (!key) return
  const status = ab("eval", `fetch("/api/auth", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: ${JSON.stringify(key)} }) }).then((r) => r.status)`)
  check(status.trim() === "200", `TOCK_KEY was refused by ${BASE}/api/auth (status ${status.trim()})`)
}

const journeys: Record<string, () => void | Promise<void>> = {
  doctor() {
    for (const url of [BASE, `${BASE}/api/health`]) check(Bun.spawnSync(["curl", "-sf", "-o", "/dev/null", url]).exitCode === 0, `${url} is not answering`)
    ab("open", BASE, "--args", "--no-sandbox")
    ab("set", "viewport", "1440", "900")
    const key = process.env.TOCK_KEY
    unlock()
    ab("errors", "--clear")
    ab("console", "--clear")
    ab("open", BASE)
    const locked = () => exists("input[autocomplete='current-password']")
    try {
      until(() => locked() || exists(".tds-row, .tds-sidebar .tds-empty"), Boolean, "the app to render", 12000)
    } catch {
      throw new Error(`the app did not render; restart Vite with --force if this is a stale module after a rebase:\n${ab("errors").slice(0, 400)}`)
    }
    if (locked()) throw new Error(key ? "still locked after POST /api/auth with TOCK_KEY" : `${BASE} asks for an access key: set TOCK_KEY to it (or DEV_ALLOW_ANON=1 in apps/server/.dev.vars locally)`)
  },
  shell() {
    ab("eval", "localStorage.removeItem('tock.sidebar.width')")
    ab("open", BASE)
    until(() => exists(".tds-row"), Boolean, "sidebar rows")
    check(rect(".tds-sidebar")?.w === 340, `sidebar should start at 340px, got ${rect(".tds-sidebar")?.w}`)
    shot("shell")
  },
  resize() {
    ab("eval", "localStorage.removeItem('tock.sidebar.width')")
    reset()
    const handle = rect(".tds-sidebar-handle")
    check(handle, "no resize handle")
    const x = handle.x + handle.w / 2
    const y = handle.y + handle.h / 2
    ab("mouse", "move", String(x), String(y))
    ab("mouse", "down")
    ab("mouse", "move", String(x + 60), String(y), "--steps", "8")
    ab("mouse", "up")
    check(rect(".tds-sidebar")?.w === 400, `drag +60 should give 400px, got ${rect(".tds-sidebar")?.w}`)
    ab("mouse", "move", String(x + 400), String(y))
    ab("open", BASE)
    until(() => rect(".tds-sidebar")?.w, (w) => w === 400, "the saved width after reload")
    ab("dblclick", ".tds-sidebar-handle")
    check(rect(".tds-sidebar")?.w === 340, "double-click should reset to 340px")
    ab("open", BASE)
    until(() => rect(".tds-sidebar")?.w, (w) => w === 340, "the reset width after reload")
    ab("focus", ".tds-sidebar-handle")
    ab("press", "ArrowRight")
    check(rect(".tds-sidebar")?.w === 356, `ArrowRight should widen by 16px, got ${rect(".tds-sidebar")?.w}`)
    ab("press", "ArrowLeft")
    shot("resize")
  },
  send() {
    ab("click", "button[aria-label='New chat']")
    const path = until(() => js<string>("return location.pathname"), (p) => /^\/t\/[0-9a-f-]{36}$/.test(p), "a UUID thread url")
    field()
    ab("keyboard", "type", "Check the weather in Tokyo and summarise it")
    ab("press", "Enter")
    until(() => exists(".tds-bubble[data-side='me']"), Boolean, "my bubble")
    until(() => exists(".tds-bubble[data-side='agent']"), Boolean, "an agent reply", 15000)
    check(js<string>("return location.pathname") === path, "the thread url changed after sending")
    shot("send")
  },
  code() {
    seeded()
    until(() => exists(".tds-code .tds-code-action") && !exists("button[aria-label='Stop']"), Boolean, "a finished code block", 15000)
    wait(600)
    check(js<string>("return document.querySelector('.tds-code-head span')?.textContent ?? ''") === "ts", "the code block should be labelled with its language")
    ab("eval", "Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.resolve() }, configurable: true })")
    ab("click", ".tds-code button[aria-label='Copy code']")
    until(() => exists(".tds-code .tds-code-copy[data-glyph='check']"), Boolean, "the copy icon to morph into a check")
    check(js<number>("return document.querySelectorAll('.tds-code .tds-code-copy .tds-glyph-layer').length") === 2, "copy and check should both be on screen mid-morph")
    wait(400)
    shot("code-copied")
    until(() => exists(".tds-code .tds-code-copy[data-glyph='copy']"), Boolean, "the check to morph back", 4000)
    check(js<boolean>("const c = document.querySelector('.tds-code pre code'); return !c.closest('.tds-code').hasAttribute('data-streaming') && c.textContent === c.firstElementChild.textContent && !!c.querySelector('[class^=sh__]')"), "a finished block should be fully highlighted with no plain tail")
  },
  divider() {
    seeded()
    until(() => exists(".tds-divider"), Boolean, "a time divider")
    check(js<string>("return document.querySelector('.tds-divider-text')?.textContent ?? ''") === "Today", "the first divider should read Today")
    shot("divider")
  },
  expand() {
    ab("click", "button[aria-label='New chat']")
    until(() => js<string>("return location.pathname"), (p) => /^\/t\//.test(p), "a thread url")
    field()
    ab("keyboard", "type", "Show a long code block please")
    ab("press", "Enter")
    until(() => exists(".tds-code .tds-code-action") && !exists("button[aria-label='Stop']"), Boolean, "a finished long code block", 15000)
    const pre = js<{ sw: number; cw: number; sh: number; ch: number; h: number; cap: number; wrap: string }>("const p = document.querySelector('.tds-code-body'); return { sw: p.scrollWidth, cw: p.clientWidth, sh: p.scrollHeight, ch: p.clientHeight, h: p.getBoundingClientRect().height, cap: parseFloat(getComputedStyle(p).maxHeight), wrap: getComputedStyle(p).whiteSpace }")
    check(pre.wrap === "pre" && pre.sw > pre.cw, "long lines should scroll sideways, not wrap: " + JSON.stringify(pre))
    check(pre.sh > pre.ch && Math.abs(pre.h - pre.cap) < 1, "a tall block stops at its cap and scrolls inside: " + JSON.stringify(pre))
    check(!exists(".tds-code-more"), "no show-all button: the block scrolls instead")
    const scrolled = js<{ top: number; left: number; page: number }>("const p = document.querySelector('.tds-code-body'); const page = document.querySelector('.tds-transcript')?.scrollTop ?? 0; p.scrollTop = 120; p.scrollLeft = 80; return { top: p.scrollTop, left: p.scrollLeft, page: (document.querySelector('.tds-transcript')?.scrollTop ?? 0) - page }")
    check(scrolled.top === 120 && scrolled.left === 80, "the block scrolls both ways inside itself: " + JSON.stringify(scrolled))
    check(js<string>("return getComputedStyle(document.querySelector('.tds-code-body')).scrollbarWidth") === "thin", "the block uses thin scrollbars")
    shot("code-scroll")
    ab("click", ".tds-code button[aria-label='Wrap lines']")
    until(() => js<{ sw: number; cw: number }>("const p = document.querySelector('.tds-code pre'); return { sw: p.scrollWidth, cw: p.clientWidth }"), (p) => p.sw <= p.cw, "wrapped lines to fit the block")
    check(js<string | null>("return document.querySelector('.tds-code button[aria-label=\"Disable line wrap\"]')?.getAttribute('aria-pressed') ?? null") === "true", "the wrap toggle should read pressed")
    shot("code-wrapped")
    ab("click", ".tds-code button[aria-label='Disable line wrap']")
    until(() => js<{ sw: number; cw: number }>("const p = document.querySelector('.tds-code pre'); return { sw: p.scrollWidth, cw: p.clientWidth }"), (p) => p.sw > p.cw, "unwrapped lines to scroll again")
  },
  fence() {
    ab("click", "button[aria-label='New chat']")
    until(() => exists(".ProseMirror"), Boolean, "the composer")
    field()
    ab("keyboard", "type", "```ts ")
    until(() => exists(".tds-input pre code"), Boolean, "a typed fence to become a code block")
    ab("keyboard", "type", "const answer = compute(42) // done")
    until(() => js<string>("return [...document.querySelectorAll('.tds-input pre .sh__token--keyword')].map((e) => e.textContent).join(',')"), (t) => t.includes("const"), "the keyword to colour as it is typed")
    const live = js<{ keyword: string; comment: string; bg: string }>("const q = (s) => getComputedStyle(document.querySelector('.tds-input pre ' + s)); return { keyword: q('.sh__token--keyword').color, comment: q('.sh__token--comment').color, bg: getComputedStyle(document.querySelector('.tds-input pre')).backgroundColor }")
    check(live.keyword === "rgb(255, 103, 141)" && live.comment === "rgb(115, 115, 115)", "the composer fence uses the shared theme colours: " + JSON.stringify(live))
    check(live.bg === "rgb(21, 21, 21)", "the composer fence sits on the code surface: " + live.bg)
    ab("press", "Enter")
    check(exists(".tds-input pre") && !exists(".tds-bubble[data-side='me']"), "Enter inside a fence adds a line instead of sending")
    ab("keyboard", "type", "const more = 1")
    shot("composer-fence")
    ab("press", "Control+Enter")
    until(() => exists(".tds-bubble[data-side='me'] .tds-code"), Boolean, "the sent fence to render as a code block in my bubble")
    const sent = js<{ lang: string; text: string; keyword: boolean }>("const c = document.querySelector('.tds-bubble[data-side=me] .tds-code'); return { lang: c.dataset.language, text: c.querySelector('.tds-code-body').textContent, keyword: !!c.querySelector('.sh__token--keyword') }")
    check(sent.lang === "ts" && sent.text.includes("compute(42)") && sent.text.includes("const more = 1") && sent.keyword, "the fence round-trips through send, highlighted: " + JSON.stringify(sent))
    shot("sent-fence")
  },
  mdpreview() {
    const work = join(homedir(), ".capy/work")
    writeFileSync(join(work, "verify-fence.md"), "# Fence\n\nA markdown file with code.\n\n```ts\nexport const answer = (n: number) => n * 42\n```\n")
    ab("click", "button[aria-label='New chat']")
    until(() => exists(".tds-composer-wrap input[type=file]"), Boolean, "the composer")
    ab("upload", ".tds-composer-wrap input[type=file]", join(work, "verify-fence.md"))
    until(() => js<string[]>("return [...document.querySelectorAll('.tds-attach')].map((e) => e.dataset.status)"), (s) => s.length === 1 && s[0] === "done", "the upload to finish", 15000)
    field()
    ab("keyboard", "type", "Here is a file")
    ab("press", "Enter")
    until(() => exists(".tds-files[data-side='me'] .tds-doc[data-state='ready']"), Boolean, "the sent file card to resolve")
    wait(300)
    ab("click", ".tds-files[data-side='me'] .tds-doc")
    until(() => exists(".tds-lightbox[data-ready] .tds-lightbox-doc .tds-lightbox-md .tds-code"), Boolean, "the markdown preview with its fence")
    const c = js<{ lang: string; text: string; keyword: string }>("const c = document.querySelector('.tds-lightbox-md .tds-code'); const k = c.querySelector('.sh__token--keyword'); return { lang: c.dataset.language, text: c.querySelector('.tds-code-body').textContent, keyword: k ? getComputedStyle(k).color : '' }")
    check(c.lang === "ts" && c.text.includes("n * 42") && c.keyword === "rgb(255, 103, 141)", "the .md preview highlights its fence with the shared block: " + JSON.stringify(c))
    check(js<string>("return document.querySelector('.tds-lightbox-md')?.textContent ?? ''").includes("A markdown file with code."), "the preview renders the prose too")
    wait(300)
    shot("md-preview")
    ab("press", "Escape")
    until(() => exists(".tds-lightbox"), (open) => !open, "Escape to close")
  },
  stopped() {
    ab("click", "button[aria-label='New chat']")
    until(() => js<string>("return location.pathname"), (p) => /^\/t\//.test(p), "a thread url")
    field()
    ab("keyboard", "type", "Plan a long trip through Japan for me")
    ab("press", "Enter")
    until(() => exists("button[aria-label='Stop']"), Boolean, "the stop button")
    ab("click", "button[aria-label='Stop']")
    until(() => js<string[]>("return [...document.querySelectorAll('.tds-caption')].map((e) => e.textContent)"), (c) => c.includes("Stopped"), "the Stopped caption", 8000)
    shot("stopped")
  },
  worklog() {
    seeded()
    until(() => exists(".tds-act-button"), Boolean, "an activity line", 15000)
    check(transparent(style(".tds-act-button", "backgroundColor")), "the activity line must have no background")
    check(transparent(style(".tds-act-caret", "backgroundColor")), "the activity caret must have no background")
    steady(".tds-act-button")
    ab("hover", ".tds-act-button")
    check(transparent(style(".tds-act-button", "backgroundColor")), "the activity line must have no hover background")
    steady(".tds-act-button")
    ab("click", ".tds-act-button")
    try {
      until(() => exists(".tds-worklog"), Boolean, "the work log", 2500)
    } catch {
      ab("click", ".tds-act-button")
    }
    until(() => js<string>("const w = document.querySelector('.tds-worklog'); return w ? (w.querySelector('.tds-ws-line') ? 'rows' : 'empty ' + Math.round(w.getBoundingClientRect().height) + ' ' + w.querySelectorAll('*').length) : 'closed ' + document.querySelector('.tds-act-button')?.getAttribute('aria-expanded')"), (s) => s === "rows", "the work log rows")
    until(() => js<number>("return document.querySelectorAll('.tds-worklog .tds-plan-item').length"), (n) => n === 3, "the three plan steps from update_plan")
    check(js<boolean>("return [...document.querySelectorAll('.tds-ws-line')].every((e) => ['rgba(0, 0, 0, 0)', 'transparent'].includes(getComputedStyle(e).backgroundColor))"), "work log rows must have no background")
    ab("hover", ".tds-ws-line")
    check(transparent(style(".tds-ws-line", "backgroundColor")), "work log rows must have no hover background")
    shot("worklog-open")
    ab("press", "Escape")
    until(() => exists(".tds-worklog"), (open) => !open, "the work log to close")
  },
  menu() {
    ensureRows(1)
    openRow()
    const items = js<string[]>("return [...document.querySelectorAll('.tds-menu .tds-menu-item')].map((e) => e.textContent.trim())")
    check(["Rename…", "Pin", "Mark as ", "Snooze", "Move to…", "Copy Link", "Archive", "Delete"].every((item) => items.some((text) => text.startsWith(item))) && items.some((text) => /^Mark as (Read|Unread)/.test(text)), `menu items: ${items.join(", ")}`)
    const geometry = js<{ w: number; h: number; r: string; f: string }>("const m = document.querySelector('.tds-menu'); const i = m.querySelector('.tds-menu-item'); const s = getComputedStyle(i); return { w: m.getBoundingClientRect().width, h: i.getBoundingClientRect().height, r: s.borderRadius, f: s.fontSize }")
    check(geometry.w >= 220 && geometry.h === 32 && geometry.r === "9px" && geometry.f === "13.5px", `SPEC §8 menu: 220 min, 32 items, r9, 13.5 text (got ${JSON.stringify(geometry)})`)
    shot("menu")
    ab("press", "Escape")
    until(() => exists(".tds-menu"), (open) => !open, "the menu to close")
  },
  pin() {
    ensureRows(1)
    const first = () => js<string>("return document.querySelector('.tds-row-wrap')?.dataset.id ?? ''")
    const id = first()
    const pins = () => js<number>("return document.querySelectorAll('.tds-pin').length")
    const before = pins()
    openRow()
    choose("Pin")
    until(() => js<boolean>(`return !!document.querySelector('.tds-pin[data-id="${id}"]')`), Boolean, "the chat to land in the pins")
    until(() => exists(`.tds-row-wrap[data-id="${id}"]`), (still) => !still, "the pinned chat to leave the list")
    check(pins() === Math.min(12, before + 1), `pins should grow by one, got ${pins()}`)
    check(rect(`.tds-pin[data-id="${id}"] .tds-pin-circle`)?.w === 48, "pin circles are 48")
    check(js<number>("return Math.max(...[...document.querySelectorAll('.tds-pin')].map((e) => e.offsetWidth))") <= 76, "pin slots are at most 76")
    check(style(".tds-pin-label", "fontSize") === "12px", "pin labels are 12px")
    wait(500)
    shot("pins")
    ab("open", BASE)
    until(() => exists(`.tds-pin[data-id="${id}"]`), Boolean, "the pin after reload")
    const at = rect(`.tds-pin[data-id="${id}"]`)!
    ab("mouse", "move", String(at.x + at.w / 2), String(at.y + at.h / 2))
    ab("mouse", "down", "right")
    ab("mouse", "up", "right")
    until(() => exists(".tds-menu"), Boolean, "the pin menu")
    choose("Unpin")
    until(() => exists(`.tds-row-wrap[data-id="${id}"]`), Boolean, "the row to come back")
    check(!exists(`.tds-pin[data-id="${id}"]`), "the pin should be gone")
  },
  writesheet() {
    seeded()
    const h = () => rect(".tds-field")!.h
    const base = h()
    const expanded = () => js<string | null>("return document.querySelector('.tds-sheet-grip')?.getAttribute('aria-expanded') ?? null")
    const receded = () => js<{ on: boolean; scale: number; filter: string }>("const t = document.querySelector('main .tds-transcript'); const s = getComputedStyle(t); return { on: t.hasAttribute('data-recede'), scale: parseFloat(s.scale) || 1, filter: s.filter }")
    const closed = (what: string) => {
      until(h, (v) => Math.abs(v - base) < 1, what)
      until(receded, (r) => !r.on, "the transcript to come back")
      check(expanded() === "false", "the grip says collapsed")
    }
    ab("hover", ".tds-field")
    ab("click", ".tds-sheet-grip")
    until(h, (v) => v > 500, "a tap on the grip to open the sheet")
    wait(500)
    const open = h()
    const back = receded()
    check(expanded() === "true", "the grip says expanded")
    check(back.on && back.scale < 0.995 && back.filter.includes("blur"), `the transcript scales back, dims and blurs (${JSON.stringify(back)})`)
    check(js<boolean>("return !!document.activeElement?.closest('.tds-editor')"), "the editor keeps focus in the sheet")
    ab("keyboard", "type", "A longer thought")
    shot("sheet-open")
    ab("press", "Escape")
    closed("Escape to collapse the sheet")
    check(js<string>("return document.querySelector('.ProseMirror').textContent") === "A longer thought", "the draft survives the round trip")

    ab("eval", "(() => { window.__peak = 0; const f = document.querySelector('.tds-field'); const tick = () => { window.__peak = Math.max(window.__peak, f.getBoundingClientRect().height); if (!window.__stopPeak) requestAnimationFrame(tick) }; window.__stopPeak = false; requestAnimationFrame(tick) })()")
    ab("eval", "document.querySelector('.tds-sheet-grip').click()")
    wait(90)
    ab("eval", "document.querySelector('.tds-sheet-grip').click()")
    closed("a second tap mid-flight to send the sheet back")
    const peak = js<number>("window.__stopPeak = true; return window.__peak")
    check(peak > base + 20 && peak < open - 40, `a mid-flight tap retargets the spring instead of finishing the open (peak ${peak.toFixed(0)} of ${open.toFixed(0)})`)

    const g = rect(".tds-sheet-grip")!
    const x = String(g.x + g.w / 2)
    ab("mouse", "move", x, String(g.y + g.h / 2))
    ab("mouse", "down")
    for (let i = 1; i <= 8; i++) ab("mouse", "move", x, String(g.y + g.h / 2 - i * 25))
    wait(100)
    const held = h()
    check(Math.abs(held - (base + 200)) < 30, `the sheet follows the pointer while dragging (${held.toFixed(0)}, expected about ${base + 200})`)
    check(receded().on, "the transcript recedes with the drag")
    for (let i = 9; i <= 22; i++) ab("mouse", "move", x, String(g.y + g.h / 2 - i * 25))
    ab("mouse", "up")
    until(h, (v) => Math.abs(v - open) < 1, "a long drag to settle open")
    check(expanded() === "true", "a drag past halfway opens the sheet")
    const top = rect(".tds-sheet-grip")!
    ab("mouse", "move", x, String(top.y + top.h / 2))
    ab("mouse", "down")
    for (let i = 1; i <= 4; i++) ab("mouse", "move", x, String(top.y + top.h / 2 + i * 25))
    wait(150)
    ab("mouse", "up")
    until(h, (v) => Math.abs(v - open) < 1, "a short drag down to spring back open")

    const main = rect("main")!
    ab("mouse", "move", String(main.x + main.w * 0.1), String(main.y + main.h / 2))
    ab("mouse", "down")
    ab("mouse", "up")
    closed("a tap on the conversation to collapse the sheet")

    ab("mouse", "move", x, String(g.y + g.h / 2))
    for (let i = 0; i < 12; i++) ab("mouse", "wheel", "60")
    until(h, (v) => Math.abs(v - open) < 1, "a two-finger swipe up over the grip to open the sheet")
    field()
    ab("press", "End")
    ab("press", "Enter")
    closed("sending to collapse the sheet")
  },
  smooth() {
    ensureRows(3)
    ab("open", BASE)
    until(liveRows, (n) => n >= 3, "rows")
    type Frame = [number, number, number, number, number, number] | [number]
    const start = (sel: string) =>
      ab("eval", `(() => { const frames = []; let on = true; window.__frames = frames; window.__stop = () => (on = false); const tick = (t) => { const el = document.querySelector(${JSON.stringify(sel)}); if (el) { const r = el.getBoundingClientRect(); frames.push([t, r.x, r.y, r.width, r.height, +getComputedStyle(el).opacity]) } else frames.push([t]); if (on) requestAnimationFrame(tick) }; requestAnimationFrame(tick) })()`)
    const stop = () => js<Frame[]>("window.__stop(); return window.__frames")
    const problems: string[] = []
    const audit = (name: string, all: Frame[]) => {
      const frames = all.filter((f, i) => all[i + 1]?.[0] !== f[0])
      const live = frames.filter((f): f is [number, number, number, number, number, number] => f.length === 6)
      if (live.length < 2) return problems.push(`${name}: never rendered`)
      for (const [i, label] of [[1, "x"], [2, "y"], [3, "width"], [4, "height"], [5, "opacity"]] as const) {
        const values = live.map((f) => f[i])
        const range = Math.max(...values) - Math.min(...values)
        if (range < (i === 5 ? 0.3 : 6)) continue
        for (let k = 1; k < live.length; k++) {
          if (live[k]![0] - live[k - 1]![0] > 34 || live[k]![5] < 0.02 || live[k - 1]![5] < 0.02) continue
          const step = Math.abs(live[k]![i] - live[k - 1]![i]) / Math.max(1, Math.round((live[k]![0] - live[k - 1]![0]) / 16.7))
          if (step > range * 0.6) problems.push(`${name}: ${label} jumps ${step.toFixed(1)} of ${range.toFixed(1)} in one frame (${live[k - 1]![i].toFixed(2)} → ${live[k]![i].toFixed(2)} at frame ${k} of ${live.length}, dt ${(live[k]![0] - live[k - 1]![0]).toFixed(0)})`)
        }
      }
      const first = frames.findIndex((f) => f.length === 6)
      const settled = live[live.length - 1]!
      const enter = live[0]!
      if (first > 0 && enter[5] >= settled[5] - 0.05 && Math.abs(enter[3] - settled[3]) < 1 && Math.abs(enter[4] - settled[4]) < 1 && Math.abs(enter[2] - settled[2]) < 1)
        problems.push(`${name}: pops in with no enter motion`)
      const gone = frames.findLastIndex((f) => f.length === 6)
      if (gone < frames.length - 1) {
        const exit = frames[gone] as [number, number, number, number, number, number]
        const rest = live.find((f) => f[5] > 0.95) ?? settled
        if (exit[5] > 0.9 && Math.abs(exit[3] - rest[3]) < 1 && Math.abs(exit[2] - rest[2]) < 1) problems.push(`${name}: vanishes with no exit motion`)
      }
    }
    const probe = (name: string, sel: string, act: () => void, ms = 700) => {
      start(sel)
      act()
      wait(ms)
      audit(name, stop())
    }
    probe("row menu", ".tds-menu", () => (ab("hover", ".tds-row-wrap .tds-row"), ab("click", ".tds-row-wrap .tds-row-more"), wait(600), ab("press", "Escape")))
    probe("palette", ".tds-palette", () => (ab("press", "Control+k"), wait(600), ab("press", "Escape")))
    ab("click", "button[aria-label='New chat']")
    wait(500)
    probe("plus menu", ".tds-plus-menu, .tds-menu", () => (ab("click", ".tds-composer-plus"), wait(600), ab("press", "Escape")))
    probe("plus to x", ".tds-composer-plus svg", () => (ab("click", ".tds-composer-plus"), wait(500), ab("press", "Escape")))
    field()
    probe("composer grows", ".tds-field", () => {
      for (let i = 0; i < 4; i++) (ab("keyboard", "type", "line " + i), ab("press", "Shift+Enter"))
    }, 900)
    ab("press", "Control+a")
    ab("press", "Backspace")
    wait(500)
    ab("hover", ".tds-field")
    probe("sheet open", ".tds-field", () => (ab("click", ".tds-sheet-grip"), wait(900), ab("press", "Escape")), 1000)
    probe("sheet recede", "main .tds-transcript", () => (ab("click", ".tds-sheet-grip"), wait(900), ab("press", "Escape")), 1000)
    probe("sheet retarget", ".tds-field", () => (ab("eval", "document.querySelector('.tds-sheet-grip').click()"), wait(140), ab("eval", "document.querySelector('.tds-sheet-grip').click()")), 1000)
    probe("bell centre", ".tds-centre", () => (ab("click", ".tds-rail-button[data-bell]"), wait(600), ab("click", ".tds-rail-button[data-bell]")))
    const at = rect(".tds-row-wrap:not([data-archived]) .tds-row")!
    ab("mouse", "move", "5", "5")
    probe("peek", ".tds-peek", () => (ab("mouse", "move", String(at.x + 60), String(at.y + at.h / 2)), wait(1200), ab("mouse", "move", "900", "450")), 900)
    const next = js<string>("return [...document.querySelectorAll('.tds-row-wrap:not([data-archived])')].find((e) => !e.querySelector('[aria-current]'))?.dataset.id ?? ''")
    ab("mouse", "move", "900", "450")
    probe("row to chat", "#main", () => ab("click", `.tds-row-wrap[data-id="${next}"] .tds-row`), 900)
    probe("toast", ".tds-toast[data-front]", () => (ab("hover", ".tds-row-wrap .tds-row"), ab("click", ".tds-row-wrap .tds-row-more"), wait(300), choose("Copy Link")), 900)
    seeded()
    until(() => exists(".tds-act-button"), Boolean, "a thread with a work log", 10000)
    wait(500)
    probe("work log open and close", ".tds-worklog", () => (ab("click", ".tds-act-button"), wait(700), ab("press", "Escape")))
    wait(400)
    steady(".tds-act-button")
    ab("click", ".tds-act-button")
    until(() => exists(".tds-worklog .tds-ws-line:not(:disabled)"), Boolean, "the work log rows")
    wait(500)
    probe("work log expand", ".tds-worklog", () => (ab("click", ".tds-worklog .tds-ws-line:not(:disabled)"), wait(600)))
    probe("work log collapse", ".tds-worklog", () => (ab("click", ".tds-worklog .tds-ws[data-open] .tds-ws-line"), wait(600)))
    ab("press", "Escape")
    const drag = (from: number, to: number, y = 420) => {
      ab("mouse", "move", String(from), String(y))
      ab("mouse", "down")
      for (let k = 1; k <= 6; k++) ab("mouse", "move", String(Math.round(from + ((to - from) * k) / 6)), String(y))
      ab("mouse", "up")
    }
    probe("centre scrub back", ".tds-centre", () => (ab("click", ".tds-rail-button[data-bell]"), wait(600), drag(300, 180), wait(700), drag(300, 40)), 900)
    probe("centre retarget", ".tds-centre", () => (ab("click", ".tds-rail-button[data-bell]"), wait(90), ab("click", ".tds-rail-button[data-bell]"), wait(90), ab("click", ".tds-rail-button[data-bell]"), wait(700), ab("press", "Escape")), 900)
    for (const line of problems) console.log("  jank  " + line)
    check(problems.length === 0, `${problems.length} motion jumps`)
  },
  calmtext() {
    const work = join(homedir(), ".capy/work")
    fresh()
    until(() => exists(".tds-composer-wrap input[type=file]"), Boolean, "the composer")
    ab("upload", ".tds-composer-wrap input[type=file]", png(join(work, "verify-calm.png"), 900, 600, [120, 160, 230]))
    until(() => js<string[]>("return [...document.querySelectorAll('.tds-attach')].map((e) => e.dataset.status)"), (s) => s.length === 1 && s[0] === "done", "the upload to finish", 15000)
    field()
    ab("keyboard", "type", "Calm zoom")
    ab("press", "Enter")
    until(() => js<boolean>("const i = document.querySelector('.tds-media-tile img'); return !!i && i.complete && i.naturalWidth > 0"), Boolean, "the sent image")
    ab("click", ".tds-media-tile")
    until(() => exists(".tds-lightbox[data-ready]"), Boolean, "the lightbox to open")
    wait(400)
    const zoomMode = js<string>("return document.querySelector('.tds-lightbox-zoom .tds-morph-text')?.dataset.mode ?? (document.querySelectorAll('.tds-lightbox').length + ' lightbox, zoom ' + !!document.querySelector('.tds-lightbox-zoom') + ', count ' + document.querySelector('.tds-lightbox-count')?.textContent + ', ' + location.pathname)")
    check(zoomMode === "calm", `the zoom % is a calm TextMorph (${zoomMode})`)
    js<boolean>("const box = document.querySelector('.tds-lightbox-zoom .num'); const frames = (window.__calm = []); let on = true; window.__calmStop = () => (on = false); const tick = () => { const all = [box, ...box.querySelectorAll('*')]; frames.push({ ys: all.map((e) => e.getBoundingClientRect().y), tr: all.map((e) => getComputedStyle(e).transform + ' ' + getComputedStyle(e).translate).filter((t) => !/^none none$/.test(t)), rolled: box.querySelectorAll('[torph-item]').length, op: Math.min(...[...box.querySelectorAll('.tds-morph-text > span')].map((e) => +getComputedStyle(e).opacity)), text: box.textContent }); if (on) requestAnimationFrame(tick) }; requestAnimationFrame(tick); return true")
    ab("click", "button[aria-label='Zoom in']")
    wait(450)
    ab("click", "button[aria-label='Zoom in']")
    wait(450)
    ab("click", "button[aria-label='Zoom out']")
    wait(450)
    const frames = js<{ ys: number[]; tr: string[]; rolled: number; op: number; text: string }[]>("window.__calmStop(); return window.__calm")
    const texts = [...new Set(frames.map((f) => f.text))]
    const drift = Math.max(0, ...frames.flatMap((f) => f.ys.map((y, i) => Math.abs(y - (frames[0]!.ys[i] ?? y)))))
    check(texts.length >= 3, `the zoom % changed across ${frames.length} frames: ${texts.join(" → ")}`)
    check(drift < 0.5, `no vertical digit movement while the zoom % changes (max drift ${drift.toFixed(2)}px)`)
    check(frames.every((f) => f.tr.length === 0 && f.rolled === 0), "no rolling digits or translated glyphs in the zoom %")
    check(frames.some((f) => f.op < 0.9), "the new value cross-fades in")
    check(morphed(".tds-lightbox-zoom .num") === frames.at(-1)!.text, `the plain render reads the final value (${morphed(".tds-lightbox-zoom .num")})`)
    shot("calm-zoom")
    ab("click", "button[aria-label='Reset zoom']")
    wait(400)
    ab("eval", "const w = document.querySelector('.tds-lightbox-stage'); const m = document.querySelector('.tds-lightbox-zoom .tds-morph-text'); const seen = (window.__burst = []); let k = 0; const step = () => { if (k >= 3) seen.push(m.textContent + (m.dataset.was ? ' fading' : '')); w.dispatchEvent(new WheelEvent('wheel', { deltaY: -6, ctrlKey: true, clientX: 700, clientY: 400, bubbles: true, cancelable: true })); if (++k < 8) requestAnimationFrame(step) }; requestAnimationFrame(step)")
    wait(300)
    const burst = js<string[]>("return window.__burst")
    check(burst.length === 5 && new Set(burst).size > 2 && burst.every((t) => !t.endsWith("fading")), `a burst of Ctrl-wheel zoom swaps the % instantly instead of stacking cross-fades: ${burst.join(", ")}`)
  },
  rowmorph() {
    ensureRows(2)
    ab("open", BASE)
    until(liveRows, (n) => n >= 2, "rows")
    ab("mouse", "move", "900", "450")
    const record = `(() => { const out = []; window.__morph = out; const t0 = performance.now(); const tick = () => { const m = document.getElementById("main"); if (m) out.push([performance.now() - t0, m.getBoundingClientRect().x, getComputedStyle(m).clipPath, location.pathname]); if (performance.now() - t0 < 1000) requestAnimationFrame(tick) }; requestAnimationFrame(tick) })()`
    type Sample = [number, number, string, string]
    const morphs = (what: string, to: string) => {
      const frames = until(() => js<Sample[]>("return window.__morph"), (f) => f.length > 0 && f.at(-1)![0] > 900, `the ${what} frames`, 3000)
      const settled = frames.at(-1)!
      check(settled[3] === `/t/${to}`, `${what} opens the chat (${settled[3]})`)
      const moving = frames.filter((f) => f[3] === settled[3])
      check(moving.every((f) => Math.abs(f[1] - settled[1]) < 1), `${what}: the chat's box never jumps, only its clip grows`)
      check(moving.some((f) => /^inset\((?!0px 0px 0px 0px)/.test(f[2])), `${what}: the chat is clipped to the source box while it grows`)
      check(settled[2] === "none" && Math.abs(moving.at(-1)![1] - settled[1]) < 1, `${what}: the chat settles full size, unclipped (${settled[2]})`)
    }
    const ids = js<string[]>("return [...document.querySelectorAll('.tds-row-wrap:not([data-archived])')].slice(0, 2).map((e) => e.dataset.id)")
    for (const id of [ids[0]!, ids[1]!]) {
      ab("eval", record)
      ab("click", `.tds-row-wrap[data-id="${id}"] .tds-row`)
      morphs("row → chat", id)
      ab("mouse", "move", "900", "450")
      wait(300)
    }
    const other = ids[0]!
    const at = rect(`.tds-row-wrap[data-id="${other}"] .tds-row`)!
    ab("mouse", "move", "5", "5")
    ab("mouse", "move", String(at.x + 60), String(at.y + at.h / 2))
    until(() => exists(".tds-peek"), Boolean, "the peek card", 3000)
    wait(500)
    const card = rect(".tds-peek")!
    ab("eval", 'window.__ghost = false; new MutationObserver(() => { if (document.querySelector(".tds-peek[data-ghost]")) window.__ghost = true }).observe(document.body, { childList: true })')
    ab("mouse", "move", String(card.x + card.w / 2), String(card.y + card.h / 2), "--steps", "6")
    ab("eval", record)
    ab("mouse", "down")
    ab("mouse", "up")
    morphs("peek → chat", other)
    check(!js<boolean>("return window.__ghost"), "the peek hands off to the chat instead of also shrinking back into its row")
    shot("rowmorph")
  },
  pingrid() {
    const pins = () => js<number>("return document.querySelectorAll('.tds-pin').length")
    const added: string[] = []
    ensureRows(Math.max(1, 6 - pins()))
    while (pins() < 6) {
      const id = js<string>("return document.querySelector('.tds-row-wrap')?.dataset.id ?? ''")
      ab("eval", "document.querySelector('.tds-row-wrap')?.scrollIntoView({ block: 'center' })")
      openRow()
      choose("Pin")
      until(() => js<boolean>(`return !!document.querySelector('.tds-pin[data-id="${id}"]')`), Boolean, "the chat to land in the pins")
      added.push(id)
      if (liveRows() === 0) ensureRows(1)
    }
    const layout = () =>
      js<{ visible: number; overlap: boolean; rows: number; cols: number; clamp: boolean }>(`
        const side = document.querySelector('.tds-sidebar').getBoundingClientRect()
        const tiles = [...document.querySelectorAll('.tds-pin')].map((e) => e.getBoundingClientRect())
        const labels = [...document.querySelectorAll('.tds-pin-label')].map((e) => e.getBoundingClientRect())
        const visible = tiles.filter((r) => r.width > 0 && r.left >= side.left - 1 && r.right <= side.right + 1).length
        const overlap = labels.some((a, i) => labels.some((b, j) => i !== j && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1))
        const tops = [...new Set(tiles.map((r) => Math.round(r.top)))]
        const lh = parseFloat(getComputedStyle(document.querySelector('.tds-pin-label')).lineHeight)
        return { visible, overlap, rows: tops.length, cols: Math.max(...tops.map((t) => tiles.filter((r) => Math.round(r.top) === t).length)), clamp: labels.every((r) => r.height <= lh * 2 + 1) }`)
    const at = (width: number) => {
      ab("eval", `localStorage.setItem("tock.sidebar.width", "${width}")`)
      ab("open", BASE)
      until(pins, (n) => n >= 6, "the pins after reload")
      wait(700)
      return layout()
    }
    const wide = at(296)
    check(wide.visible === pins(), `every pin is visible at 296, got ${wide.visible} of ${pins()}`)
    check(!wide.overlap, "pin labels never run into each other at 296")
    check(wide.clamp, "pin labels clamp to two lines")
    shot("pingrid-296")
    const narrow = at(tokens.size["sidebar-min"])
    check(narrow.visible === pins(), `every pin is visible at the narrowest sidebar, got ${narrow.visible} of ${pins()}`)
    check(!narrow.overlap, "pin labels never run into each other at the narrowest sidebar")
    check(narrow.cols < wide.cols && narrow.rows === Math.ceil(pins() / narrow.cols) && wide.rows === Math.ceil(pins() / wide.cols), `pins reflow into fewer columns when the sidebar narrows (${wide.cols}x${wide.rows} → ${narrow.cols}x${narrow.rows})`)
    shot("pingrid-narrow")
    ab("eval", 'localStorage.removeItem("tock.sidebar.width")')
    ab("open", BASE)
    for (const id of added) {
      until(() => exists(`.tds-pin[data-id="${id}"]`), Boolean, "the pin to unpin")
      const box = rect(`.tds-pin[data-id="${id}"]`)!
      ab("mouse", "move", String(box.x + box.w / 2), String(box.y + box.h / 2))
      ab("mouse", "down", "right")
      ab("mouse", "up", "right")
      until(() => exists(".tds-menu"), Boolean, "the pin menu")
      choose("Unpin")
      until(() => exists(`.tds-pin[data-id="${id}"]`), (still) => !still, "the pin to leave")
    }
  },
  swipe() {
    ensureRows(1)
    ab("mouse", "move", "5", "5")
    const id = js<string>("return document.querySelector('.tds-row-wrap')?.dataset.id ?? ''")
    const at = rect(`.tds-row-wrap[data-id="${id}"]`)!
    const y = String(at.y + at.h / 2)
    ab("mouse", "move", String(at.x + at.w - 60), y)
    ab("mouse", "down")
    for (let dx = 15; dx <= 90; dx += 15) {
      ab("mouse", "move", String(at.x + at.w - 60 - dx), y)
      wait(40)
    }
    ab("mouse", "up")
    until(() => exists(`.tds-row-wrap[data-id="${id}"][data-swiping]`), Boolean, "the row to stay open")
    const openAt = js<string>(`return document.querySelector('.tds-row-wrap[data-id="${id}"] .tds-row').style.transform`)
    check(openAt === "translateX(-132px)", `a short swipe snaps open to two actions (${openAt})`)
    wait(350)
    shot("swipe-open")
    ab("click", `.tds-row-wrap[data-id="${id}"] .tds-row`)
    until(() => exists(`.tds-row-wrap[data-id="${id}"][data-swiping]`), (open) => !open, "a click to close the swipe")
    wait(350)
    ab("mouse", "move", String(at.x + at.w - 60), y)
    ab("mouse", "down")
    ab("mouse", "move", String(at.x + at.w - 60 - 185), y, "--steps", "12")
    ab("mouse", "up")
    until(() => exists(`.tds-row-wrap[data-id="${id}"]:not([data-archived])`), (still) => !still, "a long-enough swipe (past the near threshold, short of the far one) to archive the row")
    until(() => exists(".tds-toast-action"), Boolean, "the Undo toast")
    js<boolean>("const b = [...document.querySelectorAll('.tds-toast-action')].find((e) => e.textContent.trim() === 'Undo'); b?.click(); return !!b")
    until(() => exists(`.tds-row-wrap[data-id="${id}"]:not([data-archived])`), Boolean, "Undo to restore the row")
  },
  swipeintent() {
    ab("eval", "localStorage.removeItem('tock.sidebar.width')")
    ab("open", BASE)
    ensureRows(1)
    ab("mouse", "move", "5", "5")
    const sel = ".tds-row-wrap:not([data-archived]) .tds-row"
    check(rect(sel)!.w >= 290, `rows are wide enough for the stock thresholds (${rect(sel)!.w})`)
    type Outcome = { fired: string[]; released: string[]; swiping: boolean }
    const run = (kind: "pointer" | "wheel", steps: number[][]): Outcome => {
      const out = ab("eval", `(async () => {
        const row = document.querySelector(${JSON.stringify(sel)}); const wrap = row.closest(".tds-row-wrap")
        const fired = [], released = []
        const veto = (e) => { e.preventDefault(); fired.push(e.detail) }
        const done = (e) => released.push(e.detail)
        document.addEventListener("tds-swipe", veto); document.addEventListener("tds-swipe-release", done)
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
        const b = row.getBoundingClientRect(), x0 = b.left + b.width * 0.55, y0 = b.top + b.height / 2
        const steps = ${JSON.stringify(steps)}
        if (${JSON.stringify(kind)} === "pointer") {
          const at = (x, y) => ({ bubbles: true, cancelable: true, composed: true, pointerId: 7, pointerType: "mouse", isPrimary: true, button: 0, buttons: 1, clientX: x0 + x, clientY: y0 + y })
          row.dispatchEvent(new PointerEvent("pointerdown", at(0, 0)))
          let last = [0, 0]
          for (const [dx, dy, ms] of steps) { await sleep(ms); last = [dx, dy]; row.dispatchEvent(new PointerEvent("pointermove", at(dx, dy))) }
          row.dispatchEvent(new PointerEvent("pointerup", { ...at(last[0], last[1]), buttons: 0 }))
        } else {
          for (const [dx, dy, ms] of steps) { await sleep(ms); row.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaX: dx, deltaY: dy, clientX: x0, clientY: y0 })) }
          await sleep(260)
        }
        await sleep(30)
        const swiping = wrap.hasAttribute("data-swiping")
        document.removeEventListener("tds-swipe", veto); document.removeEventListener("tds-swipe-release", done)
        return JSON.stringify({ fired, released, swiping })
      })()`)
      return JSON.parse(JSON.parse(out)) as Outcome
    }
    const reset = () => {
      ab("mouse", "move", "900", "450")
      ab("mouse", "down")
      ab("mouse", "up")
      until(() => exists(".tds-row-wrap[data-swiping]"), (on) => !on, "the row to settle closed")
      wait(250)
    }
    const drag = (to: number, ms: number, n = 12) => Array.from({ length: n }, (_, i) => [Math.round((to * (i + 1)) / n), 0, ms])
    const cases: { name: string; kind: "pointer" | "wheel"; steps: number[][]; fired: string[]; released?: string }[] = [
      { name: "short slow drag rests open", kind: "pointer", steps: drag(-80, 30), fired: [], released: "open" },
      { name: "tiny drag closes", kind: "pointer", steps: drag(-40, 30), fired: [], released: "close" },
      { name: "medium drag archives", kind: "pointer", steps: drag(-175, 25), fired: ["archive"] },
      { name: "long drag deletes", kind: "pointer", steps: drag(-245, 25, 16), fired: ["delete"] },
      { name: "long then back to medium archives", kind: "pointer", steps: [...drag(-245, 20, 14), ...Array.from({ length: 12 }, (_, i) => [-245 + (i + 1) * 6, 0, 35])], fired: ["archive"] },
      { name: "fast short flick archives", kind: "pointer", steps: drag(-64, 8, 4), fired: ["archive"] },
      { name: "fast flick never reaches delete", kind: "pointer", steps: drag(-150, 6, 4), fired: ["archive"] },
      { name: "flick back cancels an armed delete", kind: "pointer", steps: [...drag(-245, 20, 14), [-215, 0, 8], [-180, 0, 8], [-150, 0, 8]], fired: [], released: "close" },
      { name: "diagonal never swipes", kind: "pointer", steps: [[10, 12, 20], [22, 30, 20], [30, 44, 20], [34, 60, 20]], fired: [] },
      { name: "right medium marks unread", kind: "pointer", steps: drag(175, 25), fired: ["unread"] },
      { name: "right long pins", kind: "pointer", steps: drag(245, 25, 16), fired: ["pin"] },
      { name: "trackpad short rests open", kind: "wheel", steps: Array.from({ length: 7 }, () => [12, 0, 16]), fired: [], released: "open" },
      { name: "trackpad inertia tail never commits", kind: "wheel", steps: [...Array.from({ length: 9 }, () => [14, 0, 16]), ...[12, 10, 8, 7, 6, 5, 4, 3, 2, 1].map((d) => [d, 0, 16])], fired: [], released: "open" },
      { name: "trackpad deliberate long deletes", kind: "wheel", steps: Array.from({ length: 19 }, () => [14, 0, 16]), fired: ["delete"] },
      { name: "trackpad medium archives", kind: "wheel", steps: Array.from({ length: 13 }, () => [13, 0, 16]), fired: ["archive"] },
      { name: "vertical scroll never swipes", kind: "wheel", steps: Array.from({ length: 6 }, () => [1, 24, 16]), fired: [] },
    ]
    const failures: string[] = []
    for (const c of cases) {
      const got = run(c.kind, c.steps)
      const ok = JSON.stringify(got.fired) === JSON.stringify(c.fired) && (c.released === undefined || got.released.at(-1) === c.released)
      console.log(`      ${ok ? "ok  " : "FAIL"} ${c.name}: fired ${JSON.stringify(got.fired)} released ${JSON.stringify(got.released)}`)
      if (!ok) failures.push(`${c.name}: fired ${JSON.stringify(got.fired)} released ${JSON.stringify(got.released)}`)
      if (c.name === "medium drag archives") shot("swipe-armed")
      reset()
    }
    check(failures.length === 0, failures.join("; "))
  },
  multiselect() {
    ensureRows(2)
    ab("mouse", "move", "5", "5")
    js<boolean>("const rows = [...document.querySelectorAll('.tds-row-wrap:not([data-archived]) .tds-row')].slice(0, 2); rows[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true })); return rows.length === 2")
    wait(150)
    js<boolean>("const r = [...document.querySelectorAll('.tds-row-wrap:not([data-archived]) .tds-row')][1]; r?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true })); return !!r")
    until(() => js<number>("return document.querySelectorAll('.tds-row[data-multi]').length"), (n) => n >= 2, "two selected rows")
    until(() => exists(".tds-bulk[data-open]"), Boolean, "the bulk bar")
    check(style(".tds-row[data-multi]", "backgroundColor") === "rgba(229, 143, 180, 0.1)", `multi-selected fill is rose 10%, got ${style(".tds-row[data-multi]", "backgroundColor")}`)
    check(js<string>("return document.querySelector('.tds-bulk b').textContent.trim()").endsWith("selected"), "the bulk bar counts the selection")
    check(rect(".tds-bulk")?.h === 46, "the bulk bar is 46 tall")
    wait(400)
    shot("multiselect")
    ab("eval", "document.activeElement?.blur()")
    ab("press", "Escape")
    until(() => exists(".tds-bulk[data-open]"), (open) => !open, "Escape to clear the selection")
  },
  peek() {
    ensureRows(1)
    ab("mouse", "move", "5", "5")
    const at = rect(".tds-row-wrap:not([data-archived]) .tds-row")!
    ab("mouse", "move", String(at.x + 60), String(at.y + at.h / 2))
    wait(250)
    check(!exists(".tds-peek"), "the peek waits for the pointer to rest")
    until(() => exists(".tds-peek"), Boolean, "the peek card", 3000)
    check(js<number>("return document.querySelector('.tds-peek').offsetWidth") === 330, "the peek is 330 wide")
    check(js<number>("return parseFloat(document.querySelector('.tds-peek').style.translate)") === rect(".tds-sidebar")!.x + rect(".tds-sidebar")!.w + 14, "the peek sits 14 beside the sidebar")
    wait(400)
    shot("peek")
    ab("mouse", "move", "900", "450")
    until(() => exists(".tds-peek"), (open) => !open, "the peek to hide on leave")
    ab("eval", "document.activeElement?.blur()")
    ab("mouse", "move", String(at.x + 60), String(at.y + at.h / 2))
    until(() => exists(".tds-peek"), Boolean, "the peek to come back on rest", 3000)
    ab("press", "Space")
    until(() => exists(".tds-peek"), (open) => !open, "Space to hide the peek", 1500)
    ab("press", "Space")
    until(() => exists(".tds-peek"), Boolean, "Space to show the peek", 4000)
    ab("press", "Escape")
    until(() => exists(".tds-peek"), (open) => !open, "Escape to hide the peek")
    ab("mouse", "move", "900", "450")
  },
  peekcontinuous() {
    ensureRows(3)
    ab("mouse", "move", "900", "450")
    const rows = js<{ x: number; y: number }[]>("return [...document.querySelectorAll('.tds-row-wrap:not([data-archived]) .tds-row')].slice(0, 3).map((e) => { const r = e.getBoundingClientRect(); return { x: r.x + 60, y: r.y + r.height / 2 } })")
    const label = () => js<string>("return document.querySelector('.tds-peek:not([data-ghost])')?.dataset.id ?? ''")
    const glide = (points: { x: number; y: number }[], what: string) => {
      ab("mouse", "move", String(points[0]!.x), String(points[0]!.y))
      until(() => exists(".tds-peek"), Boolean, `the peek on the first ${what}`, 3000)
      ab("eval", "document.querySelector('.tds-peek').__same = 1")
      const seen = new Set([label()])
      for (const p of points.slice(1)) {
        ab("mouse", "move", String(p.x), String(p.y), "--steps", "6")
        for (const end = Date.now() + 500; Date.now() < end; wait(40)) check(exists(".tds-peek:not([data-ghost])"), `the peek stays up while moving between ${what}s`)
        seen.add(label())
      }
      check(js<number>("return document.querySelector('.tds-peek:not([data-ghost])')?.__same ?? 0") === 1, `one card morphs between ${what}s instead of closing and reopening`)
      check(seen.size === points.length, `the card shows each ${what}'s chat (${[...seen].join(" / ")})`)
    }
    glide(rows, "row")
    check(js<string>("return document.querySelector('.tds-peek').dataset.place") === "side", "rows peek beside the sidebar")
    shot("peek-rows")
    ab("mouse", "move", "900", "450")
    until(() => exists(".tds-peek:not([data-ghost])"), (open) => !open, "a short grace after leaving the list closes the peek", 2000)
    const pins = js<{ x: number; y: number }[]>("return [...document.querySelectorAll('.tds-pin')].slice(0, 3).map((e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + 24 } })")
    if (pins.length >= 2) {
      wait(600)
      glide(pins, "pin")
      check(js<string>("return document.querySelector('.tds-peek').dataset.place") === "below", "pins peek below the pin, over the roster")
      check(rect(".tds-peek")!.y >= rect(".tds-pin")!.y + rect(".tds-pin")!.h - 2, "the pin peek sits under the pins")
      shot("peek-pins")
      ab("mouse", "move", "900", "450")
      until(() => exists(".tds-peek:not([data-ghost])"), (open) => !open, "the pin peek closes after the grace", 2000)
    }
  },
  snooze() {
    ensureRows(1)
    const id = js<string>("return document.querySelector('.tds-row-wrap:not([data-archived])')?.dataset.id ?? ''")
    openRow()
    ab("hover", ".tds-menu-sub")
    until(() => js<boolean>("return [...document.querySelectorAll('.tds-menu-item')].some((e) => e.textContent.trim() === 'Tomorrow')"), Boolean, "the snooze submenu")
    wait(250)
    shot("snooze")
    choose("1 Hour")
    until(() => exists(`.tds-row-wrap[data-id="${id}"]`), (still) => !still, "the snoozed chat to leave the list")
    until(() => js<boolean>("return [...document.querySelectorAll('.tds-toast-title')].some((e) => e.textContent.includes('Snoozed for an hour'))"), Boolean, "the snooze toast")
    js<boolean>("const b = [...document.querySelectorAll('.tds-toast-action')].find((e) => e.textContent.trim() === 'Undo'); b?.click(); return !!b")
    until(() => exists(`.tds-row-wrap[data-id="${id}"]`), Boolean, "Undo to bring the chat back")
  },
  move() {
    ensureRows(1)
    openRow()
    choose("Move to…")
    until(() => exists(".tds-move input"), Boolean, "the move dialog")
    check(rect(".tds-move")?.w === 420, "the move dialog is 420 wide")
    const folder = `Verify ${Date.now().toString(36)}`
    ab("keyboard", "type", folder)
    until(() => js<boolean>("return [...document.querySelectorAll('.tds-move-item')].some((e) => e.textContent.includes('New Folder'))"), Boolean, "New Folder")
    wait(250)
    shot("move")
    ab("press", "Enter")
    until(() => js<boolean>(`return [...document.querySelectorAll('.tds-toast-title')].some((e) => e.textContent.includes(${JSON.stringify(`Moved to ${folder}`)}))`), Boolean, "the moved toast")
    until(() => exists(".tds-move"), (open) => !open, "the dialog to close")
  },
  stack() {
    ensureRows(2)
    ab("mouse", "move", "5", "5")
    const at = rect(".tds-toast-row")!
    ab("mouse", "move", String(at.x + 40), String(at.y + at.h / 2))
    ab("mouse", "down")
    wait(150)
    check(!exists(".tds-stack[data-open]"), "the stack waits for the hold")
    until(() => exists(".tds-stack[data-open]"), Boolean, "the session stack", 2000)
    const pill = rect(".tds-stack-pill")!
    check(js<number>("return document.querySelector('.tds-stack-pill').offsetHeight") === 54, "session pills are 54 tall")
    ab("mouse", "move", String(pill.x + 40), String(pill.y + pill.h / 2), "--steps", "6")
    until(() => exists(".tds-stack-pill[data-hot]"), Boolean, "the hot pill")
    wait(450)
    shot("stack")
    const target = js<string>("return document.querySelector('.tds-stack-pill[data-hot]').dataset.id")
    ab("mouse", "up")
    until(() => js<string>("return location.pathname"), (p) => p === `/t/${target}`, "release to open the hot chat")
    until(() => exists(".tds-stack[data-open]"), (open) => !open, "the stack to close")
  },
  stackscroll() {
    ensureRows(2)
    ab("mouse", "move", "5", "5")
    ab("set", "viewport", "1440", "520")
    const at = rect(".tds-toast-row")!
    ab("mouse", "move", String(at.x + 40), String(at.y + at.h / 2))
    ab("mouse", "down")
    until(() => exists(".tds-stack[data-open]"), Boolean, "the session stack", 2000)
    check(js<boolean>("return document.documentElement.hasAttribute('data-backdrop')"), "the stack recedes the app through the shared backdrop")
    wait(450)
    check(style(".tds-backdrop-scrim", "opacity") === "1", "the shared backdrop scrim covers the app")
    const order = js<{ scrim: number; stack: number }>("return { scrim: +getComputedStyle(document.querySelector('.tds-backdrop-scrim')).zIndex, stack: +getComputedStyle(document.querySelector('.tds-stack')).zIndex }")
    check(order.stack > order.scrim, `the stack sits above the scrim (${order.stack} over ${order.scrim})`)
    const box = js<{ top: number; bottom: number; scroll: number; height: number }>("const s = document.querySelector('.tds-stack-scroll'); const r = s.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, scroll: s.scrollHeight, height: s.clientHeight }")
    check(box.bottom <= 520, `the stack stays on screen (bottom ${box.bottom})`)
    if (box.scroll > box.height + 2) {
      check(js<boolean>("const e = document.querySelector('.tds-stack-scroll'); return parseFloat(e.style.getPropertyValue('--edge-b')) > 0 && parseFloat(e.style.getPropertyValue('--edge-t')) === 0"), "only the edge with more chats fades")
      ab("mouse", "move", String(at.x + 120), String(box.bottom - 6), "--steps", "4")
      until(() => js<number>("return document.querySelector('.tds-stack-scroll').scrollTop"), (top) => top > 20, "holding near the bottom edge scrolls the stack")
      check(until(() => js<number>("return parseFloat(document.querySelector('.tds-stack-scroll').style.getPropertyValue('--edge-t'))"), (t) => t > 0, "the top fade"), "the top edge fades once scrolled")
      check(exists(".tds-stack-pill[data-hot]"), "a pill stays hot while it scrolls")
    }
    shot("stack-scroll")
    ab("mouse", "move", String(at.x + 40), String(at.y + at.h / 2))
    ab("mouse", "up")
    until(() => js<boolean>("return document.documentElement.hasAttribute('data-backdrop')"), (on) => !on, "the backdrop to clear")
    ab("press", "Escape")
    ab("set", "viewport", "1440", "900")
  },
  pinactive() {
    ensureRows(1)
    ab("mouse", "move", "5", "5")
    let id = js<string>("return document.querySelector('.tds-pin')?.dataset.id ?? ''")
    if (!id) {
      id = js<string>("return document.querySelector('.tds-row-wrap:not([data-archived])').dataset.id")
      js<number>("document.querySelector('.tds-row-wrap:not([data-archived]) .tds-row-more').click(); return 1")
      until(() => exists(".tds-menu"), Boolean, "the row menu")
      choose("Pin")
      until(() => exists(`.tds-pin[data-id="${id}"]`), Boolean, "the pin")
    }
    ab("click", `.tds-pin[data-id="${id}"]`)
    until(() => js<string>("return location.pathname"), (p) => p === `/t/${id}`, "the pinned chat to open")
    until(() => js<string>(`return getComputedStyle(document.querySelector('.tds-pin[data-id="${id}"]'), '::before').opacity`), (o) => o === "1", "the open pin's tile")
    check(js<number>("return document.querySelectorAll('.tds-pin[data-active]').length") === 1, "exactly one pin is highlighted")
    shot("pin-active")
    check(js<boolean>("const e = document.querySelector('.tds-roster'); return !!e && parseFloat(e.style.getPropertyValue('--edge-b')) > 0") || js<boolean>("const s = document.querySelector('.tds-sidebar .tds-scroll'); return s.scrollHeight <= s.clientHeight"), "the roster fades at its bottom edge when it overflows")
  },
  type() {
    seeded()
    const root = js<{ smooth: string; synth: string; lh: string; size: string }>("const s = getComputedStyle(document.documentElement); return { smooth: s.webkitFontSmoothing, synth: s.fontSynthesisStyle, lh: s.getPropertyValue('--tds-type-bubble-lh').trim(), size: s.getPropertyValue('--tds-type-bubble-size').trim() }")
    check(root.smooth === "antialiased", `font smoothing is set on the root (${root.smooth})`)
    check(root.synth === "auto", `italic synthesis stays on so <em> slants (${root.synth})`)
    check(/^calc\(/.test(root.lh) && /rem$/.test(root.size), `type tokens are unitless leading and rem sizes (${root.lh}, ${root.size})`)
    const scaled = js<{ size: string; lh: string }>("document.documentElement.style.fontSize = '20px'; const s = getComputedStyle(document.querySelector('.tds-bubble')); const out = { size: s.fontSize, lh: s.lineHeight }; document.documentElement.style.fontSize = ''; return out")
    check(scaled.size === "17.5px" && Math.abs(parseFloat(scaled.lh) - 25) < 0.05, `bubble text follows the reader's font size (${scaled.size}/${scaled.lh} at 20px root)`)
    check(style(".tds-bubble", "fontSize") === "14px" && style(".tds-bubble", "lineHeight") === "20px", "bubble stays 14/20 at the default size")
    check(style(".tds-row-time", "fontVariantNumeric") === "tabular-nums", "row times use tabular numbers")
    const pairs = js<{ sel: string; fg: string; bg: string; wcag: number; apca: number; size: string }[]>(`
      const parse = (c) => { const m = c.match(/[\\d.]+/g).map(Number); return [m[0], m[1], m[2], m.length > 3 ? m[3] : 1] }
      const over = (top, under) => [0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3])).concat(1)
      const bgOf = (el) => { const stack = []; for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c[3] > 0) { stack.push(c); if (c[3] >= 1) break } } let out = [8, 8, 8, 1]; for (const c of stack.reverse()) out = over(c, out); return out }
      const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
      const L = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2])
      const wcag = (a, b) => { const x = L(a), y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
      const Y = (c) => { const t = (v) => (v / 255) ** 2.4; const y = 0.2126729 * t(c[0]) + 0.7151522 * t(c[1]) + 0.072175 * t(c[2]); return y > 0.022 ? y : y + (0.022 - y) ** 1.414 }
      const apca = (fg, bg) => { const t = Y(fg), b = Y(bg); if (Math.abs(b - t) < 0.0005) return 0; if (b > t) { const s = (b ** 0.56 - t ** 0.57) * 1.14; return s < 0.1 ? 0 : (s - 0.027) * 100 } const s = (b ** 0.65 - t ** 0.62) * 1.14; return s > -0.1 ? 0 : (s + 0.027) * 100 }
      const sels = ['.tds-row-title', '.tds-row-preview', '.tds-row-time', '.tds-bubble[data-side=agent]', '.tds-bubble[data-side=me]', '.tds-act', '.tds-input', '.tds-search input', '.tds-header-pill']
      return sels.flatMap((sel) => { const el = document.querySelector(sel); if (!el) return []; const s = getComputedStyle(el); const fg0 = parse(s.color); const bg = bgOf(el); const fg = over(fg0, bg); return [{ sel, fg: s.color, bg: 'rgb(' + bg.slice(0, 3).map(Math.round).join(', ') + ')', wcag: Math.round(wcag(fg, bg) * 100) / 100, apca: Math.round(apca(fg, bg) * 10) / 10, size: s.fontSize }] })`)
    writeFileSync(join(OUT, "type-contrast.json"), JSON.stringify(pairs, null, 2))
    console.log(pairs.map((p) => `    ${p.sel}: ${p.wcag}:1, Lc ${p.apca} (${p.fg} on ${p.bg}, ${p.size})`).join("\n"))
    for (const p of pairs.filter((p) => p.sel.startsWith(".tds-bubble") || p.sel === ".tds-row-title")) check(p.wcag >= 4.5 && Math.abs(p.apca) >= 75, `${p.sel} body text passes 4.5:1 and Lc 75 (${p.wcag}, ${p.apca})`)
    shot("type")
  },
  typography() {
    ensureRows(1)
    const row = ".tds-row-wrap:not([data-archived]) .tds-row"
    check(rect(row)?.h === 58, `rows are 58 tall, got ${rect(row)?.h}`)
    check(style(`${row} .tds-row-title`, "fontSize") === "14.5px", "row titles are 14.5")
    check(style(`${row} .tds-row-preview`, "fontSize") === "13px", "row previews are 13")
    check(js<boolean>(`const t = document.querySelector('${row} .tds-row-title'); return t.scrollHeight <= t.clientHeight`), "row titles do not crop descenders")
    check(style(".tds-row-time", "fontSize") === "12.5px", "row times are 12.5 (TG-17)")
    check(style(".tds-search input", "fontSize") === "14px", "the search field is 14 (TG-15)")
    check(js<number>("return document.querySelectorAll('.tds-search-hint kbd').length") === 2, "the search hint is two keycaps, ⌘ and K (TG-15)")
    check(style(".tds-toast-row b", "fontSize") === "15px", "the toast row name is 15 (TG-16)")
    check(js<string>("return document.querySelector('.tds-toast-hint')?.textContent ?? ''") === "Hold for all chats", "the toast row hint reads Hold for all chats (TG-16)")
    if (exists(".tds-pin-circle")) check(style(".tds-pin-circle", "borderRadius") === "10px", "pins are rounded-square tiles (fb-1610)")
    if (exists(".tds-pin-label")) check(style(".tds-pin-label", "whiteSpace") === "nowrap", "pin labels are one line (TG-14)")
    shot("typography")
    ab("mouse", "move", "900", "450")
  },
  rename() {
    ensureRows(1)
    const before = js<string>("return document.querySelector('.tds-row-wrap .tds-row-title').textContent.trim()")
    openRow()
    choose("Rename…")
    until(() => js<boolean>("return document.activeElement?.classList.contains('tds-row-rename') ?? false"), Boolean, "the rename field to focus")
    ab("keyboard", "type", "Renamed by verify")
    ab("press", "Enter")
    until(() => js<string>("return document.querySelector('.tds-row-wrap .tds-row-title').textContent.trim()"), (t) => t === "Renamed by verify", "the new title")
    ab("open", BASE)
    until(() => js<string>("return document.querySelector('.tds-row-wrap .tds-row-title')?.textContent.trim() ?? ''"), (t) => t === "Renamed by verify", "the title after reload")
    openRow()
    choose("Rename…")
    until(() => js<boolean>("return document.activeElement?.classList.contains('tds-row-rename') ?? false"), Boolean, "the rename field to focus")
    ab("press", "Control+a")
    ab("keyboard", "type", before)
    ab("press", "Enter")
  },
  dialog() {
    ensureRows(1)
    const id = js<string>("return document.querySelector('.tds-row-wrap:not([data-archived])').dataset.id")
    const here = () => exists(`.tds-row-wrap[data-id="${id}"]`)
    openRow()
    choose("Delete")
    check(!exists(".tds-dialog"), "Delete asks for no dialog")
    until(here, (still) => !still, "the deleted row to leave")
    until(() => js<boolean>("return [...document.querySelectorAll('.tds-toast-title')].some((e) => e.textContent.includes('Deleted'))"), Boolean, "the Deleted toast")
    wait(300)
    shot("delete-undo")
    js<boolean>("const b = [...document.querySelectorAll('.tds-toast-action')].find((e) => e.textContent.trim() === 'Undo'); b?.click(); return !!b")
    until(here, Boolean, "Undo to restore the row")
  },

  shortcuts() {
    ensureRows(1)
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
  hotkeys() {
    ensureRows(1)
    fresh()
    ab("eval", "document.activeElement?.blur()")
    ab("press", "?")
    until(() => exists(".tds-keys"), Boolean, "? to open the shortcuts sheet")
    const rows = js<{ label: string; ids: string; status: string; keys: string }[]>("return [...document.querySelectorAll('.tds-keys-row')].map((r) => ({ label: r.firstElementChild.textContent, ids: r.dataset.hotkeys ?? '', status: r.dataset.status ?? '', keys: [...r.querySelectorAll('kbd')].map((k) => k.textContent).join(' ') }))")
    check(rows.length === 10, `the sheet lists the 10 GUIDE §5 shortcuts (got ${rows.length})`)
    check(rows.some((r) => r.label === "Peek at a chat" && r.keys === "Space"), "the sheet has the Space, Peek row")
    const dead = rows.filter((r) => !r.ids || r.status !== "active")
    check(dead.length === 0, `every sheet row has a live binding (dead: ${dead.map((r) => `${r.label} [${r.ids}] ${r.status}`).join(", ")})`)
    shot("hotkeys-sheet")
    ab("press", "Escape")
    until(() => exists(".tds-keys"), (open) => !open, "Escape to close the sheet")
    ab("press", "Control+k")
    until(() => exists(".tds-palette"), Boolean, "Ctrl+K from the registry opens the palette")
    check(js<string>("return document.querySelector('.tds-palette-item .tds-kbds')?.textContent ?? ''") === "AltN", "the palette shows New Chat with the registry's keys")
    ab("press", "Escape")
    until(() => exists(".tds-palette"), (open) => !open, "the palette to close")
    const before = js<string>("return location.pathname")
    ab("press", "Alt+n")
    until(() => js<string>("return location.pathname"), (p) => p !== before && /^\/t\/[0-9a-f-]{36}$/.test(p), "Alt+N from the registry to open a new chat")
  },
  notifications() {
    ensureRows(2)
    const unread = () => js<number>("return Number(document.querySelector('[data-bell] .tds-badge:not([data-zero])')?.textContent?.trim() || 0)")
    const before = unread()
    ab("click", "button[aria-label='New chat']")
    until(() => js<string>("return location.pathname"), (p) => /^\/t\/[0-9a-f-]{36}$/.test(p), "a fresh chat")
    field()
    ab("keyboard", "type", "Check the weather in Tokyo and summarise it")
    ab("press", "Enter")
    until(() => exists(".tds-bubble[data-side='me']"), Boolean, "my bubble")
    const fresh = js<string>("return location.pathname")
    const chat = fresh.slice(3)
    ab("eval", "[...document.querySelectorAll('.tds-row:not([aria-current])')][0]?.click()")
    until(() => js<string>("return location.pathname"), (p) => p !== fresh, "another chat to open")
    // Other journeys' chats can finish (adding notes) or be opened (marking theirs read) at the same time, so the
    // badge count alone can stand still; assert this chat's own note, and that the badge shows something.
    until(() => js<boolean>(`return document.querySelector('[data-bell] .tds-badge:not([data-zero])') !== null`), Boolean, "a bell badge once the run finishes elsewhere", 20000)
    ab("click", "[data-bell]")
    until(() => exists(".tds-centre[data-open]"), Boolean, "the notification centre to open")
    until(() => exists(`.tds-centre .tds-note-group[data-chat="${chat}"]`), Boolean, "this chat's own note in the centre", 20000)
    wait(400)
    shot("notifications")
    ab("click", ".tds-centre .tds-centre-read")
    until(unread, (now) => now === 0, "Mark All Read to clear the badge")
    ab("press", "Escape")
    until(() => exists(".tds-centre[data-open]"), (open) => !open, "Escape to close the centre")
  },
  sheet() {
    const bell = ".tds-rail-button[data-bell]"
    const x = () => js<number>("return document.querySelector('.tds-centre').getBoundingClientRect().x")
    const receding = () => js<string>("const m = document.querySelector('main[data-backdrop-layer]'); return m && document.documentElement.hasAttribute('data-backdrop-p') ? getComputedStyle(m).scale : ''")
    const drag = (from: number, to: number, y = 420) => {
      ab("mouse", "move", String(from), String(y))
      ab("mouse", "down")
      for (let k = 1; k <= 6; k++) ab("mouse", "move", String(Math.round(from + ((to - from) * k) / 6)), String(y))
      ab("mouse", "up")
    }
    ab("click", bell)
    until(() => exists(".tds-centre[data-open]"), Boolean, "the centre to open")
    wait(600)
    const rest = x()
    check(parseFloat(receding()) < 1 && js<number>("return +getComputedStyle(document.querySelector('.tds-backdrop-scrim')).opacity") > 0.5, `the chat recedes behind the open centre (scale ${receding()}, scrim up)`)
    shot("sheet-open")
    ab("mouse", "move", "300", "420")
    ab("mouse", "down")
    ab("mouse", "move", "260", "420")
    ab("mouse", "move", "200", "420")
    wait(100)
    const held = x()
    check(held < rest - 60, `the sheet follows the pointer while scrubbing (${rest} → ${held})`)
    shot("sheet-scrub")
    ab("mouse", "up")
    until(x, (now) => Math.abs(now - rest) < 1, "a short drag to spring back open")
    check(exists(".tds-centre[data-open]"), "a short drag keeps the centre open")
    drag(300, 40)
    until(() => exists(".tds-centre[data-open]"), (open) => !open, "a long drag to close the centre")
    until(receding, (r) => r === "", "the chat to come back when the centre closes")
    ab("click", bell)
    wait(80)
    ab("click", bell)
    wait(80)
    ab("click", bell)
    until(x, (now) => Math.abs(now - rest) < 1, "a third bell click mid-flight to land the centre open")
    ab("press", "Escape")
    until(() => js<string>("return getComputedStyle(document.querySelector('.tds-centre')).visibility"), (v) => v === "hidden", "Escape to slide the centre away")
  },
  palette() {
    ab("press", "Control+k")
    until(() => exists(".tds-palette"), Boolean, "the palette on Ctrl+K")
    check(js<boolean>("return document.activeElement?.getAttribute('aria-label') === 'Search or run a command'"), "the palette input should take focus")
    const chats = js<number>("return document.querySelectorAll('.tds-palette-list .tds-palette-item').length")
    check(chats >= 3, `palette should list actions and chats, got ${chats}`)
    wait(250)
    shot("palette")
    const rows = js<{ t: string; off: boolean }[]>("return [...document.querySelectorAll('.tds-palette-list .tds-palette-item')].slice(0, 4).map((e) => ({ t: e.querySelector('.tds-palette-title').textContent, off: e.hasAttribute('data-disabled') || e.getAttribute('aria-disabled') === 'true' }))")
    check(rows.map((r) => r.t).join("|") === "New Chat|Search Files…|Open Settings…|Keyboard Shortcuts", `SysPalette actions (got ${rows.map((r) => r.t).join(", ")})`)
    check(rows[1]!.off && rows[2]!.off && !rows[0]!.off, "Search Files and Open Settings stay disabled until those surfaces exist")
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
    field()
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
    ensureRows(1)
    const target = js<string>("return document.querySelector('.tds-row .tds-row-title, .tds-row b')?.textContent?.trim() ?? ''")
    ab("click", "button[aria-label='New chat']")
    until(() => js<string>("return location.pathname"), (p) => /^\/t\//.test(p), "a new chat")
    field()
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
    settled()
    steady(".tds-bubble[data-side='me'] .tds-chip[data-kind='thread']")
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
    field()
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
    ensureRows(1)
    const title = js<string>("return document.querySelector('.tds-row-wrap .tds-row')?.getAttribute('aria-label') ?? document.querySelector('.tds-row-wrap')?.textContent ?? ''")
    const before = js<number>("return document.querySelectorAll('.tds-row-wrap:not([data-archived])').length")
    openRow()
    choose("Archive")
    until(() => js<string>("return [...document.querySelectorAll('.tds-toast-title')].map((e) => e.textContent).join('|')"), (t) => t.includes("Archived"), "the Archived toast")
    wait(450)
    shot("toast-archived")
    const type = js<{ size: string; weight: string; line: string }>("const t = getComputedStyle(document.querySelector('.tds-toast[data-front] .tds-toast-title')); const l = document.querySelector('.tds-toast[data-front] .tds-toast-line'); return { size: t.fontSize, weight: t.fontWeight, line: l ? getComputedStyle(l).fontSize : '' }")
    check(type.size === "14px" && type.weight === "600" && type.line === "12.5px", `toast title 14/600 and line 12.5 (got ${JSON.stringify(type)})`)
    check(exists(".tds-toast-action"), "the toast offers Undo")
    js<boolean>("const b = [...document.querySelectorAll('.tds-toast-action')].find((e) => e.textContent.trim() === 'Undo'); b?.click(); return !!b")
    until(() => js<string>("return [...document.querySelectorAll('.tds-toast-title')].map((e) => e.textContent).join('|')"), (t) => t.includes("Restored"), "Undo to restore")
    until(() => js<number>("return document.querySelectorAll('.tds-row-wrap:not([data-archived])').length"), (n) => n === before, "the row back in the list")
    void title
  },
  toaststack() {
    const titles = () => js<string>("return [...document.querySelectorAll('.tds-toast:not([data-gone]) .tds-toast-title')].map((e) => { const c = e.cloneNode(true); c.querySelectorAll('[aria-hidden=true]').forEach((x) => x.remove()); return c.textContent.trim() }).join('|')")
    const live = () => js<number>("return document.querySelectorAll('.tds-toast:not([data-gone])').length")
    until(live, (n) => n === 0, "earlier toasts to clear", 12000)
    const rows = () => js<number>("return document.querySelectorAll('.tds-row-wrap:not([data-archived])').length")
    while (rows() < 2) journeys.send!()
    const before = rows()
    openRow()
    choose("Archive")
    until(titles, (t) => t === "Archived", "the first Archived toast")
    wait(600)
    openRow()
    choose("Archive")
    until(titles, (t) => t === "Archived 2 chats", "the archive toasts to merge with a rolling count")
    wait(600)
    check(live() === 1, "merged into one toast")
    openRow()
    choose("Copy Link")
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
    choose("Copy Link")
    until(live, (n) => n === 1, "the Link copied toast")
    const box = rect(".tds-toast[data-front]")!
    ab("mouse", "move", String(box.x + 40), String(box.y + box.h / 2))
    ab("mouse", "down")
    ab("mouse", "move", String(box.x + 140), String(box.y + box.h / 2))
    ab("mouse", "up")
    until(live, (n) => n === 0, "swipe right to dismiss")
  },
  fluid() {
    ab("hover", ".tds-row-wrap")
    until(() => js<boolean>("return !!document.querySelector('.tds-sidebar .tds-fluid[data-on]')"), Boolean, "the row highlight")
    const target = js<string>("const r = document.querySelectorAll('.tds-row-wrap')[3].getBoundingClientRect(); return Math.round(r.x + r.width / 2) + ' ' + Math.round(r.y + r.height / 2)")
    const goal = js<number>("return document.querySelectorAll('.tds-row-wrap')[3].getBoundingClientRect().top")
    const start = js<number>("return document.querySelector('.tds-sidebar .tds-fluid').getBoundingClientRect().top")
    ab("mouse", "move", ...target.split(" "))
    wait(60)
    const mid = js<number>("return document.querySelector('.tds-sidebar .tds-fluid').getBoundingClientRect().top")
    check(mid > start + 1 && mid < goal - 1, `the highlight glides between rows (${start} -> ${mid} -> ${goal})`)
    until(() => js<number>("return document.querySelector('.tds-sidebar .tds-fluid').getBoundingClientRect().top"), (y) => Math.abs(y - goal) < 1, "the highlight to land on the hovered row")
    check(js<number>("return document.querySelector('.tds-sidebar .tds-fluid').getBoundingClientRect().height") === js<number>("return document.querySelectorAll('.tds-row-wrap')[3].getBoundingClientRect().height"), "the highlight takes the row's size")
    shot("fluid-row")
    ab("click", ".tds-row-wrap .tds-row-more")
    until(() => exists(".tds-menu"), Boolean, "the row menu")
    ab("press", "ArrowDown")
    ab("press", "ArrowDown")
    until(() => js<number>("const g = document.querySelector('.tds-menu .tds-fluid'); const h = document.querySelector('.tds-menu [data-highlighted]'); return g && h ? Math.abs(g.getBoundingClientRect().top - h.getBoundingClientRect().top) : 99"), (d) => d < 1, "the menu highlight to follow the keyboard")
    shot("fluid-menu")
    ab("press", "Escape")
  },
  peekbridge() {
    const row = js<string>("const r = document.querySelectorAll('.tds-row-wrap')[1].getBoundingClientRect(); return Math.round(r.x + r.width * 0.6) + ' ' + Math.round(r.y + r.height / 2)")
    ab("mouse", "move", ...row.split(" "))
    until(() => exists(".tds-peek"), Boolean, "the peek card", 4000)
    wait(500)
    const title = js<string>("return document.querySelector('.tds-peek b')?.textContent ?? ''")
    const card = rect(".tds-peek")!
    const [x0, y0] = row.split(" ").map(Number) as [number, number]
    const x1 = card.x + 20
    const y1 = card.y + card.h - 20
    const seen: string[] = []
    for (let i = 1; i <= 12; i++) {
      ab("mouse", "move", String(Math.round(x0 + ((x1 - x0) * i) / 12)), String(Math.round(y0 + ((y1 - y0) * i) / 12)))
      wait(40)
      seen.push(js<string>("return document.querySelector('.tds-peek b')?.textContent ?? '-'") + "@" + Date.now() % 100000)
    }
    check(exists(".tds-peek"), `the peek holds while the pointer travels to it across other rows (${title}: ${seen.join(" / ")}; from ${x0},${y0} to ${x1},${y1})`)
    check(seen.every((t) => t.split("@")[0] === title), `the peek does not swap to a row the pointer crosses on the way (${title}: ${seen.join(" / ")})`)
    wait(400)
    check(exists(".tds-peek"), "the peek stays while hovered")
    shot("peek-bridge")
    ab("mouse", "move", "900", "450")
    until(() => exists(".tds-peek"), (open) => !open, "the peek to hide once the pointer leaves it")
  },
  trackpad() {
    const box = rect(".tds-row-wrap:not([data-archived]) .tds-row")!
    ab("mouse", "move", String(box.x + box.w / 2), String(box.y + box.h / 2))
    for (let i = 0; i < 6; i++) ab("mouse", "wheel", "0", "-14")
    wait(60)
    const open = js<string>("const r = document.querySelector('.tds-row-wrap:not([data-archived]) .tds-row'); return r.style.transform")
    check(/translateX\((\d|[1-9]\d)/.test(open), `two-finger swipe right moves the row (${open})`)
    shot("trackpad-swipe")
    wait(400)
    check(exists(".tds-row-wrap[data-swiping]"), "release past the snap point leaves Pin and Unread open")
    ab("mouse", "move", "900", "450")
    ab("mouse", "down")
    ab("mouse", "up")
    until(() => exists(".tds-row-wrap[data-swiping]"), (on) => !on, "an outside press closes the swipe")
    for (let i = 0; i < 4; i++) ab("mouse", "wheel", "40", "0")
    check(!exists(".tds-row-wrap[data-swiping]"), "vertical scrolling never swipes")
  },
  morph() {
    ab("click", "button[aria-label='New chat']")
    ab("click", ".tds-composer-plus")
    until(() => exists(".tds-menu"), Boolean, "the plus menu")
    wait(400)
    check(style(".tds-composer-plus svg", "rotate") === "45deg", "plus rotates 45deg into x")
    shot("morph-plus-x")
    ab("press", "Escape")
    until(() => style(".tds-composer-plus svg", "rotate"), (r) => r === "0deg" || r === "none", "x rotates back to plus")
    ab("click", ".tds-rail-button[data-bell]")
    const layers = js<string[]>("return [...document.querySelectorAll('.tds-rail-button[data-bell] .tds-glyph-layer')].map((e) => e.dataset.phase)")
    check(layers.includes("out") && layers.includes("in"), `the bell swaps with a blur-scale morph (${layers.join(",")})`)
    until(() => js<string>("return document.querySelector('.tds-rail-button[data-bell] .tds-glyph').dataset.glyph"), (g) => g === "bell:fill", "the filled bell")
    until(() => js<number>("return document.querySelectorAll('.tds-rail-button[data-bell] .tds-glyph-layer').length"), (n) => n === 1, "the old bell to leave")
    shot("morph-bell")
    ab("click", ".tds-rail-button[data-bell]")
    until(() => js<string>("return document.querySelector('.tds-rail-button[data-bell] .tds-glyph').dataset.glyph"), (g) => g === "bell", "the outline bell")
  },
  attach() {
    const work = join(homedir(), ".capy/work")
    ab("click", "button[aria-label='New chat']")
    until(() => exists(".tds-composer-wrap input[type=file]"), Boolean, "the composer")
    writeFileSync(join(work, "verify-notes.md"), "# Notes\n\nA small markdown file for the attach journey.\n")
    png(join(work, "verify-pixel.png"), 4, 4, [229, 143, 180])
    ab("upload", ".tds-composer-wrap input[type=file]", join(work, "verify-notes.md"), join(work, "verify-pixel.png"))
    until(() => js<string[]>("return [...document.querySelectorAll('.tds-attach')].map((e) => e.dataset.status)"), (s) => s.length === 2 && s.every((x) => x === "done"), "both uploads to finish", 15000)
    shot("attach-tray")
    field()
    ab("keyboard", "type", "Here are two files")
    ab("press", "Enter")
    until(() => exists(".tds-files[data-side='me'] .tds-media-tile img") && exists(".tds-files[data-side='me'] .tds-doc"), Boolean, "the sent image and file card")
    check(!exists(".tds-attach"), "the tray should clear after sending")
    until(() => js<boolean>("const img = document.querySelector('.tds-media-tile img'); return !!img && img.complete && img.naturalWidth > 0"), Boolean, "the sent image to load")
    check(!js<string>("return document.querySelector('.tds-bubble[data-side=me]:last-of-type')?.textContent ?? ''").includes("tock-file:"), "raw file links must not show in the bubble")
    check(!js<string>("return document.querySelector('.tds-header-pill')?.textContent ?? ''").includes(".png"), "the title should not list file names when there is text")
    until(() => rect(".tds-field")?.h, (h) => h === 44, "the composer to shrink back after sending")
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
    field()
    ab("keyboard", "type", "Three pictures")
    ab("press", "Enter")
    until(() => js<boolean>("const imgs = [...document.querySelectorAll('.tds-media[data-count=\"3\"] .tds-media-tile img')]; return imgs.length === 3 && imgs.every((i) => i.complete && i.naturalWidth > 0)"), Boolean, "a row of three loaded images")
    wait(400)
    const row = js<{ w: number; h: number; first: string; inner: string; last: string }>("const t = [...document.querySelectorAll('.tds-media[data-count=\"3\"] .tds-media-tile')]; const s = (e) => getComputedStyle(e); const r = t[0].getBoundingClientRect(); return { w: r.width, h: r.height, first: s(t[0]).borderTopLeftRadius + ' ' + s(t[0]).borderTopRightRadius, inner: s(t[1]).borderTopLeftRadius, last: s(t[2]).borderBottomRightRadius }")
    check(row.w === 130 && row.h === 130 && row.first === "18px 6px" && row.inner === "6px" && row.last === "18px", `image row of three: ${JSON.stringify(row)}`)
    shot("media-row-3")
    ab("click", ".tds-media[data-count='3'] .tds-media-tile:nth-child(2)")
    until(() => exists(".tds-lightbox[data-ready]"), Boolean, "the lightbox to open")
    wait(300)
    check(lightboxCount() === "2 of 3", `count should read 2 of 3, got "${lightboxCount()}"`)
    check(js<number>("return document.querySelectorAll('.tds-lightbox-film button').length") === 3, "three filmstrip thumbs")
    check(js<boolean>("return document.querySelectorAll('.tds-lightbox-film button')[1].hasAttribute('data-on')"), "the second thumb is current")
    check(style(".tds-media[data-count='3'] .tds-media-tile:nth-child(2)", "visibility") === "hidden", "the source thumbnail hides while it is grown")
    until(() => js<string>("return document.querySelector('.tds-lightbox-bar em')?.textContent ?? ''"), (t) => /B$/.test(t), "the size in the bar")
    shot("lightbox-open")
    ab("click", ".tds-lightbox-picture")
    until(() => morphed(".tds-lightbox-zoom .num"), (t) => t === "200%", "a click to zoom to 200%")
    check(exists(".tds-lightbox[data-zoomed]"), "the lightbox marks itself zoomed")
    const pic = rect(".tds-lightbox-stage")!
    ab("mouse", "move", String(pic.x + pic.w / 2), String(pic.y + pic.h / 2))
    ab("mouse", "down")
    ab("mouse", "move", String(pic.x + pic.w / 2 + 80), String(pic.y + pic.h / 2 + 40), "--steps", "6")
    ab("mouse", "up")
    check(/translate\(\d/.test(js<string>("return document.querySelector('.tds-lightbox-picture').style.transform")), "dragging pans the zoomed picture")
    check(exists(".tds-lightbox[data-zoomed]"), "the click after a drag keeps the zoom")
    wait(300)
    shot("lightbox-zoomed")
    ab("press", "0")
    until(() => exists(".tds-lightbox[data-zoomed]"), (z) => !z, "0 to return to fit")
    for (let i = 0; i < 9; i++) ab("press", "Tab")
    check(js<boolean>("return !!document.activeElement?.closest('.tds-lightbox')"), "Tab stays inside the lightbox")
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
    check(style(".tds-media[data-count='3'] .tds-media-tile:nth-child(2)", "visibility") === "visible", "the thumbnail shows again")
    check(js<boolean>("return document.activeElement === document.querySelector(\".tds-media[data-count='3'] .tds-media-tile:nth-child(2)\")"), "focus returns to the thumbnail it grew from")
    check(exists(".tds-media-tile"), "the transcript is still there")
  },
  finished() {
    ab("click", "button[aria-label='New chat']")
    until(() => exists(".ProseMirror"), Boolean, "the composer")
    field()
    ab("keyboard", "type", "Search the web for the history of toast and write a long summary")
    ab("press", "Enter")
    const chat = until(() => js<string>("return location.pathname.startsWith('/t/') ? location.pathname.slice(3) : ''"), Boolean, "the chat to get an id")
    until(() => exists(`.tds-row[href="/t/${chat}"][data-status="working"]`), Boolean, "chat A to start working", 10000)
    ab("click", "button[aria-label='New chat']")
    until(() => js<string>("return location.pathname") !== `/t/${chat}`, Boolean, "leaving chat A")
    check(js<string>("return location.pathname") !== `/t/${chat}`, "chat B is open")
    ab("mouse", "move", "700", "500")
    until(() => exists(`.tds-row[href="/t/${chat}"]:not([data-status="working"])`), Boolean, "chat A to finish", 60000)
    js<boolean>(`window.__flew = false; new MutationObserver((_, o) => { if (document.querySelector('.tds-flight-dot[data-chat="${chat}"]')) { window.__flew = true; o.disconnect() } }).observe(document.body, { childList: true }); return true`)
    const title = until(() => js<string>(`return [...document.querySelectorAll('.tds-toast .tds-toast-title')].map((t) => t.textContent).join('|')`), (t) => t.includes("history of toast"), "chat A's finished toast")
    shot("finished-toast")
    until(() => exists(`.tds-row[href="/t/${chat}"][data-unread]`), Boolean, "chat A's row to turn unread")
    wait(800)
    check(!js<boolean>("return window.__flew"), "no dot flies home (fb-1600: not our style)")
    check(!exists(`.tds-row[href="/t/${chat}"] .tds-unread`), "unread is the bold title alone, no dot")
    check(style(`.tds-row[href="/t/${chat}"] .tds-row-title`, "fontWeight") === "600", "an unread chat's title is bold")
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
    check(js<string>("return document.querySelector('.tds-sidebar .tds-empty b')?.textContent") === "No chats match", "no-results title")
    shot("empty-search")
    ab("press", "Escape")
  },
  header() {
    seeded()
    check(rect(".tds-header-pill")?.h === 31, `header pill should be 31 tall, got ${rect(".tds-header-pill")?.h}`)
    check(style(".tds-header-pill", "fontSize") === "14px", "header title is 14px")
    check(rect(".tds-header .size-header-avatar")?.w === 50, "header avatar is 50")
    const actions = js<string[]>("return [...document.querySelectorAll('.tds-header-actions > button')].map((b) => b.getAttribute('aria-label') + ':' + (b.querySelector('use')?.getAttribute('href') ?? ''))")
    check(actions.length === 2 && actions[0] === "Share:#i-export" && actions[1]!.startsWith("Search in chat:"), `LockedDark header: Share (export) then Search (got ${actions.join(", ")})`)
    ab("click", "button[aria-label='Share']")
    until(() => js<boolean>("return document.body.innerText.includes('Link copied')"), Boolean, "the link copied toast")
    ab("click", "button[aria-label='Search in chat']")
    until(() => exists(".tds-find input"), Boolean, "the find bar")
    const word = js<string>("return (document.querySelector('.tds-bubble[data-side=agent]')?.textContent ?? '').trim().split(/\\s+/).find((w) => /^[a-z]{5,}$/i.test(w)) ?? ''")
    check(word, "no word to search for")
    ab("keyboard", "type", word.slice(0, 5))
    until(() => morphed(".tds-find-count"), (t) => /^1 of \d+$/.test(t), "a match count")
    check(js<number>("return CSS.highlights.get('tds-find-on')?.size ?? 0") === 1, "the current match is highlighted")
    shot("header-find")
    ab("keyboard", "type", "zzqx")
    until(() => morphed(".tds-find-count"), (t) => t === "No matches", "no matches")
    ab("press", "Escape")
    until(() => exists(".tds-find"), (open) => !open, "the find bar to close")
    check(js<number>("return CSS.highlights.size") === 0, "highlights cleared on close")
  },
  headerglyph() {
    const id = fresh()
    check(!exists(".tds-header-avatar[data-glyph]"), "a new chat keeps the toast mascot")
    field()
    ab("keyboard", "type", "Check the weather in Tokyo and summarise it")
    ab("press", "Enter")
    until(() => exists(".tds-header-avatar[data-glyph]"), Boolean, "the chat's glyph in the header")
    const row = `.tds-row-wrap[data-id="${id}"] .tds-row-icon`
    until(() => exists(row), Boolean, "the chat's sidebar row")
    wait(500)
    const g = js<{ hue: string; rowHue: string; path: string; rowPath: string; mascot: string; glyph: string }>(`const h = document.querySelector('.tds-header-glyph'); const r = document.querySelector('${row}'); const hue = (e) => [...e.classList].find((c) => c.startsWith('text-hue-')) ?? ''; const d = (e) => e.querySelector('.tds-glyph')?.dataset.glyph ?? ''; return { hue: hue(h), rowHue: hue(r), path: d(h), rowPath: d(r), mascot: getComputedStyle(document.querySelector('.tds-header-mascot')).opacity, glyph: getComputedStyle(h).opacity }`)
    check(g.hue !== "" && g.hue === g.rowHue, `the header hue matches the row (${g.hue} vs ${g.rowHue})`)
    check(g.path !== "" && g.path === g.rowPath, "the header glyph is the row's glyph")
    check(g.mascot === "0" && g.glyph === "1", `the glyph replaces the mascot (mascot ${g.mascot}, glyph ${g.glyph})`)
    shot("header-glyph")
  },
  headerstatus() {
    fresh()
    field()
    ab("keyboard", "type", "Plan a long trip through Japan for two weeks with a detailed itinerary, a budget and a packing list")
    ab("press", "Enter")
    until(() => exists(".tds-header-status[data-on] .tds-orb"), Boolean, "the working status in the header", 8000)
    wait(450)
    const g = js<{ sliced: boolean; title: number; status: number; statusRight: number; pill: number; orb: number; orbOp: string; cut: boolean; label: string; fit: boolean }>("const t = document.querySelector('.tds-header-title'); const s = document.querySelector('.tds-header-status'); const o = s.querySelector('.tds-header-orb'); const p = document.querySelector('.tds-header-pill').getBoundingClientRect(); const pane = t.querySelector('[skullet-pane]') ?? t.querySelector('.tds-skeleton') ?? t; return { sliced: getComputedStyle(pane).textOverflow !== 'ellipsis' || [...pane.querySelectorAll('.tds-morph-text, [torph-item]')].some((e) => getComputedStyle(e).display !== 'inline'), title: t.getBoundingClientRect().right, status: o.getBoundingClientRect().left, statusRight: s.getBoundingClientRect().right, pill: p.right, orb: o.getBoundingClientRect().width, orbOp: getComputedStyle(o).opacity, cut: pane.scrollWidth > pane.clientWidth, label: s.textContent, fit: s.scrollWidth <= s.clientWidth + 1 }")
    check(g.status - g.title >= 9, `a real gap between the title and the status (${g.status - g.title}px)`)
    check(g.orb === 12 && g.orbOp === "1", `the 12 orb is fully in (width ${g.orb}, opacity ${g.orbOp})`)
    check(g.cut, "the long title truncates")
    check(!g.sliced, "the title ends in an ellipsis, never a word sliced at the edge")
    check(g.fit && g.statusRight <= g.pill, "the status is never clipped")
    check(/Working/.test(g.label), `the label reads Working (got ${g.label})`)
    shot("header-status")
    until(() => exists(".tds-header-status[data-on]"), (on) => !on, "the status to leave once done", 20000)
  },
  offline() {
    fresh()
    field()
    ab("keyboard", "type", "hi there")
    ab("press", "Enter")
    until(() => exists(".tds-bubble[data-side='me']"), Boolean, "a bubble to sit under the banner")
    until(() => js<string>("return document.querySelector('.tds-banner')?.dataset.state ?? ''"), (s) => s === "off", "the banner to start hidden")
    check(js<string>("return document.querySelector('.tds-banner')?.dataset.state ?? ''") === "off", "the banner starts hidden")
    ab("set", "offline", "on")
    ab("eval", "window.dispatchEvent(new Event('offline'))")
    try {
      until(() => js<string>("return document.querySelector('.tds-banner')?.dataset.state ?? ''"), (s) => s === "on", "the offline banner", 12000)
      wait(400)
      check(rect(".tds-banner")!.y >= rect(".tds-header-pill")!.y + rect(".tds-header-pill")!.h + 8, `the banner sits clear below the header pill (banner ${rect(".tds-banner")?.y}, pill bottom ${rect(".tds-header-pill")!.y + rect(".tds-header-pill")!.h})`)
      const fill = js<string>("return getComputedStyle(document.querySelector('.tds-banner')).backgroundColor")
      check(/^rgb\(/.test(fill), `the banner sits on a solid fill, got ${fill}`)
      const band = js<{ banner: number; bubbles: number[]; clear: number }>("const b = document.querySelector('.tds-banner').getBoundingClientRect(); const t = document.querySelector('.tds-transcript'); const p = document.createElement('div'); p.style.height = 'var(--banner-clear)'; t.append(p); const clear = t.getBoundingClientRect().top + p.getBoundingClientRect().height; p.remove(); return { banner: b.bottom, clear, bubbles: [...document.querySelectorAll('.tds-column .tds-bubble, .tds-column .tds-md, .tds-column p')].map((e) => e.getBoundingClientRect()).filter((r) => r.height > 0 && r.bottom > 0).map((r) => r.top) }")
      check(band.clear >= band.banner, `the transcript clears the band under the banner (clear to ${band.clear}, banner bottom ${band.banner})`)
      check(band.bubbles.every((top) => top >= band.banner), `no bubble sits under the banner (banner bottom ${band.banner}, tops ${band.bubbles.join(", ")})`)
      shot("offline-banner")
    } finally {
      ab("set", "offline", "off")
    }
    until(() => js<string>("return document.querySelector('.tds-banner')?.dataset.state ?? ''"), (s) => s === "ok", "back online", 15000)
    shot("offline-back")
  },
  needsrow() {
    ab("click", "button[aria-label='New chat']")
    const path = until(() => js<string>("return location.pathname"), (p) => /^\/t\/[0-9a-f-]{36}$/.test(p), "a UUID chat url")
    const id = path.slice(3)
    field()
    ab("keyboard", "type", "please approve the deploy")
    ab("press", "Enter")
    until(() => exists(".tds-ask .tds-key[data-option='Approve']"), Boolean, "the approval card", 15000)
    const row = `.tds-row-wrap[data-id="${id}"] .tds-row`
    until(() => js<string>(`return document.querySelector('${row}')?.dataset.status ?? ''`), (s) => s === "needs", "the row in needs state")
    check(exists(`${row} .tds-row-mark img[src*='needs']`), "the row carries the amber needs orb")
    check(js<string>(`return document.querySelector('${row} .tds-row-preview').textContent`).startsWith("needs you: "), "the preview reads needs you: <question>")
    until(() => js<string>("return document.querySelector('.tds-toast-status [torph-sr]')?.textContent ?? document.querySelector('.tds-toast-status')?.textContent ?? ''"), (t) => t.includes("needs you"), "the toast row counts the chat as needs you")
    check(js<string>("return document.querySelector('.tds-header-status')?.textContent ?? ''").includes("Needs you"), "the header label reads Needs you")
    ab("click", ".tds-rail-button[data-bell]")
    until(() => js<string>("return document.querySelector('.tds-centre')?.textContent ?? ''"), (t) => /Needs you/.test(t) && t.includes("Deploy"), "a Needs you note in the centre", 4000)
    shot("needs-row")
    ab("click", ".tds-rail-button[data-bell]")
    until(() => exists(".tds-centre[data-open]"), (open) => !open, "the centre to close")
    ab("click", ".tds-ask .tds-key[data-option='Approve']")
    until(() => js<string>(`return document.querySelector('${row}')?.dataset.status ?? ''`), (s) => s !== "needs", "the row to leave needs once answered", 8000)
  },
  ask() {
    ab("click", "button[aria-label='New chat']")
    until(() => js<string>("return location.pathname"), (p) => /^\/t\/[0-9a-f-]{36}$/.test(p), "a UUID thread url")
    field()
    ab("keyboard", "type", "please approve the deploy")
    ab("press", "Enter")
    until(() => exists(".tds-ask .tds-key[data-option='Approve']"), Boolean, "the approval card", 15000)
    until(() => js<string>("return document.querySelector('.tds-act')?.dataset.state ?? ''"), (s) => s === "needs", "the activity line in needs state")
    check(js<string>("return document.querySelector('.tds-act-text')?.textContent ?? ''").includes("Deploy the fix"), "the activity line should show the question")
    until(() => exists(".tds-header-status img[src*='needs']"), Boolean, "the header pill to show the needs orb")
    check(rect(".tds-ask")!.w <= 460, `the card should be at most 460px wide, got ${rect(".tds-ask")?.w}`)
    shot("ask-card")
    steady(".tds-act-button")
    ab("click", ".tds-act-button")
    until(() => exists(".tds-worklog .tds-wa .tds-wbtn"), Boolean, "the ask row buttons in the work log")
    check(exists(".tds-worklog .tds-ws[data-status='needs'] .tds-orb"), "the ask row should carry the needs orb")
    shot("ask-worklog")
    ab("press", "Escape")
    until(() => exists(".tds-worklog"), (open) => !open, "the work log to close")
    ab("click", ".tds-ask .tds-key[data-option='Approve']")
    until(() => exists(".tds-ask-done"), Boolean, "the answered summary")
    check(js<string>("return document.querySelector('.tds-ask-done')?.textContent ?? ''").includes("You approved"), "the summary should say You approved")
    check(!exists(".tds-ask"), "the card should collapse once answered")
    until(() => js<string>("return document.querySelector('.tds-act')?.dataset.state ?? ''"), (s) => s === "done", "the run to finish", 20000)
    until(() => exists(".tds-code"), Boolean, "the final reply", 15000)
    shot("ask-answered")
  },
  question() {
    ab("click", "button[aria-label='New chat']")
    until(() => js<string>("return location.pathname"), (p) => /^\/t\/[0-9a-f-]{36}$/.test(p), "a UUID thread url")
    field()
    ab("keyboard", "type", "help me choose a base branch")
    ab("press", "Enter")
    until(() => exists(".tds-ask[data-kind='question'] .tds-key"), Boolean, "the question card", 15000)
    check(js<number>("return document.querySelectorAll('.tds-ask .tds-key').length") === 3, "the question card should offer three options")
    shot("ask-question")
    steady(".tds-act-button")
    ab("click", ".tds-act-button")
    until(() => exists(".tds-worklog .tds-wbtn[data-primary]"), Boolean, "the work log option pills")
    wait(400)
    ab("click", ".tds-worklog .tds-wbtn:nth-child(2)")
    until(() => exists(".tds-ask-done"), Boolean, "the answered summary")
    check(js<string>("return document.querySelector('.tds-ask-done')?.textContent ?? ''").includes("You chose release/2.4"), "the summary should name the chosen option")
    ab("press", "Escape")
    until(() => js<string>("return document.querySelector('.tds-act')?.dataset.state ?? ''"), (s) => s === "done", "the run to finish", 20000)
    shot("ask-question-answered")
  },
  numbered() {
    fresh()
    field()
    ab("keyboard", "type", "help me choose a base branch")
    ab("press", "Enter")
    until(() => exists(".tds-ask[data-kind='question'] .tds-ask-opt"), Boolean, "the question card", 15000)
    check(js<string>("return [...document.querySelectorAll('.tds-ask-num')].map((n) => n.textContent).join(',')") === "1,2,3", "each option should show its number")
    check(rect(".tds-ask-opt")!.h === 40, `KcQuestions: options are 40 tall (got ${rect(".tds-ask-opt")?.h})`)
    js<boolean>("document.activeElement?.blur(); return true")
    ab("press", "2")
    until(() => js<string>("return document.querySelector('.tds-ask-opt[data-on]')?.dataset.option ?? ''"), (o) => o === "release/2.4", "2 to pick the second option")
    shot("question-picked")
    ab("press", "Enter")
    until(() => exists(".tds-ask-done .tds-undo"), Boolean, "the answered line with Undo")
    check(js<string>("return document.querySelector('.tds-ask-done')?.textContent ?? ''").includes("You chose release/2.4"), "Enter should answer the picked option")
    shot("question-undo")
    ab("click", ".tds-ask-done .tds-undo")
    until(() => exists(".tds-ask .tds-ask-opt"), Boolean, "Undo to bring the card back")
    check(js<string>("return document.querySelector('.tds-act')?.dataset.state ?? ''") === "needs", "the run should still be waiting after Undo")
    ab("click", ".tds-ask .tds-ask-opt[data-option='main']")
    until(() => exists(".tds-ask-done"), Boolean, "the answered line")
    until(() => exists(".tds-undo"), (on) => !on, "Undo to leave once the answer is sent", 8000)
    until(() => js<string>("return document.querySelector('.tds-act')?.dataset.state ?? ''"), (s) => s === "done", "the run to finish", 20000)
    check(js<string>("return document.querySelector('.tds-ask-done')?.textContent ?? ''").includes("You chose main"), "the run should resume with main")
  },
  multiquestion() {
    fresh()
    field()
    ab("keyboard", "type", "ask me two questions")
    ab("press", "Enter")
    until(() => exists(".tds-ask .tds-ask-step"), Boolean, "the stepped question card", 15000)
    check(text(".tds-ask-step").includes("1 of 2"), `the card should say 1 of 2 (got ${text(".tds-ask-step")})`)
    shot("multiquestion-1")
    ab("click", ".tds-ask .tds-ask-opt[data-option='release/2.4']")
    until(() => text(".tds-ask-step"), (s) => s.includes("2 of 2"), "the second question")
    check(text(".tds-ask-q").includes("pull request"), "the second question should show")
    shot("multiquestion-2")
    ab("click", ".tds-ask .tds-ask-opt[data-option='Yes, open it']")
    until(() => exists(".tds-ask-done"), Boolean, "the answered line")
    check(text(".tds-ask-done").includes("You chose release/2.4, Yes, open it"), `the line should list both answers (got ${text(".tds-ask-done")})`)
    until(() => js<string>("return document.querySelector('.tds-act')?.dataset.state ?? ''"), (s) => s === "done", "the run to finish", 20000)
  },
  retry() {
    fresh()
    field()
    ab("keyboard", "type", `fail once ${Date.now()}`)
    ab("press", "Enter")
    until(() => exists(".tds-alert .tds-alert-retry"), Boolean, "the error card with Retry", 15000)
    check(text(".tds-alert").includes("The model returned an error"), "the card names the error")
    check(!text(".tds-alert").includes("Send your message again"), "no send-again instruction once Retry exists")
    shot("error-retry")
    ab("click", ".tds-alert .tds-alert-retry")
    until(() => exists(".tds-alert-retry"), (on) => !on, "Retry to leave once the run restarts")
    until(() => text(".tds-transcript"), (s) => s.includes("Back on track"), "the retried run to answer", 15000)
    shot("error-retried")
  },
  composer() {
    ab("click", "button[aria-label='New chat']")
    until(() => exists(".ProseMirror"), Boolean, "the composer")
    const sizes = js<number[]>("return ['.tds-field', '.tds-send', '.tds-composer-plus'].map((s) => document.querySelector(s).offsetHeight)")
    check(sizes.every((h) => h === 44), `SPEC: plus, field and send are 44 (got ${sizes})`)
    check(style(".tds-input", "fontSize") === "14.5px" && style(".tds-input", "lineHeight") === "20px", "composer type is 14.5/20")
    check(style(".tds-field", "borderTopLeftRadius") === "22px", "the resting field is radius 22")
    field()
    check(style(".tds-input", "outlineStyle") === "none" && !js<boolean>("return getComputedStyle(document.activeElement).outlineStyle !== 'none'"), "no focus ring on click")
    ab("keyboard", "type", "line one")
    ab("press", "Shift+Enter")
    ab("keyboard", "type", "line two")
    until(() => rect(".tds-field")?.h, (h) => h === 64, "the field to grow to two lines")
    check(style(".tds-field", "borderTopLeftRadius") === "20px", "the tall field is radius 20")
    shot("composer-grown")
    js<boolean>("document.querySelector('.ProseMirror').editor?.commands?.clearContent?.(); return true")
    ab("press", "Control+a")
    ab("press", "Backspace")
    until(() => rect(".tds-field")?.h, (h) => h === 44, "the field to shrink back")
  },
  tokens() {
    ab("click", "button[aria-label='New chat']")
    until(() => exists(".ProseMirror"), Boolean, "the composer")
    field()
    ab("keyboard", "type", "see https://github.com/keyurbodar/tock and")
    until(() => exists(".tds-input .tds-link-token .tds-token-fav"), Boolean, "the typed link chip with its favicon")
    const m = js<{ line: number; text: number[]; label: number[]; chip: number[] }>(
      "const p = document.querySelector('.tds-input p'); const t = [...p.childNodes].find((n) => n.nodeType === 3); const a = document.createRange(); a.selectNodeContents(t); const tr = a.getClientRects()[0]; const b = document.createRange(); b.selectNodeContents(p.querySelector('.tds-chip-label')); const lr = b.getClientRects()[0]; const c = p.querySelector('.tds-chip').getBoundingClientRect(); return { line: p.getBoundingClientRect().height, text: [tr.top, tr.bottom], label: [lr.top, lr.bottom], chip: [c.top, c.height] }",
    )
    check(m.line === 20, `a chip must not grow the 20px line (got ${m.line})`)
    check(m.chip[1] === 22, "tokens are 22 tall")
    check(Math.abs(m.text[1]! - m.label[1]!) < 0.5, `chip text sits on the line's baseline (text ${m.text}, label ${m.label})`)
    ab("keyboard", "type", " ")
    ab("press", "Control+a")
    ab("press", "Backspace")
    ab("keyboard", "type", "ask @")
    until(() => exists(".tds-suggest .tds-menu-item"), Boolean, "the @ list")
    wait(300)
    const menu = rect(".tds-suggest")!
    const caret = rect(".tds-input p")!
    check(menu.y + menu.h <= caret.y && caret.y - (menu.y + menu.h) <= 8, "the @ list sits just above the caret")
    ab("press", "Enter")
    until(() => exists(".tds-input .tds-chip[data-kind='thread']"), Boolean, "the thread token")
    ab("press", "Backspace")
    ab("press", "Backspace")
    check(/229, 143, 180/.test(style(".tds-input .tds-chip.ProseMirror-selectednode", "boxShadow") ?? ""), "the first Backspace rings the token rose")
    shot("tokens-ring")
    ab("press", "Backspace")
    check(!exists(".tds-input .tds-chip[data-kind='thread']"), "the second Backspace deletes it")
    js<boolean>("const dt = new DataTransfer(); dt.setData('text/plain', 'https://linear.app/tock/issue/T-12'); document.querySelector('.ProseMirror').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); return true")
    until(() => js<string>("return document.querySelector('.tds-input .tds-link-token:last-of-type .tds-chip-label')?.textContent ?? ''"), (t) => t === "linear.app/tock/issue/T-12", "a pasted URL to become a link chip")
    shot("tokens-links")
    ab("press", "Control+a")
    ab("press", "Backspace")
  },
  longpaste() {
    ab("click", "button[aria-label='New chat']")
    until(() => exists(".ProseMirror"), Boolean, "the composer")
    field()
    js<boolean>("const dt = new DataTransfer(); dt.setData('text/plain', Array.from({ length: 20 }, (_, i) => 'line ' + (i + 1)).join('\\n')); document.querySelector('.ProseMirror').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); return true")
    until(() => js<string>("return [...document.querySelectorAll('.tds-toast-title')].map((e) => e.textContent).join('|')"), (t) => t.includes("Long text became a file"), "the long paste toast")
    until(() => js<string>("const card = document.querySelector('.tds-attach'); const m = card?.querySelector('.tds-attach-line')?.cloneNode(true); m?.querySelectorAll('[aria-hidden=true]').forEach((e) => e.remove()); return (card?.querySelector('.tds-attach-name')?.textContent ?? '') + (m?.textContent ?? '')"), (t) => t.startsWith("Pasted text.txt") && t.endsWith("20 lines"), "the Pasted text card with its line count", 10000)
    check(js<string>("return document.querySelector('.tds-input').textContent") === "", "the long text stays out of the field")
    wait(300)
    shot("longpaste-card")
    ab("click", ".tds-attach-remove")
  },
  plus() {
    ab("click", "button[aria-label='New chat']")
    ab("click", ".tds-composer-plus")
    until(() => exists(".tds-menu"), Boolean, "the plus menu")
    const items = js<string[]>("return [...document.querySelectorAll('.tds-menu .tds-menu-item')].map((e) => e.textContent.trim())")
    check(items[0]?.startsWith("Photos and Files") && items[1] === "Take a Screenshot" && items[2] === "Paste from Clipboard" && items[3] === "From an App", `plus menu items: ${items.join(", ")}`)
    wait(400)
    check(style(".tds-plus-glyph", "rotate") === "45deg", "the plus turns 45° while open")
    ab("hover", ".tds-plus-menu .tds-menu-item:nth-last-child(1)")
    until(() => js<string[]>("return [...document.querySelectorAll('.tds-menu .tds-menu-item')].map((e) => e.textContent.trim())"), (t) => t.some((x) => x.startsWith("GitHub")), "the From an App submenu")
    check(js<boolean>("return [...document.querySelectorAll('.tds-menu .tds-menu-item')].filter((e) => /Drive|GitHub|Notion/.test(e.textContent)).every((e) => e.hasAttribute('data-disabled') || e.getAttribute('aria-disabled') === 'true')"), "app sources are disabled until they have a backend")
    wait(250)
    shot("plus-menu")
    ab("press", "Escape")
    ab("press", "Escape")
    until(() => exists(".tds-menu"), (open) => !open, "the plus menu to close")
    check(style(".tds-plus-glyph", "rotate") !== "45deg" || (wait(400), style(".tds-plus-glyph", "rotate") === "none" || style(".tds-plus-glyph", "rotate") === "0deg"), "the plus turns back")
    js<boolean>("const c = document.createElement('canvas'); c.width = 320; c.height = 200; const x = c.getContext('2d'); x.fillStyle = 'tomato'; x.fillRect(0, 0, 320, 200); const s = c.captureStream(5); setInterval(() => x.fillRect(0, 0, 1, 1), 100); navigator.mediaDevices.getDisplayMedia = async () => s; return true")
    ab("click", ".tds-composer-plus")
    until(() => exists(".tds-menu"), Boolean, "the plus menu again")
    choose("Take a Screenshot")
    until(() => js<string>("return document.querySelector('.tds-attach .tds-attach-open')?.getAttribute('aria-label') ?? ''"), (t) => /Screenshot \d\d\.\d\d\.png/.test(t), "the screenshot to land in the tray", 10000)
    until(() => js<string>("return document.querySelector('.tds-attach')?.dataset.status ?? ''"), (s) => s === "done", "the screenshot upload")
    shot("plus-screenshot")
    ab("click", ".tds-attach-remove")
  },
  lifecycle() {
    const work = join(homedir(), ".capy/work")
    ab("click", "button[aria-label='New chat']")
    until(() => exists(".tds-composer-wrap input[type=file]"), Boolean, "the composer")
    js<boolean>("window.__send ??= XMLHttpRequest.prototype.send; XMLHttpRequest.prototype.send = function (b) { setTimeout(() => window.__send.call(this, b), 2500) }; return true")
    ab("upload", ".tds-composer-wrap input[type=file]", join(work, "verify-notes.md"), join(work, "verify-pixel.png"))
    until(() => js<string[]>("return [...document.querySelectorAll('.tds-attach')].map((e) => e.dataset.status)"), (s) => s.length === 2 && s.every((x) => x === "uploading"), "both cards uploading")
    check(exists(".tds-attach[data-kind='doc'] .tds-attach-ring") && exists(".tds-attach[data-kind='image'] .tds-attach-ring"), "uploading cards show the ring")
    shot("lifecycle-uploading")
    field()
    ab("keyboard", "type", "two files, held")
    ab("press", "Enter")
    until(() => exists(".tds-held") && exists(".tds-send[data-held]"), Boolean, "the held send")
    shot("lifecycle-held")
    until(() => exists(".tds-attach[data-status='reading'] [data-shimmer]"), Boolean, "the reading shimmer", 8000)
    shot("lifecycle-reading")
    until(() => exists(".tds-bubble[data-side='me']"), Boolean, "the held send to go on its own once files are ready", 10000)
    check(!exists(".tds-attach"), "the tray clears after the held send")
    ab("upload", ".tds-composer-wrap input[type=file]", join(work, "verify-notes.md"))
    until(() => js<string>("return document.querySelector('.tds-attach')?.dataset.status ?? ''"), (s) => s === "done", "the upload", 10000)
    check(/lines?$/.test(js<string>("const m = document.querySelector('.tds-attach .tds-attach-line').cloneNode(true); m.querySelectorAll('[aria-hidden=true]').forEach((e) => e.remove()); return m.textContent.trim()")), "ready cards show the meta")
    shot("lifecycle-ready")
    ab("click", ".tds-attach-remove")
    js<boolean>("XMLHttpRequest.prototype.send = function () { setTimeout(() => this.onerror?.(new ProgressEvent('error')), 600) }; return true")
    ab("upload", ".tds-composer-wrap input[type=file]", join(work, "verify-notes.md"))
    until(() => js<string>("return document.querySelector('.tds-attach')?.dataset.status ?? ''"), (s) => s === "failed", "the failed upload")
    check(js<number>("return document.querySelector('.tds-attach').getAnimations().length") > 0 || style(".tds-attach", "animationName") === "tds-attach-shake", "a failure shakes the card")
    check(exists(".tds-attach-retry, .tds-attach-retry-pill"), "a failure offers Retry")
    shot("lifecycle-failed")
    js<boolean>("XMLHttpRequest.prototype.send = window.__send; return true")
    ab("click", ".tds-attach-retry-pill")
    until(() => js<string>("return document.querySelector('.tds-attach')?.dataset.status ?? ''"), (s) => s === "done", "Retry to finish the upload", 10000)
    ab("click", ".tds-attach-remove")
    until(() => exists(".tds-attach"), (x) => !x, "the tray to empty")
    ab("upload", ".tds-composer-wrap input[type=file]", join(work, "verify-app.exe"))
    check(js<number>("return document.querySelector('.tds-composer-row').getAnimations().length") > 0, "an unreadable file shakes the composer")
    until(() => js<string>("return [...document.querySelectorAll('.tds-toast-title')].map((e) => e.textContent).join('|')"), (t) => t.includes("can’t read .exe"), "the unsupported toast")
    check(!exists(".tds-attach"), "unsupported files never reach the tray")
    ab("upload", ".tds-composer-wrap input[type=file]", join(work, "verify-big.zip"))
    until(() => js<string>("return [...document.querySelectorAll('.tds-toast-title')].map((e) => e.textContent).join('|')"), (t) => t.includes("verify-big.zip is"), "the too large toast")
    check(!exists(".tds-attach"), "too large files never reach the tray")
    wait(300)
    shot("lifecycle-rejected")
  },
  tray() {
    const work = join(homedir(), ".capy/work")
    ab("click", "button[aria-label='New chat']")
    until(() => exists(".tds-composer-wrap input[type=file]"), Boolean, "the composer")
    ab("upload", ".tds-composer-wrap input[type=file]", join(work, "verify-notes.md"), join(work, "verify-pixel.png"), join(work, "verify-data.json"))
    until(() => js<string[]>("return [...document.querySelectorAll('.tds-attach')].map((e) => e.dataset.status)"), (s) => s.length === 3 && s.every((x) => x === "done"), "three uploads", 15000)
    const names = () => js<string[]>("return [...document.querySelectorAll('.tds-attach')].map((e) => e.dataset.key)")
    const before = names()
    ab("hover", ".tds-attach:nth-child(1)")
    wait(200)
    check(!exists(".tds-attach-preview"), "the preview waits for hover intent")
    until(() => exists(".tds-attach-preview"), Boolean, "the preview card after 450ms", 2000)
    wait(200)
    shot("tray-preview")
    const a = rect(".tds-attach:nth-child(1)")!
    const b = rect(".tds-attach:nth-child(2)")!
    ab("mouse", "move", String(a.x + 30), String(a.y + 30))
    ab("mouse", "down")
    ab("mouse", "move", String(b.x + b.w - 10), String(a.y + 30), "--steps", "10")
    check(exists(".tds-attach[data-dragging]") && !exists(".tds-attach-preview"), "dragging lifts the card and hides the preview")
    shot("tray-dragging")
    ab("mouse", "up")
    const after = names()
    check(after[0] === before[1] && after[1] === before[0], `drag reorders the tray (${before} → ${after})`)
    ab("mouse", "move", "5", "5")
    wait(300)
    const w = rect(".tds-attach:nth-child(1)")!.w
    ab("hover", ".tds-attach:nth-child(1)")
    ab("click", ".tds-attach:nth-child(1) .tds-attach-remove")
    wait(100)
    const mid = rect(".tds-attach:nth-child(1)")!.w
    check(mid < w && mid > 0, `remove collapses the width (${w} → ${mid})`)
    until(() => names().length, (n) => n === 2, "the card to leave")
    ab("press", "Escape")
    js<boolean>("document.querySelectorAll('.tds-attach-remove').forEach((b) => b.click()); return true")
  },
  dropzone() {
    ab("click", "button[aria-label='New chat']")
    until(() => exists(".tds-composer-wrap"), Boolean, "the composer")
    const fire = (type: string, mime: string) => js<boolean>(`const dt = new DataTransfer(); dt.items.add(new File(['x'], 'f', { type: '${mime}' })); document.querySelector('.tds-composer-wrap').closest('main, section').dispatchEvent(new DragEvent('${type}', { dataTransfer: dt, bubbles: true, cancelable: true })); return true`)
    fire("dragenter", "image/png")
    until(() => exists(".tds-drop"), Boolean, "the drop zone")
    const r = rect(".tds-drop")!
    const s = rect(".tds-drop")!
    check(style(".tds-drop", "borderTopLeftRadius") === "24px" && /229, 143, 180/.test(style(".tds-drop", "boxShadow") ?? ""), "glass r24 rose ring")
    void r, s
    wait(350)
    shot("drop-zone")
    fire("dragleave", "image/png")
    until(() => exists(".tds-drop"), (x) => !x, "the drop zone to leave")
    fire("dragenter", "application/x-msdownload")
    until(() => exists(".tds-drop[data-bad]"), Boolean, "the unreadable drop zone")
    check(/232, 144, 138/.test(style(".tds-drop", "boxShadow") ?? ""), "unreadable files ring red")
    wait(350)
    shot("drop-zone-bad")
    fire("drop", "application/x-msdownload")
    until(() => exists(".tds-drop"), (x) => !x, "the drop zone to close on drop")
    check(!exists(".tds-attach"), "unreadable drops never reach the tray")
  },
  queued() {
    ab("click", "button[aria-label='New chat']")
    until(() => exists(".ProseMirror"), Boolean, "the composer")
    field()
    ab("keyboard", "type", "Plan a long trip through Japan for two weeks")
    ab("press", "Enter")
    until(() => exists(".tds-send[data-stop]"), Boolean, "Stop while toast works and the field is empty", 4000)
    wait(300)
    const tint = [style(".tds-send", "backgroundColor"), style(".tds-send", "color")].join(" ")
    check(/232,? 144,? 138/.test(tint), "Stop is tinted red: " + tint)
    shot("queued-stop")
    js<boolean>("window.__queued = null; new MutationObserver((_, o) => { const b = document.querySelector('.tds-bubble[data-queued]'); const c = [...document.querySelectorAll('.tds-caption')].find((e) => e.textContent.includes('Waiting for toast')); if (b && c && !window.__queued) { window.__queued = { opacity: getComputedStyle(b).opacity, caption: c.textContent }; o.disconnect() } }).observe(document.body, { subtree: true, childList: true, attributes: true }); return true")
    ab("keyboard", "type", "second while working")
    ab("press", "Enter")
    wait(120)
    shot("queued-caption")
    const seen = until(() => js<{ opacity: string; caption: string } | null>("return window.__queued"), Boolean, "the queued bubble and its caption", 4000)!
    check(Number(seen.opacity) < 1, "queued sends are dimmed")
  },
  queuestop() {
    const id = fresh()
    say("Plan a long trip through Japan for two weeks")
    until(() => exists(".tds-send[data-stop]"), Boolean, "the run to start", 4000)
    ab("keyboard", "type", "second message queued")
    ab("press", "Enter")
    until(() => exists(".tds-bubble[data-queued]"), Boolean, "the queued bubble")
    ab("click", "button[aria-label='Stop']")
    const mine = () => js<number>("return [...document.querySelectorAll('.tds-bubble[data-side=me]')].filter((b) => b.textContent.includes('second message queued')).length")
    until(() => exists(".tds-bubble[data-queued]"), (queued) => !queued, "the queued send to run after Stop", 20000)
    settled()
    check(mine() === 1, "the queued send shows once after Stop, got " + mine())
    shot("queuestop-after")
    ab("open", `${BASE}/t/${id}`)
    until(() => exists(".tds-bubble[data-side='agent']"), Boolean, "the chat after a reload", 15000)
    until(mine, (n) => n === 1, "the queued send to survive Stop and a reload")
    check(!exists(".tds-bubble[data-queued]"), "no ghost queued bubble after the reload")
    shot("queuestop-reload")
  },
  askqueued() {
    const id = fresh()
    say("help me choose a base branch")
    until(() => exists(".tds-ask[data-kind='question'] .tds-key"), Boolean, "the question card", 15000)
    field()
    ab("keyboard", "type", "ok go")
    ab("press", "Enter")
    until(() => exists(".tds-bubble[data-queued]"), Boolean, "the send to queue behind the ask")
    ab("open", `${BASE}/t/${id}`)
    until(() => exists(".tds-ask[data-kind='question'] .tds-key"), Boolean, "the question card after a reload", 15000)
    until(() => exists(".tds-bubble[data-queued]"), Boolean, "the queued send to survive a reload")
    shot("askqueued-reloaded")
    ab("click", ".tds-ask .tds-key[data-option='main']")
    until(() => exists(".tds-ask-done"), Boolean, "the answered summary")
    const mine = () => js<number>("return [...document.querySelectorAll('.tds-bubble[data-side=me]')].filter((b) => b.textContent.trim() === 'ok go' && !b.hasAttribute('data-queued')).length")
    until(mine, (n) => n === 1, "the queued send to run after the answer", 20000)
    settled()
    ab("open", `${BASE}/t/${id}`)
    for (const end = Date.now() + 2500; Date.now() < end; wait(40)) check(!exists(".tds-ask .tds-key"), "an answered ask never flashes its keys after a reload")
    if (!devServer()) console.log("      askqueued: stale-cache flash check skipped, it delays socket frames through the dev-only tock.slow switch")
    else {
      ab("eval", `(async () => {
        const db = await new Promise((r) => { const q = indexedDB.open("tock"); q.onsuccess = () => r(q.result) })
        const tx = (mode) => db.transaction("threads", mode).objectStore("threads")
        const entries = await new Promise((r) => { const q = tx("readonly").get(${JSON.stringify(id)}); q.onsuccess = () => r(q.result ?? []) })
        const stale = entries.map((entry) => ({ ...entry, model: (entry.model ?? []).filter((m) => !(m.role === "toolResult" && m.toolName === "ask_owner")) }))
        await new Promise((r) => { const q = tx("readwrite").put(stale, ${JSON.stringify(id)}); q.onsuccess = r })
        sessionStorage.setItem("tock.slow", "1500")
        return "ok"
      })()`)
      ab("open", `${BASE}/t/${id}`)
      try {
        for (const end = Date.now() + 1200; Date.now() < end; wait(40)) check(!exists(".tds-ask .tds-key") && !exists(".tds-wa .tds-wbtn"), "a cached transcript with the ask still open never shows its keys before the server answers")
      } finally {
        ab("eval", "sessionStorage.removeItem('tock.slow')")
      }
    }
    until(() => exists(".tds-ask-done"), Boolean, "the answer to persist across a reload", 15000)
    until(() => js<string>("return [...document.querySelectorAll('.tds-ask-done')].filter((e) => !e.closest('[data-ghost]')).map((e) => e.textContent).join(' | ')"), (s) => s.includes("You chose main"), "the summary to say You chose main after a reload")
    until(() => exists(".tds-ask .tds-key"), (card) => !card, "the ask card to stay answered after a reload")
    until(mine, (n) => n === 1, "the queued send once after a reload")
    check(js<string>("return document.querySelector('.tds-header')?.textContent ?? ''").toLowerCase().includes("needs you") === false, "the header no longer says needs you")
    shot("askqueued-done")
  },
  enterstop() {
    fresh()
    say("Plan a long trip through Japan for two weeks")
    until(() => exists(".tds-send[data-stop]"), Boolean, "Stop while working with an empty field", 4000)
    wait(300)
    ab("press", "Enter")
    wait(50)
    ab("press", "Enter")
    wait(600)
    const captions = () => js<string[]>("return [...document.querySelectorAll('.tds-caption')].map((e) => e.textContent)")
    check(!captions().includes("Stopped"), "Enter on an empty composer never stops the run: " + captions())
    ab("click", "[data-bell]")
    until(() => exists(".tds-centre[data-open]"), Boolean, "the notification centre to open")
    ab("press", "Escape")
    until(() => exists(".tds-centre[data-open]"), (open) => !open, "Escape to close the centre")
    wait(600)
    check(!captions().includes("Stopped"), "Escape that closes the centre never stops the run")
    check(exists(".tds-send[data-stop]"), "the run is still working")
    ab("press", "Escape")
    until(captions, (c) => c.includes("Stopped"), "Escape with nothing open to stop the run", 8000)
    shot("enterstop")
  },
  baseline() {
    ab("click", "button[aria-label='New chat']")
    until(() => exists(".ProseMirror"), Boolean, "the composer")
    field()
    ab("keyboard", "type", "ask @")
    until(() => exists(".tds-suggest .tds-menu-item"), Boolean, "the @ list")
    wait(250)
    const glass = style(".tds-suggest", "backdropFilter") ?? ""
    check(/blur/.test(glass), "the caret menu is glass: " + glass)
    const g = js<{ glide: number; row: number }>("const g = document.querySelector('.tds-suggest-glide').getBoundingClientRect(); const r = document.querySelector('.tds-suggest [data-highlighted]').getBoundingClientRect(); return { glide: g.top, row: r.top }")
    check(Math.abs(g.glide - g.row) < 1, "the highlight glides under the active row")
    shot("baseline-menu")
    ab("press", "Enter")
    ab("keyboard", "type", "to check the notes")
    js<boolean>("window.__sent = null; return true")
    ab("press", "Enter")
    const first = until(() => js<boolean>("const b = [...document.querySelectorAll('.tds-bubble[data-side=me]')].at(-1); if (b && b.textContent.includes('to check the notes') && !window.__sent) { window.__sent = b; b.dataset.probe = '1' } return !!window.__sent"), Boolean, "the bubble to appear at once", 600)
    void first
    check(js<string>("return document.querySelector('.tds-input').textContent") === "", "the composer clears on send")
    until(() => exists(".tds-bubble[data-side='agent']"), Boolean, "the reply", 15000)
    check(js<boolean>("return window.__sent.isConnected && window.__sent.dataset.probe === '1'"), "the sent bubble keeps its node when the server confirms it (no remount flash)")
    const m = js<{ line: number; text: number; label: number; chip: number }>(
      "const c = window.__sent.querySelector('.tds-chip'); const p = c.parentElement; const a = document.createRange(); a.selectNodeContents(c.querySelector('.tds-chip-label')); const l = a.getClientRects()[0]; const t = [...p.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim()); const b = document.createRange(); b.selectNodeContents(t); const x = b.getClientRects()[0]; return { line: parseFloat(getComputedStyle(p).lineHeight), text: x.bottom, label: l.bottom, chip: c.getBoundingClientRect().height }",
    )
    check(Math.abs(m.text - m.label) < 0.5, "bubble chips sit on the text baseline: " + JSON.stringify(m))
    const inner = js<number>("const s = getComputedStyle(window.__sent); return window.__sent.getBoundingClientRect().height - parseFloat(s.paddingTop) - parseFloat(s.paddingBottom)")
    check(Math.abs(inner / m.line - Math.round(inner / m.line)) < 0.05, "a bubble chip does not grow its line: " + inner + " for line " + m.line)
    shot("baseline-bubble")
  },
  scroll() {
    ab("click", "button[aria-label='New chat']")
    until(() => js<string>("return location.pathname"), (p) => /^\/t\/[0-9a-f-]{36}$/.test(p), "a UUID thread url")
    field()
    ab("keyboard", "type", "Check the weather in Tokyo and summarise it")
    ab("press", "Enter")
    until(() => exists(".tds-code"), Boolean, "the agent reply", 15000)
    const gap = () => js<number>("const s = document.querySelector('.tds-transcript'); return Math.round(s.scrollHeight - s.scrollTop - s.clientHeight)")
    ab("eval", "{ const d = document.createElement('div'); d.className = 'verify-older'; d.style.height = '2400px'; document.querySelector('.tds-transcript .tds-column').prepend(d) }")
    until(gap, (g) => g <= 140, "the transcript to stay pinned when content grows")
    check(!exists(".tds-jump[data-on]"), "no scroll affordance while pinned")
    ab("eval", "{ const s = document.querySelector('.tds-transcript'); s.scrollTop = s.scrollTop - 900 }")
    until(() => exists(".tds-jump[data-on]"), Boolean, "the Scroll to end pill once scrolled up")
    check(js<string>("return document.querySelector('.tds-jump')?.getAttribute('aria-label') ?? ''").startsWith("Scroll to end"), "the pill should be labelled Scroll to end")
    const before = js<number>("return Math.round(document.querySelector('.tds-bubble[data-side=me]').getBoundingClientRect().top)")
    ab("eval", "{ const d = document.createElement('div'); d.className = 'verify-older'; d.style.height = '600px'; document.querySelector('.tds-transcript .tds-column').prepend(d) }")
    wait(200)
    const after = js<number>("return Math.round(document.querySelector('.tds-bubble[data-side=me]').getBoundingClientRect().top)")
    check(Math.abs(after - before) <= 1, "older content above should not move what I am reading (" + before + " -> " + after + ")")
    shot("scroll-pill")
    ab("click", ".tds-jump")
    until(gap, (g) => g <= 140, "Scroll to end to return to the bottom")
    until(() => exists(".tds-jump[data-on]"), (on) => !on, "the pill to morph out")
    ab("eval", "{ const s = document.querySelector('.tds-transcript'); s.scrollTop = 0 }")
    until(() => exists(".tds-jump[data-on]"), Boolean, "the pill after scrolling to the top")
    field()
    ab("keyboard", "type", "and Osaka too")
    ab("press", "Enter")
    until(gap, (g) => g <= 140, "sending to jump to the bottom", 4000)
    shot("scroll-sent")
    ab("eval", "document.querySelectorAll('.verify-older').forEach((d) => d.remove())")
  },
  rich() {
    ab("click", "button[aria-label='New chat']")
    until(() => exists(".ProseMirror"), Boolean, "the composer")
    field()
    ab("keyboard", "type", "make **bold** and _soft_ and `code` ")
    until(() => exists(".tds-input strong") && exists(".tds-input em") && exists(".tds-input code"), Boolean, "markdown marks to render live")
    ab("press", "Control+b")
    ab("keyboard", "type", "loud")
    ab("press", "Control+b")
    check(js<string>("return [...document.querySelectorAll('.tds-input strong')].map((e) => e.textContent).join('|')").includes("loud"), "Ctrl+B bolds")
    ab("press", "Shift+Enter")
    ab("keyboard", "type", "- first")
    until(() => exists(".tds-input ul li"), Boolean, "a bullet list from '- '")
    ab("press", "Shift+Enter")
    ab("keyboard", "type", "second")
    check(js<number>("return document.querySelectorAll('.tds-input ul li').length") === 2, "Shift+Enter adds a list item")
    shot("rich-editor")
    ab("press", "Enter")
    until(() => exists(".tds-bubble[data-side='me'] .tds-bubble-rich"), Boolean, "the rich bubble")
    const sent = js<{ strong: string[]; em: number; code: number; li: number }>("const b = [...document.querySelectorAll('.tds-bubble[data-side=me]')].at(-1); return { strong: [...b.querySelectorAll('strong')].map((e) => e.textContent), em: b.querySelectorAll('em').length, code: b.querySelectorAll('code').length, li: b.querySelectorAll('li').length }")
    check(sent.strong.includes("bold") && sent.strong.includes("loud") && sent.em === 1 && sent.code === 1 && sent.li === 2, "the bubble renders the same markdown: " + JSON.stringify(sent))
    wait(300)
    shot("rich-sent")
    field()
    js<boolean>("const dt = new DataTransfer(); dt.setData('text/plain', '> quoted\\n\\n1. one\\n2. two'); document.querySelector('.ProseMirror').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); return true")
    until(() => exists(".tds-input blockquote") && js<number>("return document.querySelectorAll('.tds-input ol li').length") === 2, Boolean, "pasted markdown to parse")
    js<boolean>("const dt = new DataTransfer(); dt.setData('text/html', '<p>an <b>html</b> <i>paste</i></p>'); dt.setData('text/plain', 'an html paste'); document.querySelector('.ProseMirror').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); return true")
    until(() => js<string>("return [...document.querySelectorAll('.tds-input strong')].map((e) => e.textContent).join('|')"), (t) => t.includes("html"), "rich HTML paste to keep its bold")
    shot("rich-paste")
    ab("press", "Control+a")
    ab("press", "Backspace")
  },
  markdown() {
    fresh()
    say("Show every markdown format")
    settled()
    until(() => exists(".tds-bubble[data-side='agent'] table"), Boolean, "the formats reply", 20000)
    wait(800)
    const md = js<Record<string, unknown>>("const a = [...document.querySelectorAll(\".tds-bubble[data-side='agent']\")]; const q = (s) => a.flatMap((b) => [...b.querySelectorAll(s)]); const link = q('a.tds-link')[0]; return { del: q('del').map((e) => e.textContent), quote: q('blockquote').map((e) => e.textContent.trim()), hr: document.querySelectorAll('.tds-column hr.tds-rule').length, ol: q('ol').map((e) => e.getAttribute('start')), nested: q('ul > li > ul > li').map((e) => e.textContent.trim()), tasks: q('.tds-task').map((e) => e.getAttribute('aria-label')), th: q('th').map((e) => e.textContent), right: q('td[data-align=right]').length, raw: a.some((b) => /^(>|\\||---|~~)/m.test(b.textContent)), linkColor: link && getComputedStyle(link).color, tx: getComputedStyle(document.body).color, dots: link && getComputedStyle(link).backgroundImage }")
    check(JSON.stringify(md.del) === '["Struck out"]', "strike renders as <del>: " + JSON.stringify(md.del))
    check((md.quote as string[]).length === 1 && /quoted line/.test((md.quote as string[])[0]!), "blockquote renders: " + JSON.stringify(md.quote))
    check(md.hr === 1, "one horizontal rule")
    check(JSON.stringify(md.ol) === '["3"]', "ordered list keeps its start: " + JSON.stringify(md.ol))
    check(JSON.stringify(md.nested) === '["nested child"]', "nested list stays nested: " + JSON.stringify(md.nested))
    check(JSON.stringify(md.tasks) === '["Done","To do"]', "task items render a checkbox: " + JSON.stringify(md.tasks))
    check(JSON.stringify(md.th) === '["Name","Count"]' && md.right === 2, "table renders with alignment: " + JSON.stringify(md.th))
    check(!md.raw, "no raw markdown markers left in agent bubbles")
    check(md.linkColor === md.tx && /radial-gradient/.test(String(md.dots)), `link text stays --tx with dotted underline (${md.linkColor} vs ${md.tx})`)
    shot("markdown-agent")
    field()
    js<boolean>("const dt = new DataTransfer(); dt.setData('text/plain', '> a quoted line\\n\\n3. three\\n4. four\\n\\n- parent\\n  - nested child\\n\\n~~strike only~~'); document.querySelector('.ProseMirror').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); return true")
    until(() => exists(".tds-input blockquote"), Boolean, "pasted markdown in the composer")
    ab("press", "Enter")
    until(() => js<number>("return document.querySelectorAll(\".tds-bubble[data-side='me']\").length") >= 2, Boolean, "the second sent bubble")
    const me = js<Record<string, unknown>>("const b = [...document.querySelectorAll(\".tds-bubble[data-side='me']\")].at(-1); return { quote: b.querySelectorAll('blockquote').length, del: [...b.querySelectorAll('del')].map((e) => e.textContent), nested: b.querySelectorAll('ul > li > ul > li').length, ol: b.querySelector('ol')?.getAttribute('start') ?? null, text: b.textContent }")
    check(me.quote === 1 && JSON.stringify(me.del) === '["strike only"]' && me.nested === 1, "the sent bubble renders quote, strike and nested list: " + JSON.stringify(me))
    check(!/~~|^>/m.test(String(me.text)), "no raw markers in the sent bubble")
    wait(400)
    shot("markdown-me")
    const plain = js<string>("return document.querySelector('.tds-header')?.textContent ?? ''")
    check(!/~~|\\\\|\*\*/.test(plain), "the header title has no markdown: " + plain)
  },
  keys() {
    seeded()
    ab("eval", "document.querySelector(\"button[aria-label='Search in chat']\").focus()")
    ab("press", "Space")
    until(() => exists(".tds-find input"), Boolean, "Space on a focused button opens the find bar")
    check(!js<boolean>("return document.activeElement?.closest('.ProseMirror') !== null && document.activeElement?.closest('.ProseMirror') !== undefined"), "Space did not jump focus to the composer")
    ab("press", "Escape")
    ab("eval", "document.querySelector('.tds-transcript')?.focus?.(); document.activeElement?.blur()")
    ab("press", "h")
    until(() => js<boolean>("return !!document.activeElement?.closest('.ProseMirror')"), Boolean, "a letter still focuses the composer")
    ab("press", "Control+a")
    ab("press", "Backspace")
    const live = js<{ n: number; text: string }>("const r = [...document.querySelectorAll('[aria-live=polite][role=status].sr-only')]; return { n: r.length, text: r[0]?.textContent ?? '' }")
    check(live.n === 1 && /run finished/.test(live.text), "one shared polite announcer says the run finished: " + JSON.stringify(live))
    ab("set", "viewport", "320", "700")
    wait(400)
    const ph = js<{ ws: string; h: number; line: number; overflow: string }>("const p = document.querySelector('.tds-input p.is-editor-empty'); const s = getComputedStyle(p, '::before'); return { ws: s.whiteSpace, overflow: s.textOverflow, h: p.getBoundingClientRect().height, line: parseFloat(getComputedStyle(p).lineHeight) }")
    check(ph.ws === "nowrap" && ph.overflow === "ellipsis" && ph.h <= ph.line + 1, "placeholder stays one line with an ellipsis at 320px: " + JSON.stringify(ph))
    shot("placeholder-320")
    ab("set", "viewport", "1440", "900")
  },
  jumppill() {
    ab("click", "button[aria-label='New chat']")
    until(() => exists(".ProseMirror"), Boolean, "the composer")
    field()
    ab("keyboard", "type", "Check the weather in Tokyo and summarise it")
    ab("press", "Enter")
    until(() => exists(".tds-bubble[data-side='me']"), Boolean, "my bubble")
    ab("eval", "document.querySelector('.tds-column').insertAdjacentHTML('afterbegin', '<div class=verify-older style=height:2400px></div>')")
    until(() => (ab("eval", "(() => { const t = document.querySelector('.tds-transcript'); t.scrollTo({ top: 0, behavior: 'instant' }); t.dispatchEvent(new Event('scroll')) })()"), wait(150), exists(".tds-jump[data-on]")), Boolean, "the pill once scrolled up")
    const count = until(() => js<string>("return document.querySelector('.tds-jump-count [torph-sr]')?.textContent ?? ''"), (t) => /^\d+ new$/.test(t), "the new-message count", 20000)
    check(js<string>("return document.querySelector('.tds-jump')?.getAttribute('aria-label') ?? ''").includes(count), "the label carries the count")
    wait(450)
    const geo = js<{ top: number; bottom: number; h: number; composer: number; band: number }>(`const p = document.querySelector('.tds-jump').getBoundingClientRect(); const c = document.querySelector('.tds-field').getBoundingClientRect(); const t = document.querySelector('.tds-transcript').getBoundingClientRect(); return { top: p.top, bottom: p.bottom, h: p.height, composer: c.top, band: t.bottom - ${tokens.size["column-bottom"]} }`)
    check(geo.h <= 32, `the pill is compact, got ${geo.h}px`)
    check(geo.bottom <= geo.composer - 4, `the pill sits above the composer (pill bottom ${geo.bottom}, composer ${geo.composer})`)
    check(geo.top >= geo.band - 1, `the pill floats in the composer gap, below every fully visible bubble (pill top ${geo.top}, gap starts ${geo.band})`)
    shot("jump-pill")
    ab("click", ".tds-jump")
    until(() => exists(".tds-jump[data-on]"), (on) => !on, "the pill to leave after jumping to the end")
    ab("eval", "document.querySelectorAll('.verify-older').forEach((d) => d.remove())")
  },
  newdivider() {
    fresh()
    field()
    ab("keyboard", "type", "Check the weather in Tokyo and summarise it")
    ab("press", "Enter")
    until(() => exists(".tds-bubble[data-side='me']"), Boolean, "my bubble")
    ab("eval", "document.querySelector('.tds-column').insertAdjacentHTML('afterbegin', '<div class=verify-older style=height:2400px></div>')")
    until(() => (ab("eval", "(() => { const t = document.querySelector('.tds-transcript'); t.scrollTo({ top: 0, behavior: 'instant' }); t.dispatchEvent(new Event('scroll')) })()"), wait(150), exists(".tds-jump[data-on]")), Boolean, "the pill once scrolled up")
    const label = until(() => text(".tds-divider[data-tone='new'] .tds-divider-text"), (t) => /^\d+ new$/.test(t), "the N new divider", 20000)
    check(js<string>("return getComputedStyle(document.querySelector('.tds-divider[data-tone=new] .tds-divider-text')).color") === js<string>("const p = document.createElement('i'); p.style.color = 'var(--tds-accent-rose)'; document.body.append(p); const c = getComputedStyle(p).color; p.remove(); return c"), "the new divider is rose")
    ab("click", ".tds-jump")
    until(() => exists(".tds-jump[data-on]"), (on) => !on, "the pill to leave")
    ab("eval", "document.querySelector('.tds-divider[data-tone=new]').scrollIntoView({ block: 'center' })")
    wait(300)
    shot("divider-new")
    check(exists(".tds-divider[data-tone='new']"), `the ${label} divider stays after you jump down`)
    ab("eval", "document.querySelectorAll('.verify-older').forEach((d) => d.remove())")
    field()
    ab("keyboard", "type", "thanks")
    ab("press", "Enter")
    until(() => exists(".tds-divider[data-tone='new']"), (on) => !on, "the new divider to clear once you send")
    ab("eval", "import('/src/chat/items.ts').then((m) => { const at = new Date(2026, 10, 27, 9).getTime(); window.__td = [m.timeDivider(at, at + 5 * 60000, at), m.timeDivider(at, at + 2 * 3600000, at), m.timeDivider(at, at + 40 * 60000, at), m.timeDivider(at, at + 5 * 3600000, at)] })")
    const td = until(() => js<Array<{ text: string; tone?: string } | null> | null>("return window.__td ?? null"), Boolean, "timeDivider samples")
    check(td![0] === null, "no divider for a short gap")
    check(td![1]?.text === "2 hours later" && td![1]?.tone === "passed", `a 2h gap in the same sitting reads 2 hours later (got ${JSON.stringify(td![1])})`)
    check(td![2]?.text === "40 minutes later", `a 40m gap reads 40 minutes later (got ${JSON.stringify(td![2])})`)
    check(td![3]?.tone === undefined && /PM|AM/.test(td![3]?.text ?? ""), `a 5h gap shows the day and time (got ${JSON.stringify(td![3])})`)
  },
  revealstable() {
    ab("click", "button[aria-label='New chat']")
    until(() => exists(".ProseMirror"), Boolean, "the composer")
    field()
    ab("keyboard", "type", "Check the weather in Tokyo and summarise it")
    ab("press", "Enter")
    settled()
    js<boolean>(`const b = document.querySelector('.tds-act-button'); const r0 = b.getBoundingClientRect(); window.__drift = { max: 0, frames: 0, done: false }; const tick = () => { const r = document.querySelector('.tds-act-button')?.getBoundingClientRect(); if (r) window.__drift.max = Math.max(window.__drift.max, Math.abs(r.top - r0.top), Math.abs(r.left - r0.left), Math.abs(r.height - r0.height)); window.__drift.frames++; if (document.querySelector('.tds-word-wait, .tds-word') || window.__drift.frames < 30) requestAnimationFrame(tick); else window.__drift.done = true }; requestAnimationFrame(tick); return true`)
    const drift = until(() => js<{ max: number; frames: number; done: boolean }>("return window.__drift"), (d) => d.done, "the reveal to finish", 15000)
    check(drift.max < 0.5, `the activity line moved ${drift.max}px between the run settling and the reveal ending`)
    shot("reveal-stable")
  },
  clamp() {
    ab("click", "button[aria-label='New chat']")
    until(() => exists(".ProseMirror"), Boolean, "the composer")
    field()
    const long = Array.from({ length: 40 }, (_, i) => `line ${i + 1} of a very long note that keeps going so the bubble has to clamp.`).join(" ")
    ab("keyboard", "inserttext", long)
    ab("press", "Enter")
    until(() => exists(".tds-bubble[data-side='me'][data-clamped]"), Boolean, "the long bubble to clamp")
    wait(400)
    check(Math.round(rect(".tds-bubble[data-side='me'][data-clamped]")?.h ?? 0) === 320, `clamped bubble is 320 tall, got ${rect(".tds-bubble[data-side='me'][data-clamped]")?.h}`)
    check(style(".tds-bubble[data-side='me'][data-clamped]", "maskImage")?.includes("gradient"), "the clamp fades out")
    shot("clamp-closed")
    ab("click", ".tds-bubble[data-side='me'][data-clamped]")
    until(() => rect(".tds-bubble[data-side='me'][data-expanded]")?.h ?? 0, (h) => h > 400, "the bubble to expand in place")
    wait(400)
    shot("clamp-open")
  },
  anchor() {
    ab("click", "button[aria-label='New chat']")
    until(() => js<string>("return location.pathname"), (p) => /^\/t\/[0-9a-f-]{36}$/.test(p), "a UUID thread url")
    field()
    ab("keyboard", "type", "Check the weather in Tokyo and summarise it")
    ab("press", "Enter")
    until(() => js<string>("return document.querySelector('.tds-act')?.dataset.state ?? ''"), (s) => s === "done", "the run to finish", 20000)
    wait(400)
    steady(".tds-act-button")
    ab("click", ".tds-act-button")
    until(() => exists(".tds-worklog .tds-ws-line:not(:disabled)"), Boolean, "an expandable work log row")
    wait(500)
    const bottom = () => js<number>("const p = document.querySelector('.tds-worklog'); const r = p.getBoundingClientRect(); return Math.round(p.hasAttribute('data-down') ? r.top : r.bottom)")
    const tall = () => js<number>("return Math.round(document.querySelector('.tds-worklog').getBoundingClientRect().height)")
    const b0 = bottom()
    const h0 = tall()
    const roomy = () => js<boolean>("const p = document.querySelector('.tds-worklog'); return p.getBoundingClientRect().height < parseFloat(p.style.maxHeight) - 1")
    const room = roomy()
    const key = js<string>("return document.querySelector('.tds-worklog .tds-ws-line:not(:disabled)').closest('.tds-ws').dataset.key")
    ab("click", ".tds-worklog .tds-ws-line:not(:disabled)")
    wait(100)
    const mid = tall()
    wait(600)
    const h1 = tall()
    check(Math.abs(bottom() - b0) <= 1, "the work log should stay anchored to its line (" + b0 + " -> " + bottom() + ")")
    if (room) check(h1 > h0, "the work log should grow to fit the expanded row (" + h0 + " -> " + h1 + ")")
    if (room && h1 < js<number>("return parseFloat(document.querySelector('.tds-worklog').style.maxHeight)") - 1) check(mid > h0 && mid < h1, "the height should animate open, not jump (" + h0 + ", " + mid + ", " + h1 + ")")
    check(js<boolean>("const r = document.querySelector('.tds-ws[data-key=\"" + key + "\"]').getBoundingClientRect(); const b = document.querySelector('.tds-worklog-body').getBoundingClientRect(); return r.top >= b.top - 1 && r.top < b.bottom"), "the expanded row should be in view")
    check(js<number>("return +getComputedStyle(document.querySelector('.tds-ws[data-key=\"" + key + "\"] .tds-ws-body')).opacity") === 1, "the row body should have faded in")
    shot("worklog-anchor")
    ab("click", ".tds-ws[data-key=\"" + key + "\"] .tds-ws-line")
    wait(100)
    const back = tall()
    wait(600)
    if (h1 > h0 && tall() < h1) check(back <= h1 && back >= tall(), "the height should animate closed (" + h1 + ", " + back + ", " + tall() + ")")
    if (room) check(Math.abs(tall() - h0) <= 2, "the work log should return to its size (" + h0 + " -> " + tall() + ")")
    check(Math.abs(bottom() - b0) <= 1, "the work log should stay anchored after collapsing")
    shot("worklog-collapsed")
    ab("press", "Escape")
  },



  files() {
    const work = join(homedir(), ".capy/work")
    const pics = [0, 1, 2, 3, 4].map((i) => png(join(work, `verify-g${i}.png`), 480, 360, [80 + i * 30, 140, 200 - i * 25]))
    writeFileSync(join(work, "verify-notes.md"), "# Notes\n\nA small markdown file for the files journey.\n\n```ts\nexport const answer = (n: number) => n * 42\n```\n")
    ab("click", "button[aria-label='New chat']")
    until(() => exists(".tds-composer-wrap input[type=file]"), Boolean, "the composer")
    ab("upload", ".tds-composer-wrap input[type=file]", join(work, "verify-notes.md"), ...pics)
    until(() => js<string[]>("return [...document.querySelectorAll('.tds-attach')].map((e) => e.dataset.status)"), (s) => s.length === 6 && s.every((x) => x === "done"), "six uploads to finish", 20000)
    check(/B · \d+ lines?/.test(js<string>("return document.querySelector('.tds-attach[data-kind=doc] .tds-attach-line')?.textContent ?? ''")), "the doc card shows size and lines")
    check(js<string>("return document.querySelector('.tds-attach[data-kind=doc] .tds-sq-pill')?.textContent ?? ''") === "MD", "the doc card has a type pill")
    const sq = rect(".tds-attach[data-kind=doc]")!
    check(sq.w === 112 && sq.h === 112, `square tray card: ${JSON.stringify(sq)}`)
    shot("files-tray")
    field()
    js<boolean>("window.__fileChips = 0; new MutationObserver(() => { window.__fileChips = Math.max(window.__fileChips, document.querySelectorAll('.tds-bubble[data-side=agent] .tds-chip').length) }).observe(document.querySelector('.tds-transcript') ?? document.body, { subtree: true, childList: true }); return true")
    ab("keyboard", "type", "Send the files back")
    ab("press", "Enter")
    until(() => js<number>("return document.querySelectorAll(\".tds-files[data-side='me'] .tds-media[data-layout='grid'] .tds-media-tile\").length"), (n) => n === 4, "a grid of four with the overflow")
    check(js<string>("return document.querySelector(\".tds-files[data-side='me'] .tds-media-more\")?.textContent ?? ''") === "+2", "the fourth tile shows +2")
    until(() => js<string>("return document.querySelector(\".tds-files[data-side='me'] .tds-doc\")?.dataset.state ?? ''"), (t) => t === "ready", "the sent doc card to resolve")
    check(js<boolean>("const f = document.querySelector(\".tds-files[data-side='me']\"); const b = f?.nextElementSibling; return !!b && b.matches('.tds-bubble') && f.getBoundingClientRect().right > b.getBoundingClientRect().right - 2"), "the user's files sit above the bubble, right-aligned")
    until(() => js<boolean>("return [...document.querySelectorAll('.tds-bubble')].some((b) => b.textContent.includes('another pass'))"), Boolean, "the agent's reply to finish", 30000)
    until(() => exists(".tds-files[data-side='agent'] .tds-doc"), Boolean, "the agent's file card", 20000)
    const metaText = "const m = document.querySelector(\".tds-files[data-side='agent'] .tds-doc-meta\")?.cloneNode(true); m?.querySelectorAll('[aria-hidden=true]').forEach((e) => e.remove()); return m?.textContent.trim() ?? ''"
    until(() => js<string>(metaText), (t) => /^Markdown · [\d.]+ [KM]?B · \d+ lines?$/.test(t), "the agent card type, size and lines, drawn once")
    const card = ".tds-files[data-side='agent'] .tds-doc"
    check(!js<string>("return document.querySelector(\"" + card + "\").textContent").includes("Open"), "the doc card has no Open text, the whole card is the target")
    check(js<number>("const c = document.querySelector(\"" + card + "\"); return parseFloat(getComputedStyle(c).borderRadius) - parseFloat(getComputedStyle(c).paddingLeft) - parseFloat(getComputedStyle(c.querySelector('.tds-doc-glyph')).borderRadius)") === 0, "the glyph radius nests inside the card (inner = outer - padding)")
    const hoverRule = js<{ bg: string; shadow: string } | null>("const walk = (rules) => { for (const r of rules) { if (r.selectorText === '.tds-doc:hover') return { bg: r.style.backgroundColor, shadow: r.style.boxShadow }; if (r.cssRules) { const f = walk(r.cssRules); if (f) return f } } return null }; for (const s of document.styleSheets) { try { const f = walk(s.cssRules); if (f) return f } catch {} } return null")
    check(hoverRule && hoverRule.bg !== "" && hoverRule.shadow === "", "hover shades the card (a fill and the raise shadow), never a ring: " + JSON.stringify(hoverRule))
    check(js<number>("return document.querySelectorAll(\".tds-files[data-side='agent'] .tds-media[data-layout='grid'] .tds-media-tile\").length") === 4, "the agent's five images form a 2x2 grid with +N")
    const corners = js<string[]>("const t = [...document.querySelectorAll(\".tds-files[data-side='agent'] .tds-media-tile\")]; return [getComputedStyle(t[0]).borderTopLeftRadius, getComputedStyle(t[0]).borderBottomRightRadius, getComputedStyle(document.querySelector('.tds-bubble')).borderTopLeftRadius]")
    check(corners[0] === "18px" && corners[1] === "6px", "the gallery takes the SPEC media radius outside (18) and stays tight inside (6): " + corners.join(", "))
    wait(300)
    shot("files-sent")
    ab("click", ".tds-files[data-side='agent'] .tds-doc")
    until(() => exists(".tds-lightbox[data-ready] .tds-lightbox-doc .tds-lightbox-md"), Boolean, "a markdown file to open in the lightbox as rendered markdown")
    check(js<string>("return document.querySelector('.tds-lightbox-md')?.textContent ?? ''").includes("Notes"), "the lightbox shows the file text")
    check(js<boolean>("const c = document.querySelector('.tds-lightbox-md .tds-code'); return !!c && c.dataset.language === 'ts' && !!c.querySelector('.tds-code-body [class^=sh__]') && c.querySelector('.tds-code-body').textContent.includes('n * 42')"), "the markdown preview highlights its fence through the shared code block")
    wait(300)
    shot("files-doc-lightbox")
    ab("press", "Escape")
    until(() => exists(".tds-lightbox"), (open) => !open, "Escape to close")
    check(js<number>("return window.__fileChips") === 0, "agent files must render as the gallery and cards, never as chips in a bubble (saw " + js<number>("return window.__fileChips") + ")")
  },
  flip() {
    ensureRows(3)
    const ids = js<string[]>("return [...document.querySelectorAll('.tds-row-wrap:not([data-archived])')].slice(0, 2).map((e) => e.dataset.id)")
    const [gone, next] = [ids[0]!, ids[1]!]
    js<boolean>(`window.__flip = { max: 0 }; const end = performance.now() + 2500; const tick = () => { const w = document.querySelector('.tds-row-wrap[data-id="${next}"]'); const t = w ? new DOMMatrix(getComputedStyle(w).transform).m42 : 0; window.__flip.max = Math.max(window.__flip.max, Math.abs(t)); if (performance.now() < end) requestAnimationFrame(tick) }; requestAnimationFrame(tick); return true`)
    openRow()
    choose("Archive")
    until(() => exists(`.tds-row-wrap[data-id="${gone}"]:not([data-archived])`), (still) => !still, "the archived row to leave")
    until(() => js<number>(`return document.querySelector('.tds-row-wrap[data-id="${next}"]')?.getAnimations().length ?? 0`), (n) => n === 0, "the slide to land", 4000)
    const moved = js<{ max: number }>("return window.__flip")
    check(moved.max > 4, `the row below slides up into the gap instead of jumping (max offset ${moved.max}px)`)
    check(Math.abs(js<number>(`return new DOMMatrix(getComputedStyle(document.querySelector('.tds-row-wrap[data-id="${next}"]')).transform).m42`)) < 0.5, "the row lands with no offset")
    shot("flip-landed")
    js<boolean>("const b = [...document.querySelectorAll('.tds-toast-action')].find((e) => e.textContent.trim() === 'Undo'); b?.click(); return !!b")
    until(() => exists(`.tds-row-wrap[data-id="${gone}"]:not([data-archived])`), Boolean, "Undo to restore the row")
  },

  mobile() {
    ab("set", "device", "iPhone 16 Pro")
    try {
      fresh()
      const m = js<Record<string, string | boolean | null>>(`const s = (q) => getComputedStyle(document.querySelector(q)); return { coarse: matchMedia("(pointer: coarse)").matches, input: s(".tds-input").fontSize, key: document.querySelector(".ProseMirror")?.getAttribute("enterkeyhint") ?? null, tap: s("html").webkitTapHighlightColor, over: s("body").overscrollBehaviorY, touch: s(".tds-send").touchAction, select: s(".tds-send").userSelect, meta: document.querySelector("meta[name=viewport]")?.content ?? "" }`)
      check(m.coarse === true, "the phone emulation should report a coarse pointer")
      check(parseFloat(String(m.input)) >= 16, `composer text under 16px zooms iOS on focus, got ${m.input}`)
      check(m.key === "send", `the return key should say send, got ${m.key}`)
      check(transparent(String(m.tap)), `tap highlight should be transparent, got ${m.tap}`)
      check(m.over === "none", `page overscroll should be none, got ${m.over}`)
      check(m.touch === "manipulation", `buttons need touch-action: manipulation, got ${m.touch}`)
      check(m.select === "none", `button labels should not be selectable, got ${m.select}`)
      check(/viewport-fit=cover/.test(String(m.meta)) && !/user-scalable=no|maximum-scale/.test(String(m.meta)), `viewport meta: ${m.meta}`)
      shot("mobile")
    } finally {
      ab("close")
      ab("open", BASE, "--args", "--no-sandbox")
      ab("set", "viewport", "1440", "900")
      unlock()
      ab("open", BASE)
    }
  },
  ui() {
    const ungated = js<string[]>(`const out = []; const walk = (list, gated) => { for (const r of list) { if (r.conditionText !== undefined && r.cssRules) walk(r.cssRules, gated || /hover:\\s*hover/.test(r.conditionText)); else { if (r.selectorText !== undefined && /:hover/.test(r.selectorText) && !gated) out.push(r.selectorText); if (r.cssRules?.length) walk(r.cssRules, gated) } } }; for (const s of document.styleSheets) { try { walk(s.cssRules, false) } catch {} } return out`)
    check(!ungated.length, `every :hover rule sits under @media (hover: hover); ungated: ${ungated.slice(0, 5).join(" | ")}`)
    fresh()
    say("https://example.com/workspaces/acme/projects/q3-launch/docs/9f8e7d6c5b4a?tab=comments&x=DonaudampfschiffahrtsgesellschaftDonaudampfschiffahrtsgesellschaft")
    settled()
    const spill = js<string[]>("return [...document.querySelectorAll('.tds-transcript, .tds-column, .tds-bubble')].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.className.split(' ')[0])")
    check(!spill.length, `an unbreakable message stays inside its bubble and column; overflowing: ${spill.join(", ")}`)
    const hidden = js<string[]>("return [...document.querySelectorAll('*')].filter((e) => getComputedStyle(e).textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth + 1 && !e.closest('[title], [aria-label]')).map((e) => e.className.split(' ')[0])")
    check(!hidden.length, `truncated text keeps a way to the full value (title or aria-label); bare: ${hidden.join(", ")}`)
    const small = js<string[]>("return [...document.querySelectorAll('button, [role=button], a[href]:not(.tds-link)')].filter((e) => { const r = e.getBoundingClientRect(); return r.width && (r.width < 24 || r.height < 24) && !e.classList.contains('tds-sidebar-handle') }).map((e) => e.className.split(' ')[0] + ' ' + (e.getAttribute('aria-label') ?? ''))")
    check(!small.length, `every control is at least 24×24 (WCAG 2.5.8); small: ${small.join(", ")}`)
    shot("ui")
    ab("set", "viewport", "320", "700")
    try {
      reset()
      check(js<boolean>("return !!document.querySelector('[data-narrow]') && !document.querySelector('[data-pane=home]')?.offsetWidth"), "at 320px home shows the chat list alone")
      ab("click", ".tds-row-wrap .tds-row")
      until(() => exists("[data-pane=thread] .tds-composer-row"), Boolean, "the thread at 320px")
      const out = js<string[]>("return ['.tds-header-pill', '.tds-composer-row', '.tds-send', '.tds-column'].filter((q) => { const r = document.querySelector(q)?.getBoundingClientRect(); return !r || r.left < 0 || r.right > innerWidth + 0.5 })")
      check(!out.length, `at 320px the header, composer and column stay on screen; clipped: ${out.join(", ")}`)
      check(rect(".tds-field")!.w >= 120, `the composer field keeps room to type at 320px, got ${rect(".tds-field")?.w}`)
      shot("ui-320-thread")
      ab("click", "button[aria-label^='Chats']")
      until(() => js<string>("return location.pathname"), (path) => path === "/", "Chats to lead back to the list at 320px")
    } finally {
      ab("set", "viewport", "1440", "900")
    }
  },
  edges() {
    ab("set", "viewport", "1440", "480")
    try {
      ensureRows(8)
      const read = () => js<{ mask: string; edge: boolean; t: number; b: number; top: number; max: number; len: number }>("const e = document.querySelector('.tds-roster'); const s = getComputedStyle(e); return { mask: s.maskImage, edge: e.hasAttribute('data-edge'), t: parseFloat(e.style.getPropertyValue('--edge-t')), b: parseFloat(e.style.getPropertyValue('--edge-b')), top: e.scrollTop, max: e.scrollHeight - e.clientHeight, len: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tds-size-edge-fade')) }")
      const scrollTo = (where: string) => ab("eval", "(() => { const e = document.querySelector('.tds-roster'); e.scrollTop = " + where + " })()")
      const first = until(read, (r) => r.max > 0 && r.b > 0, "the roster to overflow")
      check(first.edge && /gradient/.test(first.mask), "an overflowing roster carries no edge mask (" + first.mask + ")")
      check(first.top === 0 && first.t === 0, "at the top the roster fades its top edge (" + first.t + "px)")
      check(first.b >= first.len, "at the top the bottom fade is shorter than the token (" + first.b + "px)")
      shot("edges-top")
      scrollTo("Math.round((e.scrollHeight - e.clientHeight) / 2)")
      const mid = until(read, (r) => r.t > 0 && r.b > 0, "both fades in the middle")
      check(mid.t >= Math.min(mid.len, mid.top) && mid.b > 0, "in the middle both edges fade (" + mid.t + "/" + mid.b + ")")
      shot("edges-middle")
      scrollTo("e.scrollHeight")
      const end = until(read, (r) => r.b < 1 && r.t > 0, "only the top fade at the bottom")
      check(end.t >= end.len, "at the bottom the top fade is shorter than the token (" + end.t + "px)")
      shot("edges-bottom")
      ab("set", "viewport", "1440", "900")
      until(() => js<boolean>("const e = document.querySelector('.tds-roster'); return e.scrollHeight <= e.clientHeight ? !e.hasAttribute('data-edge') : true"), Boolean, "a roster that fits to drop its mask")
      if (!devServer()) return console.log("      edges: /__motion demo strip skipped, the route exists only on the dev server")
      ab("open", BASE + "/__motion")
      until(() => exists(".tds-motion-strip"), Boolean, "the motion demo")
      const strip = until(() => js<{ l: number; r: number; edge: boolean }>("const e = document.querySelector('.tds-motion-strip'); return { l: parseFloat(e.style.getPropertyValue('--edge-l')), r: parseFloat(e.style.getPropertyValue('--edge-r')), edge: e.hasAttribute('data-edge') }"), (s) => s.r > 0, "the demo strip to fade its right edge")
      check(strip.l === 0 && strip.edge, "the demo strip fades its left edge at the start")
      shot("edges-demo")
    } finally {
      ab("set", "viewport", "1440", "900")
    }
  },
  motion() {
    seeded()
    ab("set", "media", "dark")
    const all = js<string[]>("return [...document.querySelectorAll('*')].filter((e) => { const s = getComputedStyle(e); const d = s.transitionDuration.split(', '); return s.transitionProperty.split(', ').some((p, i) => p === 'all' && parseFloat(d[i % d.length]) > 0) }).slice(0, 5).map((e) => e.className.toString().slice(0, 60))")
    check(all.length === 0, `transition: all on ${all.join(" | ")}`)
    const press = js<{ p: string; d: string }>("const s = getComputedStyle(document.querySelector('.tds-composer button:not(:disabled)') ?? document.querySelector('button')); return { p: s.transitionProperty, d: s.transitionDuration }")
    check(/scale/.test(press.p), `buttons carry no press transition (${press.p})`)
    field()
    ab("keyboard", "type", "@")
    until(() => exists(".tds-suggest-glide"), Boolean, "the mention list")
    ab("press", "ArrowDown")
    const glide = until(() => js<{ t: string; y: number }>("const s = getComputedStyle(document.querySelector('.tds-suggest-glide')); return { t: s.transitionProperty, y: parseFloat(s.translate.split(' ')[1] ?? '0') }"), (g) => g.y > 0, "the highlight to glide down")
    check(!/\btop\b/.test(glide.t), `suggest highlight still animates top (${glide.t})`)
    ab("press", "Escape")
    ab("press", "Backspace")
    until(() => js<number>("return document.getAnimations().filter((a) => a.effect?.getTiming().iterations === Infinity && a.playState === 'running').length"), (n) => n === 0, "no infinite loops running on an idle chat")
    ab("set", "media", "dark", "reduced-motion")
    const dur = js<number>("return Math.max(...getComputedStyle(document.querySelector('.tds-composer button') ?? document.body).transitionDuration.split(',').map(parseFloat))")
    check(dur <= 0.15, `reduced motion leaves ${dur}s transitions`)
    js<boolean>("window.__moves = []; const a = Element.prototype.animate; Element.prototype.__animate ??= a; Element.prototype.animate = function (k, o) { if (JSON.stringify(k).match(/translate|transform/)) window.__moves.push(this.className.toString().slice(0, 40)); return Element.prototype.__animate.call(this, k, o) }; return true")
    say("one more")
    shot("motion-reduced")
    const moves = js<string[]>("return window.__moves")
    ab("set", "media", "dark")
    check(moves.length === 0, `element.animate moved things under reduced motion: ${moves.join(", ")}`)
  },
  a11y() {
    const page = () => js<{ mains: number; h1: string[]; title: string; viewport: string; unnamed: string[]; noAlt: number; hiddenTabbable: string[]; positive: number; small: string[] }>(`
      const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && e.checkVisibility({ checkVisibilityCSS: true }) && !e.closest('[inert]') }
      const name = (e) => (e.getAttribute('aria-label') || (e.getAttribute('aria-labelledby') || '').split(' ').map((i) => document.getElementById(i)?.textContent || '').join('') || [...(e.labels || [])].map((l) => l.textContent).join('') || e.textContent || e.getAttribute('title') || '').trim()
      const ia = [...document.querySelectorAll('button, a[href], input, textarea, select, [role=button], [role=option], [role=menuitem], [role=separator][tabindex], [contenteditable=true]')].filter(vis)
      return {
        mains: [...document.querySelectorAll('main')].filter(vis).length,
        h1: [...document.querySelectorAll('h1, [role=heading][aria-level="1"]')].map((h) => h.textContent.trim()),
        title: document.title,
        viewport: document.querySelector('meta[name=viewport]')?.content ?? '',
        unnamed: ia.filter((e) => !name(e)).map((e) => e.outerHTML.slice(0, 80)),
        noAlt: document.querySelectorAll('img:not([alt])').length,
        hiddenTabbable: [...document.querySelectorAll('[aria-hidden=true] :is(button, a[href], input, textarea, [tabindex="0"])')].filter((e) => !e.closest('[inert]') && !e.disabled && e.tabIndex >= 0).map((e) => e.outerHTML.slice(0, 80)),
        positive: [...document.querySelectorAll('[tabindex]')].filter((e) => e.tabIndex > 0).length,
        small: ia.filter((e) => !e.matches('input, textarea, [contenteditable], [role=separator], .tds-link')).filter((e) => { const r = e.getBoundingClientRect(); return r.width < 24 || r.height < 24 }).map((e) => e.className + ' ' + name(e)),
      }`)
    const audit = (where: string) => {
      const p = page()
      check(p.mains === 1, `${where}: expected one visible <main>, got ${p.mains}`)
      check(p.h1.length >= 1, `${where}: no level-1 heading`)
      check(!/maximum-scale|user-scalable=no/.test(p.viewport), `${where}: viewport blocks zoom: ${p.viewport}`)
      check(p.unnamed.length === 0, `${where}: controls with no accessible name: ${p.unnamed.join(' | ')}`)
      check(p.noAlt === 0, `${where}: ${p.noAlt} <img> without alt`)
      check(p.hiddenTabbable.length === 0, `${where}: tabbable controls inside aria-hidden: ${p.hiddenTabbable.join(' | ')}`)
      check(p.positive === 0, `${where}: positive tabindex`)
      check(p.small.length === 0, `${where}: targets under 24px: ${p.small.join(' | ')}`)
      return p
    }
    const home = audit("home")
    check(home.title === "Tock", `home title is ${home.title}`)
    ab("eval", "document.activeElement?.blur()")
    ab("press", "Tab")
    check(js<string>("return document.activeElement?.className ?? ''") === "tds-skip", "Skip to chat is not the first Tab stop")
    check(js<boolean>("const r = document.activeElement.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.width > 0"), "the focused skip link is off screen")
    shot("a11y-skip")
    ab("press", "Enter")
    until(() => js<string>("return document.activeElement?.id ?? ''"), (id) => id === "main", "Enter on the skip link to focus <main>")
    const id = seeded()
    const chat = audit("chat")
    check(/ · Tock$/.test(chat.title) && chat.title !== " · Tock", `chat title is ${chat.title}`)
    check(js<boolean>("return !!document.querySelector('.tds-row[href$=\"" + id + "\"], .tds-row')"), "no sidebar row to tab to")
    ab("eval", "document.querySelector('.tds-skip').focus()")
    const stops: string[] = []
    for (let i = 0; i < 40; i++) {
      ab("press", "Tab")
      wait(220)
      const stop = js<{ tag: string; label: string; ring: boolean; shown: boolean; text: boolean }>(`
        const e = document.activeElement
        if (!e || e === document.body) return { tag: 'BODY', label: '', ring: true, shown: true, text: false }
        const own = getComputedStyle(e), box = e.closest('.tds-search')
        const ring = (own.outlineStyle !== 'none' && parseFloat(own.outlineWidth) > 0) || (box && getComputedStyle(box).outlineStyle !== 'none') || (e.matches('.tds-sidebar-handle') && getComputedStyle(e, '::after').opacity === '1')
        const r = e.getBoundingClientRect()
        return { tag: e.tagName, label: (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 24), ring: !!ring, shown: r.width > 0 && r.height > 0 && e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }), text: e.isContentEditable }
      `)
      if (stop.tag === "BODY") break
      stops.push(stop.tag + ":" + stop.label)
      check(stop.shown, `Tab stop ${stop.tag} "${stop.label}" is invisible`)
      check(stop.ring || stop.text, `Tab stop ${stop.tag} "${stop.label}" has no visible focus indicator`)
      if (stop.label.startsWith("New chat")) shot("a11y-row-focus")
    }
    check(stops.length >= 10, `only ${stops.length} Tab stops: ${stops.join(', ')}`)
    ab("click", "button[aria-label='Share']")
    until(() => exists(".tds-toast"), Boolean, "the share toast")
    ab("eval", "document.querySelector('.tds-toast button')?.focus()")
    wait(5600)
    check(exists(".tds-toast:not([data-gone])"), "a focused toast timed out")
    shot("a11y-toast-focus")
    ab("eval", "document.activeElement?.blur()")
  },
  steps() {
    ab("click", "button[aria-label='New chat']")
    until(() => js<string>("return location.pathname"), (p) => /^\/t\/[0-9a-f-]{36}$/.test(p), "a UUID thread url")
    field()
    ab("keyboard", "type", "Check the weather in Tokyo and summarise it")
    ab("press", "Enter")
    until(() => js<string>("return document.querySelector('.tds-act')?.dataset.state ?? ''"), (s) => s === "done", "the run to finish", 20000)
    wait(400)
    steady(".tds-act-button")
    ab("click", ".tds-act-button")
    until(() => exists(".tds-worklog .tds-ws"), Boolean, "the work log rows")
    wait(600)
    const fit = js<{ sh: number; ch: number; rows: number }>("const b = document.querySelector('.tds-worklog-body'); return { sh: b.scrollHeight, ch: b.clientHeight, rows: document.querySelectorAll('.tds-worklog .tds-ws').length }")
    check(fit.sh <= fit.ch + 1, "a short turn should show every row without scrolling (" + JSON.stringify(fit) + ")")
    check(rect(".tds-worklog-head")!.h <= 37, "the compact head should be about 36px, got " + rect(".tds-worklog-head")?.h)
    const pane = rect(".tds-worklog")!
    const mine = js<{ l: number; t: number; b: number } | null>("const e = document.querySelector('.tds-bubble[data-side=me]'); if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, b: r.bottom }")
    if (mine) check(pane.x + pane.w <= mine.l + 1 || mine.b <= pane.y + 1 || mine.t >= pane.y + pane.h - 1, "the pane should not cover my bubble")
    const clear = js<boolean>("const p = document.querySelector('.tds-worklog').getBoundingClientRect(); return [...document.querySelectorAll(\".tds-bubble[data-side='me'], .tds-sent-images, .tds-file-card[data-side='me']\")].every((e) => { const r = e.getBoundingClientRect(); return r.right <= p.left || r.left >= p.right || r.bottom <= p.top || r.top >= p.bottom })")
    check(clear, "the pane must not cover my bubble or attachments")
    shot("worklog-steps")
    ab("press", "Escape")
  },
  longrun() {
    ab("click", "button[aria-label='New chat']")
    until(() => js<string>("return location.pathname"), (p) => /^\/t\/[0-9a-f-]{36}$/.test(p), "a UUID thread url")
    field()
    ab("keyboard", "type", "please run a long job")
    ab("press", "Enter")
    until(() => js<string>("return document.querySelector('.tds-act')?.dataset.state ?? ''"), (s) => s === "done", "the long run to finish", 60000)
    steady(".tds-act-button")
    ab("click", ".tds-act-button")
    until(() => exists(".tds-worklog .tds-ws"), Boolean, "the work log rows")
    wait(600)
    const summary = js<string>("return document.querySelector('.tds-worklog .tds-ws[data-kind=group] .tds-ws-label')?.textContent ?? ''")
    check(/searched memory \d+ times/i.test(summary), "a run of tool calls folds into one sentence, got: " + summary)
    ab("click", ".tds-worklog .tds-ws[data-kind='group'] > .tds-ws-line")
    wait(700)
    check(js<string>("return [...document.querySelectorAll('.tds-worklog .tds-ws-file')].map((c) => c.textContent.trim()).join(',')").includes("probe2.mjs"), "file names in rows render as file chips")
    const box = js<{ sh: number; ch: number; top: number; vh: number }>("const b = document.querySelector('.tds-worklog-body'); const p = document.querySelector('.tds-worklog').getBoundingClientRect(); return { sh: b.scrollHeight, ch: b.clientHeight, top: p.top, vh: innerHeight }")
    check(box.sh > box.ch, "a long turn should scroll inside the pane (" + JSON.stringify(box) + ")")
    check(box.top >= 0, "the pane should stay on screen (" + JSON.stringify(box) + ")")
    check(js<number>("return document.querySelectorAll('.tds-worklog .tds-ws').length") >= 30, "a 30-step run renders every row in flow (virtualized only past the worklog-virtual limit)")
    const clear = js<boolean>("const p = document.querySelector('.tds-worklog').getBoundingClientRect(); return [...document.querySelectorAll(\".tds-bubble[data-side='me'], .tds-sent-images, .tds-file-card[data-side='me']\")].every((e) => { const r = e.getBoundingClientRect(); return r.right <= p.left || r.left >= p.right || r.bottom <= p.top || r.top >= p.bottom })")
    check(clear, "the pane must not cover my bubble or attachments")
    shot("worklog-long")
    ab("eval", "document.querySelector('.tds-worklog-body').scrollTop = 0")
    wait(300)
    until(() => exists(".tds-worklog .tds-ws-line:not(:disabled) .tds-ws-label"), Boolean, "the long log row")
    const tall = () => js<number>("return Math.round(document.querySelector('.tds-worklog').getBoundingClientRect().height)")
    ab("eval", "const r = [...document.querySelectorAll('.tds-worklog .tds-ws-line:not(:disabled)')].filter((l) => l.closest('.tds-ws[data-nested]')).find((l) => /Ran code/.test(l.textContent)); r.click()")
    const samples: number[] = []
    for (let i = 0; i < 6; i++) { samples.push(tall()); wait(60) }
    wait(500)
    const out = js<{ h: number; sh: number }>("const b = document.querySelector('.tds-ws[data-nested][data-open] .tds-ws-body'); return { h: b.getBoundingClientRect().height, sh: b.scrollHeight }")
    check(out.h <= 241, "an expanded long output should cap near 240px, got " + out.h)
    check(out.sh > out.h, "the long output should scroll inside its row")
    shot("worklog-long-output")
    ab("press", "Escape")
  },

  growopen() {
    seeded()
    until(() => exists(".tds-act-button"), Boolean, "a thread with a work log", 10000)
    wait(600)
    steady(".tds-act-button")
    ab("click", ".tds-act-button")
    wait(700)
    ab("press", "Escape")
    wait(500)
    const line = rect(".tds-act-button")!
    ab("eval", "(() => { const f = []; window.__g = f; let on = true; window.__gstop = () => (on = false); const tick = () => { const el = document.querySelector('.tds-worklog'); if (el) { const r = el.getBoundingClientRect(); f.push([r.x, r.y, r.width, r.height, +getComputedStyle(el).opacity]) } if (on) requestAnimationFrame(tick) }; requestAnimationFrame(tick) })()")
    steady(".tds-act-button")
    ab("click", ".tds-act-button")
    wait(900)
    const frames = js<number[][]>("window.__gstop(); return window.__g")
    const end = frames.at(-1)!
    const first = frames.find((f) => f[4] > 0.05)!
    check(frames[0]![4] < 0.05, "the pane must not flash at full opacity before it grows (" + JSON.stringify(frames[0]) + ")")
    check(first[2] < end[2] * 0.75, "the pane should first show small, near its line (" + JSON.stringify(first) + " vs " + JSON.stringify(end) + ")")
    const between = frames.filter((f) => f[4] > 0.05 && f[2] > first[2] + 1 && f[2] < end[2] - 1)
    check(between.length >= 3, "the pane should pass through intermediate sizes, saw " + between.length)
    check(Math.abs(first[0] + first[2] / 2 - (line.x + line.w / 2)) < Math.abs(end[0] + end[2] / 2 - (line.x + line.w / 2)) + 1, "the first visible frame should sit nearer the line than the settled pane")
    ab("press", "Escape")
  },
  trayfit() {
    seeded()
    const clip = join(FIXTURES, "verify-clip-with-a-long-name-for-truncation.mp4")
    writeFileSync(clip, new Uint8Array(3.5 * 1024 * 1024))
    js<boolean>("window.__tray = { frames: 0, slot: 0, clash: 0, cover: 0 }; const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom; const end = performance.now() + 20000; const tick = () => { const t = window.__tray; t.frames++; for (const card of document.querySelectorAll('.tds-attach')) { const name = card.querySelector('b'); const ring = card.querySelector('.tds-attach-ring'); if (name && ring) { t.slot++; if (hit(name.getBoundingClientRect(), ring.getBoundingClientRect())) t.clash++ } } const last = [...document.querySelectorAll('.tds-column .tds-bubble')].at(-1); const field = document.querySelector('.tds-composer-wrap .tds-field'); if (last && field) { const depth = last.getBoundingClientRect().bottom - field.getBoundingClientRect().top; t.deepest = Math.max(t.deepest ?? 0, Math.round(depth)); if (depth > 1) t.cover++ } if (performance.now() < end && !window.__trayStop) requestAnimationFrame(() => setTimeout(tick)) }; window.__trayStop = false; requestAnimationFrame(() => setTimeout(tick)); return true")
    ab("upload", ".tds-composer-wrap input[type=file]", clip)
    until(() => js<string>("return document.querySelector('.tds-attach')?.dataset.status ?? ''"), (s) => s === "done", "the large upload to finish", 30000)
    wait(600)
    ab("eval", "window.__trayStop = true")
    const seen = js<{ frames: number; slot: number; clash: number; cover: number }>("return window.__tray")
    shot("trayfit")
    check(seen.slot > 0, "the upload progress was never on screen: " + JSON.stringify(seen))
    check(seen.clash === 0, "the progress slot must never sit on the file name: " + JSON.stringify(seen))
    check(seen.cover === 0, "the tray must never cover the last message in a painted frame: " + JSON.stringify(seen))
    const gap = js<number>("const last = [...document.querySelectorAll('.tds-column .tds-bubble')].at(-1).getBoundingClientRect(); return Math.round(document.querySelector('.tds-composer-wrap .tds-field').getBoundingClientRect().top - last.bottom)")
    check(gap >= 0, "the last message sits above the grown composer, gap " + gap)
    ab("click", ".tds-attach-remove")
  },
  traygrow() {
    fresh()
    const work = join(homedir(), ".capy/work")
    const a = png(join(work, "verify-tray-a.png"), 320, 240, [229, 143, 180])
    const big = join(FIXTURES, "verify-tray-big-notes.md")
    writeFileSync(big, "# Big notes\n" + "a line of notes for the tray journey\n".repeat(90000))
    js<boolean>("window.__grow = { first: null, heights: [], metas: [], widths: [] }; const plus = document.querySelector('.tds-composer-plus').getBoundingClientRect(); window.__grow.plus = [plus.x + plus.width / 2, plus.y + plus.height / 2]; const end = performance.now() + 15000; const tick = () => { const g = window.__grow; const card = document.querySelector('.tds-attach'); if (card && !g.first && +getComputedStyle(card).opacity > 0.05) { const r = card.getBoundingClientRect(); g.first = [r.x + r.width / 2, r.y + r.height / 2, r.width] } g.heights.push(Math.round(document.querySelector('.tds-field').getBoundingClientRect().height)); const m = document.querySelector('.tds-attach[data-kind=doc] .tds-attach-line'); if (m) { const c = m.cloneNode(true); c.querySelectorAll('[aria-hidden=true]').forEach((x) => x.remove()); const t = c.textContent.trim(); if (g.metas.at(-1) !== t) g.metas.push(t) } const w = document.querySelector('.tds-attach[data-leaving], .tds-attach[style*=pointer-events]'); if (w) g.widths.push(Math.round(w.getBoundingClientRect().width)); if (performance.now() < end && !window.__growStop) requestAnimationFrame(() => setTimeout(tick)) }; window.__growStop = false; requestAnimationFrame(() => setTimeout(tick)); return true")
    ab("upload", ".tds-composer-wrap input[type=file]", a)
    until(() => js<string>("return document.querySelector('.tds-attach')?.dataset.status ?? ''"), (s) => s === "done", "the image to upload")
    until(() => js<boolean>("return !!window.__grow.first"), Boolean, "the card to appear")
    wait(700)
    const g1 = js<{ first: number[] | null; heights: number[]; plus: number[] }>("return window.__grow")
    const card = rect(".tds-attach")!
    check(g1.first !== null, "the card was never seen entering")
    const near = Math.hypot(g1.first![0]! - g1.plus[0]!, g1.first![1]! - g1.plus[1]!)
    const far = Math.hypot(card.x + card.w / 2 - g1.plus[0]!, card.y + card.h / 2 - g1.plus[1]!)
    check(near < far - 8 && g1.first![2]! < card.w, `the card grows out of the plus button (first frame ${JSON.stringify(g1.first)}, rest ${JSON.stringify(card)})`)
    const heights = [...new Set(g1.heights)]
    check(heights.length >= 4, "the composer height moves through intermediate sizes, saw " + heights.join(","))
    check(Math.max(...g1.heights) > heights.at(-1)!, "the composer height springs past its rest and settles: " + heights.join(","))
    ab("upload", ".tds-composer-wrap input[type=file]", big)
    until(() => js<string[]>("return document.querySelectorAll('.tds-attach').length === 2 ? [...document.querySelectorAll('.tds-attach')].map((e) => e.dataset.status) : []"), (s) => s.length === 2 && s.every((x) => x === "done"), "the big doc to finish", 30000)
    const metas = js<string[]>("return window.__grow.metas")
    check(metas.some((t) => /^[\d.]+ [KM]?B of [\d.]+ [KM]?B$/.test(t)), "the doc showed upload progress as bytes of size: " + JSON.stringify(metas))
    check(/lines?$/.test(metas.at(-1)!), "the progress morphs into the final meta: " + JSON.stringify(metas))
    shot("traygrow-two")
    ab("hover", ".tds-attach[data-kind=image]")
    ab("click", ".tds-attach[data-kind=image] .tds-attach-remove")
    until(() => js<number>("return document.querySelectorAll('.tds-attach').length"), (n) => n === 1, "the removed card to go")
    const widths = [...new Set(js<number[]>("return window.__grow.widths"))]
    check(widths.length >= 3, "removal collapses through intermediate widths, saw " + widths.join(","))
    ab("eval", "window.__growStop = true")
    ab("click", ".tds-attach-remove")
  },
  outbox() {
    const id = fresh()
    ab("set", "offline", "on")
    ab("eval", "window.dispatchEvent(new Event('offline'))")
    try {
      until(() => js<string>("return document.querySelector('.tds-banner')?.dataset.state ?? ''"), (s) => s === "on", "the offline banner")
      say("Sent while offline")
      until(() => js<string[]>("return [...document.querySelectorAll('.tds-caption')].map((e) => e.textContent)"), (c) => c.some((t) => t.includes("back online")), "the offline caption under the queued send")
      ab("eval", "new Promise((done) => { const r = indexedDB.open('tock'); r.onsuccess = () => { const q = r.result.transaction('outbox').objectStore('outbox').getAll(); q.onsuccess = () => { window.__outbox = q.result.length; done(1) } } })")
      check(js<number>("return window.__outbox") === 1, "the offline send waits in the IndexedDB outbox")
      shot("outbox-offline")
    } finally {
      ab("set", "offline", "off")
    }
    until(() => exists(".tds-bubble[data-side='agent']"), Boolean, "the queued send to flush on reconnect and get a reply", 25000)
    const mine = () => js<number>("return [...document.querySelectorAll('.tds-bubble[data-side=me]')].filter((b) => b.textContent.includes('Sent while offline')).length")
    check(mine() === 1, "the flushed send appears once, got " + mine())
    ab("eval", `new Promise((done) => { const r = indexedDB.open('tock'); r.onsuccess = () => { const tx = r.result.transaction('outbox', 'readwrite'); tx.objectStore('outbox').put({ id: 'verify-outbox-' + Date.now(), sessionId: '${id}', text: 'Survived a reload', seq: 1 }, 'verify-outbox-' + Date.now()); tx.oncomplete = () => done(1) } })`)
    settled()
    ab("open", `${BASE}/t/${id}`)
    until(() => js<number>("return [...document.querySelectorAll('.tds-bubble[data-side=me]')].filter((b) => b.textContent.includes('Survived a reload')).length"), (n) => n === 1, "a send left in the outbox to flush after a reload", 20000)
    until(() => js<number>("return document.querySelectorAll('.tds-bubble[data-side=me]').length"), (n) => n === 2, "both sends, each once")
    const outboxSize = () => (ab("eval", "new Promise((done) => { const r = indexedDB.open('tock'); r.onsuccess = () => { const q = r.result.transaction('outbox').objectStore('outbox').getAll(); q.onsuccess = () => { window.__outbox = q.result.length; done(1) } } })"), js<number>("return window.__outbox"))
    until(outboxSize, (n) => n === 0, "the outbox to drain")
    check(mine() === 1, "no duplicate of the first send after the reload")
    shot("outbox-flushed")
  },
  faults() {
    const id = seeded()
    for (const surface of ["transcript", "composer", "sidebar"] as const) {
      ab("eval", `sessionStorage.setItem("tock.fault", "${surface}")`)
      ab("open", `${BASE}/t/${id}`)
      until(() => exists(`.tds-fault[data-surface="${surface}"]`), Boolean, `the ${surface} error state`)
      check(js<string>(`return document.querySelector('.tds-fault[data-surface="${surface}"] .tds-empty-button')?.textContent.trim() ?? ''`) === "Try Again", `the ${surface} error state offers Try again`)
      if (surface !== "sidebar") check(exists(".tds-row"), `the sidebar keeps working while the ${surface} is down`)
      if (surface !== "transcript") check(exists(".tds-bubble"), `the transcript keeps working while the ${surface} is down`)
      shot(`fault-${surface}`)
      ab("click", `.tds-fault[data-surface="${surface}"] .tds-empty-button`)
      until(() => exists(`.tds-fault[data-surface="${surface}"]`), (down) => !down, `Try again to bring the ${surface} back`)
    }
    until(() => exists(".ProseMirror") && exists(".tds-bubble") && exists(".tds-row"), Boolean, "every surface back")
  },
  longchat() {
    seeded()
    ab("eval", "window.__long = null; const t0 = performance.now(); window.__tockSeed(location.pathname.slice(3), 130); requestAnimationFrame(() => requestAnimationFrame(() => { window.__long = { render: Math.round(performance.now() - t0), nodes: document.querySelectorAll('.tds-transcript *').length, bubbles: document.querySelectorAll('.tds-column .tds-bubble').length } }))")
    const m = until(() => js<{ render: number; nodes: number; bubbles: number } | null>("return window.__long"), Boolean, "the long chat to mount")!
    console.log("      longchat: " + JSON.stringify(m))
    check(m.render < 1000, "mounting a 500+ message chat stays under 1000ms of main thread, took " + m.render + "ms")
    check(m.nodes < 4000, "only the newest window is in the DOM, got " + m.nodes + " nodes")
    until(() => js<number>("const s = document.querySelector('.tds-transcript'); return Math.round(s.scrollHeight - s.scrollTop - s.clientHeight)"), (g) => g <= 140, "the long chat to open at the end")
    until(() => js<number>("return document.querySelectorAll('.tds-column .tds-bubble').length"), (n) => n >= 600, "the rest of the chat to mount in idle slices after it opens", 10000)
    check(js<number>("const s = document.querySelector('.tds-transcript'); return Math.round(s.scrollHeight - s.scrollTop - s.clientHeight)") <= 140, "mounting older messages in the background keeps the chat pinned at its end")
    ab("click", "button[aria-label='Search in chat']")
    until(() => js<number>("return document.querySelectorAll('.tds-column .tds-bubble').length"), (n) => n >= 500, "find to mount the whole chat so it can search every message")
    ab("press", "Escape")
    shot("longchat")
    const prod = !js<boolean>("return !!document.querySelector('script[src*=\"@vite/client\"]')")
    if (!prod) console.log("      longchat scroll: dev build, frames logged but not gated (Solid dev attribution inflates mounts ~6x); gate it with a VITE_TOCK_SEED=1 build on TOCK_URL=http://localhost:4173")
    const settled = scrollUp()
    console.log("      longchat scroll, all mounted: " + JSON.stringify(settled))
    check(!prod || settled.long === 0, "scrolling a fully mounted 650-bubble chat from end to top keeps every frame under 50ms: " + JSON.stringify(settled))
    seeded()
    ab("eval", "window.__tockSeed(location.pathname.slice(3), 130)")
    until(() => js<number>("const s = document.querySelector('.tds-transcript'); return document.querySelectorAll('.tds-column .tds-bubble').length >= 60 ? Math.round(s.scrollHeight - s.scrollTop - s.clientHeight) : 9999"), (g) => g <= 140, "the long chat to open at its end")
    const mounting = scrollUp()
    console.log("      longchat scroll, while slices mount: " + JSON.stringify(mounting))
    check(mounting.bubbles >= 600, "scrolling to the top mounts the whole chat, got " + mounting.bubbles + " bubbles")
    check(!prod || mounting.long === 0, "scrolling up right after opening a 650-bubble chat, while older slices still mount, keeps every frame under 50ms: " + JSON.stringify(mounting))
  },
  prefetch() {
    ensureRows(3)
    ab("open", BASE)
    until(liveRows, (n) => n >= 3, "rows")
    const target = js<string>("return [...document.querySelectorAll('.tds-row-wrap:not([data-archived])')][2].dataset.id")
    ab("hover", `.tds-row-wrap[data-id="${target}"] .tds-row`)
    wait(400)
    js<boolean>("window.__nav = { frames: 0, blank: 0, skeleton: 0 }; const end = performance.now() + 1500; const tick = () => { const n = window.__nav; if (location.pathname.startsWith('/t/')) { n.frames++; if (document.querySelector('.tds-transcript [aria-busy=true]')) n.skeleton++; if (!document.querySelector('.tds-column .tds-bubble')) n.blank++ } if (performance.now() < end) requestAnimationFrame(() => setTimeout(tick)) }; requestAnimationFrame(() => setTimeout(tick)); return true")
    ab("click", `.tds-row-wrap[data-id="${target}"] .tds-row`)
    wait(1700)
    const nav = js<{ frames: number; blank: number; skeleton: number }>("return window.__nav")
    check(nav.frames > 0, "the chat never opened")
    check(nav.skeleton === 0 && nav.blank === 0, "a chat prefetched on hover opens with its messages in the first painted frame, no skeleton or blank: " + JSON.stringify(nav))
  },
  thoughts() {
    seeded()
    steady(".tds-act-button")
    ab("click", ".tds-act-button")
    until(() => exists(".tds-worklog .tds-ws[data-kind='thinking']"), Boolean, "a thought row")
    wait(500)
    const label = js<string>("return document.querySelector(\".tds-worklog .tds-ws[data-kind='thinking'] .tds-ws-label\").textContent.trim()")
    check(/^Thought for \d+(\.\d+)?s$/.test(label), "a finished thought reads 'Thought for Ns', got: " + label)
    check(!exists(".tds-worklog .tds-ws[data-kind='thinking'] .tds-ws-slot"), "thought rows carry no icon")
    const timed = js<string[]>("return [...document.querySelectorAll('.tds-worklog .tds-ws[data-kind=thinking]')].map((e) => (e.dataset.ms ?? '') + '|' + e.querySelector('.tds-ws-label').textContent.trim())")
    check(timed.every((t) => /^\d+\|Thought for \d+(\.\d)?s$/.test(t)), "every finished thought shows the server-timed duration: " + timed.join(", "))
    ab("click", ".tds-worklog .tds-ws[data-kind='thinking'] .tds-ws-line")
    until(() => exists(".tds-worklog .tds-ws[data-kind='thinking'][data-open] .tds-ws-thought p"), Boolean, "the thought prose")
    wait(700)
    const look = js<{ bg: string; bubbles: number; rule: string; color: string; muted: string }>("const t = document.querySelector('.tds-worklog .tds-ws-thought'); const probe = document.createElement('span'); probe.style.color = 'var(--tds-text-muted)'; document.body.append(probe); const muted = getComputedStyle(probe).color; probe.remove(); return { bg: getComputedStyle(t).backgroundColor, bubbles: t.querySelectorAll('.tds-bubble, .tds-md-bubble, pre').length, rule: getComputedStyle(t).boxShadow, color: getComputedStyle(t.querySelector('p')).color, muted }")
    check(transparent(look.bg) && look.bubbles === 0, "thoughts render as plain prose with no bubble or container: " + JSON.stringify(look))
    check(look.rule.includes("inset"), "thoughts sit under a thin left rule: " + look.rule)
    check(look.color === look.muted, "thought prose uses the muted text colour: " + look.color + " vs " + look.muted)
    shot("worklog-thought")
    const bg = js<string[]>("const a = getComputedStyle(document.querySelector('.tds-worklog')).backgroundColor; const b = getComputedStyle(document.querySelector('.tds-field')).backgroundColor; return [a, b]")
    check(bg[0] === bg[1], "the work log takes the composer's surface: " + bg.join(" vs "))
    ab("press", "Escape")
  },
  editorboot() {
    ab("eval", "localStorage.setItem('tock:hold-editor', '1')")
    try {
      fresh()
      until(() => exists(".tds-input[data-shell]"), Boolean, "the static composer shell")
      check(!exists(".ProseMirror"), "the editor chunk is held back")
      const box = () => js<number[]>("const f = document.querySelector('.tds-field').getBoundingClientRect(); const i = document.querySelector('.tds-input').getBoundingClientRect(); return [f.x, f.y, f.width, f.height, i.x, i.y, i.width, i.height]")
      const placeholder = () => js<string>("const p = document.querySelector('.tds-input p'); const s = getComputedStyle(p, '::before'); return s.content.replaceAll(String.fromCharCode(34), '') + ' ' + s.color + ' ' + s.fontSize")
      const shellBox = box()
      const shellPlaceholder = placeholder()
      shot("editorboot-shell")
      ab("click", ".tds-input[data-shell]")
      ab("keyboard", "type", "hello world")
      ab("press", "ArrowLeft")
      ab("press", "ArrowLeft")
      check(!exists(".ProseMirror") && !exists(".tds-send[data-empty]"), "typing in the shell arms Send before the editor loads")
      ab("eval", "window.__tockReleaseEditor?.()")
      until(() => exists(".ProseMirror") && !exists(".tds-input[data-shell]"), Boolean, "the editor to take over from the shell")
      check(js<string>("return document.querySelector('.ProseMirror').textContent") === "hello world", "typed text carries over")
      check(js<boolean>("return document.activeElement === document.querySelector('.ProseMirror')"), "focus carries over")
      ab("keyboard", "type", "X")
      check(js<string>("return document.querySelector('.ProseMirror').textContent") === "hello worXld", "the caret carries over")
      ab("press", "Control+a")
      ab("press", "Backspace")
      wait(300)
      const editorBox = box()
      check(JSON.stringify(editorBox) === JSON.stringify(shellBox) && placeholder() === shellPlaceholder, "the shell and the editor are pixel-identical: " + JSON.stringify({ shellBox, editorBox, shellPlaceholder, editor: placeholder() }))
      fresh()
      until(() => exists(".tds-input[data-shell]"), Boolean, "the shell again")
      ab("click", ".tds-input[data-shell]")
      ab("keyboard", "type", "sent before load")
      ab("press", "Enter")
      ab("eval", "window.__tockReleaseEditor?.()")
      until(() => js<string>("return [...document.querySelectorAll('.tds-bubble[data-side=me]')].map((b) => b.textContent).join('|')"), (t) => t.includes("sent before load"), "Enter pressed in the shell to send once the editor loads")
      check(js<string>("return document.querySelector('.ProseMirror').textContent") === "", "the composer clears after the replayed send")
    } finally {
      ab("eval", "localStorage.removeItem('tock:hold-editor')")
    }
  },
  roundtrip() {
    fresh()
    field()
    const html = () => js<string>("return [...document.querySelectorAll('.tds-input *')].map((e) => e.tagName.toLowerCase()).join(' ')")
    const type = (text: string) => ab("keyboard", "type", text)
    const line = () => ab("press", "Shift+Enter")
    type("# Plan")
    until(() => exists(".tds-input h1"), Boolean, "'# ' to make a heading")
    line()
    type("**bold** *soft* ~~gone~~ `code` keep a_b_c and [ ] as typed")
    until(() => exists(".tds-input strong") && exists(".tds-input em") && exists(".tds-input s") && exists(".tds-input code"), Boolean, "inline marks: " + html())
    line()
    type("> quoted")
    until(() => exists(".tds-input blockquote"), Boolean, "'> ' to make a quote")
    line()
    line()
    check(!js<boolean>("return !!getSelection().anchorNode.parentElement.closest('blockquote')"), "Shift+Enter on an empty quote line leaves the quote")
    type("- one")
    until(() => exists(".tds-input ul li"), Boolean, "'- ' to make a list")
    line()
    type("two")
    line()
    line()
    check(js<number>("return document.querySelectorAll('.tds-input ul:not([data-type]) > li').length") === 2, "Shift+Enter on an empty item leaves the list: " + html())
    type("- [ ] ship it")
    until(() => exists(".tds-input ul[data-type='taskList'] li[data-checked]"), Boolean, "'- [ ] ' to make a task: " + html())
    line()
    line()
    type("1. first")
    until(() => exists(".tds-input ol li"), Boolean, "'1. ' to make an ordered list")
    line()
    line()
    type("---")
    until(() => exists(".tds-input hr"), Boolean, "'---' to make a rule")
    type("see [docs](https://example.com) now")
    until(() => js<string>("return document.querySelector('.tds-input a')?.getAttribute('href') ?? ''"), (href) => href === "https://example.com", "[text](url) to make a link: " + html())
    line()
    type("```js")
    ab("press", "Enter")
    until(() => exists(".tds-input pre"), Boolean, "a fence to open a code block on Enter")
    check(!exists(".tds-bubble[data-side='me']"), "Enter on a fence opens the block instead of sending")
    type("let x = 1")
    ab("press", "Enter")
    type("```")
    ab("press", "Enter")
    type("done")
    check(js<boolean>("return !getSelection().anchorNode.parentElement.closest('pre')"), "a closing fence plus Enter leaves the block")
    shot("roundtrip-editor")
    ab("press", "Enter")
    until(() => exists(".tds-bubble[data-side='me'] .tds-bubble-rich"), Boolean, "the sent bubble")
    wait(400)
    const sent = js<Record<string, unknown>>(`const b = [...document.querySelectorAll('.tds-bubble[data-side=me]')].at(-1); const has = (s) => !!b.querySelector(s); return { h1: has('h1, h2, h3, [data-heading]'), strong: has('strong'), em: has('em'), strike: has('del, s'), code: has('code'), quote: has('blockquote'), ul: b.querySelectorAll('ul li').length, task: has('input[type=checkbox], [data-task], .tds-task'), ol: has('ol li, [data-ordered] li'), hr: has('hr'), link: b.querySelector('a[href="https://example.com"], [data-href="https://example.com"]') !== null || b.textContent.includes('docs'), pre: has('pre, .tds-code'), text: b.textContent }`)
    check(String(sent.text).includes("a_b_c") && String(sent.text).includes("[ ] as typed") && !String(sent.text).includes("\\"), "typed markdown characters arrive as typed, unescaped: " + sent.text)
    const missing = ["h1", "strong", "em", "strike", "code", "ol", "link", "pre"].filter((k) => !sent[k])
    if (Number(sent.ul) < 2) missing.push("ul")
    shot("roundtrip-sent")
    check(missing.length === 0, "the bubble renders every format (missing: " + missing.join(", ") + ")")
    const source: Record<string, string> = { quote: "> quoted", hr: "---", task: "[ ] ship it" }
    const unrendered = Object.keys(source).filter((k) => !sent[k])
    check(unrendered.every((k) => String(sent.text).includes(source[k]!)), "a format the bubble cannot render yet still arrives as its markdown source: " + unrendered.join(", "))
    if (unrendered.length) console.log("      note: the bubble does not render " + unrendered.join(", ") + " yet (markdown.tsx); the composer sends them correctly")
  },
  richpaste() {
    fresh()
    field()
    const paste = (plain: string, html = "") => js<boolean>(`const dt = new DataTransfer(); ${html ? `dt.setData('text/html', ${JSON.stringify(html)});` : ""} dt.setData('text/plain', ${JSON.stringify(plain)}); document.querySelector('.ProseMirror').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); return true`)
    const html = () => js<string>("return [...document.querySelectorAll('.tds-input *')].map((e) => e.tagName.toLowerCase()).join(' ')")
    const clear = () => (ab("press", "Control+a"), ab("press", "Backspace"))
    check(!exists(".tds-mic, button[aria-label='Dictate']"), "the unwired Dictate button is hidden")
    paste("## Heading\n\n- [ ] task one\n- [x] task two")
    until(() => exists(".tds-input h2") && js<number>("return document.querySelectorAll('.tds-input li[data-checked]').length") === 2, Boolean, "a markdown paste with a heading and tasks to land: " + html())
    clear()
    paste("snake_case_name and file_name.py")
    until(() => js<string>("return document.querySelector('.tds-input').textContent"), (t) => t.includes("file_name.py"), "the plain paste")
    check(!exists(".tds-input a") && !exists(".tds-input .tds-chip"), "a plain paste of file_name.py stays text: " + html())
    clear()
    paste("a\tb\n1\t2", "<table><thead><tr><th>a</th><th>b</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>")
    until(() => js<string>("return document.querySelector('.tds-input').innerText"), (t) => t.includes("| a | b |") && t.includes("| --- | --- |") && t.includes("| 1 | 2 |"), "an HTML table paste to become GFM: " + html())
    shot("richpaste-table")
    ab("press", "Enter")
    until(() => exists(".tds-bubble[data-side='me']"), Boolean, "the sent table")
    wait(300)
    const table = exists(".tds-bubble[data-side='me'] table")
    check(table || js<string>("return [...document.querySelectorAll('.tds-bubble[data-side=me]')].at(-1).textContent").includes("| 1 | 2 |"), "the sent table arrives as GFM")
    if (!table) console.log("      note: the bubble does not render GFM tables yet (markdown.tsx); the composer sends them correctly")
    field()
    ab("keyboard", "type", "read the docs")
    ab("eval", "(() => { const p = document.querySelector('.tds-input p'); const t = p.firstChild; const r = document.createRange(); r.setStart(t, 9); r.setEnd(t, 13); getSelection().removeAllRanges(); getSelection().addRange(r) })()")
    wait(100)
    ab("press", "Control+k")
    wait(200)
    check(!exists(".tds-palette"), "Mod-K inside the editor does not open the palette")
    until(() => js<string>("return document.querySelector('.tds-input').textContent"), (t) => t === "read the [docs]()", "Mod-K wraps the selection as a link")
    ab("keyboard", "type", "https://example.com")
    ab("press", "End")
    ab("keyboard", "type", " ok")
    until(() => js<string>("return document.querySelector('.tds-input a')?.getAttribute('href') ?? ''"), (href) => href === "https://example.com", "the link to form once the caret leaves: " + html())
    clear()
    ab("keyboard", "type", "abc")
    ab("press", "Shift+Home")
    ab("press", "Control+e")
    until(() => exists(".tds-input code"), Boolean, "Mod-E to make inline code: " + html())
    wait(300)
    check(!js<string>("return [...document.querySelectorAll('.tds-toast-title')].map((e) => e.textContent).join('|')").includes("Archived"), "Mod-E in the editor formats instead of archiving the chat")
    ab("press", "End")
    ab("press", "Control+u")
    ab("keyboard", "type", "x")
    check(!exists(".tds-input u"), "there is no underline")
    clear()
    ab("upload", ".tds-composer-wrap input[type=file]", join(FIXTURES, "verify-notes.md"))
    until(() => js<string[]>("return [...document.querySelectorAll('.tds-attach')].map((e) => e.dataset.status)"), (s) => s.length === 1 && s[0] === "done", "the upload to finish", 15000)
    field()
    ab("keyboard", "type", "notes")
    ab("press", "Enter")
    until(() => exists(".tds-files[data-side='me']"), Boolean, "the sent file")
    field()
    ab("keyboard", "type", "@")
    until(() => exists(".tds-suggest .tds-menu-item"), Boolean, "the @ list")
    const groups = js<string[]>("return [...document.querySelectorAll('.tds-suggest .tds-menu-label')].map((e) => e.textContent)")
    check(groups[0] === "Files" && js<string>("return document.querySelector('.tds-suggest .tds-menu-item .tds-suggest-label').textContent") === "verify-notes.md", "the @ list leads with this chat's files: " + groups.join(", "))
    ab("press", "Enter")
    until(() => exists(".tds-input .tds-chip[data-kind='file']"), Boolean, "a file token")
    shot("richpaste-mention")
    clear()
    ab("keyboard", "type", "/")
    until(() => exists(".tds-suggest[data-kind='command'] .tds-menu-item"), Boolean, "the / list")
    const gap = js<number>("const i = document.querySelector('.tds-suggest .tds-menu-item'); return i.querySelector('.tds-suggest-hint').getBoundingClientRect().left - i.querySelector('.tds-suggest-label').getBoundingClientRect().right")
    check(Math.abs(gap - tokens.space[8]!) < 1 && !exists(".tds-suggest .tds-menu-label"), "a command's description sits inline 8px after it, with no group label (gap " + gap + ")")
    wait(300)
    shot("richpaste-slash")
    ab("press", "Escape")
    clear()
  },
  codeexit() {
    fresh()
    field()
    ab("keyboard", "type", "`abc`")
    until(() => js<string>("return [...document.querySelectorAll('.tds-input code')].map((e) => e.textContent).join('|')"), (t) => t === "abc", "a backtick pair to make inline code")
    for (let i = 0; i < 3; i++) ab("press", "Backspace")
    ab("press", "Control+a")
    ab("press", "Backspace")
    ab("press", "Control+e")
    ab("keyboard", "type", "abc")
    for (let i = 0; i < 3; i++) ab("press", "Backspace")
    ab("keyboard", "type", "xyz")
    const codes = () => js<string>("return [...document.querySelectorAll('.tds-input code')].map((e) => e.textContent).join('|')")
    check(!codes().includes("xyz"), "after clearing the code text, typing is plain again (code: " + codes() + ")")
    check(js<string>("return document.querySelector('.ProseMirror').textContent").includes("xyz"), "the typed text is there")
    ab("press", "Control+a")
    ab("press", "Backspace")
    ab("press", "Control+e")
    ab("keyboard", "type", "in")
    ab("keyboard", "type", "`")
    ab("keyboard", "type", "out")
    check(codes() === "in", "a backtick typed inside code steps out of it (code: " + codes() + ")")
    check(js<string>("return document.querySelector('.ProseMirror').textContent") === "inout", "the exiting backtick is not inserted")
    ab("press", "Control+a")
    ab("press", "Backspace")
    ab("keyboard", "type", "`end`")
    until(codes, (t) => t === "end", "inline code again")
    ab("press", "ArrowLeft")
    ab("press", "ArrowRight")
    ab("press", "ArrowRight")
    ab("keyboard", "type", "after")
    check(codes() === "end", "ArrowRight at the end of code exits it (code: " + codes() + ")")
    ab("press", "Control+a")
    ab("keyboard", "type", "fresh")
    check(codes() === "" && js<string>("return document.querySelector('.ProseMirror').textContent") === "fresh", "typing over a selection that starts with code is plain text (code: " + codes() + ")")
    shot("codeexit")
    ab("press", "Control+a")
    ab("press", "Backspace")
  },
  trayopen() {
    fresh()
    const work = join(homedir(), ".capy/work")
    writeFileSync(join(work, "verify-notes.md"), "# Notes\n\nA small markdown file for the tray lightbox.\n")
    ab("upload", ".tds-composer-wrap input[type=file]", png(join(work, "verify-tray-open.png"), 320, 240, [80, 190, 170]), join(work, "verify-notes.md"))
    until(() => js<string[]>("return [...document.querySelectorAll('.tds-attach')].map((e) => e.dataset.status)"), (s) => s.length === 2 && s.every((x) => x === "done"), "both uploads")
    check(js<string>("return document.querySelector('.tds-attach[data-kind=doc] .tds-attach-open').getAttribute('aria-label')") === "Open verify-notes.md", "the card is a labelled button")
    ab("focus", ".tds-attach[data-kind=doc] .tds-attach-open")
    check(js<string>("return getComputedStyle(document.activeElement).outlineStyle") !== "none", "the focused card shows a focus ring")
    ab("press", "Enter")
    until(() => exists(".tds-lightbox[data-ready] :is(.tds-lightbox-doc pre, .tds-lightbox-md)"), Boolean, "Enter on an unsent doc card to open it in the lightbox")
    wait(300)
    shot("trayopen-doc")
    ab("press", "Escape")
    until(() => exists(".tds-lightbox"), (open) => !open, "Escape to close")
    check(js<boolean>("return document.activeElement === document.querySelector('.tds-attach[data-kind=doc] .tds-attach-open')"), "focus returns to the card it opened from")
    ab("focus", ".tds-attach[data-kind=image] .tds-attach-open")
    ab("press", "Space")
    until(() => exists(".tds-lightbox[data-ready]"), Boolean, "Space on an image card to open it")
    ab("press", "Escape")
    until(() => exists(".tds-lightbox"), (open) => !open, "Escape to close")
    js<boolean>("document.querySelectorAll('.tds-attach-remove').forEach((b) => b.click()); return true")
  },
  skeleton() {
    const id = seeded()
    const probe = join(FIXTURES, "verify-slow.js")
    writeFileSync(probe, SLOW_PROBE)
    ab("close")
    ab("open", `${BASE}/brand/toast-mascot-36.svg`, "--init-script", probe, "--args", "--no-sandbox")
    unlock()
    ab("set", "viewport", "1440", "900")
    type Box = { x: number; y: number; w: number; h: number }
    const pass = (forget: string) => {
      js<boolean>(`indexedDB.databases().then((all) => all.forEach((d) => indexedDB.deleteDatabase(d.name))); ${forget}; return true`)
      ab("open", `${BASE}/t/${id}?slow=${tokens.motion.duration.panel * 5}`)
      until(() => js<number>("return window.__skel?.busyFrames ?? 0"), (n) => n > 0, "a skeleton on the first frames")
      until(() => exists(".tds-bubble[data-side='agent']") && js<boolean>("return !document.querySelector(\"[aria-busy='true']\")"), Boolean, "the chat to load over its skeleton", 12000)
      wait(tokens.motion.duration.panel * 2)
      const probed = js<{ skel: Record<string, Box>; last: Record<string, Box> }>("return window.__skel")
      return Object.fromEntries(Object.entries(probed.last).filter(([name]) => probed.skel[name]).map(([name, box]) => [name, Math.max(...(["x", "y", "w", "h"] as const).map((m) => Math.abs(box[m] - probed.skel[name]![m])))]))
    }
    const cold = pass("localStorage.clear()")
    const coldKeys = exists(".tds-pin") ? ["column", "composer"] : ["row", "column", "composer"]
    for (const name of coldKeys) check(cold[name] !== undefined && cold[name]! < 1, `first visit: ${name} moved ${cold[name]}px from its skeleton (sample rows and column must sit where loaded ones do) ${JSON.stringify(cold)}`)
    const warm = pass("0")
    shot("skeleton")
    for (const name of ["row", "me", "act", "pill", "title", "column", "composer"]) check(warm[name] !== undefined && warm[name]! < 1, `reload: ${name} moved ${warm[name]}px between first paint and loaded data ${JSON.stringify(warm)}`)
    ab("close")
    ab("open", BASE, "--args", "--no-sandbox")
    unlock()

    ab("set", "viewport", "1440", "900")
  },
  heic() {
    fresh()
    const heic = join(FIXTURES, "sample.heic")
    check(existsSync(heic), "needs ~/.capy/work/sample.heic (any HEIC photo, e.g. libheif examples/example.heic)")
    js<boolean>("window.__heic = []; new MutationObserver(() => { const c = document.querySelector('.tds-attach'); const t = c?.querySelector('.tds-attach-line') ? (() => { const m = c.querySelector('.tds-attach-line').cloneNode(true); m.querySelectorAll('[aria-hidden=true]').forEach((x) => x.remove()); return m.textContent.trim() })() : c?.dataset.kind ?? ''; if (t && window.__heic.at(-1) !== t) window.__heic.push(t) }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true }); return true")
    ab("upload", ".tds-composer-wrap input[type=file]", heic)
    until(() => js<string>("return document.querySelector('.tds-attach')?.dataset.status ?? ''"), (s) => s === "done", "the HEIC photo to convert and upload", 30000)
    const seen = js<string[]>("return window.__heic")
    check(seen.includes("Converting to JPEG"), "the card shows the converting state first: " + JSON.stringify(seen))
    check(js<string>("return document.querySelector('.tds-attach')?.dataset.kind ?? ''") === "image", "the converted photo shows as a picture")
    check(js<boolean>("const i = document.querySelector('.tds-attach img'); return !!i && i.complete && i.naturalWidth > 0"), "the converted preview decodes")
    check(/sample\.jpg$/.test(js<string>("return document.querySelector('.tds-attach .tds-attach-open').getAttribute('aria-label') ?? ''")), "the file is renamed to .jpg")
    shot("heic")
    js<boolean>("document.querySelectorAll('.tds-attach-remove').forEach((b) => b.click()); return true")
  },
  pdf() {
    fresh()
    const pdf = join(FIXTURES, "verify-pages.pdf")
    check(existsSync(pdf), "needs ~/.capy/work/verify-pages.pdf (two pages)")
    ab("upload", ".tds-composer-wrap input[type=file]", pdf)
    until(() => js<string>("return document.querySelector('.tds-attach')?.dataset.status ?? ''"), (s) => s === "done", "the PDF to upload")
    check(/2 pages$/.test(js<string>("return document.querySelector('.tds-attach-line')?.textContent ?? ''")), "the tray card counts the pages")
    say("Here is the PDF")
    until(() => js<boolean>("const i = document.querySelector(\".tds-files[data-side='me'] .tds-doc-glyph[data-thumb] img\"); return !!i && i.complete && i.naturalWidth > 0"), Boolean, "the doc card to show the first page as its thumbnail", 15000)
    wait(300)
    shot("pdf-card")
    ab("click", ".tds-files[data-side='me'] .tds-doc")
    until(() => js<number>("return document.querySelectorAll('.tds-lightbox-pdf canvas.tds-lightbox-page').length"), (n) => n === 2, "the lightbox to draw both pages", 15000)
    until(() => js<string>("return document.querySelector('.tds-lightbox-bar em')?.textContent ?? ''"), (t) => t.includes("2 pages"), "the bar to say 2 pages")
    wait(300)
    shot("pdf-lightbox")
    ab("press", "Escape")
    until(() => exists(".tds-lightbox"), (open) => !open, "Escape to close")
  },
  hoverread() {
    ensureRows(2)
    ab("open", BASE)
    until(liveRows, (n) => n >= 2, "rows")
    const target = js<string>("return document.querySelector('.tds-row-wrap:not([data-archived])').dataset.id")
    if (!unreadRow(target)) {
      openRow()
      check(js<boolean>("const e = [...document.querySelectorAll('.tds-menu-item')].find((el) => /^Mark as unread/i.test(el.textContent.trim())); e?.click(); return !!e"), "no Mark as unread item")
      until(() => unreadRow(target), Boolean, "the row to read as unread")
    }
    ab("mouse", "move", "900", "450")
    tapSocket()
    ab("hover", `.tds-row-wrap[data-id="${target}"] .tds-row`)
    wait(600)
    ab("mouse", "move", "900", "450")
    wait(400)
    check(framesOf("chat.subscribe") === 0, "hover intent prefetches without subscribing")
    check(framesOf("thread.update") === 0, "hover intent never marks the chat read")
    ab("open", BASE)
    until(liveRows, (n) => n >= 2, "rows after reload")
    check(unreadRow(target), "the chat is still unread after hovering it and reloading")
    shot("hoverread")
    ab("click", `.tds-row-wrap[data-id="${target}"] .tds-row`)
    until(() => unreadRow(target), (unread) => !unread, "opening the chat to mark it read")
  },
  subscriptions() {
    ensureRows(4)
    const id = seeded()
    tapSocket()
    const others = js<string[]>(`return [...document.querySelectorAll('.tds-row-wrap:not([data-archived])')].map((e) => e.dataset.id).filter((x) => x !== "${id}").slice(0, 3)`)
    for (const other of others) {
      ab("hover", `.tds-row-wrap[data-id="${other}"] .tds-row`)
      wait(300)
    }
    ab("mouse", "move", "900", "450")
    check(framesOf("chat.subscribe") === 0, "hovering other rows leaves the open chat as the one this socket streams")
    ab("set", "offline", "on")
    ab("eval", "window.dispatchEvent(new Event('offline'))")
    try {
      until(bannerText, (t) => t.includes("offline"), "the offline banner")
    } finally {
      ab("set", "offline", "off")
    }
    until(() => js<string>("return document.querySelector('.tds-banner')?.dataset.state ?? ''"), (s) => s === "ok", "back online", 15000)
    until(() => framesOf("chat.subscribe"), (n) => n >= 1, "the open chat to resubscribe")
    wait(800)
    check(framesOf("chat.subscribe") === 1, "a reconnect resubscribes only the open chat, got " + framesOf("chat.subscribe"))
    check(js<string>(`return JSON.parse(window.__frames.find((f) => f.includes('"type":"chat.subscribe"'))).sessionId`) === id, "the resubscribed chat is the open one")
    ab("eval", "new Promise((done) => { const r = indexedDB.open('tock'); r.onsuccess = () => { const q = r.result.transaction('threads').objectStore('threads').getAllKeys(); q.onsuccess = () => { window.__keys = q.result; done(1) } } })")
    const keys = js<string[]>("return window.__keys")
    check(keys.includes(id), "the open chat's transcript is cached under its chat id: " + JSON.stringify(keys.slice(0, 5)))
    check(keys.every((key) => /^[0-9a-f-]{36}$/.test(key)), "every cached transcript is keyed by chat id: " + JSON.stringify(keys.slice(0, 5)))
  },
  halfopen() {
    seeded()
    tapSocket()
    ab("eval", "document.dispatchEvent(new Event('visibilitychange')); true")
    until(() => js<boolean>("return !!window.__ws"), Boolean, "a heartbeat ping on the live socket")
    wait(400)
    ab("eval", "window.__ws.dispatchEvent(new MessageEvent('message', { data: '{not json' })); true")
    ab("eval", "window.__drop = true; document.dispatchEvent(new Event('visibilitychange')); true")
    const text = until(bannerText, (t) => t !== "", "a silent socket to be caught by the missed pong", 12000)
    check(text.includes("Reconnecting"), "a dropped socket on a live network says Reconnecting…, got " + text)
    shot("halfopen-reconnecting")
    ab("eval", "window.__drop = false; true")
    until(() => js<string>("return document.querySelector('.tds-banner')?.dataset.state ?? ''"), (s) => s === "ok", "the socket to come back", 15000)
    say("Still here after a half-open socket")
    until(() => js<number>("return document.querySelectorAll('.tds-bubble[data-side=agent]').length"), (n) => n >= 2, "a reply over the new socket", 20000)
  },
  offlinereload() {
    const id = seeded()
    const prod = js<boolean>("return !document.querySelector('script[src*=\"/@vite/client\"]')")
    if (!prod) return console.log("      offlinereload: skipped, the service worker only registers in a production build (TOCK_URL at vite preview or a deploy)")
    until(() => js<boolean>("return !!navigator.serviceWorker?.controller"), Boolean, "the service worker to control the page", 15000)
    ab("eval", "caches.keys().then((names) => Promise.all(names.map((n) => caches.open(n).then((c) => c.keys())))).then((all) => { window.__cached = all.flat().map((r) => new URL(r.url).pathname) })")
    until(() => js<string[] | null>("return window.__cached ?? null"), (paths) => !!paths && paths.includes("/") && paths.some((p) => p.startsWith("/assets/")), "the shell and its assets in the cache")
    check(!js<string[]>("return window.__cached").some((p) => /^\/(api|ws|mcp)(\/|$)/.test(p)), "nothing under /api, /ws or /mcp is cached")
    ab("set", "offline", "on")
    try {
      ab("open", `${BASE}/t/${id}`)
      until(() => exists(".tds-sidebar") && exists(".ProseMirror"), Boolean, "the app shell to load while offline", 12000)
      until(() => exists(".tds-bubble[data-side='me']"), Boolean, "the cached transcript while offline")
      until(() => js<string>("return document.querySelector('.tds-banner')?.dataset.state ?? ''"), (s) => s === "on", "the offline banner")
      shot("offlinereload")
    } finally {
      ab("set", "offline", "off")
    }
    until(() => js<string>("return document.querySelector('.tds-banner')?.dataset.state ?? ''"), (s) => s === "ok", "back online", 15000)
  },
  swdeploy() {
    const prod = js<boolean>("return !document.querySelector('script[src*=\"/@vite/client\"]')")
    if (!prod) return console.log("      swdeploy: skipped, needs a production build (vite preview on TOCK_URL, TOCK_DIST pointing at its dist)")
    const dist = process.env.TOCK_DIST ?? join(import.meta.dir, "../apps/web/dist")
    const files = { index: join(dist, "index.html"), sw: join(dist, "sw.js") }
    const a = { index: readFileSync(files.index, "utf8"), sw: readFileSync(files.sw, "utf8") }
    ab("open", BASE)
    until(() => js<boolean>("return !!navigator.serviceWorker?.controller"), Boolean, "the service worker to control build A", 15000)
    check(!exists('meta[name="tock-build"]'), "build A has no marker")
    try {
      writeFileSync(files.index, a.index.replace("<head>", '<head><meta name="tock-build" content="B">'))
      writeFileSync(files.sw, `${a.sw}\n// build B\n`)
      ab("eval", "window.__stay = 1")
      ab("click", "button[aria-label='New chat']")
      until(() => exists(".ProseMirror"), Boolean, "the composer")
      field()
      ab("keyboard", "type", "draft in progress")
      ab("eval", "navigator.serviceWorker.getRegistration().then((r) => r && r.update())")
      until(() => js<boolean>("return document.documentElement.hasAttribute('data-update-waiting')"), Boolean, "build B's worker to take over", 15000)
      wait(1500)
      check(js<number>("return window.__stay ?? 0") === 1, "a tab with a draft is never reloaded under you")
      check(!exists('meta[name="tock-build"]'), "the open tab keeps running build A until it reloads")
      ab("eval", "document.querySelector('.ProseMirror').innerHTML = ''")
      ab("open", BASE)
      until(() => js<string>("return document.querySelector('meta[name=\"tock-build\"]')?.getAttribute('content') ?? ''"), (v) => v === "B", "a reload to load build B's index, not the cached one")
      until(() => exists(".tds-sidebar"), Boolean, "the app to boot on build B")
    } finally {
      writeFileSync(files.index, a.index)
      writeFileSync(files.sw, a.sw)
    }
  },
  async jank() {
    ensureRows(6)
    ab("open", BASE)
    until(liveRows, (n) => n >= 6, "rows")
    const cdp = await cdpPage()
    const rows: JankRow[] = []
    const center = (sel: string) => {
      const r = rect(sel)
      check(r, "nothing at " + sel)
      return [String(Math.round(r.x + r.w / 2)), String(Math.round(r.y + r.h / 2))] as const
    }
    const tap = (sel: string) => (ab("mouse", "move", ...center(sel)), ab("mouse", "down"), ab("mouse", "up"))
    const drag = (from: readonly [number, number], to: readonly [number, number], steps = 8) => {
      ab("mouse", "move", String(from[0]), String(from[1]))
      ab("mouse", "down")
      for (let k = 1; k <= steps; k++) (ab("mouse", "move", String(Math.round(from[0] + ((to[0] - from[0]) * k) / steps)), String(Math.round(from[1] + ((to[1] - from[1]) * k) / steps))), wait(16))
      ab("mouse", "up")
    }
    const probe = async (name: string, act: () => void, ms = 700) => {
      wait(300)
      ab("eval", "(() => { const dts = []; const all = []; let last = 0, input = 0, skip = 0, on = true; const mark = () => (input = performance.now()); for (const type of ['pointerdown', 'pointerup', 'keydown']) addEventListener(type, mark, { capture: true, passive: true }); window.__jank = () => { on = false; for (const type of ['pointerdown', 'pointerup', 'keydown']) removeEventListener(type, mark, { capture: true }); return [dts, all] }; const tick = (t) => { if (last) { all.push(t - last); if (input > last) skip = 3; if (skip > 0) skip--; else dts.push(t - last) } last = t; if (on) requestAnimationFrame(tick) }; requestAnimationFrame(tick) })()")
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
      const events = await cdp.trace(() => (act(), wait(ms)))
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
      const [animated, all] = js<[number[], number[]]>("return window.__jank()")
      rows.push({ ...jankOf(name, events, animated), mount: Math.round(Math.max(0, ...all)) })
    }
    try {
      ab("mouse", "move", "5", "5")
      const list = js<{ x: number; y: number }[]>("return [...document.querySelectorAll('.tds-row-wrap:not([data-archived]) .tds-row')].slice(0, 6).map((e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) } })")
      await probe("hover glide", () => {
        for (const p of [...list, ...[...list].reverse()]) (ab("mouse", "move", String(p.x), String(p.y), "--steps", "4"), wait(60))
        ab("mouse", "move", "900", "450")
      })
      ab("mouse", "move", "5", "5")
      await probe("peek", () => (ab("mouse", "move", String(list[1]!.x - 40), String(list[1]!.y)), wait(1100), ab("mouse", "move", "900", "450")), 900)
      await probe("palette", () => (ab("press", "Control+k"), wait(600), ab("press", "Escape")))
      ab("mouse", "move", String(list[0]!.x), String(list[0]!.y))
      wait(300)
      const more = center(".tds-row-wrap:not([data-archived]) .tds-row-more")
      await probe("menu", () => (ab("mouse", "move", ...more), ab("mouse", "down"), ab("mouse", "up"), wait(600), ab("press", "Escape")))
      ab("mouse", "move", "900", "450")
      ab("eval", "document.activeElement?.blur()")
      await probe("dialog", () => (ab("press", "?"), wait(600), ab("press", "Escape")))
      const bell = center(".tds-rail-button[data-bell]")
      await probe("centre", () => (ab("mouse", "move", ...bell), ab("mouse", "down"), ab("mouse", "up"), wait(700), drag([300, 420], [180, 420]), wait(600), drag([300, 420], [40, 420])), 900)
      ab("mouse", "move", "5", "5")
      wait(300)
      const swipeAt = rect(".tds-row-wrap:not([data-archived])")!
      const sy = Math.round(swipeAt.y + swipeAt.h / 2)
      await probe("row swipe", () => (drag([swipeAt.x + swipeAt.w - 60, sy], [swipeAt.x + swipeAt.w - 160, sy], 6), wait(500), ab("mouse", "move", String(swipeAt.x + 60), String(sy)), ab("mouse", "down"), ab("mouse", "up")))
      ab("mouse", "move", "900", "450")
      fresh()
      ab("click", ".ProseMirror")
      ab("keyboard", "type", WEATHER)
      await probe("streaming", () => (ab("press", "Enter"), wait(400)), 2500)
      settled()
      until(() => exists(".tds-act-button"), Boolean, "a work log", 10000)
      steady(".tds-act-button")
      await probe("work log", () => {
        tap(".tds-act-button")
        wait(800)
        const line = rect(".tds-worklog .tds-ws-line:not(:disabled)")
        if (line) (ab("mouse", "move", String(line.x + 40), String(line.y + line.h / 2)), ab("mouse", "down"), ab("mouse", "up"), wait(700), ab("mouse", "down"), ab("mouse", "up"), wait(700))
        ab("press", "Escape")
      })
      ab("mouse", "move", ...center(".tds-field"))
      wait(300)
      await probe("composer sheet", () => (tap(".tds-sheet-grip"), wait(900), ab("press", "Escape")), 900)
      const seed = js<boolean>("return typeof window.__tockSeed === 'function'")
      if (seed) {
        ab("eval", "window.__tockSeed(location.pathname.slice(3), 60)")
        until(() => js<number>("return document.querySelectorAll('.tds-column .tds-bubble').length"), (n) => n >= 100, "a long chat")
        wait(1500)
        ab("mouse", "move", "900", "400")
        await probe("transcript scroll", () => {
          for (let i = 0; i < 24; i++) (ab("mouse", "wheel", "-120"), wait(30))
          for (let i = 0; i < 12; i++) (ab("mouse", "wheel", "240"), wait(30))
        })
      } else console.log("      jank: transcript scroll skipped (build with VITE_TOCK_SEED=1 for the long chat)")
      reset()
      ab("mouse", "move", String(list[0]!.x), String(list[0]!.y))
      wait(300)
      await probe("toast", () => {
        ab("mouse", "move", ...center(".tds-row-wrap:not([data-archived]) .tds-row-more"))
        ab("mouse", "down")
        ab("mouse", "up")
        wait(300)
        choose("Copy Link")
      }, 1200)
      const work = join(homedir(), ".capy/work")
      ab("click", "button[aria-label='New chat']")
      until(() => exists(".tds-composer-wrap input[type=file]"), Boolean, "the composer")
      ab("upload", ".tds-composer-wrap input[type=file]", png(join(work, "verify-rose.png"), 640, 420, [229, 143, 180]), png(join(work, "verify-teal.png"), 420, 640, [80, 190, 170]))
      until(() => js<string[]>("return [...document.querySelectorAll('.tds-attach')].map((e) => e.dataset.status)"), (s) => s.length === 2 && s.every((x) => x === "done"), "uploads", 15000)
      ab("click", ".ProseMirror")
      ab("keyboard", "type", "Two pictures")
      ab("press", "Enter")
      until(() => js<boolean>("const imgs = [...document.querySelectorAll('.tds-media .tds-media-tile img')]; return imgs.length === 2 && imgs.every((i) => i.complete && i.naturalWidth > 0)"), Boolean, "the images")
      settled()
      wait(800)
      await probe("lightbox", () => (tap(".tds-media .tds-media-tile:nth-child(1)"), wait(900), ab("press", "Escape")), 900)
    } finally {
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 }).catch(() => {})
      cdp.close()
    }
    const cols = ["name", "frames", "dropped", "worst", "p95", "mount", "long", "forced", "forcedAtInput", "vendor", "paint"] as const
    console.log("      " + cols.join("\t"))
    for (const r of rows) console.log("      " + cols.map((c) => r[c]).join("\t") + (r.culprits.length ? "\t" + r.culprits.join(" ") : ""))
    writeFileSync(join(OUT, "jank.json"), JSON.stringify(rows, null, 1))
    if (process.env.JANK_OUT) writeFileSync(process.env.JANK_OUT, JSON.stringify(rows, null, 1))
    const over = rows.filter((r) => r.worst > JANK_FRAME_MS || r.p95 > JANK_P95_MS || r.forced > 0)
    for (const r of over.filter((r) => JANK_KNOWN[r.name])) console.log("      known: " + r.name + " — " + JANK_KNOWN[r.name])
    if (process.env.JANK_SOFT) return
    check(over.every((r) => JANK_KNOWN[r.name]), "over the jank budget: " + over.filter((r) => !JANK_KNOWN[r.name]).map((r) => r.name + " (worst animated frame " + r.worst + "ms, " + r.forced + " forced layouts" + (r.culprits.length ? ": " + r.culprits.join(" ") : "") + ")").join("; "))
  },
  oddfiles() {
    fresh()
    const dir = join(FIXTURES, "odd")
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, "noext"), "plain text\n")
    writeFileSync(join(dir, "empty.txt"), "")
    writeFileSync(join(dir, "three.md"), "one\ntwo\nthree\n")
    writeFileSync(join(dir, "Package.swift"), "let a = 1\n")
    ab("upload", ".tds-composer-wrap input[type=file]", join(dir, "noext"), join(dir, "empty.txt"), join(dir, "three.md"), join(dir, "Package.swift"))
    until(() => js<string[]>("return [...document.querySelectorAll('.tds-attach')].map((e) => e.dataset.status)"), (s) => s.length === 3 && s.every((x) => x === "done"), "three readable files")
    const toasts = () => js<string>("return [...document.querySelectorAll('.tds-toast-title')].map((e) => e.textContent).join('|')")
    until(toasts, (t) => t.includes("can’t tell what noext is"), "a file without an extension to be refused by name, not as .file")
    const line = (name: string) => js<string>(`const c = [...document.querySelectorAll('.tds-attach')].find((e) => e.querySelector('.tds-attach-open')?.getAttribute('aria-label') === 'Open ${name}'); const m = c?.querySelector('.tds-attach-line')?.cloneNode(true); m?.querySelectorAll('[aria-hidden=true]').forEach((x) => x.remove()); return m?.textContent.trim() ?? ''`)
    check(line("empty.txt") === "Empty", "an empty file reads Empty, got " + line("empty.txt"))
    check(/· 3 lines$/.test(line("three.md")), "a trailing newline does not count as a line, got " + line("three.md"))
    check(js<string>("return [...document.querySelectorAll('.tds-sq-pill')].map((e) => e.textContent).join('|')").includes("SWIFT"), "a five-letter extension keeps its type pill")
    js<boolean>("document.querySelectorAll('.tds-attach-remove').forEach((b) => b.click()); return true")
  },
  diagnostics() {
    const logs = ab("console")
    const bad = logs.split("\n").filter((line) => /REACTIVITY|STRICT_READ|UNSTABLE_LIST|CLEANUP_IN|\[error\]/.test(line) && !line.includes("tock.fault"))
    check(bad.length === 0, `console diagnostics:\n${bad.slice(0, 5).join("\n")}`)
    const errors = ab("errors").split("\n").filter((line) => !line.includes("tock.fault")).join("\n")
    check(!/Error/.test(errors), `page errors:\n${errors.slice(0, 600)}`)
  },
}

const order = ["doctor", "shell", "resize", "send", "code", "divider", "worklog", "menu", "typography", "pin", "swipe", "swipeintent", "multiselect", "peek", "peekcontinuous", "snooze", "move", "stack", "stackscroll", "pinactive", "rename", "dialog", "shortcuts", "hotkeys", "palette", "notifications", "sheet", "plus", "attach", "lightbox", "finished", "links", "mention", "command", "toasts", "expand", "stopped", "empty", "header", "headerglyph", "headerstatus", "offline", "toaststack", "morph", "fluid", "ask", "needsrow", "question", "numbered", "multiquestion", "retry", "composer", "writesheet", "tokens", "longpaste", "lifecycle", "tray", "dropzone", "queued", "queuestop", "askqueued", "enterstop", "baseline", "scroll", "rich", "fence", "mdpreview", "clamp", "anchor", "flip", "files", "peekbridge", "trackpad", "rowmorph", "pingrid", "mobile", "ui", "motion", "type", "a11y", "smooth", "calmtext", "steps", "longrun", "growopen", "trayfit", "traygrow", "outbox", "faults", "longchat", "jumppill", "newdivider", "revealstable", "prefetch", "thoughts", "codeexit", "roundtrip", "richpaste", "editorboot", "trayopen", "edges", "skeleton", "markdown", "keys", "hoverread", "subscriptions", "halfopen", "swdeploy", "jank", "oddfiles", "diagnostics"]
/**
 * Journeys that drive a dev-only hook (a /src import, the /__motion route, sessionStorage fault or seed switches) or
 * that need a production build (the service worker). They are skipped by name, explicitly, wherever they can't run.
 */
const requires: Record<string, { mode: "dev" | "build" | "preview"; why: string }> = {
  newdivider: { mode: "dev", why: "imports /src/chat/items.ts to build its fixtures" },
  faults: { mode: "dev", why: "uses the dev-only sessionStorage tock.fault switch" },
  longchat: { mode: "dev", why: "seeds 650 bubbles with the dev-only window.__tockSeed" },
  offlinereload: { mode: "build", why: "the service worker registers only in a production build" },
  swdeploy: { mode: "preview", why: "swaps the files of a local production build (vite preview + TOCK_DIST), so it cannot run against a deploy" },
  jank: { mode: "build", why: "the dev build runs Solid's dev-only performance track, which inflates every frame" },
}
let devCache: boolean | undefined
function devServer(): boolean {
  devCache ??= js<boolean>("return !!document.querySelector('script[src*=\"/@vite/client\"]')")
  return devCache
}
const picked = process.argv.slice(2)
const run = picked.length ? ["doctor", ...picked.filter((name) => name !== "doctor")] : order
let failed = 0
for (const name of run) {
  const journey = journeys[name]
  if (!journey) throw new Error(`unknown journey ${name}; known: ${order.join(", ")}`)
  const started = Date.now()
  const need = requires[name]
  const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(BASE)
  const runs = !need || (need.mode === "dev" ? devServer() : need.mode === "build" ? !devServer() : !devServer() && local)
  if (!runs) {
    const label = need.mode === "dev" ? "dev server only" : need.mode === "build" ? "production build only" : "local vite preview only"
    console.log(`skip  ${name.padEnd(12)} ${label}: ${need.why}`)
    continue
  }
  try {
    if (name !== "doctor" && name !== "diagnostics") reset()
    await journey()
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
