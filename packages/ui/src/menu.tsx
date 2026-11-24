import {
  Menu as MenuRoot,
  MenuContent as MenuContentPart,
  MenuItem as MenuItemPart,
  MenuTrigger as MenuTriggerPart,
} from "@ui-sdk/react/menu"
import type { ComponentProps } from "react"
import { cn } from "./cn"

export const POPUP =
  "z-(--z-overlay-content) origin-(--transform-origin) rounded-(--radius-overlay) border-[0.5px] border-border-2 bg-popover p-1 text-foreground shadow-overlay outline-none transition-[opacity,scale] duration-fast ease-out-quint data-[starting-style]:scale-[0.97] data-[starting-style]:opacity-0 data-[ending-style]:scale-[0.97] data-[ending-style]:opacity-0 data-[ending-style]:duration-[120ms] motion-reduce:transition-none"

export const MENU_ROW =
  "relative flex h-(--h-menu-row) w-full min-w-0 cursor-pointer items-center gap-2 rounded px-2 text-left text-sm font-normal text-foreground outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-[var(--menu-row-highlight,var(--popover-hover))] [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-(--icon-sm)"

export const MENU_LABEL = "mt-1 flex min-h-[22px] items-center px-2 text-xs font-medium text-muted-foreground-2 first:mt-0"

export const Menu = MenuRoot
export const MenuTrigger = MenuTriggerPart

export function MenuContent({ className, ...props }: ComponentProps<typeof MenuContentPart>) {
  return (
    <MenuContentPart
      sideOffset={4}
      className={cn(POPUP, "flex max-h-[min(60dvh,var(--available-height))] min-w-32 flex-col overflow-hidden", className)}
      {...props}
    />
  )
}

export function MenuItem({
  className,
  danger,
  ...props
}: ComponentProps<typeof MenuItemPart> & { danger?: boolean }) {
  return (
    <MenuItemPart
      className={cn(MENU_ROW, danger && "text-destructive [--menu-row-highlight:var(--destructive-soft)]", className)}
      {...props}
    />
  )
}

export function MenuSeparator() {
  return <div data-slot="menu-separator" className="-mx-1 my-1 h-px shrink-0 bg-border-1" />
}

export function MenuLabel({ children }: { children: string }) {
  return <div className={MENU_LABEL}>{children}</div>
}
