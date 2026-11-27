---
name: verify-tock
description: Drive the Tock web app (main chat layout) in a real browser with agent-browser and prove a UI change works, with screenshots and console checks. Use before calling any web change done, and after every fix round.
---

# Verify Tock

Every UI claim needs a run of `bun scripts/verify.ts` against the live dev stack, plus a look at the screenshots it saves. Typecheck and lint passing is not proof.

## Launch

Two processes, both from the repo root. Start them detached and leave them running.

```bash
cd apps/server && npx wrangler dev --port 8787        # API + Durable Object; .dev.vars sets DEV_ALLOW_ANON=1
cd apps/web && ./node_modules/.bin/vite --port 5199 --strictPort   # proxies /api and /ws to 8787
```

Ready means `curl -sf localhost:8787/api/health` returns `{"ok":true,"service":"tock"}` and `curl -sf localhost:5199/` returns 200.
The first `agent-browser open` in a container needs `--args --no-sandbox`.

## Doctor

`bun scripts/verify.ts doctor` checks both ports, opens the app at 1440×900 and clears the console and error buffers. Run it first whenever anything looks off.

## Drive

`bun scripts/verify.ts` runs every journey in order; `bun scripts/verify.ts menu dialog` runs a subset after `doctor`. Journeys use stable handles only: class names from `apps/web/src/styles/shell.css`, ARIA labels and route shapes. The feature map in [features/](features/README.md) lists what each journey proves.

To add a journey, add a function to `journeys` in `scripts/verify.ts` and a line to the feature map. Assert what a person sees (computed style, focus, text, url, persisted state after a reload), never internal signals.

## Evidence

Screenshots land in `~/.capy/work/verify/<timestamp>/`, one per journey plus `fail-<journey>.png` for each failure. The script prints the folder. Open the screenshots and compare them with the matching TDS board in `~/.capy/work/tds/TDS/boards/png/` before reporting; a passing run with a wrong-looking screenshot is a failure.

The `diagnostics` journey fails on any Solid diagnostic (`REACTIVITY`, `STRICT_READ_UNTRACKED`, `UNSTABLE_LIST_IDENTITY`, `CLEANUP_IN_FORBIDDEN_SCOPE`) or page error. Run it last so it sees everything the other journeys triggered.

## Cleanup

The journeys create chats on the local Durable Object, which is scratch state. `rename` and `pin` restore what they change. Stop only the dev servers you started, by their operation, never by process name. Evidence folders stay.

## Gotchas

- Solid 2 batches signal writes. Reading a signal right after setting it returns the old value, so persist the value you computed, not `signal()`. The `resize` journey caught this.
- `For` keys by object identity. Wrap fresh objects (list entries, lexer tokens) in a stable cache or use `keyed={false}`/`keyed={(x) => x.key}`, or `diagnostics` fails with `UNSTABLE_LIST_IDENTITY`.
- Store values are proxies. Write `snapshot(store.x)` to IndexedDB, never `{ ...proxy }`; nested proxies throw `DataCloneError`.
- The faux demo model replies in about a second, so live states (shimmer, "Working for") are brief. Screenshot within 300ms of sending to see them.
