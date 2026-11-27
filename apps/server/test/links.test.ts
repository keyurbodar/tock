import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { handleLink, parseHead, publicUrl, resolveIcon, resolveLink, type Fetcher } from "../src/core/links.js";
import { fixtureFetch } from "../src/dev/links.js";

const html = (head: string) => new Response(`<html><head>${head}</head><body><title>not this</title></body></html>`, { headers: { "content-type": "text/html" } });

describe("link resolver", () => {
  it("rejects non-http, private, loopback and port-bearing URLs", () => {
    for (const bad of [
      "ftp://example.com/",
      "javascript:alert(1)",
      "http://localhost/",
      "http://foo.localhost/",
      "http://127.0.0.1/",
      "http://2130706433/",
      "http://10.1.2.3/",
      "http://172.20.0.1/",
      "http://192.168.1.1/",
      "http://169.254.169.254/latest/meta-data",
      "http://[::1]/",
      "http://printer.local/",
      "http://intranet/",
      "https://example.com:8443/",
      "https://user:pass@example.com/",
    ])
      expect(publicUrl(bad), bad).toBeNull();
    expect(publicUrl("https://example.com/docs")?.href).toBe("https://example.com/docs");
    expect(publicUrl("http://8.8.8.8/")?.hostname).toBe("8.8.8.8");
  });

  it("reads og tags before <title>, ranks icon links and resolves them against the page", () => {
    const base = new URL("https://www.example.com/a/b");
    const head = parseHead(
      '<title>Plain &amp; simple</title><meta property="og:site_name" content="Example"><link rel="apple-touch-icon" href="/touch.png"><link rel="icon" href="fav.svg"><meta property="og:image" content="/card.png">',
      base,
    );
    expect(head).toEqual({ title: "Plain & simple", site: "Example", favicon: "https://www.example.com/a/fav.svg", image: "https://www.example.com/card.png" });
    expect(parseHead('<meta property="og:title" content="OG wins"><title>t</title>', base).title).toBe("OG wins");
    const bare = parseHead("<p>no head</p>", base);
    expect(bare.site).toBe("example.com");
    expect(bare.favicon).toBe("https://www.example.com/favicon.ico");
  });

  it("follows redirects only to public hosts and falls back when the fetch fails", async () => {
    const toPrivate: Fetcher = async () => new Response(null, { status: 302, headers: { location: "http://127.0.0.1/admin" } });
    const preview = await resolveLink(new URL("https://example.com/x"), toPrivate);
    expect(preview).toMatchObject({ title: null, site: "example.com", favicon: "https://example.com/favicon.ico" });

    const hops: string[] = [];
    const redirecting: Fetcher = async (input) => {
      hops.push(input);
      return input.endsWith("/old") ? new Response(null, { status: 301, headers: { location: "/new" } }) : html("<title>Moved</title>");
    };
    expect((await resolveLink(new URL("https://example.com/old"), redirecting)).title).toBe("Moved");
    expect(hops).toEqual(["https://example.com/old", "https://example.com/new"]);

    const throwing: Fetcher = async () => {
      throw new Error("offline");
    };
    expect((await resolveLink(new URL("https://example.com/"), throwing)).title).toBeNull();
  });

  it("caps oversized icons and refuses non-image bodies", async () => {
    const big: Fetcher = async (input) =>
      input.endsWith("/") ? html('<link rel="icon" href="/big.png">') : input.endsWith("big.png") ? new Response(new Uint8Array(200 * 1024), { headers: { "content-type": "image/png" } }) : new Response("<html>", { headers: { "content-type": "text/html" } });
    expect(await resolveIcon("example.com", big)).toBeNull();
    const icon = await resolveIcon("github.com", fixtureFetch);
    expect(icon?.type).toBe("image/svg+xml");
  });

  it("serves previews and icon bytes from the endpoint and caches them", async () => {
    let calls = 0;
    const counting: Fetcher = async (input, init) => (calls++, fixtureFetch(input, init));
    const cache = await caches.open("links-test");
    const first = await handleLink(new URL("http://x/api/link?url=https://github.com/keyurbodar/tock"), counting, cache);
    expect(await first.json()).toMatchObject({ title: "keyurbodar/tock", site: "GitHub", favicon: "https://github.com/fixture-icon.svg" });
    const again = await handleLink(new URL("http://x/api/link?url=https://github.com/keyurbodar/tock"), counting, cache);
    expect(await again.json()).toMatchObject({ title: "keyurbodar/tock" });
    expect(calls).toBe(1);
    const icon = await handleLink(new URL("http://x/api/link/icon?host=example.com"), fixtureFetch, null);
    expect(icon.headers.get("content-type")).toBe("image/svg+xml");
    expect(icon.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("refuses private targets at the route without fetching", async () => {
    const response = await SELF.fetch("http://tock.local/api/link?url=http://169.254.169.254/");
    expect(response.status).toBe(400);
    expect((await SELF.fetch("http://tock.local/api/link/icon?host=a/b")).status).toBe(400);
  });
});
