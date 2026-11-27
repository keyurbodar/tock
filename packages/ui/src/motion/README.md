# @tock/ui/motion

One motion library for Tock. Every surface in apps/web animates through these primitives. The `primitives` lint (scripts/lint/primitives.ts) fails on raw `.animate(`, on `@keyframes` outside `motion.css`, and on spring or duration literals. Its error message names the primitive to use. Every live demo is at `/__motion` (dev only).

```ts
import { growFrom, watchLayout, animate, spring, scrub, backdrop, TextMorph, MorphIcon, raise } from "@tock/ui/motion"
```

Timing always comes from tokens: `tokens.motion.duration.*` (CSS `--tds-dur-*`), `tokens.motion.curve.*` (`--tds-ease-*`), `tokens.motion.spring.{snappy,soft,text,press,glide}`, `tokens.motion.gesture.*`, and material `--tds-raise-*` and `--tds-backdrop-*`.

## Morph: container → container (shared element)
Use it when a surface opens from something on screen: a menu from its button, the palette from the search field, the peek from its row, the work log from its activity line.
- **Declarative.** Add one line to `sources` in `grow.ts`: `{ surface: ".tds-x", trigger: () => document.querySelector(".tds-x-button"), ghost: true, backdrop: true }`. `installGrow()` (already called in main.tsx) grows the surface from its trigger when it mounts, or when it gains `data-open`. Set `ghost: true` if the surface unmounts at once; a frozen copy then shrinks back into the trigger. Set `backdrop: true` to make the app recede behind it.
- **Imperative.** `growFrom(surface, triggerOrRect)` returns the Animation. It is interruptible: calling it again mid-flight starts from the current frame. `shrinkInto(copy, box, triggerRect)` is the reverse.
- The first frame is held invisible until the grow starts, so a surface never flashes at full size.

## Morph: open in place from a source (row → chat)
Use it when an always-mounted surface changes what it shows because something else was clicked: a sidebar row, a pin or the peek card opens its chat in `#main`.
```ts
onClick={(e) => morphFrom(e.currentTarget)}               // the source: remembers its box, marks it data-handoff
createEffect(() => params.id, () => morphInto(main))      // the surface, once the new content rendered
```
The surface never moves, so its box never jumps. One `drive()` spring (glide) plays the clip from the source's band to the full box as a track, and a second track fades and unblurs the surface's children on the same curve; `[data-morphing]` marks the flight. A source marked `data-handoff` skips its ghost exit, so the peek card turns into the chat instead of also shrinking back into its row. A source older than two panel durations is ignored.

## Enter and exit: one table per component class
Timing lives in `motion.enter` / `motion.exit` (tokens.json); `sources` entries pick a class with `kind`.

| Class | Surfaces | Enter | Exit |
|---|---|---|---|
| popover | peek, palette, attachment preview, tooltips | scale `enter.popover.scale` (.96) → 1 + opacity, `enter.popover.duration` (140ms), `curve.out`, origin on the trigger side, no blur | reverse to .96 + fade in place, `exit.popover` (90ms) |
| menu | plus menu, row/thread menus | grow out of the trigger (shared element, blur in), `enter.menu` (220ms), `curve.sheet` | shrink back into the trigger, `exit.menu` (130ms) |
| dialog | shortcuts, dialogs | as menu, `enter.dialog` (240ms) | `exit.dialog` (150ms) |
| sheet | notification centre, composer sheet, work log pane | `drive()` spring (velocity-keeping, scrubbable) | same spring, `pop-close` preset |

Exits are always faster than enters. A glass surface in flight carries `data-moving`, which drops its live backdrop blur until it rests (static blur), and the Backdrop is a single scrim fading opacity, never a blur or scale of the app.

## Flip: layout morph
Use it when items come, go or reflow: pins, rows, chips, attachment cards.
```ts
<div ref={(el) => watchLayout(el, ".tds-pin")}>…</div>   // keyed by data-id; returns { move, stop }
```
It watches child-list changes and resizes. Moved items glide from their drawn position on `curve.sheet` / `duration.layout`, and a move during a flight retargets from the current translate. Positions are measured inside the container, so the container itself moving (a composer field growing above its tray) never reads as an item move. If you change layout yourself without a DOM mutation (for example, a CSS variable for column count), call `move()`. `flip(els, change)` is the one-shot version.

