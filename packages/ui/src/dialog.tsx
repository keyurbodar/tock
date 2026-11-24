import {
  Dialog as DialogRoot,
  DialogBackdrop,
  DialogClose as DialogClosePart,
  DialogContent as DialogContentPart,
  DialogDescription as DialogDescriptionPart,
  DialogTitle as DialogTitlePart,
  DialogTrigger as DialogTriggerPart,
} from "@ui-sdk/react/dialog"
import type { ComponentProps, ReactNode } from "react"
import { cn } from "./cn"

export const Dialog = DialogRoot
export const DialogTrigger = DialogTriggerPart
export const DialogClose = DialogClosePart

const BACKDROP =
  "fixed inset-0 z-(--z-dialog) bg-overlay transition-opacity duration-fast ease-out-quint data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 data-[ending-style]:duration-[120ms] motion-reduce:transition-none"

const CONTENT =
  "fixed top-1/2 left-1/2 z-(--z-dialog) flex max-h-[min(85dvh,640px)] w-[min(calc(100vw-2rem),28rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-clip rounded-(--radius-overlay) border-[0.5px] border-border-2 bg-popover text-foreground shadow-sheet outline-none transition-[opacity,scale] duration-fast ease-out-quint data-[starting-style]:scale-[0.97] data-[starting-style]:opacity-0 data-[ending-style]:scale-[0.97] data-[ending-style]:opacity-0 data-[ending-style]:duration-[120ms] motion-reduce:transition-none"

export function DialogContent({ className, children, ...props }: ComponentProps<typeof DialogContentPart>) {
  return (
    <>
      <DialogBackdrop className={BACKDROP} />
      <DialogContentPart className={cn(CONTENT, className)} {...props}>
        {children}
      </DialogContentPart>
    </>
  )
}

export function DialogHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-col gap-1 px-4 pt-4 pb-3">
      <DialogTitlePart className="text-base font-medium text-foreground">{title}</DialogTitlePart>
      {description ? (
        <DialogDescriptionPart className="text-sm font-normal text-muted-foreground-2">{description}</DialogDescriptionPart>
      ) : null}
    </div>
  )
}

export function DialogBody({ children }: { children: ReactNode }) {
  return <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4">{children}</div>
}

export function DialogFooter({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-end gap-2 border-t-[0.5px] border-border-1 px-4 py-3">{children}</div>
  )
}
