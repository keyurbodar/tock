import { Children, createContext, type CSSProperties, isValidElement, type ReactNode, useContext, useState, useSyncExternalStore } from "react"
import { cn } from "./cn"

export interface ImageSize {
  readonly width: number
  readonly height: number
}

export interface ViewedImage {
  readonly src: string
  readonly alt: string
}

export type ViewImages = (images: readonly ViewedImage[], index: number) => void

export const MarkdownImageView = createContext<ViewImages | undefined>(undefined)

const GalleryImages = createContext<readonly ViewedImage[] | undefined>(undefined)

const sizes = new Map<string, ImageSize>()
const watchers = new Set<() => void>()

export function rememberImageSize(src: string, size: ImageSize) {
  const known = sizes.get(src)
  if (size.width <= 0 || size.height <= 0 || (known?.width === size.width && known.height === size.height)) return
  sizes.set(src, size)
  for (const notify of watchers) notify()
}

const watch = (notify: () => void) => {
  watchers.add(notify)
  return () => void watchers.delete(notify)
}

function useImageSize(src: string | undefined) {
  const read = () => (src === undefined ? undefined : sizes.get(src))
  return useSyncExternalStore(watch, read, read)
}

const MIN_RATIO = 3 / 4
const MAX_RATIO = 3

const BOX = "flex aspect-video w-(--media-box-w) max-w-full items-center justify-center rounded-(--radius-card)"
const PLACED = "w-(--placed-w) max-w-full aspect-(--placed-ar)"
const TILE = "relative overflow-hidden rounded-(--radius-card) border-[0.5px] border-border-2 bg-secondary"
const FILL = "[&_[data-slot=image-unavailable]]:size-full [&_[role=status]]:size-full [&_img]:size-full [&_img]:object-cover [&_img]:object-top"

const VARIANT = {
  pair: "aspect-[4/3] min-w-0 flex-1",
  hero: "min-w-0 flex-[1.5]",
  stack: "min-h-0 w-full flex-1",
  grid: "aspect-video min-w-0 flex-1",
  fit: "min-w-0",
} as const

const placed = (size: ImageSize) =>
  ({
    "--placed-w": `min(var(--media-box-w), calc(var(--media-box-h) * ${size.width} / ${size.height}), ${size.width}px)`,
    "--placed-ar": `${size.width} / ${size.height}`,
  }) as CSSProperties

const cropped = (size: ImageSize | undefined) => size !== undefined && size.width / size.height < MIN_RATIO

function single(size: ImageSize): CSSProperties {
  const ratio = Math.max(size.width / size.height, MIN_RATIO)
  return { width: `min(100%, var(--media-box-w), ${size.width}px, calc(var(--media-box-h) * ${ratio}))`, aspectRatio: `${ratio}` }
}

function ImageUnavailable({ label }: { label?: string }) {
  return (
    <span
      role="img"
      data-slot="image-unavailable"
      aria-label={label === undefined ? "Image unavailable" : `${label}, image unavailable`}
      className={cn(BOX, "flex-col gap-1.5 border-[0.5px] border-border-2 bg-secondary p-4 text-center")}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24px"
        height="24px"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className="size-(--icon-base) text-icon-muted"
      >
        <path
          d="M4 14.2105L6.84488 12.0821C7.66137 11.5378 8.75215 11.6663 9.41987 12.3853C10.9123 13.9926 12.6426 15.4538 15 15.4538C17.1727 15.4538 18.6125 14.6485 20 13.261M7 20H17C18.6569 20 20 18.6569 20 17V7C20 5.34315 18.6569 4 17 4H7C5.34315 4 4 5.34315 4 7V17C4 18.6569 5.34315 20 7 20ZM17 9C17 10.1046 16.1046 11 15 11C13.8954 11 13 10.1046 13 9C13 7.89543 13.8954 7 15 7C16.1046 7 17 7.89543 17 9Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
      <span className="text-xs font-medium text-muted-foreground">Image unavailable</span>
      {label === undefined ? null : <span className="line-clamp-2 text-2xs text-muted-foreground-2 wrap-anywhere">{label}</span>}
    </span>
  )
}