## Presence: enter / exit
Use it for an element appearing or leaving in place.
`animate(el, frames, opts)` is the only WAAPI entry point. It defaults to `curve.out`, keeps only opacity under reduced motion (pass `essential: true` for timers and measured heights), and accepts null. Presets: `enter.menu|submenu|hoverCard|peek|toast|message|dialog|attachment|pane`, `exit.menu|toast|dialog|pane`, `collapse(el)`, and `expandTo(el, from, to)`. CSS entries reuse the keyframes in `motion.css` (`tds-stagger-in`, `tds-word`, `tds-peek-in`, …).

## Spring
`spring(el, frames, "snappy" | "soft" | "text" | "press" | "glide")` runs a token spring as a `linear()` easing on the compositor. `springEasing(name)` returns `{ easing, duration }` for your own `animate` call. Use springs for movement and scale; use `curve.out` with a duration for colour and opacity.

## Drive: one progress, interruptible
Use it when one expand/collapse moves several things at once (a sheet, its content, the backdrop) or when a gesture can hand off to a spring. `drive(el, { preset: "expressive" })` plays a 0..1 `--p` (a registered `<number>` property) on the element from a real spring that keeps its velocity. Each leg is solved in closed form and runs as one WAAPI animation whose `linear()` easing is the spring, so no script runs per frame. `tracks: [{ el, at: (p) => keyframe }]` move other elements on the same curve; keep `at` linear in p and stick to transform, opacity and filter so they run on the compositor. `backdrop: "holder"` fades the shared scrim as a track. `to(1, "pop-open")` opens, `to(0, "pop-close")` closes, and calling `to` mid-flight turns around without a jump. During a drag, call `set(p)`; on release, call `to(open ? 1 : 0, preset, velocity)`. Key the CSS off `--p`: `scale: calc(.96 + var(--p) * .04); filter: blur(calc((1 - var(--p)) * var(--tds-blur-enter)))`. Presets come from `motion.spring.{expressive,pop-open,pop-close,highlight,…}` (expandable-bottom-tabs values; see renders/TOCK-3/motion-research.md).

## Glide: fluid hover
Use it for one highlight that glides between the items of a list and takes on their size. Add a lane in `fluid.ts`:
`{ item: ".tds-x-row", scope: ".tds-x-list", follow: "pointer" }`, or `follow: "highlighted"` for keyboard-driven lists such as menus and listboxes. Shading comes from `--tds-raise-sheen-hover` and `--tds-raise-shadow-hover`. Give the item no hover background of its own.

## Gesture: scrub with velocity commit
Use it for anything that can be dragged or swiped open or closed: a sheet, a drawer, a row action.
```ts
scrub(el, { axis: "y", distance: 320, direction: -1, onProgress: (p) => el.style.setProperty("--p", String(p)), onRelease: (open) => … })
```
Pointer drag and trackpad wheel both drive progress. It locks the gesture to one axis, applies a rubber band past 0 and 1 (`gesture.rubber`), and on release decides on the projected position (`gesture.project`, `gesture.commit`). For sidebar-row swipes, the lower-level helpers are `rubber`, `swipeState` and `isSideways`.

## Recede: the backdrop on a progress
Use it with Drive when one element, not the whole backdrop layer, should give way in step with a surface that grows over it. The composer sheet lives inside the main column, so it recedes only the transcript; use `backdropTo` when the whole app should recede.
```ts
const d = drive(field, { preset: "glide", tracks: [recede(() => transcript)] })
scrub(grip, { axis: "y", direction: -1, area: field, distance: () => travel(), from: () => d.value, onProgress: (p) => d.set(p), onRelease: (open, v) => d.to(open ? 1 : 0, "glide", (v * 1000) / travel()) })
```
- `recede(() => el)` is a drive track: scale, blur and dim from the same `--tds-backdrop-*` material as `backdrop()`, on the compositor. Resting at 0 clears its inline style.
- `scrub` reports release velocity in px/ms and `drive.to` takes progress per second, so divide by the travel as above.
- `scrub` follows the pointer outside the handle once pressed, swallows the click that ends a drag, and with `area` keeps a wheel gesture going after the handle moves out from under it. `distance` may be a function, read at the start of each gesture.

