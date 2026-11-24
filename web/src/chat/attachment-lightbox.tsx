import { glyphs } from "@tock/ui/glyph"
import { Lightbox, LightboxAction, lightboxImage, lightboxThumbnail, type LightboxEntry } from "@tock/ui/lightbox"
import { copyImage, downloadMedia } from "./media"

export interface MediaEntry extends LightboxEntry {
  readonly url: string
}

export function AttachmentLightbox({
  entries,
  index,
  onIndexChange,
  onClose,
}: {
  entries: readonly MediaEntry[]
  index: number
  onIndexChange: (index: number) => void
  onClose: () => void
}) {
  return (
    <Lightbox
      entries={entries}
      index={index}
      onIndexChange={onIndexChange}
      onClose={onClose}
      renderMedia={(entry) => (
        <div className="relative">
          <img alt={entry.label} src={entry.url} draggable={false} className={lightboxImage} />
        </div>
      )}
      renderThumbnail={(entry) => <img alt={entry.label} src={entry.url} loading="lazy" className={lightboxThumbnail} />}
      renderActions={(entry) => (
        <>
          <LightboxAction label={`Copy ${entry.label}`} hint="Copy image" onClick={() => copyImage(entry.url)}>
            {glyphs.copy}
          </LightboxAction>
          <LightboxAction label={`Download ${entry.label}`} hint="Download image" onClick={() => downloadMedia(entry.url, entry.label)}>
            {glyphs.download}
          </LightboxAction>
        </>
      )}
    />
  )
}
