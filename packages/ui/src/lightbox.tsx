import { Dialog } from "@base-ui/react/dialog"
import { motion } from "@tock/theme/motion"
import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type SyntheticEvent,
} from "react"
import { Button } from "./button"
import { cn } from "./cn"
import { glyphs } from "./glyph"
import { clampZoom, usePanZoom, type PanZoom } from "./pan-zoom"
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip"

const { zoom: Z, strip: S } = motion

export interface LightboxEntry {
  readonly key: string
  readonly kind: "image" | "video"
  readonly label: string
}

export const lightboxImage =
  "max-h-[calc(100dvh-6rem-var(--lightbox-strip,0rem))] max-w-[calc(100vw-2*var(--lightbox-gutter,1.5rem))] rounded-(--radius-card) object-contain"
export const lightboxThumbnail = "size-full object-cover"

const SCRIM =
  "fixed inset-0 z-(--z-dialog) transition-opacity duration-base ease-out data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 data-[ending-style]:duration-fast bg-overlay-media"
const POPUP =
  "fixed inset-0 z-(--z-dialog) h-dvh overflow-hidden outline-none transition-opacity duration-base ease-out data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 data-[ending-style]:duration-fast"
const THUMB =
  "absolute top-0 flex size-12 items-center justify-center overflow-hidden rounded-(--radius) text-overlay-fg opacity-50 transition-opacity duration-100 after:pointer-events-none after:absolute after:inset-px after:rounded-[inherit] after:border-2 after:border-overlay-fg after:opacity-0 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-ring-inset aria-[current=true]:opacity-100 aria-[current=true]:after:opacity-100"
const EDITABLE = "input, textarea, [contenteditable='true'], [contenteditable='plaintext-only']"
const IDLE = { on: null, x: 0, y: 0 } as const

type View = Pick<PanZoom, "zoom" | "minZoom" | "maxZoom" | "nativeZoom" | "setZoom" | "setPan">

function ZoomButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button variant="ghost" size={typeof children === "string" ? "xs" : "icon-xs"} aria-label={label} disabled={disabled} onClick={onClick}>
            {children}
          </Button>
        }
      />
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  )
}

export function PanZoomControls({ view, children }: { view: View; children?: ReactNode }) {
  const native = view.nativeZoom ?? 1
  const fit = (scale: number) => () => {
    view.setZoom(clampZoom(scale, view.maxZoom, view.minZoom))
    view.setPan({ x: 0, y: 0 })
  }
  return (
    <div
      className="absolute bottom-3 left-3 flex items-center gap-0.5 rounded-(--radius) border-[0.5px] border-border-2 bg-popover px-1 py-0.5 shadow-overlay"
      style={{ cursor: "default" }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <ZoomButton
        label="Zoom out"
        disabled={view.zoom <= view.minZoom}
        onClick={() => view.setZoom((zoom) => clampZoom(zoom / Z.step, view.maxZoom, view.minZoom))}
      >
        {glyphs.minus}
      </ZoomButton>
      <span className="min-w-10 text-center text-xs font-normal text-muted-foreground-1 tabular-nums">
        {Math.round((view.zoom / native) * 100)}%
      </span>
      <ZoomButton
        label="Zoom in"
        disabled={view.zoom >= view.maxZoom}
        onClick={() => view.setZoom((zoom) => clampZoom(zoom * Z.step, view.maxZoom, view.minZoom))}
      >
        {glyphs.plus}
      </ZoomButton>
      {view.nativeZoom === undefined ? null : (
        <>
          <ZoomButton label="Actual size (1)" onClick={fit(native)}>
            100%
          </ZoomButton>
          <ZoomButton label="Double size (2)" onClick={fit(native * 2)}>
            200%
          </ZoomButton>
        </>
      )}
      <ZoomButton
        label="Reset view (0)"
        onClick={() => {
          view.setZoom(1)
          view.setPan({ x: 0, y: 0 })
        }}
      >
        {glyphs.reset}
      </ZoomButton>
      {children}
    </div>
  )
}

export function LightboxMedia({
  entryKey,
  image,
  zoomable,
  style,
  children,
}: {
  entryKey: string
  image: boolean
  zoomable: boolean
  style?: CSSProperties
  children: ReactNode
}) {
  return (
    <div className="flex h-full w-full items-center justify-center p-6 px-[var(--lightbox-gutter,1.5rem)] pb-[calc(1.5rem+var(--lightbox-strip,0rem))]">
      <div className="flex origin-[50%_calc(50%+var(--lightbox-strip,0rem)/2)] backface-hidden motion-reduce:transition-none!" style={style}>
        <div
          key={entryKey}
          data-lightbox-media
          className={cn("contents", image && "[&_img]:select-none [&_img]:[-webkit-touch-callout:none]", zoomable && "*:cursor-zoom-in")}
        >
          {children}
        </div>
      </div>
    </div>
  )
}

export function LightboxBar({ position, children, onClose }: { position?: string; children?: ReactNode; onClose: () => void }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-4 grid grid-cols-[minmax(0,1fr)_auto_minmax(max-content,1fr)] items-center gap-2 pr-[calc(1rem+var(--lightbox-controls,0px))] pl-4">
      <span />
      {position === undefined ? <span /> : <span className="text-sm tabular-nums text-overlay-fg">{position}</span>}
      <div data-slot="lightbox-actions" className="flex items-center justify-end gap-2 *:pointer-events-auto">
        {children}
        <Button size="icon-sm" aria-label="Close preview" onClick={onClose}>
          {glyphs.close}
        </Button>
      </div>
    </div>
  )
}

