# Motion reference from the three videos

Frames are pulled at 2 fps with `ffmpeg -vf fps=2,scale=360:-1`. Each item maps a moment in a video to the Tock behaviour it sets. These are web adaptations, not literal ports of the mobile gestures.

## Claude Duet: Claude Code sessions (v1)
- **Hold to fan sessions.** Holding the orb button veils and blurs the page. Sessions rise as glass pills, staggered from the button upward, nearest first. Sliding up lights the pill under the pointer with a rose fill that grows 3%, and release opens it. On the web this becomes holding the toast row (320ms), plus click-to-open for a mouse.
- **Pill becomes the chat.** The chosen pill grows into the chat surface along a shared element path (title stays put, the card's corners ease from 27 to the page radius). Closing runs the path backwards into the row.
- **Approve in place.** The approval card sits in the thread with Decline and a dark Allow key. Pressing Allow gives a press scale and a ring, then the card collapses into a one-line step ("Pushing fix/login-loop") with a shimmer.
- **Queued message while working.** Typing during a run sends a dimmed bubble with a caption. It turns solid when the agent picks it up.
- **Mascot reacts.** A burst on the toast face when a PR lands. Rare, so it can be expressive.

## Claude sessions motion study (v2)
- **Layer stack:** Page, Scrim, Card, Content, Title. The title travels on its own layer while the card grows, so text never scales.
- **Sheet under the finger.** A workflow card drags open with the pointer one to one, reporting progress ("open 81%"), and settles on release with the sheet curve. Velocity decides open or closed, not distance alone.
- **Corner continuity.** The card keeps the device radius while it grows, then eases to the content radius as it lands.
- **Back into the row.** Dismissing shrinks the chat back into its row and the home list un-blurs underneath.

## Claude Android (v3)
- **Search grows from its icon.** The field expands from the header glyph, the list cross-fades, and matches are bolded as you type with no list jump.
- **Model sheet.** It rises from the bottom with the selected row on a cap. The effort control is a segmented track whose knob slides between stops while the label morphs (Medium to High to Max).
- **Streaming.** Lines appear in place with no reflow above them. Headings and bullets land as whole blocks.
- **Drawer pushes the page.** The sidebar slides in and the page moves with it, dimming.
- **Tab label pill.** Tapping a tab shows its name as a dark pill above it, then it fades. The "Finished" toast rises above the composer as a small pill.

## Rules taken from them
1. Every surface comes from the thing you touched, and goes back into it.
2. Text never scales during a shared element move; it travels on its own layer and morphs with torph.
3. Anything under a pointer follows it one to one, then settles on the sheet curve using velocity.
4. Staggers run 24ms apart, nearest to the pointer first.
5. Frequent actions (send, menu open from the keyboard, palette) don't animate their opening.
