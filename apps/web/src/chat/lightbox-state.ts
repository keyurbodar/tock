import { createSignal, untrack } from "solid-js"

export interface LightboxItem {
  readonly id: string
  readonly name: string
}

export interface Opening {
  readonly items: readonly LightboxItem[]
  readonly index: number
  readonly from: HTMLElement
}

/** The open viewer lives here, apart from the viewer itself, so callers stay light and the viewer can load as its own chunk. */
export const [opening, setOpening] = createSignal<Opening>()

/** Opens the viewer grown out of the thumbnail `from` (TDS px4 Lightbox); a second open while one is up is ignored. */
export function openLightbox(items: readonly LightboxItem[], index: number, from: HTMLElement) {
  if (untrack(opening)) return
  setOpening({ items, index, from })
}
