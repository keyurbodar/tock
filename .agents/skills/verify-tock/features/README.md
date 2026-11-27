# Feature map

| Feature | Journeys | Proves |
| --- | --- | --- |
| [Sidebar](sidebar.md) | shell, resize | default 320px width, drag, keyboard and double-click resize that persists |
| [Thread actions](thread-actions.md) | menu, pin, rename, dialog, toasts | roster menu opens from the row's more button; pin, rename and delete-cancel round-trip through the server; Archive shows a toast whose Undo restores the row |
| [Chat](chat.md) | send, worklog | a new chat gets a UUID url that survives the first send; the activity line and work log are text only and open and close |
| [Shortcuts](shortcuts.md) | shortcuts, palette | `?` opens the shortcuts sheet; ⌘K opens the palette, filters, runs an action with Enter and closes on Escape |
| [Composer](composer.md) | plus, attach, mention, command | plus menu items, upload with progress, sent image and file card; `@` lists chats, inserts a thread token, first Backspace selects it and the second deletes it, the sent chip previews the chat after hover intent; `/` filters commands and runs one |
| [Links](links.md) | links | a typed URL plus a space becomes a link token; a sent link reads host and path behind the site's mark, gets no hover card, and right-click offers Open and Copy, which confirms with a toast |
| Health | diagnostics | no Solid diagnostics or page errors across the run |
- [media.md](media.md): image rows, doc cards, lightbox, finished-elsewhere dot (`lightbox`, `finished`)
