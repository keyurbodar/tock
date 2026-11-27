import type { FileCheck } from "../lint-tokens"

/**
 * Motion primitives: every animation goes through @tock/ui/motion (packages/ui/src/motion), so a new surface reuses
 * Morph, Flip, Presence, Glide, Gesture, Spring and Backdrop instead of starting from scratch. README there has recipes.
 */
const LIBRARY = /packages\/ui\/src\/motion\//
const MATERIAL = /packages\/ui\/src\/styles\.css$/

export const check: FileCheck = (file, text) => {
  if (LIBRARY.test(file)) return []
  const hits: ReturnType<FileCheck> = []
  const css = file.endsWith(".css")
  text.split("\n").forEach((line, i) => {
    if (line.includes("lint-tokens-ignore")) return
    const at = i + 1
    if (css) {
      if (/@keyframes\b/.test(line) && !MATERIAL.test(file))
        hits.push({ line: at, name: "keyframes-outside-motion", found: "@keyframes", why: "Keyframes live in packages/ui/src/motion/motion.css. Reuse one there (tds-stagger-in, tds-word, tds-peek-in…) or add yours to it; for open/close prefer Presence (enter/exit) or Morph (growFrom)." })
      return
    }
    if (/behavior\s*:\s*["'`]smooth["'`]|["'`]smooth["'`]\s*:/.test(line))
      hits.push({ line: at, name: "smooth-scroll-literal", found: "behavior: \"smooth\"", why: "Smooth scrolling must jump instantly under reduced motion, and the CSS reset never reaches scrollTo/scrollIntoView. Use behavior: scrollBehavior() from @tock/ui/motion." })
    if (/\.animate\(/.test(line))
      hits.push({ line: at, name: "raw-waapi", found: ".animate(", why: "Use the motion library: animate()/spring() (Presence) from @tock/ui/motion, watchLayout (Flip) for reflow, growFrom/shrinkInto (Morph) for container→container. They handle reduced motion and retargeting." })
    if (/\b(?:stiffness|damping|mass)\s*:\s*\d/.test(line))
      hits.push({ line: at, name: "spring-literal", found: line.trim().slice(0, 40), why: "Springs are tokens (motion.spring.*). Call spring(el, frames, \"snappy\" | \"soft\" | \"glide\" | …) or springEasing(name) from @tock/ui/motion." })
    if (/\b(?:duration|delay)\s*:\s*\d{2,}/.test(line))
      hits.push({ line: at, name: "duration-literal", found: line.trim().slice(0, 40), why: "Durations are tokens: tokens.motion.duration.* (dur from @tock/ui/motion), or a spring preset via springEasing()." })
  })
  return hits
}
