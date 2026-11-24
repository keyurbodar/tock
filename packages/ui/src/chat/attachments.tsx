import { type CSSProperties, type ReactNode, useState } from "react"
import { Button } from "../button"
import { cn } from "../cn"
import { DotGrid } from "../dot-grid"
import { FileIcon } from "../file-icon"
import { ProgressRing } from "../progress-ring"

export type AttachmentStatus =
  | { readonly phase: "uploading"; readonly progress?: number }
  | { readonly phase: "ready" }
  | { readonly phase: "failed"; readonly message: string }

export interface AttachmentTileProps {
  readonly name: string
  readonly mediaType: string
  readonly size: string
  readonly status: AttachmentStatus
  readonly previewUrl?: string
  readonly onPreview?: () => void
  readonly onRemove: () => void
}

const CLOSE = (
  <svg xmlns="http://www.w3.org/2000/svg" width="24px" height="24px" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M6.5 6.5L17.5 17.5M17.5 6.5L6.5 17.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
)

const OPEN = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24px"
    height="24px"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
    className="size-(--icon-sm) shrink-0 text-icon-muted opacity-0 transition-opacity duration-fast group-hover:opacity-100 group-focus-visible:opacity-100"
  >
    <path
      d="M9 6H8.8C7.11984 6 6.27976 6 5.63803 6.32698C5.07354 6.6146 4.6146 7.07354 4.32698 7.63803C4 8.27976 4 9.11984 4 10.8V15.2C4 16.8802 4 17.7202 4.32698 18.362C4.6146 18.9265 5.07354 19.3854 5.63803 19.673C6.27976 20 7.11984 20 8.8 20H13.2C14.8802 20 15.7202 20 16.362 19.673C16.9265 19.3854 17.3854 18.9265 17.673 18.362C18 17.7202 18 16.8802 18 15.2V15"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M14 4H20M20 4V10M20 4L11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const THUMB = "relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-(--radius) bg-secondary text-icon-muted"
const CARD =
  "group flex h-12 w-60 max-w-full cursor-pointer items-center gap-2 rounded-(--radius-card) border-[0.5px] border-border-2 bg-button py-1.5 pr-2 pl-1.5 text-left shadow-plate transition-colors duration-fast hover:bg-button-hover focus-visible:outline-ring-inset"

const kind = (name: string, mediaType: string) =>
  (name.includes(".") ? name.split(".").at(-1)?.toUpperCase() : undefined) || mediaType.split("/").at(-1) || "file"

const detail = (name: string, mediaType: string, status: AttachmentStatus) => {
  if (status.phase === "failed") return status.message
  if (status.phase === "ready") return kind(name, mediaType)
  if (status.progress === undefined) return "Preparing"
  return status.progress === 100 ? "Finishing" : `${status.progress}%`
}

function Thumb({ name, status, previewUrl }: Pick<AttachmentTileProps, "name" | "status" | "previewUrl">) {
  if (status.phase === "uploading") {
    return status.progress === undefined || status.progress === 100 ? (
      <DotGrid
        size="base"
        role="status"
        tone={false}
        label={`${status.progress === 100 ? "Finishing" : "Preparing"} upload: ${name}`}
      />
    ) : (
      <ProgressRing value={status.progress} label={`Uploading ${name}`} />
    )
  }
  return previewUrl === undefined ? (
    <FileIcon name={name} className="size-(--icon-base)" />
  ) : (
    <img crossOrigin="anonymous" src={previewUrl} alt={name} className="size-full object-cover" />
  )
}

export function AttachmentTile({ name, mediaType, size, status, previewUrl, onPreview, onRemove }: AttachmentTileProps) {
  const body = (
    <>
      <span className={THUMB}>
        <Thumb name={name} status={status} previewUrl={previewUrl} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="mask-fade-r overflow-hidden text-sm font-medium whitespace-nowrap [--mask-fade-ramp:8px]">{name}</span>
        <span
          title={status.phase === "failed" ? status.message : undefined}
          className={cn("truncate text-2xs tabular-nums", status.phase === "failed" ? "text-destructive" : "text-muted-foreground-2")}
        >
          {size} · {detail(name, mediaType, status)}
        </span>
      </span>
    </>
  )
  const tile = (
    <div className="flex h-12 w-60 max-w-full items-center gap-2 rounded-(--radius-card) border-[0.5px] border-border-2 bg-button py-1.5 pr-1 pl-1.5 shadow-plate">
      {onPreview === undefined ? (
        <div className="flex min-w-0 flex-1 items-center gap-2 text-left">{body}</div>
      ) : (
        <button
          type="button"
          aria-label={`Preview ${name}`}
          onClick={onPreview}
          className="flex min-w-0 flex-1 items-center gap-2 text-left cursor-zoom-in rounded-(--radius) outline-none focus-visible:outline-ring-inset"
        >
          {body}
        </button>
      )}
      <Button variant="ghost" size="icon-xs" aria-label={`Remove ${name}`} className="shrink-0" onClick={onRemove}>
        {CLOSE}
      </Button>
    </div>
  )
  return onPreview === undefined ? (
    tile
  ) : (
    <span className="contents" data-slot="context-menu-trigger">
      {tile}
    </span>
  )
}

export function AttachmentStrip({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-1.5 pt-2">{children}</div>
}

export interface SentAttachmentProps {
  readonly name: string
  readonly mediaType: string
  readonly size: string
  readonly previewUrl?: string
  readonly onOpen: () => void
}

function SentThumb({ name, previewUrl }: { name: string; previewUrl: string }) {
  const [phase, setPhase] = useState<"loading" | "loaded" | "failed">("loading")
  if (phase === "failed") return <FileIcon name={name} className="size-(--icon-base)" />
  return (
    <>
      {phase === "loading" ? (
        <div
          className="shimmer-surface shimmer-surface-motion-safe rounded absolute inset-0"
          style={{ "--shimmer-surface-base": "var(--card-hover)", "--shimmer-surface-gradient": "var(--gradient-skeleton)" } as CSSProperties}
        />
      ) : null}
      <img
        src={previewUrl}
        crossOrigin="anonymous"
        alt={name}
        className={cn("size-full object-cover", phase === "loading" && "opacity-0")}
        loading="lazy"
        onLoad={() => setPhase("loaded")}
        onError={() => setPhase("failed")}
      />
    </>
  )
}

export function SentAttachment({ name, mediaType, size, previewUrl, onOpen }: SentAttachmentProps) {
  const card = (
    <button type="button" aria-label={`${previewUrl === undefined ? "Open" : "Preview"} ${name}`} onClick={onOpen} className={CARD}>
      <span className={THUMB}>
        {previewUrl === undefined ? <FileIcon name={name} className="size-(--icon-base)" /> : <SentThumb name={name} previewUrl={previewUrl} />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="mask-fade-r overflow-hidden text-sm font-medium whitespace-nowrap [--mask-fade-ramp:8px]">{name}</span>
        <span className="truncate text-2xs text-muted-foreground-2">
          {size} · {kind(name, mediaType)}
        </span>
      </span>
      {OPEN}
    </button>
  )
  return previewUrl === undefined ? (
    card
  ) : (
    <span className="contents" data-slot="context-menu-trigger">
      {card}
    </span>
  )
}

export function SentAttachments({ align = "start", children }: { align?: "start" | "end"; children: ReactNode }) {
  return <div className={cn("flex max-w-full flex-wrap gap-1.5", align === "end" && "justify-end")}>{children}</div>
}
