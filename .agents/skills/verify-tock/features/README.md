# Feature map

| Feature | Journeys | Proves |
| --- | --- | --- |
| [Sidebar](sidebar.md) | shell, resize, search | default 320px width, drag, keyboard and double-click resize that persists, ⌘K focuses search |
| [Thread actions](thread-actions.md) | menu, pin, rename, dialog | roster menu opens from the row's more button; pin, rename and delete-cancel round-trip through the server |
| [Chat](chat.md) | send, worklog | a new chat gets a UUID url that survives the first send; the activity line and work log are text only and open and close |
| [Shortcuts](shortcuts.md) | shortcuts | `?` opens the shortcuts sheet and Escape closes it |
| [Composer](composer.md) | plus, attach | plus menu items, upload with progress, sent image and file card, composer returns to its resting height |
| Link cards | hovercard | a link card waits for hover intent (450ms), shows host and path, stays while hovered and leaves after the pointer goes. The faux model writes no links, so the journey appends one to the last finished reply |
| Health | diagnostics | no Solid diagnostics or page errors across the run |
