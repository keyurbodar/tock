/**
 * Tock motion library. Every animated surface in apps/web goes through these primitives; see README.md for recipes.
 *
 * Morph      growFrom / shrinkInto / installGrow + sources   container → container shared element, interruptible
 * Flip       watchLayout, flip                               layout morph when items come, go or reflow
 * Presence   enter.*, exit.*, collapse, expandTo, animate     enter/exit presets, reduced-motion aware
 * Glide      installFluidHover + lanes                       one highlight that glides between items
 * Gesture    scrub, rubber, swipeState, isSideways           drag / wheel scrubbing with rubber band + velocity commit
 * Spring     spring, springEasing                            presets from tokens.motion.spring
 * Drive      drive                                           one velocity-keeping 0..1 progress (--p), retargetable
 * Backdrop   backdrop                                        dim / scale / blur behind an expanded surface
 * Text/Icon  TextMorph, MorphIcon                            text, number and glyph morphs
 * Material   raise                                           shade classes (tds-raise-1/2/3) beside tds-over / tds-glass
 */
export * from "./core"
export { backdrop, growFrom, installGrow, shrinkInto, sources } from "./grow"
export { installFluidHover, lanes } from "./fluid"
export { watchLayout } from "./flip"
export { scrub, type ScrubOptions } from "./gesture"
export { drive } from "./drive"
export { TextMorph } from "../text-morph"
export { MorphIcon, type GlyphName, type MorphIconName } from "../morph-icon"

export const raise = { 1: "tds-raise-1", 2: "tds-raise-2", 3: "tds-raise-3", hover: "tds-shade" } as const
