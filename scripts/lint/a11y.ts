import type { LineRule } from "../lint-tokens"

const tsx = /\.tsx$/

export const rules: LineRule[] = [
  { name: "a11y-positive-tabindex", files: tsx, test: /tabindex=\{?["']?[1-9]/gi, why: "Positive tabindex breaks the tab order (better-accessibility, WCAG 2.4.3). Fix the DOM order and use 0, or -1 for programmatic focus." },
  { name: "a11y-div-click", files: tsx, test: /<(?:div|span|li|p|i|b)\b(?![^>]*aria-hidden="true")[^>]*\bon(?:Click|DblClick)=/g, why: "A clickable div/span has no role, focus or keyboard (WCAG 2.1.1, 4.1.2). Use <button type=\"button\"> (or <a href> to navigate). A pointer-only scrim with an Escape path takes aria-hidden=\"true\"." },
  { name: "a11y-role-button", files: tsx, test: /role="(?:button|link)"/g, why: "role=button/link promises the full keyboard model. Use the native <button> or <a href> (first rule of ARIA)." },
  { name: "a11y-img-alt", files: tsx, test: /<img\b(?![^>]*\balt=)[^>]*>/g, why: "Every <img> needs alt: alt=\"\" when decorative, otherwise its meaning or action (WCAG 1.1.1)." },
  { name: "a11y-assertive", files: tsx, test: /aria-live="assertive"/g, why: "Assertive interrupts the reader. Use role=\"status\" (polite) for updates and role=\"alert\" only for urgent errors." },
  { name: "a11y-submit-gate", files: tsx, test: /type="submit"[^>]*\bdisabled=\{!/g, why: "Never disable submit to gate validation. Keep it enabled, validate on submit, mark the field aria-invalid and point aria-describedby at the error." },
  { name: "a11y-placeholder-label", files: tsx, test: /<input\b(?![^>]*\baria-label(?:ledby)?=)(?![^>]*\bid=)[^>]*\bplaceholder=/g, why: "A placeholder is not a label. Give the input a <label for>, aria-labelledby or aria-label that starts with the visible text (WCAG 1.3.1, 4.1.2)." },
  { name: "a11y-user-scalable", test: /user-scalable\s*=\s*no|maximum-scale\s*=\s*1(?![.\d])/g, why: "Never block pinch-zoom (WCAG 1.4.4)." },
]
