# Pending

## Landed in the 2026-11-28 pass
- Type: Allo (opsz + wght variable, roundness pinned at 40, `scripts/fonts.py`) for UI, Paper Mono for code; metric-matched fallbacks; no letter-spacing so ligatures stay on.
- Focus rings only for keyboard navigation (`lib/modality.ts` sets `html[data-kbd]`); 1px accent ring, 2px offset.
- Channels filter is a Claude-style menu (`shell/channel-filter.tsx`): status, last activity, group by, sort by, archived; persisted; accent dot when filtering.
- Sidebar resizes on its edge (232–420px, double-click resets, arrows when focused); hairline lights while dragging; pins only reflow when their column count changes (the old per-frame FLIP was the jitter).
- Row titles fade out before the ⋯ button instead of running under it.
- Reply and quote, Telegram's model: reply strip docks into the composer, quote card in the sent bubble (code in mono, media thumbnail, quote glyph for selections); code blocks and media are repliable; jumping to a quote shows a soft row band instead of a ring.
- Streaming reveal is frame-based and adaptive (`motion.stream`): steady floor rate, drains any backlog in ~0.4s, bursts long replies; always whole words.
- Status grid: device-pixel canvas, additive LED bloom, visible unlit grid.
- Overlays blur (palette, dialogs, composer sheet, session stack); the app no longer scales back. Drop target is a full-window blur with an accent outline.
- Composer: ↵ send that morphs to stop, no disclaimer line, long words wrap; follow-ups align with the composer and never cover the last bubble; jump-to-end button centred above the composer.
- Chips are soft tinted pills; selecting one in the editor brightens it instead of drawing a ring.

## Still open
- `scripts/verify.ts` still targets some removed DOM; journeys need updating.
- Dev diagnostics that predate this pass: STRICT_READ_UNTRACKED ("session"), EFFECT_RELAY_TEAR in the composer MorphIcon, IMMUTABLE_UPDATE_IN_STORE on thread/session meta spreads.
- Allo is not preloaded in index.html (Vite hashes the file); consider a plugin that injects the preload.
- Follow-up chips still use the full-prompt tooltip card, which Wabi doesn't have; decide whether to keep it.