export function LightboxAction({
  label,
  hint,
  disabled,
  onClick,
  children,
}: {
  label: string
  hint: string
  disabled?: boolean
  onClick?: () => void
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button size="icon-sm" aria-label={label} disabled={disabled} onClick={onClick}>
            {children}
          </Button>
        }
      />
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  )
}

export function LightboxStrip<Entry extends LightboxEntry>({
  entries,
  index,
  onIndexChange,
  renderThumbnail,
  initialWindow,
}: {
  entries: readonly Entry[]
  index: number
  onIndexChange: (index: number) => void
  renderThumbnail: (entry: Entry) => ReactNode
  initialWindow?: { readonly start: number; readonly end: number }
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const current = useRef(index)
  const centered = useRef(false)
  const count = entries.length
  const [range, setRange] = useState(initialWindow ?? { start: 0, end: 0 })

  const measure = (element: HTMLElement) => {
    const start = Math.max(0, Math.floor(element.scrollLeft / S.pitch) - S.overscan)
    const end = Math.min(count, Math.ceil((element.scrollLeft + element.clientWidth) / S.pitch) + S.overscan)
    setRange((previous) => (previous.start === start && previous.end === end ? previous : { start, end }))
  }
  const center = useEffectEvent((element: HTMLElement, behavior: ScrollBehavior) => {
    if (element.clientWidth === 0) return
    element.scrollTo({ left: current.current * S.pitch - (element.clientWidth - S.thumb) / 2, behavior })
    centered.current = true
    if (behavior === "instant") measure(element)
  })

  useLayoutEffect(() => {
    current.current = index
    const element = scroller.current
    if (element) center(element, centered.current && !matchMedia("(prefers-reduced-motion: reduce)").matches ? "smooth" : "instant")
  }, [index])

  useEffect(() => {
    const element = scroller.current
    if (!element) return
    const observer = new ResizeObserver(() => center(element, "instant"))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={scroller}
      data-slot="lightbox-strip"
      role="group"
      aria-label="Thumbnails"
      className="absolute bottom-3 left-1/2 hidden max-w-[calc(100vw-30rem)] -translate-x-1/2 overflow-x-auto scrollbar-hide [--scroll-fade-ramp:24px] sm:flex md:scroll-fade-x"
      onScroll={(event) => measure(event.currentTarget)}
      onWheel={(event) => event.stopPropagation()}
    >
      <div className="relative h-12 shrink-0" style={{ width: count * S.pitch - S.gap }}>
        {entries.slice(range.start, range.end).map((entry, offset) => {
          const at = range.start + offset
          return (
            <button
              key={entry.key}
              type="button"
              aria-label={`Show ${entry.label}`}
              aria-current={at === index ? "true" : undefined}
              tabIndex={at === index ? 0 : -1}
              onClick={() => onIndexChange(at)}
              style={{ left: at * S.pitch }}
              className={THUMB}
            >
              {renderThumbnail(entry)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function Lightbox<Entry extends LightboxEntry>({
  entries,
  index,
  onIndexChange,
  onClose,
  renderMedia,
  renderThumbnail,
  renderActions,
  onEscape,
}: {
  entries: readonly Entry[]
  index: number
  onIndexChange: (index: number) => void
  onClose: () => void
  renderMedia: (entry: Entry) => ReactNode
  renderThumbnail: (entry: Entry) => ReactNode
  renderActions?: (entry: Entry) => ReactNode
  onEscape?: () => boolean
}) {
  const entry = entries[index]
  const count = entries.length
  const image = entry?.kind === "image"
  const step = (by: number) => onIndexChange((index + by + count) % count)
  const press = useRef<{ on: "media" | "backdrop" | null; x: number; y: number }>(IDLE)
  const view = usePanZoom(
    Z.max,
    entry?.kind === "image"
      ? {
          key: entry.key,
          onTap: (x, y, double) => {
            if (press.current.on === "backdrop") onClose()
            else if (press.current.on === "media" && double) view.toggleZoom(x, y)
          },
          onSwipe: step,
        }
      : undefined,
    1,
  )
  const popup = useRef<HTMLDivElement>(null)
  const menuOpen = useRef(false)

  useEffect(() => {
    const track = () => {
      menuOpen.current = popup.current?.querySelector('[aria-haspopup="menu"][data-popup-open]') != null
    }
    window.addEventListener("pointerdown", track, true)
    return () => window.removeEventListener("pointerdown", track, true)
  }, [])

  const zoomed = image && (view.zoom > 1 || view.pan.x !== 0 || view.pan.y !== 0)
  const { setZoom, setPan } = view
  const reset = useEffectEvent(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  })
  useLayoutEffect(() => reset(), [entry?.key])

  if (entry === undefined) return null

  const settle = (event: PointerEvent<HTMLElement>) => {
    view.onPointerUp(event)
    press.current = IDLE
    view.setDragged(false)
  }

  const onKeyDownCapture = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && event.target.closest('[role="dialog"]') !== event.currentTarget) return
    if (document.querySelector('[role="menu"][data-open]') !== null) return
    const editing = event.target instanceof Element && event.target.closest(EDITABLE) !== null
    if (image && !editing) view.onKeyDown(event)
    if (event.key === "Escape") {
      event.preventDefault()
      event.stopPropagation()
      if (onEscape?.() !== true) onClose()
      return
    }
    if (count <= 1 || editing) return
    if (!event.shiftKey && event.target instanceof Element && event.target.closest('[data-slot="video-player"], video') !== null) return
    if (event.key === "ArrowLeft") {
      event.preventDefault()
      step(-1)
    }
    if (event.key === "ArrowRight") {
      event.preventDefault()
      step(1)
    }
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!(event.target instanceof Node) || !event.currentTarget.contains(event.target)) return
    const onMedia = event.target instanceof Element && event.target.closest("[data-lightbox-media]") !== null
    press.current = { on: event.button !== 0 || menuOpen.current ? null : onMedia ? "media" : "backdrop", x: event.clientX, y: event.clientY }
    if (event.button !== 0) return
    if (zoomed || (image && event.pointerType === "touch")) view.onPointerDown(event)
    else if (press.current.on === "backdrop") event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = press.current
    if (start.on !== null && (Math.abs(event.clientX - start.x) > Z.drag || Math.abs(event.clientY - start.y) > Z.drag)) view.setDragged(true)
    if (zoomed || (image && event.pointerType === "touch")) view.onPointerMove(event)
  }

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (image && event.pointerType === "touch") return settle(event)
    const start = press.current
    const clicked = start.on !== null && !view.dragged()
    settle(event)
    if (!clicked) return
    if (start.on === "backdrop") onClose()
    else if (image) view.toggleZoom(start.x, start.y)
  }

  const onContextMenuCapture = (event: SyntheticEvent<HTMLDivElement>) => {
    const touch = "pointerType" in event.nativeEvent && event.nativeEvent.pointerType === "touch"
    if (!image || !(view.panning || touch)) return
    event.preventDefault()
    event.stopPropagation()
  }

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop data-slot="dialog-overlay" forceRender className={SCRIM} />
        <Dialog.Popup
          ref={popup}
          data-slot="dialog-content"
          data-media-preview=""
          initialFocus={() => popup.current?.querySelector<HTMLElement>("[data-lightbox-media] video") ?? popup.current}
          aria-label={entry.label}
          className={cn(
            POPUP,
            count > 1 && "sm:[--lightbox-strip:3rem]",
            count > 1 && (image ? "pointer-fine:[--lightbox-gutter:3.5rem]" : "[--lightbox-gutter:3.5rem]"),
          )}
          onKeyDownCapture={onKeyDownCapture}
        >
          <div
            ref={image ? view.setStage : undefined}
            className="absolute inset-0 overflow-hidden"
            style={{ touchAction: image ? "none" : undefined, cursor: zoomed ? (view.panning ? "grabbing" : "grab") : "default" }}
            onContextMenuCapture={onContextMenuCapture}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={settle}
            onLostPointerCapture={(event) => {
              if (image && event.pointerType === "touch") view.onPointerUp(event)
            }}
          >
            <LightboxMedia
              entryKey={entry.key}
              image={image}
              zoomable={image && view.zoom <= 1}
              style={
                image
                  ? {
                      transform: `translate(${view.pan.x}px, ${view.pan.y}px) scale(${view.zoom})`,
                      willChange: view.panning ? "transform" : undefined,
                    }
                  : undefined
              }
            >
              {renderMedia(entry)}
            </LightboxMedia>
            {image ? <PanZoomControls view={view} /> : null}
          </div>
          <LightboxBar position={count > 1 ? `${index + 1} / ${count}` : undefined} onClose={onClose}>
            {renderActions?.(entry)}
          </LightboxBar>
          {count > 1 ? (
            <>
              <Button
                size="icon-sm"
                aria-label="Previous item"
                className={cn("absolute top-1/2 left-4 -translate-y-1/2", image && "pointer-coarse:hidden")}
                onClick={() => step(-1)}
              >
                {glyphs.previous}
              </Button>
              <Button
                size="icon-sm"
                aria-label="Next item"
                className={cn("absolute top-1/2 right-4 -translate-y-1/2", image && "pointer-coarse:hidden")}
                onClick={() => step(1)}
              >
                {glyphs.next}
              </Button>
              <LightboxStrip entries={entries} index={index} onIndexChange={onIndexChange} renderThumbnail={renderThumbnail} />
            </>
          ) : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
