import type { FileCheck, LineRule } from "../lint-tokens"

export const rules: LineRule[] = [
  { name: "transition-all", test: /transition(?:-property)?\s*:\s*all\b|\btransition-all\b/g, why: "Name the properties you animate (better-motion, emil-design-eng). transition: all animates layout and colour you never meant to." },
  { name: "scale-zero", test: /\bscale\(\s*0\s*[,)]|\bscale\s*:\s*0(?![.\d]|\s+\d)|\bscale-0\b/g, why: "Nothing appears from nothing (review-animations 5). Start an enter from scale(var(--tds-press)) or .96-.99 plus opacity 0." },
  { name: "ease-in-keyword", test: /(?<![-\w])ease-in(?![-\w])/g, why: "ease-in delays the moment the user watches (animate, review-animations 3). Enters use var(--tds-ease-out); exits may use var(--tds-ease-in) with an exit duration (TDS)." },
  { name: "spring-on-fade", test: /\b(?:opacity|color|background-color)\s+var\(--tds-dur-\w[\w-]*\)\s+var\(--tds-ease-spring\)/g, why: "A colour or opacity change never takes a spring (better-motion). Use var(--tds-ease-out) with a duration." },
  { name: "will-change-all", test: /will-change\s*:\s*all\b/g, why: "Name the property that animates (better-motion, animation-performance)." },
  { name: "keyframe-on-toggle", test: /(?::hover|\[data-(?:open|on|active|expanded|selected)\])[^{]*\{[^}]*\banimation\s*:(?![^;}]*infinite)/g, files: /\.css$/, why: "Keyframes on a toggled state cannot reverse mid-flight (better-motion transitions.md). Use a transition on the same properties." },
]

const LAYOUT = /^(?:margin(?:-\w+)?|padding(?:-\w+)?|top|left|right|bottom|inset|width|min-width|max-width|min-height|max-height|flex-grow|flex-basis)$/
const WAAPI_LAYOUT = /\{\s*(?:top|left|right|bottom|width|margin\w*|padding\w*)\s*:/

/** Existing layout-property motion, each routed to its owner by the TOCK-8 motion audit. Anything new fails. */
const KNOWN: { file: RegExp; line: string; why: string }[] = [
  { file: /shell\.css$/, line: "transition: padding var(--tds-dur-layout) var(--tds-ease-sheet)", why: "notification stack: routed, translate the under-cards instead of the group's padding" },
  { file: /chat-extras\.css$/, line: "transition: max-height var(--tds-dur-panel)", why: "code collapse (TOCK-5): routed, measured height via clamp.ts" },
  { file: /chat-surface\.css$/, line: "transition: margin var(--tds-dur-swap)", why: "header status pill width morph (TOCK-3): routed" },
  { file: /sidebar\.css$/, line: "transition: min-width var(--tds-dur-menu)", why: "swipe actions (TOCK-3): routed" },
  { file: /motion\.css$/, line: "width var(--tds-dur-glide)", why: "fluid hover (TOCK-3): absolutely positioned, routed" },
  { file: /scroll\.css$/, line: "transition-property: opacity, filter, margin", why: "work-log fold (TOCK-5): routed" },
  { file: /composer\.css$/, line: "left var(--tds-dur-hover) var(--tds-ease-out)", why: "mention popover follows the caret: routed, position with translate" },
  { file: /chat\/composer\.tsx$/, line: "marginRight", why: "attachment card closes its gap from a measured width" },
]
const UNGUARDED_ROUTED: RegExp[] = []

export const check: FileCheck = (file, text) => {
  const hits: ReturnType<FileCheck> = []
  const css = file.endsWith(".css")
  const guarded = /prefersReducedMotion|prefers-reduced-motion/.test(text)
  let depth = 0
  let hoverDepth = -1
  text.split("\n").forEach((line, i) => {
    const at = i + 1
    if (line.includes("lint-tokens-ignore")) return
    const known = KNOWN.some((k) => k.file.test(file) && line.includes(k.line))
    if (/--tds-ease-in\b(?!-)|\bcurve\.in\b/.test(line) && !/exit|leav|clos/.test(line))
      hits.push({ line: at, name: "ease-in-not-exit", found: "ease-in", why: "The TDS in-curve is for leaving only, 120-200ms. Pair it with an exit duration on the same line, or use the out-curve." })
    if (css) {
      for (const m of line.matchAll(/transition(?:-property)?\s*:\s*([^;}]+)/g)) {
        const bad = m[1]!.split(",").map((part) => part.trim().split(/\s+/)[0]!).filter((p) => LAYOUT.test(p))
        if (bad.length && !known) hits.push({ line: at, name: "layout-transition", found: bad.join(","), why: "Animating layout properties re-runs layout every frame (animation-performance). Animate translate/scale/opacity, or a measured height." })
      }
      if (/@media[^{]*\(hover:\s*hover\)/.test(line) && hoverDepth < 0) hoverDepth = depth
      const gated = hoverDepth >= 0 || /\(hover:\s*hover\)/.test(line)
      if (!gated && /:hover[^{]*\{[^}]*(?:\bscale\s*:(?!\s*1\s*[;}])|\btranslate\s*:|\brotate\s*:|\btransform\s*:)/.test(line))
        hits.push({ line: at, name: "ungated-hover-motion", found: ":hover", why: "Touch fires phantom hovers on tap. Wrap hover motion in @media (hover: hover) and (pointer: fine) (review-animations 8)." })
      depth += (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length
      if (hoverDepth >= 0 && depth <= hoverDepth) hoverDepth = -1
      return
    }
    if (!/\.animate\(/.test(line)) return
    if (WAAPI_LAYOUT.test(line) && !known) hits.push({ line: at, name: "layout-transition", found: ".animate(layout)", why: "WAAPI on top/left/width/margin re-runs layout every frame. Animate translate or transform." })
    if (/\b(?:translate|transform)\s*:/.test(line) && !guarded && !UNGUARDED_ROUTED.some((f) => f.test(file)))
      hits.push({ line: at, name: "waapi-reduced-motion", found: ".animate(translate)", why: "The CSS reduced-motion reset never reaches element.animate(). Branch on prefersReducedMotion() from @tock/ui/motion and keep only opacity." })
  })
  return hits
}
