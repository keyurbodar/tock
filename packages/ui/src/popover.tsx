import {
  Popover as PopoverRoot,
  PopoverContent as PopoverContentPart,
  PopoverTrigger as PopoverTriggerPart,
} from "@ui-sdk/react/popover"
import type { ComponentProps } from "react"
import { cn } from "./cn"
import { POPUP } from "./menu"

export const Popover = PopoverRoot
export const PopoverTrigger = PopoverTriggerPart

export function PopoverContent({ className, ...props }: ComponentProps<typeof PopoverContentPart>) {
  return (
    <PopoverContentPart
      sideOffset={4}
      className={cn(POPUP, "flex max-h-(--available-height) w-80 flex-col", className)}
      {...props}
    />
  )
}
