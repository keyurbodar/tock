# Needs-you asks (ask_owner)

## Sub-features
Approval card (Approve / Deny keys) and question card (option keys) in the transcript, folding into an answered line; ask row in the work log with the amber needs orb and pill buttons; activity line in needs state shows the question.

## How to get to it (user POV)
Send a prompt containing "approve" (approval) or "question"/"choose" (options) to the demo model.

## Driving it with agent-browser
`bun scripts/verify.ts ask question`. `ask` approves from the card and waits for the run to finish; `question` answers from the work log pills.

## Gotchas
The server keeps the pending ask in memory (`pendingAsks`); a Durable Object restart while parked loses the route for `ask.answer`.
