import type { Fetcher } from "../core/links.js";

/**
 * Canned pages for the link resolver, so the verify journeys run offline. Dev only: the worker uses it when
 * DEV_ALLOW_ANON is set and the page carries the tock-link-fixture cookie. Icons answer late, so a journey can watch
 * the favicon fade in over its fallback without the line moving.
 */
const ICON_DELAY_MS = 1000;

const svg = (fill: string, letter: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="3" fill="${fill}"/><text x="8" y="12" font-size="11" font-family="sans-serif" font-weight="700" text-anchor="middle" fill="#fff">${letter}</text></svg>`;

const pages: Record<string, string> = {
  "https://github.com/keyurbodar/tock":
    '<html><head><title>GitHub - keyurbodar/tock</title><meta property="og:title" content="keyurbodar/tock"><meta property="og:site_name" content="GitHub"><link rel="icon" href="/fixture-icon.svg"></head><body></body></html>',
  "https://example.com/docs":
    '<html><head><title>Example Docs &amp; Guides</title><link rel="shortcut icon" href="/fixture-icon.svg"></head><body></body></html>',
};

const icons: Record<string, string> = {
  "github.com": svg("#24292f", "G"),
  "example.com": svg("#3b82f6", "E"),
};

export const fixtureFetch: Fetcher = async (input) => {
  const url = new URL(input);
  if (url.pathname === "/fixture-icon.svg") {
    await new Promise((resolve) => setTimeout(resolve, ICON_DELAY_MS));
    const icon = icons[url.hostname];
    return icon ? new Response(icon, { headers: { "content-type": "image/svg+xml" } }) : new Response(null, { status: 404 });
  }
  const page = pages[url.href.replace(/\/$/, "")] ?? (url.pathname === "/" ? `<html><head><link rel="icon" href="/fixture-icon.svg"></head></html>` : undefined);
  return page ? new Response(page, { headers: { "content-type": "text/html; charset=utf-8" } }) : new Response(null, { status: 404 });
};