## Backdrop
`backdrop(true | false)` (reference counted) and `backdropTo(holder, p)` fade one static scrim (`--tds-backdrop-scrim`) behind the open surface. Opacity only: blurring or scaling the whole app every frame cost 50+ long frames per palette open on the production build. Morph sources with `backdrop: true` call it for you. `recede(el, p)` is the per-element version the composer sheet uses.

`backdropTo(holder, amount)` is the same recede keyed off a 0..1 progress, for surfaces that ride `drive()` or a gesture: the layers follow the surface frame by frame and reverse with it. Holders stack and the deepest wins. The notification centre uses `drive({ backdrop: "centre" })` + `scrub`, so the scrim rides the spring as a compositor track instead of a per-frame variable on :root (which restyled the whole document every frame).

## Text and icon morphs
- `<TextMorph value={v} mode="roll" | "morph" | "calm" | "swap" />`. The mode is required, so every site picks one:
  - `roll`: torph with odometer digits. Only for counts that genuinely tick: badges, unread and selection counts.
  - `morph`: torph letter morph, digits treated as letters (no rolling). Titles, statuses and short labels.
  - `calm`: the old value cross-fades out (on `::after`, from `data-was`) while the new one fades in, both with `blur.calm` over `duration.calm`, and nothing moves. A change inside `duration.calm` of the previous one swaps instantly, so a scrub (Ctrl-wheel zoom) reads as a tabular swap and a click cross-fades. Use it for numbers a user reads: zoom %, find counts, relative times, file meta.
  - `swap`: instant tabular swap, no animation. Live timers, upload progress and anything that changes several times a second.
- In journeys read the value with `morphed(sel)` in scripts/verify.ts: torph's `[torph-sr]` copy for roll and morph, the plain text for calm and swap (the outgoing calm copy is a pseudo-element, so `textContent` is always the current value). The `calmtext` journey proves the zoom % never moves a digit vertically.

| Site | Value | Mode |
| --- | --- | --- |
| chat/header.tsx | chat title | morph |
| chat/header.tsx | header status (Working, Needs you…) | morph |
| chat/header.tsx | find count "2 of 5" / "No matches" | calm |
| chat/header.tsx | offline / back online banner | calm |
| chat/activity.tsx | step verb | morph |
| chat/activity.tsx | tool group sentence "Searched memory 3 times" | morph |
| chat/transcript.tsx | jump pill "3 new" | roll |
| chat/activity.tsx | "Worked for 2s" on a finished turn | calm |
| chat/activity.tsx | plan title | morph |
| chat/activity.tsx | work log "Working for / Worked for" | morph |
| chat/activity.tsx | work log live timer | swap |
| chat/activity.tsx | plan progress "3 of 5" | calm |
| chat/composer.tsx | attachment line: upload progress "0.4 MB of 1.2 MB", reading, meta, error | swap |
| chat/composer.tsx | "Sending when … finishes" | calm |
| chat/composer.tsx | characters over the limit | swap |
| chat/files.tsx | sent document meta "Markdown · 54 B · 4 lines" | calm |
| chat/lightbox.tsx | position "2 of 3" | calm |
| chat/lightbox.tsx | file size | calm |
| chat/lightbox.tsx | zoom % | calm |
| shell/centre.tsx | notification relative time | calm |
| shell/sidebar.tsx | row relative time | calm |
| shell/sidebar.tsx | archive group count | roll |
| shell/sidebar.tsx | "N selected" | roll |
| shell/session-stack.tsx | "2 working, 1 needs you" | calm |
| shell/rail.tsx | unread badge | roll |
| shell/toasts.tsx | toast title | calm |
| shell/toasts.tsx | toast repeat count ×N | roll |
| dev/motion-demo.tsx | place label; one counter per mode | morph; all four |
- `<MorphIcon name={busy ? "stop" : "arrow-up"} />` morphs line shapes stroke by stroke, and uses a blur and scale swap otherwise. Add new line shapes to `shapes` in morph-icon.tsx.

