/**
 * Tock motion library. Every animated surface in apps/web goes through these primitives; see README.md for recipes.
 *
 * Morph      growFrom / shrinkInto / installGrow + sources   container → container shared element, interruptible
 * Flip       watchLayout, flip                               layout morph when items come, go or reflow
 * Presence   enter.*, exit.*, collapse, expandTo, animate     enter/exit presets, reduced-motion aware
 * Glide      installFluidHover + lanes                       one highlight that glides between items
 * Gesture    scrub, swipe model (lockAxis, swipeDecision, inertiaTail), rubber           drag / wheel scrubbing with rubber band + velocity commit
 * Spring     spring, springEasing                            presets from tokens.motion.spring
 * Drive      drive, recede                                   one velocity-keeping 0..1 progress (--p), retargetable; recede one element by it
 * Backdrop   backdrop, backdropTo                            dim / scale / blur behind an expanded surface (on/off or by progress)
 * Text/Icon  TextMorph (roll|morph|calm|swap), MorphIcon     text, number and glyph morphs
 * Edge       edgeFade, installEdgeFade                      scroll-edge mask fade, only where content continues past an edge
 * Skeleton   Skeleton                                        skullet placeholder drawn from a sample through the real components, revealed in place
 * Material   raise                                           shade classes (tds-raise-1/2/3) beside tds-over / tds-glass
 */
export * from "./core"
export { backdrop, backdropTo, growFrom, installGrow, shrinkInto, sources } from "./grow"
export { morphFrom, morphInto } from "./morph"
export { installFluidHover, lanes } from "./fluid"
export { watchLayout } from "./flip"
export { scrub, type ScrubOptions } from "./gesture"
export { inertiaTail, lockAxis, swipeDecision, swipeOffset, swipeStage, swipeThresholds, velocityTracker, type SwipeDecision, type SwipeSide, type SwipeStage, type SwipeThresholds } from "./swipe"
export { drive, recede } from "./drive"
export { edgeFade, installEdgeFade, type EdgeAxis } from "./edge"
export { Skeleton } from "./skeleton"
export { TextMorph, type TextMode } from "../text-morph"
export { MorphIcon, type GlyphName, type MorphIconName } from "../morph-icon"

export const raise = { 1: "tds-raise-1", 2: "tds-raise-2", 3: "tds-raise-3", hover: "tds-shade" } as const
