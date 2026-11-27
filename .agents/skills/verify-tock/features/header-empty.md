# Header, offline banner, empty states

- `empty`: home shows the "Say hi to toast" mascot state with a New chat button; a fresh thread shows it without the button; a sidebar search with no hits shows the hairline "Nothing matches that" object.
- `header`: 50 avatar, 31 pill, 14px title; Share copies the link with a "Link copied" toast; Search in chat opens the find bar, counts "1 of N", paints the current match with the `tds-find-on` highlight, says "No matches", and Esc closes it and clears highlights. Cmd/Ctrl+F opens it too.
- `offline`: `agent-browser set offline on` closes the socket (the app closes it on the window `offline` event); the wifi-slash banner slides in 96 from the top, then turns green "Back online" after reconnecting.

- `revealstable`: from the moment the run settles until the last word has faded in, the activity line does not move (under 0.5px). Words take their final space as soon as they arrive; the reveal only fades them in. Fails at about 63px on the old prefix reveal.