## Edge fade: scroll boxes
Every box that scrolls fades the edges its content continues past, and only those: at the top of a list there is no top fade. The `edge-fade` lint (scripts/lint/edge.ts) fails on any apps/web CSS rule that sets `overflow(-x|-y): auto|scroll` unless its selector carries `[data-edge-fade]`.
```tsx
<div class="tds-x-list" data-edge-fade="y">…</div>          // declarative: installEdgeFade() (main.tsx) attaches on mount
.tds-x-list[data-edge-fade] { overflow-y: auto }            // CSS: the overflow lives on the same selector, so it never scrolls unfaded
edgeFade(el, { axis: "x" })                                 // imperative, returns stop(); axis "y" | "x" | "both"
```
- One passive scroll listener per box, rAF-throttled, plus a ResizeObserver on the box and its children for content changes. It writes the distance left on each side as `--edge-t/-b/-l/-r`; one mask rule in motion.css clamps each to `--tds-size-edge-fade` (`size.edge-fade`), so a fade grows in over the first pixels of scroll instead of popping.
- `data-edge` is set only while some side overflows, and the mask applies only then, so a box that fits keeps its shadow and glass unmasked.
- For markup you do not render (TipTap code blocks, the roster's VList viewport), pass the attribute through its props. A box that draws its own mask (the transcript's column fade) owns its edges, and the lint skips it.

## Skeleton: loading without a shift
Use it for anything that shows a placeholder while data loads: sidebar rows, the chat title, the transcript. It wraps skullet's `Reveal`; never write a shimmer or a `skullet-reveal` by hand.
```tsx
<Skeleton loading={!loaded()} id={`transcript:${id}`} label="Loading messages" fill sample={() => <Rows rows={SAMPLE} />}>
  <div class="h-full">…the real content…</div>
</Skeleton>
```
- `sample` renders sample data through the same components and classes as the content, so the bones take exactly the content's box. skullet draws a bar per text line and a block per icon, image and control.
- `children` is one element, created once; it is revealed into the same host when `loading` turns false (smart reveal: instant under 150ms, else in sequence). Content that never loaded is mounted directly, with no reveal.
- `id` keys the remembered shape. After a reveal the shape is saved once and the watcher stops, so ticking text inside (TextMorph, relative times) costs nothing. The next load under that `id` (a reload of the same chat) draws the remembered shape, which matches the content exactly. Leave `id` off for virtual lists (the sidebar): their shape passes skullet's 20k-character cap, so it would be remembered empty; uniform sample rows already sit where loaded rows do.
- `fill` makes the host and its panes fill a sized slot (scrollers, virtual lists); `inline` sizes to its text (titles).
- Bones use `--skullet-base` / `--skullet-highlight` from TDS overlays (motion.css). The `skeleton` journey proves key elements move less than 1px between first paint and loaded data.

## Material: Raise
`tds-raise-1` (fields, chips, cards), `tds-raise-2` (buttons, selected states, pin circles) and `tds-raise-3` (panes and floating cards) add a top highlight, a gradient sheen and a small plus a large shadow. When a state adds a ring, set `--tds-raise-ring` rather than `box-shadow`. Glass overlays keep `tds-over` and `tds-glass`. `tds-raise-glass` is the round composer buttons' material (send and stop, plus, scroll to end): a soft top highlight, an inner rim and a darker foot over the button's own fill, so a solid fill reads as a glass bead. `raise` exports the class names.

## Layout reads: afterLayout
A FLIP or grow reads geometry right after a DOM change. Read it in `afterLayout(el, fn)` (the first ResizeObserver delivery: after layout, before paint) instead of a `requestAnimationFrame`, which runs before layout and forces it. Read every box first, then write; never interleave. The `jank` journey counts forced layouts per interaction.

## Checking motion
Add a `probe(name, selector, act)` line to the `smooth` journey in scripts/verify.ts. It samples every frame and fails on single-frame jumps, on pops (no enter motion) and on vanishes (no exit motion). For a visual check, record at 60fps with `agent-browser record start clip.mp4 --fps 60` and step through the frames with ffmpeg.
