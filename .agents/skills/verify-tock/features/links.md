# Links

Follows T3Code's MarkdownExternalLink (favicon glued to the first characters, long words break, short ones stay whole) with the TDS PxChips "Links" look.

- Every markdown link goes through `Reference` in `apps/web/src/chat/markdown.tsx`: `tock-file:` becomes a file chip, `tock-thread:` a thread chip, http(s) an external link, anything else plain text.
- An external link is `a.tds-link[data-link=web]` with `data-shape`:
  - `chip` when its text is the address itself (a bare URL, or a label with no spaces that is the URL or a prefix of it, `isAddressLabel`): favicon plus host and path, cut at `limit.link-chars`, on a rose tint that deepens on hover.
  - `words` for any other label (`[the docs](url)`): the words with the favicon in front, no underline at rest, a solid underline on hover.
- The favicon (`.tds-link-fav`) is a reserved 14px inline-block whose bottom is the text baseline. A globe glyph shows until the bytes arrive, then the favicon fades in over it through `@tock/ui/motion` (`fadeFavicon`); on error the globe stays. Bytes come from `/api/link/icon?host=`, never from the site.
- The worker resolver (`apps/server/src/core/links.ts`): `GET /api/link?url=` returns `{ url, title, site, favicon, image }` from `<title>`, og:title, og:site_name and icon links, falling back to /favicon.ico; SSRF guard (http(s), public hosts, default ports, every redirect rechecked), 3s timeout, size caps, Cache API with a TTL. With `DEV_ALLOW_ANON=1` and the `tock-link-fixture=1` cookie it serves canned pages (`apps/server/src/dev/links.ts`) so journeys run offline; icons answer 1s late so the fade is observable.
- A pause on a link (bubble or composer chip) opens `.tds-link-card` after `motion.hover-intent.open`: favicon, page title, site, URL. It grows from the link (a `sources` line in grow.ts).
- Right-click opens the shared link menu (Open Link, Copy Link); Copy confirms with a "Link copied" toast.
- Hover styles sit behind `(hover: hover) and (pointer: fine)`, which headless Chrome reports false, so journeys can't assert them.

Journeys: `links`, `linkchips` (chip and words, 14px icon on the baseline via a Range, no layout shift while favicons load, card title and site, composer chip card).
