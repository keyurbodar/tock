# Links

Follows T3Code's MarkdownExternalLink with the TDS PxChips "Links" look.

- Every markdown link goes through `Reference` in `apps/web/src/chat/markdown.tsx`: `tock-file:` becomes a file chip, `tock-thread:` a thread chip, http(s) an external link, anything else plain text.
- An external link is `a.tds-link[data-link=web]`: the favicon (`.tds-link-fav`, globe on error) glued to the first characters, a dotted rose underline that goes solid on hover. Bare URLs read as host and path, cut at `limit.link-chars`.
- Plain links get no hover card. Right-click opens the shared link menu (Open link, Copy link); Copy confirms with a "Link copied" toast.
- Only thread chips have a hover card (`.tds-thread-card`), opened after `motion.hover-intent.open`.

Journey: `links`.
