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

## Against another deployment

`TOCK_URL=https://… TOCK_KEY=<access key> bun scripts/verify.ts [journeys]`. The doctor POSTs `TOCK_KEY` to `/api/auth` from inside the page, so the session cookie lands in agent-browser's profile, then fails fast if the Unlock dialog is still up. Without `TOCK_KEY` it fails with that hint instead of letting every journey stall behind the dialog. Locally `DEV_ALLOW_ANON=1` in `apps/server/.dev.vars` makes the key unnecessary. The doctor launches Chrome with `--no-sandbox`, which containers need; the flag only applies when agent-browser starts a new browser.

## Doctor

`bun scripts/verify.ts doctor` checks both ports, opens the app at 1440×900 and clears the console and error buffers. Run it first whenever anything looks off.

## Drive

`bun scripts/verify.ts` runs every journey in order; `bun scripts/verify.ts menu dialog` runs a subset after `doctor`. Journeys use stable handles only: class names from `apps/web/src/styles/shell.css`, ARIA labels and route shapes. The feature map in [features/](features/README.md) lists what each journey proves.

To add a journey, add a function to `journeys` in `scripts/verify.ts`, put its name in `order`, and add a line to the feature map. A name in `order` with no function crashes the whole run, so delete both together.

## Isolation rule

Every journey must pass alone (`bun scripts/verify.ts <name>`) and in any position of the full run. The runner calls `reset()` before each journey (a reload of `/`, pointer parked, sidebar loaded), which clears overlays, toasts, hover and the sidebar search. Beyond that, a journey builds the state it needs itself:

- `fresh()` opens a brand-new chat at `/t/<uuid>` and returns the id. Use it instead of relying on whatever chat the last journey left open.
- `seeded(text?)` is `fresh()` plus one finished exchange: it waits until an agent bubble is on screen, Stop is gone and the activity line reads done.
- `ensureRows(n)` creates chats until the sidebar has `n` live rows. Sidebar journeys call it first.
- Never find a chat by its text (`'what I found'`), never reuse a previous journey's chat, and leave the store as you found it (Undo, unpin, rename back).

Wait on what a person can observe, never on time. `until()` polls every 150ms, so it cannot see anything that lives for less than about half a second (the finished dot flies for 700ms). For short-lived states, install a `MutationObserver` or a `requestAnimationFrame` sampler in the page that writes to `window.__name`, act, then `until()` on that flag (see `finished`, `queued`, `flip`). Keep `wait()` only to let an animation settle before a screenshot. Assert what a person sees (computed style, focus, text, url, persisted state after a reload), never internal signals.

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
