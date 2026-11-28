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

## Landed in the second 2026-11-28 pass
- Comments removed from the message rail: hover shows React and Reply only, centred on the bubble (Kiko).
- Reactions follow Kiko: the quick bar opens above the React button, centred and clamped; badges are solid pills overlapping the bubble's lower edge and each other, cut out by a page-colour ring.
- Reply strip grows out of the composer's top edge (height, not a slide); no lines between strip and field.
- No outlines on the composer, follow-up chips, cards or reaction surfaces; focus never draws on the composer.
- Fonts: Allo keeps all three axes; roundness is one token (`font.round`, 30). Regular 420 / emphasis 470 (no bold) to sit evenly on the dark ground; slight tracking on 13–16px text; fonts preloaded at build.
- Pins hold four columns at every sidebar width, so resizing never reshuffles them.
- Follow-up chips have no tooltip (Wabi).

## Still open
- `scripts/verify.ts` still targets some removed DOM; journeys need updating.
- Dev diagnostics that predate this pass: STRICT_READ_UNTRACKED ("session"), EFFECT_RELAY_TEAR in the composer MorphIcon, IMMUTABLE_UPDATE_IN_STORE on thread/session meta spreads.
- Chip and link hover cards are t3code-inspired, not a line-for-line port.
