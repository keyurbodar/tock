# Needs-you asks (ask_owner)

## Sub-features
Approval card (Approve / Deny keys) and question card (option keys) in the transcript, folding into an answered line; ask row in the work log with the amber needs orb and pill buttons; activity line in needs state shows the question.

## How to get to it (user POV)
Send a prompt containing "approve" (approval) or "question"/"choose" (options) to the demo model.

## Driving it with agent-browser
`bun scripts/verify.ts ask question`. `ask` approves from the card and waits for the run to finish; `question` answers from the work log pills.

## Gotchas
The server keeps the pending ask in memory (`pendingAsks`); a Durable Object restart while parked loses the route for `ask.answer`.

## Numbered and stepped questions, Undo, Retry

Question options carry their number (1, 2, 3); with focus outside a field (or an empty composer) pressing a digit picks that option and Enter answers. An ask with a questions array (demo prompt "two questions") steps through one card with "1 of 2" and dots, and answers with one "question: choice" line per question. The answered line keeps Undo for motion.duration.ask-undo before the answer is sent. A model error or failed run shows a CxAlerts card with a Retry key that resends the last prompt (demo prompt "fail once").

`bun scripts/verify.ts numbered multiquestion retry`.
