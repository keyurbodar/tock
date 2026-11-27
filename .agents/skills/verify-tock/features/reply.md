# Reply and quote

Source: apps/web/src/chat/reply.tsx (hover Reply button, context menu, selection pair, preview, chip, jump), chat/quote.ts (state, markdown), styles/reply.css; server plain.ts strips the quote line from titles, demo.ts answers a quoted message with "On “<excerpt>”: <message>".

Sent shape: `> [<excerpt>](tock-quote:<ref>)` then a blank line and the message; ref comes from chat/items.ts. Bubbles carry `data-ref`.

| Feature | Journey | Proves |
|---|---|---|
| Reply from the bubble | replyrail | hover shows Reply beside the agent bubble; the preview docks above the composer naming toast with the excerpt and focuses the field; the socket frame carries the tock-quote line; the sent bubble shows an author + excerpt chip above plain text; the demo agent answers about the quote (the server got it); clicking the chip scrolls to the source and flashes it rose |
| Quote a selection | quoteselect | selecting text in an agent bubble shows Quote / Reply above it; pressing keeps the selection and copy still runs; Quote puts exactly the selection in the preview; Reply on your own bubble replies to You with the whole message |
| Pair under the header | quoteheader | a selection right under the header band flips the Quote / Reply pair below it, clear of the header; with room above it sits above |
| Clear | quoteesc | the bubble context menu offers Reply and Copy Text; Esc clears the preview; the x clears it |
| Elsewhere | quotesidebar | sidebar row and peek lines show no quote markup; the peek shows a quoted reply with a compact chip line (bar, author, one-line excerpt) above its text, read from the rendered peek so it runs on deploys |
