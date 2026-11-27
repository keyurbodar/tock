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

## Flip: layout morph
Use it when items come, go or reflow: pins, rows, chips, attachment cards.
```ts
<div ref={(el) => watchLayout(el, ".tds-pin")}>…</div>   // keyed by data-id; returns { move, stop }
```
It watches child-list changes and resizes. Moved items glide from their drawn position on `curve.sheet` / `duration.layout`, and a move during a flight retargets from the current translate. If you change layout yourself without a DOM mutation (for example, a CSS variable for column count), call `move()`. `flip(els, change)` is the one-shot version.

## Presence: enter / exit
Use it for an element appearing or leaving in place.
`animate(el, frames, opts)` is the only WAAPI entry point. It defaults to `curve.out`, keeps only opacity under reduced motion (pass `essential: true` for timers and measured heights), and accepts null. Presets: `enter.menu|submenu|hoverCard|peek|toast|message|dialog|attachment|pane`, `exit.menu|toast|dialog|pane`, `collapse(el)`, and `expandTo(el, from, to)`. CSS entries reuse the keyframes in `motion.css` (`tds-stagger-in`, `tds-word`, `tds-peek-in`, …).

## Spring
`spring(el, frames, "snappy" | "soft" | "text" | "press" | "glide")` runs a token spring as a `linear()` easing on the compositor. `springEasing(name)` returns `{ easing, duration }` for your own `animate` call. Use springs for movement and scale; use `curve.out` with a duration for colour and opacity.

## Drive: one progress, interruptible
Use it when one expand/collapse moves several things at once (a sheet, its content, the backdrop) or when a gesture can hand off to a spring. `drive(el, { preset: "expressive" })` writes a 0..1 `--p` on the element from a real spring that keeps its velocity. `to(1, "pop-open")` opens, `to(0, "pop-close")` closes, and calling `to` mid-flight turns around without a jump. During a drag, call `set(p)`; on release, call `to(open ? 1 : 0, preset, velocity)`. Key the CSS off `--p`: `scale: calc(.96 + var(--p) * .04); filter: blur(calc((1 - var(--p)) * var(--tds-blur-enter)))`. Presets come from `motion.spring.{expressive,pop-open,pop-close,highlight,…}` (expandable-bottom-tabs values; see renders/TOCK-3/motion-research.md).

## Glide: fluid hover
Use it for one highlight that glides between the items of a list and takes on their size. Add a lane in `fluid.ts`:
`{ item: ".tds-x-row", scope: ".tds-x-list", follow: "pointer" }`, or `follow: "highlighted"` for keyboard-driven lists such as menus and listboxes. Shading comes from `--tds-raise-sheen-hover` and `--tds-raise-shadow-hover`. Give the item no hover background of its own.

## Gesture: scrub with velocity commit
Use it for anything that can be dragged or swiped open or closed: a sheet, a drawer, a row action.
```ts
scrub(el, { axis: "y", distance: 320, direction: -1, onProgress: (p) => el.style.setProperty("--p", String(p)), onRelease: (open) => … })
```
Pointer drag and trackpad wheel both drive progress. It locks the gesture to one axis, applies a rubber band past 0 and 1 (`gesture.rubber`), and on release decides on the projected position (`gesture.project`, `gesture.commit`). For sidebar-row swipes, the lower-level helpers are `rubber`, `swipeState` and `isSideways`.

## Backdrop
`backdrop(true | false)` (reference counted) makes every `[data-backdrop-layer]` element (the main column and the sidebar) scale to `--tds-backdrop-scale`, blur by `--tds-backdrop-blur` and dim to `--tds-backdrop-dim`. Morph sources with `backdrop: true` call it for you.

## Text and icon morphs
- `<TextMorph value={n} numbers />` morphs titles, statuses and counters (torph). In journeys, read the value through `[torph-sr]`.
- `<MorphIcon name={busy ? "stop" : "arrow-up"} />` morphs line shapes stroke by stroke, and uses a blur and scale swap otherwise. Add new line shapes to `shapes` in morph-icon.tsx.

## Material: Raise
`tds-raise-1` (fields, chips, cards), `tds-raise-2` (buttons, selected states, pin circles) and `tds-raise-3` (panes and floating cards) add a top highlight, a gradient sheen and a small plus a large shadow. When a state adds a ring, set `--tds-raise-ring` rather than `box-shadow`. Glass overlays keep `tds-over` and `tds-glass`. `raise` exports the class names.

## Checking motion
Add a `probe(name, selector, act)` line to the `smooth` journey in scripts/verify.ts. It samples every frame and fails on single-frame jumps, on pops (no enter motion) and on vanishes (no exit motion). For a visual check, record at 60fps with `agent-browser record start clip.mp4 --fps 60` and step through the frames with ffmpeg.
