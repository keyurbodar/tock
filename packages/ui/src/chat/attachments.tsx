import type { ReactNode } from "react"
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
      <span className="relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-(--radius) bg-secondary text-icon-muted">
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
