# Thread actions

## Sub-features
Rename (inline), Pin/Unpin, Mark as Unread/Read, Copy Link, Archive/Unarchive, Delete with confirmation.

## How to get to it (user POV)
Hover a chat in the sidebar and press the `…` button.

## Driving it with agent-browser
`bun scripts/verify.ts menu pin rename dialog`. Items are chosen by their visible text inside `.tds-menu-item` or `.tds-button`.

## Gotchas
Metadata lives in the `tock_threads` table and comes back on `session.list` as `meta`; `rename` reloads the page to prove it persisted.

## Toasts
One quiet line at the top right: a 16px tone glyph, the title, the description muted on the same line (it ellipsizes first), an optional action, and a 24×24 close on the trailing edge that shows on hover and focus (always on touch) and never scales. Toasts stack 8px apart at rest and expand on hover or focus; timers pause while hovered, focused or the tab is hidden. Drag right to dismiss: past `size.swipe` or faster than `gesture.toast-flick` px/ms; a slower, shorter drag springs back.
- `toasts`: Archive's toast is one 44px line, title 14/500, Undo restores.
- `toaststack`: grouped "Archived 2 chats" merges, a second toast stacks, hover expands without overlap, Esc dismisses newest first, a swipe dismisses.
- `toastclose`: relaunches the browser with a fine hovering pointer (headless reports hover: none, where the close always shows), then proves the close's size, place, hover/focus reveal and click/Enter, hover and focus pausing past the timer, slow drag vs flick, and the collapsed peek vs expanded stack.

