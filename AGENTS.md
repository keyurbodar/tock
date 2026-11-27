# Tock

- Design source of truth: the TDS boards. Follow them before assuming anything.
- Every size, colour, duration, curve and z-index lives in `packages/tokens/tokens.json`; `bun scripts/lint-tokens.ts` must pass.
- Verify every web change with the `verify-tock` skill in `.agents/skills/verify-tock/SKILL.md` (`bun scripts/verify.ts`), and look at its screenshots, before calling it done.
- Server changes: `cd apps/server && npx vitest run`.
