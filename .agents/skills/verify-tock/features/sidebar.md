# Sidebar

## Sub-features
Search (⌘K), new chat, the thread list (virtualised), archive section, resize handle.

## How to get to it (user POV)
Always visible left of the chat. The resize handle is the right edge of the sidebar.

## Driving it with agent-browser
`bun scripts/verify.ts shell resize search`. Resize uses `mouse move/down/up` on `.tds-sidebar-handle`, then reloads to check `localStorage["tock.sidebar.width"]`.

## Gotchas
Width bounds come from `size.sidebar-min`, `sidebar-max` and `sidebar-panel` tokens; the journey assumes 320 default and a 16px keyboard step.
