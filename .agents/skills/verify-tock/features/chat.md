# Chat

## Sub-features
New chat url, composer send, bubbles, activity line, floating work log with expandable step bodies.

## How to get to it (user POV)
Press the pencil, type in the composer, press Enter. Click "Worked for …" under a reply that used tools.

## Driving it with agent-browser
`bun scripts/verify.ts send worklog`. The worklog journey asserts transparent backgrounds on `.tds-act-button`, `.tds-act-caret` and every `.tds-ws-line`, at rest and on hover.

## Gotchas
Only turns that call tools get an activity line; the faux model's first reply in a fresh Durable Object does.
