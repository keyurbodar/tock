# Thread actions

## Sub-features
Rename (inline), Pin/Unpin, Mark as Unread/Read, Copy Link, Archive/Unarchive, Delete with confirmation.

## How to get to it (user POV)
Hover a chat in the sidebar and press the `…` button.

## Driving it with agent-browser
`bun scripts/verify.ts menu pin rename dialog`. Items are chosen by their visible text inside `.tds-menu-item` or `.tds-button`.

## Gotchas
Metadata lives in the `tock_threads` table and comes back on `session.list` as `meta`; `rename` reloads the page to prove it persisted.
