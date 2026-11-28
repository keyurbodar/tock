import type { FileCheck, LineRule } from "../lint-tokens"

const css = /\.css$/
const code = /\.tsx?$/
export const rules: LineRule[] = [
  { name: "line-height-length", files: css, test: /line-height\s*:\s*(?:-?[\d.]+(?:px|rem|em)\b|var\(--tds-(?:type-[\w-]+-leading|space-[\w-]+)\))/g, why: "Line-height is unitless so it scales with the font (better-typography). Use var(--tds-type-<role>-lh); the -leading px token is for geometry calcs only." },
  { name: "font-synthesis-none", files: css, test: /font-synthesis\s*:\s*none/g, why: "font-synthesis: none also kills italic synthesis and no italic face ships, so <em> renders upright. Set only the longhand you mean (font-synthesis-weight: none)." },
  { name: "variation-wght-opsz", files: css, test: /font-variation-settings\s*:[^;]*["'](?:wght["']|opsz["'](?!\s*var\(--tds-font-opsz\)))/g, why: "Use font-weight for weight. The optical cut is one token, set on the root as \"opsz\" var(--tds-font-opsz); never a raw number." },
  { name: "feature-tnum", files: css, test: /font-feature-settings\s*:[^;]*["'](?:tnum|zero|lnum|onum)["']/g, why: "Use font-variant-numeric (tabular-nums, slashed-zero) instead of raw feature tags." },
  { name: "letter-spacing-px", files: css, test: /letter-spacing\s*:\s*-?[\d.]+px/g, why: "Tracking is in em so it scales with size. Use var(--tds-type-<role>-tracking)." },
  { name: "raw-font-weight", files: /(?<!fonts)\.css$/, test: /font-weight\s*:\s*[1-9]00\b/g, why: "Weights live in tokens.json: var(--tds-weight-<name>) or var(--tds-type-<role>-weight)." },
  { name: "justify", files: css, test: /text-align\s*:\s*justify/g, why: "Interface text stays text-align: start." },
  { name: "kerning-none", files: css, test: /font-kerning\s*:\s*none/g, why: "Kerning is part of the font; turning it off is never a fix." },
  { name: "skip-ink-none", files: css, test: /text-decoration-skip-ink\s*:\s*none/g, why: "Keep skip-ink; tune text-underline-offset instead." },
  { name: "smoothing-in-component", files: /(?<!styles\/app)\.css$/, test: /-webkit-font-smoothing|-moz-osx-font-smoothing/g, why: "Font smoothing is set once on html in styles/app.css." },
  { name: "hand-plural", files: code, test: /===\s*1\s*\?\s*["'`]{2}\s*:\s*["'`]s["'`]/g, why: "Use Intl.PluralRules with whole-string forms ({ one: \"# line\", other: \"# lines\" }); word order and plural forms differ per language (better-writing)." },
  { name: "bad-copy", files: code, test: /["'`>][^"'`<>]*\b(?:Oops|Something went wrong|successfully|Are you sure|Click here)\b/g, why: "Say what failed and the next step; name the action and the object (better-writing)." },
]

const contraction = /["`>][^"`<>]*\b[A-Za-z]+'(?:t|re|ll|ve|m|d|s)\b/g
const dots = /[A-Za-z]\.\.\.(?=["`<\s])/g
export const check: FileCheck = (file, text) => {
  if (!code.test(file)) return []
  const hits: ReturnType<FileCheck> = []
  text.split("\n").forEach((line, i) => {
    if (/^\s*(?:\/\/|\/\*|\*)/.test(line) || line.includes("lint-tokens-ignore") || /querySelector|\bcss\s*\(/.test(line)) return
    for (const m of line.matchAll(contraction)) hits.push({ line: i + 1, name: "straight-apostrophe", found: m[0].slice(-12), why: "Rendered copy uses the typographic apostrophe ’ (better-typography smart punctuation)." })
    for (const m of line.matchAll(dots)) hits.push({ line: i + 1, name: "three-dots", found: m[0], why: "Use the ellipsis character … in rendered copy." })
  })
  return hits
}
