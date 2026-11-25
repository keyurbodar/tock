import { cases } from "../case"
import { Button } from "../../src/button"
import { LightboxAction, LightboxBar, LightboxMedia, LightboxStrip, PanZoomControls, lightboxImage, lightboxThumbnail } from "../../src/lightbox"
import { glyphs } from "../../src/glyph"

const noop = () => {}
const view = { zoom: 1, minZoom: 1, maxZoom: 4, nativeZoom: 1, setZoom: noop, setPan: noop }
const thumbs = [
  ["Files pane (flattened shadow DOM)", "p_qQ_3vn3y"],
  ["Explore — Plugins (logos fixed)", "jFsx2idLfZ"],
  ["Your themes (grid fixed)", "4Zs3glEZMS"],
  ["Contact sheet, page 20", "YV5aqrBAlP"],
].map(([label, asset]) => ({ key: asset, kind: "image" as const, label, src: `https://doop.design/a/${asset}.jpg` }))

export default cases("Lightbox", [
  ["RzFF6Hed67|div[data-media-preview] div.absolute.bottom-3.left-3|0", "zoom controls at fit", () => <PanZoomControls view={view} />],
  [
    "RzFF6Hed67|div[data-media-preview] > div.absolute.inset-0 > div.flex.h-full|0",
    "image at fit",
    () => (
      <LightboxMedia entryKey="a" image zoomable style={{ transform: "translate(0px, 0px) scale(1)" }}>
        <div className="relative">
          <span className="contents" data-slot="context-menu-trigger">
            <img alt="screenshot.png" src="https://doop.design/a/rmiXayAIoz.jpg" draggable={false} crossOrigin="anonymous" className={lightboxImage} />
          </span>
          <div className="absolute" data-slot="media-comment-layer" style={{ left: 0, top: 0, width: 1440, height: 818, pointerEvents: "none" }} />
        </div>
      </LightboxMedia>
    ),
  ],
  [
    "RzFF6Hed67|div[data-media-preview] > div.pointer-events-none|0",
    "single image actions",
    () => (
      <LightboxBar onClose={noop}>
        <Button size="sm" aria-pressed={false} aria-keyshortcuts="C" data-slot="tooltip-trigger" className="pointer-coarse:hidden">
          <svg xmlns="http://www.w3.org/2000/svg" width="24px" height="24px" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M11.9998 7.99999L11.9998 11M11.9998 11V14M11.9998 11H8.99976M11.9998 11H14.9998M11.9977 20.5358L14.7377 18.2657C14.9171 18.1171 15.1427 18.0358 15.3757 18.0358L17.002 18.0358C18.6588 18.0358 20.002 16.6926 20.002 15.0358V7C20.002 5.34314 18.6588 4 17.0019 4L7.00195 4.00002C5.3451 4.00002 4.00195 5.34317 4.00195 7.00002V15.0358C4.00195 16.6926 5.3451 18.0358 7.00195 18.0358H8.65157C8.8865 18.0358 9.11393 18.1185 9.29398 18.2694L11.9977 20.5358Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Annotate
        </Button>
        <LightboxAction label="Copy screenshot.png" hint="Copy image" onClick={noop}>
          {glyphs.copy}
        </LightboxAction>
        <LightboxAction label="Download screenshot.png" hint="Download image" onClick={noop}>
          {glyphs.download}
        </LightboxAction>
      </LightboxBar>
    ),
  ],
  [
    "sB6Dyj3uO2|[data-slot=lightbox-strip]|0",
    "four thumbnails, first current",
    () => (
      <LightboxStrip
        entries={thumbs}
        index={0}
        onIndexChange={noop}
        initialWindow={{ start: 0, end: 4 }}
        renderThumbnail={(entry) => <img alt={entry.label} src={entry.src} loading="lazy" crossOrigin="anonymous" className={lightboxThumbnail} />}
      />
    ),
  ],
])
