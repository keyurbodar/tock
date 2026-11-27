# Composer

## Sub-features
Plus menu (Photos and Files…, Paste from Clipboard), ⌘/Ctrl+O picker, paste files into the editor, drag files anywhere on the chat, upload tray with progress ring, retry and remove, sent images and file cards.

## How to get to it (user POV)
Press the + left of the composer, or drop files on the chat.

## Driving it with agent-browser
`bun scripts/verify.ts plus attach`. `attach` uploads `~/.capy/work/verify-notes.md` and `~/.capy/work/verify-pixel.png` through the hidden file input with `agent-browser upload`, waits for both chips to reach `data-status="done"`, sends, then checks the sent image loads, the bubble has no raw `tock-file:` link, and the field shrinks back to `size.composer`.

## Gotchas
Files ride in the message as `[name](tock-file:id)` links so the model can `file_read` them; every place that shows message text as a title or preview goes through `plainText`. Drag-and-drop is not driven by the script.

## Processing (T3Code)

- Send while files upload holds the send (`.tds-held`, send button `data-held`) and fires when the uploads finish; editing or Esc cancels. Failed files block the send with a "Fix or remove" toast.
- Images over `limit.compress-kb` shrink to `limit.image-edge` as WebP before upload.
- A paste longer than `limit.paste-lines` lines becomes `pasted.txt` with a toast.
- Over `limit.prompt-chars` the field turns red and an alert explains it; send is disabled.
- `@` opens a chat list at the caret (`.tds-suggest`); Enter or Tab inserts a thread token serialised as `[@Title](tock-thread:id)`. `/` at the start of the draft lists commands (new, files, paste, shortcuts).
- A typed URL followed by a space becomes a link token.

Journeys: `mention`, `command`.

## Writing sheet

The grip at the top of the field (`.tds-sheet-grip`, shown on hover or when the field is tall) expands the field into a full-height writing sheet while the transcript recedes (`data-recede`: scales back, dims, blurs). Tap or Enter/Space on the grip toggles it; dragging the grip scrubs it and the release flings to the nearer end; a two-finger swipe over the grip scrubs too and keeps going once the grip moves away. Esc, a tap on the conversation, or sending collapses it. The motion is one spring from `@tock/ui/motion` (`drive` for the velocity-keeping spring on `--p`, `scrub` for drag and wheel, `recede` for the transcript) that keeps its velocity when retargeted.

Journey: `writesheet` (tap, focus, recede, Esc, mid-flight retarget, drag follows the pointer, fling open, short drag springs back, tap outside, wheel, send collapses). `smooth` samples every frame of the sheet opening, the transcript receding and a mid-flight reversal.

## Follow-up suggestions (TDS KbSugg)

The agent calls `suggest_followups` (up to three `{ emoji, label, prompt }`); the call stays in the turn's transcript, so the chips survive a reload, and it never shows as a work-log step. After the run settles they float above the composer between the plus and Send columns, entering with `enter.followup` (70ms stagger). Hover shows the full prompt, × (shown on row hover) dismisses the row for that turn (remembered in localStorage), typing hides them until the field is empty, and a pick sends the prompt. The demo model proposes three on every planned reply. `bun scripts/verify.ts followups`.
