# Interface rules (TOCK-8)

- `ui`: every `:hover` rule in every loaded stylesheet sits under `@media (hover: hover)` (no latched hover on touch); a 150-character unbreakable URL message stays inside its bubble, column and transcript (no horizontal overflow); every truncated (ellipsis) text has a title or aria-label on itself or an ancestor, so the full value is reachable; every button and non-inline link is at least 24×24 (inline `.tds-link` and the sidebar resize handle are exempt).
- Static twins live in `scripts/lint/ui.ts`: ungated-hover, overlay-overscroll, viewport-100vh, viewport-100vw, scale-from-zero, icon-hex-paint.
