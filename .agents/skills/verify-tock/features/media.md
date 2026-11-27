# Media, lightbox and finished-elsewhere

## Sub-features
Sent image rows of 1, 2 or 3 (240×170, 170×150, 130×130) with 18px outer and 6px shared inner corners; 230-wide r16 doc cards; the lightbox (TDS px4) that grows out of the thumbnail, counts "2 of 3", shows the size, Download/Copy/Close, arrows and buttons, a 14px end bounce, a 44px filmstrip, and Escape shrinks it back into the thumbnail; when another chat finishes, a toast that turns into a rose dot flying into that chat's sidebar row, which then reads unread.

## How to get to it (user POV)
Attach two or three images in the composer and send; click one. For the dot: send a message, open another chat with the pencil before the reply ends.

## Driving it with agent-browser
`bun scripts/verify.ts lightbox finished`. lightbox asserts the row's sizes and corner radii, the hidden source thumbnail, the count across ArrowRight, the end bounce, the prev button and filmstrip, click-to-zoom to 200% with drag to pan (the click after a drag keeps the zoom), 0 to fit, a Tab trap inside the viewer, and that Escape restores the thumbnail and returns focus to it. Also ported from T3Code but not asserted: neighbour preloading, Ctrl/pinch-wheel zoom around the pointer, +/- keys, arrow keys panning while zoomed, touch swipe between images, and a failure line when a picture won't load. `calmtext` samples the lightbox zoom % every frame across Zoom in, Zoom in, Zoom out and proves the calm TextMorph never moves a digit vertically (no torph items, no transforms, drift under 0.5px), cross-fades the new value in, reads back through the plain render, and swaps instantly on a burst of Ctrl-wheel zoom. finished asserts the toast, a `.tds-flight-dot[data-chat]`, and the unread dot on chat A's row.

## Gotchas
The lightbox is fixed over everything (z lightbox 60) and listens for keys in the capture phase so the app's own Escape and arrow shortcuts don't fire under it. The dot is skipped (row marked unread at once) when the toast is hovered or the row is scrolled out of the list.
