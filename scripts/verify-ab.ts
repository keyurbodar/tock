#!/usr/bin/env bun
/**
 * Fast agent-browser verification suite for the Tock UI/UX/motion overhaul.
 * Usage: bun scripts/verify-ab.ts [url]
 * Starts a local Vite preview server automatically if no URL is passed.
 */
import { spawn } from "node:child_process"
import { mkdirSync } from "node:fs"
import { join } from "node:path"

const OUT = join(import.meta.dir, "../.verify-shots")
mkdirSync(OUT, { recursive: true })

function ab(...args: string[]) {
  const res = Bun.spawnSync(["agent-browser", "--executable-path", "/usr/bin/chromium", "--ignore-https-errors", ...args], {
    env: { ...process.env, AGENT_BROWSER_EXECUTABLE_PATH: "/usr/bin/chromium" },
  })
  const out = res.stdout.toString().trim()
  const err = res.stderr.toString().trim()
  if (res.exitCode !== 0) throw new Error(`agent-browser ${args.join(" ")} failed (${res.exitCode}): ${err || out}`)
  return out
}

function evalJs<T = unknown>(code: string): T {
  const raw = ab("eval", code)
  try {
    const first = JSON.parse(raw)
    if (typeof first === "string") {
      try {
        return JSON.parse(first) as T
      } catch {
        return first as T
      }
    }
    return first as T
  } catch {
    return raw as T
  }
}

let server: ReturnType<typeof spawn> | undefined
const targetUrl = process.argv[2] ?? "http://localhost:4173"

async function waitUp(url: string, ms = 10000) {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {}
    await Bun.sleep(150)
  }
  throw new Error(`Timed out waiting for ${url}`)
}

try {
  if (!process.argv[2]) {
    server = spawn("bun", ["--bun", "./node_modules/.bin/vite", "preview", "--host", "127.0.0.1", "--port", "4173", "--strictPort"], {
      cwd: join(import.meta.dir, "../apps/web"),
      stdio: "ignore",
    })
    await waitUp(targetUrl)
  }

  console.log(`Verifying ${targetUrl} with agent-browser...`)
  ab("set", "viewport", "1440", "900")
  ab("open", targetUrl)
  await Bun.sleep(1200)

  const errors = ab("errors")
  console.log("Page errors:", errors || "none")

  const audit = evalJs<Record<string, unknown>>(`(() => {
    const html = getComputedStyle(document.documentElement);
    const swipeNodes = document.querySelectorAll('.tds-swipe, .tds-swipe-side').length;
    const filterBtn = document.querySelector('button[aria-label*="Filter channels"], button[aria-label*="filter"]');
    const tockIcons = document.querySelectorAll('tock-icon').length;
    const tockSvgs = document.querySelectorAll('tock-icon svg').length;
    const canvases = [...document.querySelectorAll('.tds-grid canvas')].map(c => ({ w: c.width, h: c.height }));
    return JSON.stringify({
      fontFamily: html.fontFamily,
      smoothing: html.getPropertyValue('-webkit-font-smoothing'),
      swipeNodes,
      hasFilterBtn: !!filterBtn,
      filterAriaLabel: filterBtn?.getAttribute('aria-label') ?? null,
      tockIcons,
      tockSvgs,
      canvases,
      title: document.title,
      url: location.href,
    });
  })()`)
  console.log("DOM Audit:", JSON.stringify(audit, null, 2))

  ab("screenshot", join(OUT, "01-home.png"))

  // Test filter button opens channel filter bar (not archived!)
  if (audit.hasFilterBtn) {
    ab("click", 'button[aria-label="Filter channels"]')
    await Bun.sleep(250)
    const filterCheck = evalJs<{ open: boolean; pills: string[] }>(`(() => {
      const box = document.querySelector('.tds-ch-filter');
      const pills = [...document.querySelectorAll('.tds-ch-filter-pill')].map(p => p.textContent?.trim() ?? '');
      return JSON.stringify({ open: !!box, pills });
    })()`)
    console.log("Filter bar check:", JSON.stringify(filterCheck))
    ab("screenshot", join(OUT, "02-filter-open.png"))
    ab("press", "Escape")
    await Bun.sleep(150)
  }

  // Test command palette opens with backdrop blur scrim
  ab("click", 'button[aria-label="Search"]')
  await Bun.sleep(250)
  const paletteCheck = evalJs<{ open: boolean; blur: string; scrimClass: string }>(`(() => {
    const pal = document.querySelector('.tds-palette');
    const scrim = document.querySelector('.tds-palette-scrim');
    const style = scrim ? getComputedStyle(scrim) : null;
    return JSON.stringify({
      open: !!pal,
      blur: style ? (style.backdropFilter || style.webkitBackdropFilter || 'none') : 'missing',
      scrimClass: scrim?.className ?? '',
    });
  })()`)
  console.log("Command palette check:", JSON.stringify(paletteCheck))
  ab("screenshot", join(OUT, "03-palette.png"))
  ab("press", "Escape")
  await Bun.sleep(200)

  // Test motion demo page if available to verify StatusGrid HiDPI canvases & followups
  ab("open", `${targetUrl}/dev/motion`)
  await Bun.sleep(800)
  const motionCheck = evalJs<{ grids: { w: number; h: number }[]; count: number }>(`(() => {
    const grids = [...document.querySelectorAll('.tds-grid canvas')].map(c => ({ w: c.width, h: c.height }));
    return JSON.stringify({ count: grids.length, grids: grids.slice(0, 8) });
  })()`)
  console.log("StatusGrid check (/dev/motion):", JSON.stringify(motionCheck))
  ab("screenshot", join(OUT, "04-motion-demo.png"))

  ab("close")
  console.log("Verification screenshots saved to", OUT)
} finally {
  server?.kill()
}
