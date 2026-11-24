import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import type { ComponentProps } from "react"
import { buttonVariants } from "./button"
import { cn } from "./cn"
import { glyphs } from "./glyph"

const OVERLAY =
  "fixed inset-0 z-(--z-dialog) bg-overlay transition-opacity duration-base ease-out data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 data-[ending-style]:duration-fast"

const CONTENT =
  "relative flex w-full max-w-lg flex-col overflow-y-auto rounded-(--radius-panel) border-[0.5px] border-border-2 bg-popover text-left shadow-overlay [--table-lead-bg:var(--popover)] outline-none transition-[opacity,scale] duration-base ease-out-quint data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[ending-style]:duration-fast"

const PASSWORD_MANAGER_TAGS = ["com-1password-", "bitwarden-", "lpform-", "dashlanefr-", "protonpass-"]
const PASSWORD_MANAGER_FIELDS = ["keepassxc-username-field", "keepassxc-password-field"]
const PASSWORD_MANAGER_MARKS =
  "[data-com-onepassword-filled], [data-1p-ignore], [data-lastpass-icon-root], [data-dashlane-rid], [data-protonpass-form], [data-keepassxc-id]"

function fromPasswordManager(target: EventTarget | null) {
  if (!(target instanceof Element)) return false
  const tag = target.tagName.toLowerCase()
  return (
    PASSWORD_MANAGER_TAGS.some((prefix) => tag.startsWith(prefix)) ||
    PASSWORD_MANAGER_FIELDS.includes(tag) ||
    target.closest(PASSWORD_MANAGER_MARKS) !== null
  )
}

export function Dialog({ onOpenChange, ...props }: ComponentProps<typeof DialogPrimitive.Root>) {
  return (
    <DialogPrimitive.Root
      onOpenChange={(open, details) => {
        if (!open && details.reason === "outside-press" && fromPasswordManager(details.event.target)) details.cancel()
        else onOpenChange?.(open, details)
      }}
      {...props}
    />
  )
}

export function DialogTrigger(props: ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

export function DialogClose(props: ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

export function DialogContent({ className, ...props }: ComponentProps<typeof DialogPrimitive.Popup>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop data-slot="dialog-overlay" className={OVERLAY} />
      <div className="fixed inset-0 z-(--z-dialog) flex h-dvh items-center justify-center px-4 pt-[calc(1rem+var(--safe-top))] pb-[calc(1rem+var(--safe-bottom))]">
        <DialogPrimitive.Popup data-slot="dialog-content" className={cn(CONTENT, "max-h-full", className)} {...props} />
      </div>
    </DialogPrimitive.Portal>
  )
}

export function DialogHeader({ className, children, ...props }: ComponentProps<"div">) {
  return (
    <div data-slot="dialog-header" className={cn("grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 px-5 pt-4", className)} {...props}>
      {children}
      <DialogPrimitive.Close
        data-slot="dialog-close"
        className={cn(
          buttonVariants({ variant: "ghost", size: "icon-sm" }),
          "col-start-2 row-start-1 -mt-0.5 -mr-1.5 cursor-pointer self-start justify-self-end text-icon-muted",
        )}
      >
        {glyphs.close}
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </div>
  )
}

export function DialogTitle({ className, size = "base", ...props }: ComponentProps<typeof DialogPrimitive.Title> & { size?: "base" | "lg" }) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("col-start-1 row-start-1 self-center text-balance font-medium text-foreground", size === "lg" ? "text-xl" : "text-base", className)}
      {...props}
    />
  )
}

export function DialogDescription({ className, ...props }: ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "col-span-full row-start-2 mt-1 text-pretty text-sm text-muted-foreground-2",
        "*:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className,
      )}
      {...props}
    />
  )
}

export function DialogBody({ className, spacing = "base", ...props }: ComponentProps<"div"> & { spacing?: "base" | "relaxed" }) {
  return <div data-slot="dialog-body" className={cn("flex flex-col px-5", spacing === "relaxed" ? "gap-4 py-5" : "gap-3 py-4", className)} {...props} />
}

export function DialogFooter({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="dialog-footer" className={cn("flex flex-row justify-end gap-2 px-5 pb-4", className)} {...props} />
}
