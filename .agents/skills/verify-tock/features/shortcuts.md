# Shortcuts

## Sub-features
`?` sheet, ⌥N new chat, ⌥↑/↓ previous or next chat.

## How to get to it (user POV)
Press `?` anywhere outside a text field.

## Driving it with agent-browser
`bun scripts/verify.ts shortcuts` blurs the active element first so the key is not typed into the composer.

## Gotchas
Browsers reserve ⌘N, so new chat is ⌥N. The sheet lists only shortcuts that are wired.

## hotkeys

Every shortcut is declared once in apps/web/src/shell/hotkeys.ts (@tanstack/solid-hotkeys app hotkeys) and the sheet renders from it. Each .tds-keys-row carries data-hotkeys (registry ids) and data-status (live registration status). The journey opens a chat, opens the sheet, and fails if any row is not active or the Space, Peek row is missing; then checks Ctrl+K and Alt+N fire from the registry and the palette shows the registry keys. Alt+N and Alt+arrows replace TDS Cmd+N and bare arrows because browsers keep Cmd+N for a window and bare arrows scroll.