export function MarkdownImage({ src, alt = "" }: { src?: string; alt?: string }) {
  const view = useContext(MarkdownImageView)
  const gallery = useContext(GalleryImages)
  const size = useImageSize(src)
  const [failed, setFailed] = useState<string>()
  if (src === undefined || failed === src) return <ImageUnavailable label={alt === "" ? undefined : alt} />
  const open =
    view === undefined
      ? undefined
      : () => {
          const images = gallery ?? [{ src, alt }]
          view(images, Math.max(0, images.findIndex((image) => image.src === src)))
        }
  return (
    <>
      <span hidden />
      <span className="contents" data-slot="context-menu-trigger">
        <img
          key={src}
          src={src}
          crossOrigin="anonymous"
          alt={alt}
          width={size?.width}
          height={size?.height}
          style={size === undefined ? undefined : placed(size)}
          onLoad={(event) => rememberImageSize(src, { width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
          onError={() => setFailed(src)}
          className={cn(size !== undefined && PLACED, "max-h-(--media-box-h)", open !== undefined && "focus-visible:outline-ring-inset")}
          {...(open === undefined
            ? {}
            : {
                role: "button",
                tabIndex: 0,
                "aria-label": `View ${alt}`,
                onClick: open,
                onKeyDown: (event) => {
                  if (event.key !== "Enter" && event.key !== " ") return
                  event.preventDefault()
                  open()
                },
              })}
        />
      </span>
    </>
  )
}

const Fade = () => <span className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-linear-to-t from-secondary to-transparent" />

type Tile = (index: number, variant: keyof typeof VARIANT, extra?: number, style?: CSSProperties) => ReactNode

function Layout({ count, ratios, tile }: { count: number; ratios: readonly number[]; tile: Tile }) {
  if (count >= 2 && count !== 3 && ratios.length === Math.min(count, 4)) {
    const rows = count === 2 ? ((ratios[0] ?? 0) + (ratios[1] ?? 0) > 4 ? [[0], [1]] : [[0, 1]]) : [[0, 1], [2, 3]]
    const height = count === 2 ? "var(--media-box-h)" : "calc(var(--media-box-h) * 0.6)"
    return (
      <div className="flex w-full max-w-(--media-box-w) flex-col gap-1">
        {rows.map((row) => (
          <div
            key={row[0]}
            className="flex gap-1"
            style={{ width: `min(100%, calc(${row.reduce((sum, index) => sum + (ratios[index] ?? 0), 0)} * ${height} + ${row.length - 1} * 0.25rem))` }}
          >
            {row.map((index) => tile(index, "fit", index === 3 ? count - 4 : undefined, { flex: `${ratios[index]} 1 0%`, aspectRatio: `${ratios[index]}` }))}
          </div>
        ))}
      </div>
    )
  }
  if (count === 2) {
    return (
      <div className="flex w-full max-w-(--media-box-w) gap-1">
        {tile(0, "pair")}
        {tile(1, "pair")}
      </div>
    )
  }
  if (count === 3) {
    return (
      <div className="flex aspect-[2/1] w-full max-w-(--media-box-w) gap-1">
        {tile(0, "hero")}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {tile(1, "stack")}
          {tile(2, "stack")}
        </div>
      </div>
    )
  }
  if (count < 4) return null
  return (
    <div className="flex w-full max-w-(--media-box-w) flex-col gap-1">
      <div className="flex gap-1">
        {tile(0, "grid")}
        {tile(1, "grid")}
      </div>
      <div className="flex gap-1">
        {tile(2, "grid")}
        {tile(3, "grid", count - 4)}
      </div>
    </div>
  )
}

const imageOf = (child: ReactNode): ViewedImage | undefined => {
  if (!isValidElement<{ src?: unknown; alt?: unknown }>(child) || typeof child.props.src !== "string") return undefined
  return { src: child.props.src, alt: typeof child.props.alt === "string" ? child.props.alt : "" }
}

export function MarkdownGallery({ children }: { children: ReactNode }) {
  const items = Children.toArray(children)
  const images = items.map(imageOf)
  const known = () => images.map((image) => (image === undefined ? "" : `${sizes.get(image.src)?.width}x${sizes.get(image.src)?.height}`)).join(",")
  useSyncExternalStore(watch, known, known)
  const measured = images.map((image) => (image === undefined ? undefined : sizes.get(image.src)))
  const viewable = images.flatMap((image) => image ?? [])
  const first = measured[0]
  if (items.length === 1) {
    return (
      <GalleryImages value={viewable}>
        {first === undefined ? (
          <span
            data-slot="markdown-gallery"
            className={cn(TILE, "block w-fit max-w-(--media-box-w) [&_img]:block [&_img]:max-h-(--media-box-h) [&_img]:w-auto [&_img]:max-w-full")}
          >
            {items[0]}
          </span>
        ) : (
          <span data-slot="markdown-gallery" className={cn(TILE, "block", FILL)} style={single(first)}>
            {items[0]}
            {cropped(first) ? <Fade /> : null}
          </span>
        )}
      </GalleryImages>
    )
  }
  const ratios = measured
    .slice(0, Math.min(items.length, 4))
    .flatMap((size) => (size === undefined ? [] : [Math.min(Math.max(size.width / size.height, MIN_RATIO), MAX_RATIO)]))
  const tile: Tile = (index, variant, extra, style) => (
    <span key={index} className={cn(TILE, VARIANT[variant], FILL)} style={style}>
      {items[index]}
      {cropped(measured[index]) ? <Fade /> : null}
      {extra !== undefined && extra > 0 ? (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-overlay text-lg font-medium text-overlay-fg">+{extra}</span>
      ) : null}
    </span>
  )
  return (
    <GalleryImages value={viewable}>
      <div data-slot="markdown-gallery">
        <Layout count={items.length} ratios={ratios} tile={tile} />
        {items.length > 4 ? <span hidden>{items.slice(4)}</span> : null}
      </div>
    </GalleryImages>
  )
}

export function ImageGallery({ images, className }: { images: readonly ViewedImage[]; className?: string }) {
  return (
    <div data-component="markdown" data-gallery="" className={className}>
      <MarkdownGallery>
        {images.map((image) => (
          <MarkdownImage key={image.src} src={image.src} alt={image.alt} />
        ))}
      </MarkdownGallery>
    </div>
  )
}
