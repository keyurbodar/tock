/* App shell for offline reloads: the HTML shell and the hashed /assets/* it loads. /api, /ws and /mcp never touch a cache.
 * Navigations go to the network first, so a deploy is picked up on the next online load; the cached shell answers only
 * when the network is down (fetched with cache: no-cache, so neither the HTTP cache nor this one can pin an old index).
 * Hashed assets are immutable, so they are served from the cache, and old builds' files age out. A new worker takes
 * over at once (skipWaiting + clients.claim); the page reloads into the new build only when idle (lib/update.ts). */
const SHELL = "tock-shell-v1"
const ASSETS = "tock-assets-v1"
const KEEP_DAYS = 7
const live = /^\/(api|ws|mcp)(\/|$)/

const referenced = (html) => [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((match) => match[1])

async function keepShell(response) {
  const html = await response.clone().text()
  await (await caches.open(SHELL)).put("/", response)
  const urls = referenced(html)
  const assets = await caches.open(ASSETS)
  await Promise.all(urls.map(async (url) => (await assets.match(url)) || assets.add(url).catch(() => undefined)))
  const stale = Date.now() - KEEP_DAYS * 86400000
  for (const request of await assets.keys()) {
    const path = new URL(request.url).pathname
    if (urls.includes(path)) continue
    const cached = await assets.match(request)
    const at = Date.parse(cached?.headers.get("date") ?? "")
    if (!(at > stale)) await assets.delete(request)
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    fetch("/", { cache: "no-cache" })
      .then((response) => (response.ok ? keepShell(response) : undefined))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => name.startsWith("tock-") && name !== SHELL && name !== ASSETS).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener("fetch", (event) => {
  const request = event.request
  if (request.method !== "GET") return
  const url = new URL(request.url)
  if (url.origin !== location.origin || live.test(url.pathname)) return
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request.url, { cache: "no-cache", credentials: "same-origin" })
        .then((response) => {
          if (response.ok && (response.headers.get("content-type") ?? "").includes("text/html")) event.waitUntil(keepShell(response.clone()))
          return response
        })
        .catch(async () => (await caches.match("/", { cacheName: SHELL })) ?? Response.error()),
    )
    return
  }
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(request, { cacheName: ASSETS }).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) event.waitUntil(caches.open(ASSETS).then((cache) => cache.put(request, response.clone())))
            return response
          }),
      ),
    )
    return
  }
  if (url.pathname.startsWith("/brand/")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) event.waitUntil(caches.open(SHELL).then((cache) => cache.put(request, response.clone())))
          return response
        })
        .catch(async () => (await caches.match(request, { cacheName: SHELL })) ?? Response.error()),
    )
  }
})
