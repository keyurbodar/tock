# Tock UI / UX / Motion Engineering Audit (`FINDING.md`)

Audit of the last 3 commits (`4005cd7`, `dc048f4`, `a3af5c9`) on `hoplite/tauromenion-3408e3d3` merged into `main`, verified against the Claude Duet web reference, Wabi follow-up captures (`screenshot 30.mov`, `screenshot 31.mov`), Thinking status indicator reference (`___-_______________8______________Z7hh0j.mp4`), `tock-icons`, `t3code`, `benji.org/morphing-icons-with-claude`, and `emilkowalski/skills` + `jakubkrehel/skills`.

## 1. Tock Icons (Duet & Glass)
- **Incomplete rollout**: `TockIcon` is only wired in `sidebar.tsx`, `pins.tsx`, `header.tsx`, and `followups.tsx`. Channel glyphs in `peek.tsx`, `palette.tsx`, `session-stack.tsx`, `chip-card.tsx` (`ThreadCardBody`), and `composer.tsx` (`@` mention menu) still use static `<Icon>` sprite references, causing missing or monochrome icons on peek/hover/search.
- **Engine ESM warning & redundant re-renders**: `packages/ui/vendor/tock-icons/engine.js` leaves a CommonJS `module.exports` line inside an ESM module (Rolldown warning). `TockIcon` sets attributes sequentially inside `createEffect`, causing redundant SVG rebuilds.
- **Bundle budget regression**: Initial JS grew to `321.2 KB gz` (over `310 KB` budget) and CSS to `36.2 KB gz` (over `36 KB` budget).

## 2. Sidebar Bugs & Duet Parity
- **Swipe gestures still active**: `apps/web/src/shell/sidebar.tsx` and `apps/web/src/styles/sidebar.css` retain the full horizontal pointer/wheel swipe gesture stack (`tds-swipe`, `swipeOffset`, `swipeDecision`, `onWheel`). Must be removed completely.
- **Channel filter icon miswired**: The `funnel-simple` button next to `+` in the `Channels` header is wired to `archiveOpen()` ("Show archived") instead of filtering sidebar channels. Must filter channels (All / Unread / Working / Needs you + inline quick filter).
- **'Archived' row styled as a box/chip**: `.tds-archive-head` and its icon receive box/pill hover backgrounds instead of a clean text-only treatment. Must be text-only with no background box or chip around the label or icon.
- **Composer placeholder & send control**: Composer still hardcodes `"Message toast"` instead of channel-aware `"Message #<channel>"` / `"Message toast"`.

## 3. Follow-ups (Wabi 1:1 Parity)
- **Overlapping transcript**: `.tds-followups` can overlap the bottom message bubble when the transcript is short because `--composer-reserve` does not account for active follow-ups.
- **Hover / tooltip / morphing polish**: Hover states, glass icon layer parting, floating prompt tooltip positioning, row-hover `×` dismiss transition, and chip-to-chip width/label/icon morphing need tight 1:1 alignment with `screenshot 30.mov` and `screenshot 31.mov` using warm Duet surfaces and glass Tock icons.

## 4. Reply, Quote & Comment System (Delete & Rebuild)
- **Sloppy, fragile implementation**: `apps/web/src/chat/reactions.tsx` uses a 571-line `MutationObserver` + imperative `lane.after(slot)` DOM injection hack for comments. `apps/web/src/chat/reply.tsx` renders a detached floating `.tds-quote-preview` box above the composer (`screenshot 31.png`).
- **Rebuild**:
  - **Telegram-accurate reply & quote**: Docked flush above the composer input with vertical accent bar, author, 1-line excerpt, and `×` close (Esc clears); double-click / rail Reply / context menu / text selection toolbar (`Quote`, `Comment`, `Copy`); sent bubbles render a crisp clickable quote card that scrolls to and highlights the original message (with highlighted partial selection excerpt).
  - **t3code-style comment editor**: Clean declarative popover editor (`Enter` save, `⌘/Ctrl+Enter` save & send, `Shift+Enter` newline, `Esc` cancel) and declarative inline comment chips without imperative DOM slot mutation.

## 5. Tokens / Chips in Composer & Chat (Port from `t3code`)
- **Tokens vanish on send**:
  - `apps/web/src/chat/tokens.ts` (`tokenText`) returns bare `attrs.label` for `kind === "file"`, dropping the `tock-file:` link completely on send.
  - `splitFiles` in `apps/web/src/chat/attachments.ts` strips inline `tock-file:` links out of user message text so inline file chips disappear from sent sentences.
- **Baseline & alignment bugs**: `apps/web/src/styles/chips.css` uses fragile `calc((var(--tds-size-token) - 1lh) / 2)` negative-margin hacks that misalign chips with Geist text.
- **Fix**: Port `t3code`'s `ContextChip` design (`inline-flex items-center gap-[0.2em] leading-[normal]`, `[&_svg]:size-[1em]`) and hover card motion for all chip kinds (`link`, `file`, `thread`, `skill`, `plugin`, `command`, `citation`), preserving inline tokens across composer and sent chat messages.

## 6. Motion Package, Command Palette & Morphing Icons
- **Command palette missing backdrop blur & motion**: `.tds-palette-scrim` lacks `backdrop-filter: blur(...)` and scrim fill; `.tds-palette` sets `transition: none`, causing abrupt open/close; `palette-hit` introduces a sluggish 140ms delay before closing.
- **Sluggish motion tokens**: Several UI transition durations in `packages/tokens/tokens.json` (`layout: 260ms`, `swap: 300ms`, `panel: 350ms`, `toast: 420ms`, `menu: 200ms`) feel slow/choppy. Tighten to snappy Emil Kowalski / Jakub Krehel curves and timings (`120–220ms` enters, faster exits, GPU-composited `transform`/`opacity` only).
- **Morphing icons**: Upgrade `MorphIcon` (`benji.org/morphing-icons-with-claude` rotation groups + line morphing) and wire it into interactive controls (copy→check, send→stop, plus→x, chevrons, filter toggle).

## 7. Geist Font Smoothing & Typography
- Form controls (`input`, `textarea`, `button`, `.ProseMirror`) do not explicitly inherit `-webkit-font-smoothing: antialiased` and `font-family`, causing inconsistent weight/rendering between chat bubbles and composer/inputs.
- Preload `Geist-Variable.woff2` in `index.html`, enable proper OpenType features (`"kern", "calt", "ss01"`), and align Geist tracking/weights across UI surfaces.

## 8. Status Indicators (`status-grid.tsx`)
- **144p blurry/blocky rendering**: At 14–18px row sizes, `pitch = Math.round((px * dpr) / 9)` produces `dot < 3`, falling back to `fillRect` squares and disabling bloom completely.
- **Dull colors & slow timing**: `color.grid` tokens are desaturated compared to the luminous LED reference video (`___-_______________8______________Z7hh0j.mp4`), and cycle durations (`ring: 3000ms`, `arc: 1500ms`, `spiral-step: 50ms`) are too slow.
- **Fix**: High-DPI oversampled circular LED rendering (always crisp circles + additive radial glow bloom, DPR-aware), vibrant LED palette matching the reference video, snappier frame-matched speeds, and crisp shimmer text.
