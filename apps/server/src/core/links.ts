/**
 * Link previews for chat: what a URL's page calls itself and the icon it shows, fetched by the worker so the client never
 * hotlinks a third-party host. Every hop is checked against the SSRF guard, bodies are capped and fetches time out.
 */
export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

export interface LinkPreview {
  url: string;
  title: string | null;
  site: string;
  favicon: string | null;
  image: string | null;
}

const TIMEOUT_MS = 3000;
const HTML_CAP = 256 * 1024;
const ICON_CAP = 64 * 1024;
const MAX_REDIRECTS = 3;
const TTL_S = 60 * 60 * 24;
const FAIL_TTL_S = 60;
const MAX_URL = 2048;

const PRIVATE_V4: readonly [number, number][] = [
  [0x00000000, 8],
  [0x0a000000, 8],
  [0x64400000, 10],
  [0x7f000000, 8],
  [0xa9fe0000, 16],
  [0xac100000, 12],
  [0xc0000000, 24],
  [0xc0a80000, 16],
  [0xc6120000, 15],
  [0xe0000000, 3],
];

function privateV4(host: string): boolean {
  const parts = host.split(".");
  if (parts.length !== 4 || !parts.every((p) => /^\d{1,3}$/.test(p))) return false;
  const ip = parts.reduce((acc, p) => acc * 256 + Number(p), 0);
  return PRIVATE_V4.some(([base, bits]) => Math.floor(ip / 2 ** (32 - bits)) === Math.floor(base / 2 ** (32 - bits)));
}

/** An http(s) URL on a public host and default port, or null: no localhost, private or link-local addresses, no IPv6 literals. */
export function publicUrl(raw: string): URL | null {
  if (raw.length > MAX_URL) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host.includes(".") || host.startsWith("[")) return null;
  if (/(^|\.)(localhost|local|internal|home\.arpa|localdomain)$/.test(host)) return null;
  if (privateV4(host)) return null;
  return url;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'", nbsp: " " };
const decode = (text: string) =>
  text
    .replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (match, name: string) => {
      if (name[0] === "#") {
        const code = name[1]?.toLowerCase() === "x" ? parseInt(name.slice(2), 16) : Number(name.slice(1));
        return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : match;
      }
      return ENTITIES[name.toLowerCase()] ?? match;
    })
    .replace(/\s+/g, " ")
    .trim();

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g)) out[m[1]!.toLowerCase()] = m[3] ?? m[4] ?? m[5] ?? "";
  return out;
}

const resolve = (href: string | undefined, base: URL) => {
  if (!href) return null;
  try {
    const url = new URL(decode(href), base);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
};

const ICON_RANK = ["icon", "shortcut icon", "apple-touch-icon", "apple-touch-icon-precomposed"];

/** Title, site name, icon and image from a page's head; the icon falls back to /favicon.ico. */
export function parseHead(html: string, base: URL): Omit<LinkPreview, "url"> {
  const end = html.search(/<body[\s>]/i);
  const head = end < 0 ? html : html.slice(0, end);
  const meta: Record<string, string> = {};
  for (const m of head.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    const key = (a.property ?? a.name ?? "").toLowerCase();
    if (key && a.content !== undefined && !(key in meta)) meta[key] = a.content;
  }
  let icon: { rank: number; href: string } | null = null;
  for (const m of head.matchAll(/<link\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    const rank = ICON_RANK.indexOf((a.rel ?? "").toLowerCase().trim());
    const href = resolve(a.href, base);
    if (rank >= 0 && href && (!icon || rank < icon.rank)) icon = { rank, href };
  }
  const tagTitle = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1];
  const title = decode(meta["og:title"] ?? meta["twitter:title"] ?? tagTitle ?? "") || null;
  return {
    title: title?.slice(0, 300) ?? null,
    site: decode(meta["og:site_name"] ?? "") || base.hostname.replace(/^www\./, ""),
    favicon: icon?.href ?? new URL("/favicon.ico", base).href,
    image: resolve(meta["og:image"] ?? meta["twitter:image"], base),
  };
}

async function readCapped(response: Response, cap: number, truncate: boolean): Promise<Uint8Array | null> {
  if (!truncate && Number(response.headers.get("content-length") ?? 0) > cap) return null;
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) {
      await reader.cancel();
      return truncate ? join(chunks, total - value.byteLength) : null;
    }
    chunks.push(value);
  }
  return join(chunks, total);
}

