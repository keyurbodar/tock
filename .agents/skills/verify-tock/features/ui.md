# Interface rules (TOCK-8)

- `ui`: every `:hover` rule in every loaded stylesheet sits under `@media (hover: hover)` (no latched hover on touch); a 150-character unbreakable URL message stays inside its bubble, column and transcript (no horizontal overflow); every truncated (ellipsis) text has a title or aria-label on itself or an ancestor, so the full value is reachable; every button and non-inline link is at least 24×24 (inline `.tds-link` and the sidebar resize handle are exempt).
- Static twins live in `scripts/lint/ui.ts`: ungated-hover, overlay-overscroll, viewport-100vh, viewport-100vw, scale-from-zero, icon-hex-paint.
- `ui` (narrow): at 320×700 `[data-narrow]` is set (below `size.narrow` = 720), home shows only the chat list, a thread hides the sidebar so the header pill, composer row, send and column stay inside the viewport with a field of at least 120px, and the Chats rail button navigates back to `/`.
