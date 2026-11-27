# Feature map

| Feature | Journeys | Proves |
| --- | --- | --- |
| [Sidebar](sidebar.md) | shell, resize | default 320px width, drag, keyboard and double-click resize that persists |
| [Thread actions](thread-actions.md) | menu, pin, rename, dialog, toasts | roster menu opens from the row's more button; pin, rename and delete-cancel round-trip through the server; Archive shows a toast whose Undo restores the row |
| [Chat](chat.md) | send, worklog | a new chat gets a UUID url that survives the first send; the activity line and work log are text only and open and close |
| [Shortcuts](shortcuts.md) | shortcuts, palette | `?` opens the shortcuts sheet; ⌘K opens the palette, filters, runs an action with Enter and closes on Escape |
| [Composer](composer.md) | plus, attach, mention, command | plus menu items, upload with progress, sent image and file card; `@` lists chats, inserts a thread token, first Backspace selects it and the second deletes it, the sent chip previews the chat after hover intent; `/` filters commands and runs one |
| [Links](links.md) | links | a typed URL plus a space becomes a link token; a sent link reads host and path behind the site's mark, gets no hover card, and right-click offers Open and Copy, which confirms with a toast |
| Sidebar motion | flip | archiving a row slides the rows below up into the gap (FLIP) and lands with no offset; Undo restores it |
| Connection | offline | the offline banner shows at once when the network drops (the socket is dropped without waiting for a close handshake) and turns to Back online on reconnect |
| [Interface rules](ui.md) | ui | hover gated to hover-capable pointers, unbreakable text stays in its bubble, truncated text keeps its full value reachable, controls at least 24×24 |
| Motion rules | motion | no live element transitions `all`; buttons carry the press transition; an idle chat runs no infinite loops; under reduced motion transitions cap at 150ms and no element.animate() call moves anything (sending only fades) |
| Health | diagnostics | no Solid diagnostics or page errors across the run |
- [media.md](media.md): image rows, doc cards, lightbox, finished-elsewhere dot (`lightbox`, `finished`)
- [ui.md](ui.md): interface/layout rules from the jk and ek skills (`ui`)