function join(chunks: Uint8Array[], total: number) {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

/** GET with a timeout, following redirects by hand so every hop passes the SSRF guard; a page body is cut at the cap, an icon over it fails. */
async function fetchCapped(start: URL, fetcher: Fetcher, cap: number, accept: string, truncate = false) {
  let url = start;
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const response = await fetcher(url.href, { redirect: "manual", signal, headers: { accept, "user-agent": "TockLinkPreview/1.0" } });
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      const next = publicUrl(resolve(response.headers.get("location") ?? "", url) ?? "");
      if (!next) return null;
      url = next;
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      return null;
    }
    const body = await readCapped(response, cap, truncate);
    return body ? { url, body, type: (response.headers.get("content-type") ?? "").toLowerCase() } : null;
  }
  return null;
}

export const fallbackPreview = (url: URL): LinkPreview => ({
  url: url.href,
  title: null,
  site: url.hostname.replace(/^www\./, ""),
  favicon: new URL("/favicon.ico", url).href,
  image: null,
});

export async function resolveLink(url: URL, fetcher: Fetcher): Promise<LinkPreview> {
  try {
    const page = await fetchCapped(url, fetcher, HTML_CAP, "text/html,application/xhtml+xml", true);
    if (!page || !/html|xml/.test(page.type)) return fallbackPreview(url);
    return { url: url.href, ...parseHead(new TextDecoder().decode(page.body), page.url) };
  } catch {
    return fallbackPreview(url);
  }
}

const ICON_TYPE = /^image\/(png|x-icon|vnd\.microsoft\.icon|svg\+xml|gif|jpeg|webp|avif)/;

/** The icon a host's front page names, falling back to /favicon.ico, as bytes and a type an <img> can show. */
export async function resolveIcon(host: string, fetcher: Fetcher): Promise<{ body: Uint8Array; type: string } | null> {
  const root = publicUrl(`https://${host}/`);
  if (!root || root.hostname !== host.toLowerCase()) return null;
  const preview = await resolveLink(root, fetcher);
  const candidates = [...new Set([preview.favicon, new URL("/favicon.ico", root).href].filter((x): x is string => !!x))];
  for (const href of candidates) {
    const target = publicUrl(href);
    if (!target) continue;
    const icon = await fetchCapped(target, fetcher, ICON_CAP, "image/*").catch(() => null);
    if (!icon || icon.body.byteLength === 0) continue;
    const type = ICON_TYPE.exec(icon.type)?.[0] ?? (/\.ico$/i.test(target.pathname) && /^(application\/octet-stream)?$/.test(icon.type.split(";")[0]!) ? "image/x-icon" : null);
    if (type) return { body: icon.body, type };
  }
  return null;
}

async function cached(key: string, cache: Cache | null, make: () => Promise<Response>): Promise<Response> {
  const request = new Request(`https://tock-link.cache/${encodeURIComponent(key)}`);
  const hit = await cache?.match(request);
  if (hit) return hit;
  const response = await make();
  await cache?.put(request, response.clone()).catch(() => undefined);
  return response;
}

/** GET /api/link?url= and GET /api/link/icon?host=. Fixture mode (dev only) swaps the network for canned pages and skips the cache. */
export async function handleLink(url: URL, fetcher: Fetcher, cache: Cache | null): Promise<Response> {
  if (url.pathname === "/api/link") {
    const target = publicUrl(url.searchParams.get("url") ?? "");
    if (!target) return Response.json({ ok: false, error: "invalid_url" }, { status: 400 });
    return cached(`page:${target.href}`, cache, async () => {
      const preview = await resolveLink(target, fetcher);
      const ttl = preview.title ? TTL_S : FAIL_TTL_S;
      return Response.json(preview, { headers: { "cache-control": `public, max-age=${ttl}` } });
    });
  }
  const host = (url.searchParams.get("host") ?? "").toLowerCase();
  if (!/^[a-z0-9.-]{1,253}$/.test(host)) return Response.json({ ok: false, error: "invalid_host" }, { status: 400 });
  return cached(`icon:${host}`, cache, async () => {
    const icon = await resolveIcon(host, fetcher).catch(() => null);
    if (!icon) return new Response(null, { status: 404, headers: { "cache-control": `public, max-age=${FAIL_TTL_S}` } });
    return new Response(icon.body, {
      headers: {
        "content-type": icon.type,
        "cache-control": `public, max-age=${TTL_S}`,
        "content-security-policy": "sandbox; default-src 'none'; style-src 'unsafe-inline'",
        "x-content-type-options": "nosniff",
      },
    });
  });
}
