# Skill lints

Each `*.ts` file here is loaded by `scripts/lint-tokens.ts`. Export `rules` (per-line regex rules, optional `files` regex to scope them) and/or `check(file, text)` returning hits. Add `lint-tokens-ignore` on a line to waive a line rule. One file per skill area so threads do not collide.
