# Composer

## Sub-features
Plus menu (Photos and Files…, Paste from Clipboard), ⌘/Ctrl+O picker, paste files into the editor, drag files anywhere on the chat, upload tray with progress ring, retry and remove, sent images and file cards.

## How to get to it (user POV)
Press the + left of the composer, or drop files on the chat.

## Driving it with agent-browser
`bun scripts/verify.ts plus attach`. `attach` uploads `~/.capy/work/verify-notes.md` and `~/.capy/work/verify-pixel.png` through the hidden file input with `agent-browser upload`, waits for both chips to reach `data-status="done"`, sends, then checks the sent image loads, the bubble has no raw `tock-file:` link, and the field shrinks back to `size.composer`.

## Gotchas
Files ride in the message as `[name](tock-file:id)` links so the model can `file_read` them; every place that shows message text as a title or preview goes through `plainText`. Drag-and-drop is not driven by the script.
