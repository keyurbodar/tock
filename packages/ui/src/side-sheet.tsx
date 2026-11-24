import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { createContext, useContext, type ComponentProps } from "react"
import { buttonVariants } from "./button"
import { cn } from "./cn"
import { Dialog } from "./dialog"
import { Drawer, DrawerContent, usePhoneLayout } from "./drawer"
import { glyphs } from "./glyph"

const Phone = createContext(false)

const OVERLAY =
  "fixed inset-0 z-(--z-dialog) bg-overlay transition-opacity duration-fast ease-out data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 data-[ending-style]:duration-[120ms]"
const CONTENT =
  "fixed inset-y-0 right-0 z-(--z-dialog) flex w-[640px] max-w-full flex-col border-l-[0.5px] border-border-1 bg-panel shadow-sheet h-dvh outline-none pt-(--safe-top) pb-(--safe-bottom) transition-[translate,opacity] duration-fast ease-out-quint data-[starting-style]:translate-x-full data-[starting-style]:opacity-0 data-[ending-style]:translate-x-full data-[ending-style]:opacity-0 data-[ending-style]:duration-[120ms]"

export function SideSheet(props: ComponentProps<typeof DialogPrimitive.Root>) {
  const phone = usePhoneLayout()
  const Root = phone ? Drawer : Dialog
  return (
    <Phone.Provider value={phone}>
      <Root {...props} />
    </Phone.Provider>
  )
}

export function SideSheetClose(props: ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="side-sheet-close" {...props} />
}

export function SideSheetContent({
  className,
  children,
  ...props
}: Omit<ComponentProps<typeof DialogPrimitive.Popup>, "className"> & { className?: string }) {
  if (useContext(Phone)) {
    return (
      <DrawerContent className={className} {...props}>
        {children}
      </DrawerContent>
    )
  }
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop data-slot="side-sheet-overlay" className={OVERLAY} />
      <DialogPrimitive.Popup data-slot="side-sheet-content" className={cn(CONTENT, className)} {...props}>
        {children}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  )
}

export function SideSheetHeader({ className, children, ...props }: ComponentProps<"div">) {
  const phone = useContext(Phone)
  return (
    <div data-slot="side-sheet-header" className={cn("grid shrink-0 grid-cols-[minmax(0,1fr)_auto] gap-x-3 px-5 pt-4", className)} {...props}>
      {children}
      {phone ? null : (
        <DialogPrimitive.Close
          data-slot="side-sheet-close"
          className={cn(
            buttonVariants({ variant: "ghost", size: "icon-sm" }),
            "col-start-2 row-start-1 -mt-0.5 -mr-1.5 cursor-pointer self-start justify-self-end text-icon-muted",
          )}
        >
          {glyphs.close}
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

export function SideSheetTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="side-sheet-title"
      className={cn("col-start-1 row-start-1 self-center text-balance text-base font-medium text-foreground", className)}
      {...props}
    />
  )
}

export function SideSheetDescription({ className, ...props }: ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="side-sheet-description"
      className={cn("col-span-full row-start-2 mt-1 text-pretty text-sm text-muted-foreground-2", className)}
      {...props}
    />
  )
}

export function SideSheetBody({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="side-sheet-body"
      className={cn("flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-5 py-4", className)}
      {...props}
    />
  )
}

export function SideSheetFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="side-sheet-footer"
      className={cn("flex shrink-0 flex-row gap-2 px-5 py-4 border-t-[0.5px] border-border-1", className)}
      {...props}
    />
  )
}

export function SideSheetActions({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex shrink-0 items-center gap-2", className)} {...props} />
}
