import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"
import type { ComponentProps, ReactNode } from "react"
import { cn } from "./cn"
import { Kbd } from "./kbd"

const CONTENT =
  "w-fit max-w-xs rounded bg-popover border-[0.5px] border-border-2 shadow-overlay px-2 py-1 text-xs font-medium text-balance text-foreground data-[open]:animate-tooltip-in data-[closed]:animate-tooltip-out data-[instant]:animate-none"

export const TooltipProvider = TooltipPrimitive.Provider
export const Tooltip = TooltipPrimitive.Root

export function TooltipTrigger(props: ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

type Position = Pick<
  ComponentProps<typeof TooltipPrimitive.Positioner>,
  "side" | "align" | "sideOffset" | "alignOffset" | "collisionPadding" | "anchor"
>

export function TooltipContent({
  className,
  side,
  align,
  sideOffset = 4,
  alignOffset,
  collisionPadding = 12,
  anchor,
  shortcut,
  children,
  ...props
}: Omit<ComponentProps<typeof TooltipPrimitive.Popup>, "className"> & Position & { className?: string; shortcut?: ReactNode }) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        side={side}
        align={align}
        sideOffset={sideOffset}
        alignOffset={alignOffset}
        collisionPadding={collisionPadding}
        anchor={anchor}
        className="z-(--z-tooltip) outline-none"
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(CONTENT, shortcut != null && "flex items-center gap-1.5", className)}
          {...props}
        >
          {shortcut == null ? children : <span className="min-w-0">{children}</span>}
          {shortcut == null ? null : (
            <Kbd variant="chip" className="-mr-0.5 shrink-0 whitespace-nowrap">
              {shortcut}
            </Kbd>
          )}
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  )
}
