import type { LineRule } from "../lint-tokens"

export const rules: LineRule[] = [
  { name: "transition-all", test: /transition(?:-property)?\s*:\s*all\b|\btransition-all\b/g, why: "Name the properties you animate (better-motion, emil-design-eng). transition: all animates layout and colour you never meant to." },
]
