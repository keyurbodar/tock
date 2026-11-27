# Code blocks, captions, dividers

- `code`: the reply's code block is labelled with its language; Copy morphs the copy icon into a check (both mid-transition at 150ms) and back after `motion.duration.confirm`.
- `divider`: the first message of the day sits under a centred "Today" time divider (TDS CxDividersTime).
- `expand`: "Show a long code block" makes the demo model reply with 30 long lines; the block starts collapsed to `size.code-collapsed`, long lines scroll sideways, "Show all N lines" expands it and offers "Show less".
- `stopped`: pressing Stop while a run is going leaves a faint "Stopped" caption under the turn.
- Not covered: the "Sends when you're back online" caption (needs the socket forced offline).

## Time passed and New dividers

A gap of limit.divider-passed-min minutes up to limit.divider-sitting-hours inside one day reads "40 minutes later" / "2 hours later" between steam-wave hairlines (data-tone="passed"); longer gaps keep the day and time. Messages that arrive while you are scrolled up get a rose "N new" divider (data-tone="new") where they start; it stays after you jump down and clears when you send. `bun scripts/verify.ts newdivider`.
