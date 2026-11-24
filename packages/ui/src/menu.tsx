import {
  Menu as MenuRoot,
  MenuContent as MenuContentPart,
  MenuItem as MenuItemPart,
  MenuTrigger as MenuTriggerPart,
} from "@ui-sdk/react/menu"
import { useEffect, useRef, type ComponentProps, type ReactNode } from "react"
import { cn } from "./cn"

export const POPUP =
  "z-(--z-overlay-content) origin-(--transform-origin) rounded-(--radius-overlay) border-[0.5px] border-border-2 bg-popover p-1 text-foreground shadow-overlay outline-none transition-[opacity,scale] duration-fast ease-out-quint data-[starting-style]:scale-[0.97] data-[starting-style]:opacity-0 data-[ending-style]:scale-[0.97] data-[ending-style]:opacity-0 data-[ending-style]:duration-[120ms] motion-reduce:transition-none"

export const MENU_CONTENT =
  "rounded-(--radius-overlay) border-[0.5px] border-border-2 bg-popover p-1 text-foreground shadow-overlay flex min-w-32 flex-col overflow-hidden origin-(--transform-origin) outline-none transition-[opacity,scale] duration-fast ease-out-quint data-[starting-style]:scale-[0.97] data-[starting-style]:opacity-0 data-[ending-style]:scale-[0.97] data-[ending-style]:opacity-0 data-[ending-style]:duration-[120ms] data-[instant]:transition-none max-h-[min(60dvh,var(--available-height))]"

export const MENU_ITEM =
  "relative flex w-full min-w-0 cursor-pointer items-center gap-2 rounded px-2 text-left text-sm font-normal outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-(--icon-sm) h-(--h-menu-row) data-[highlighted]:bg-[var(--menu-row-highlight,var(--popover-hover))] data-[popup-open]:bg-[var(--menu-row-highlight,var(--popover-hover))]"

const TONE = {
  plain: "text-foreground",
  danger: "text-destructive [--menu-row-highlight:var(--destructive-soft)]",
}

export const menuItemClass = (danger = false) => `${MENU_ITEM} ${danger ? TONE.danger : TONE.plain}`

export const Menu = MenuRoot
export const MenuTrigger = MenuTriggerPart

export function MenuList({ children }: { children: ReactNode }) {
  return (
    <div role="presentation" data-menu-list="true" className="-m-1 min-h-0 overflow-x-hidden overflow-y-auto p-1 md:scroll-fade-y">
      <div
        data-slot="responsive-menu-level"
        data-menu-list="true"
        className="flex flex-col transition-[opacity,translate] duration-fast ease-out-quint data-[nav=push]:starting:translate-x-2 data-[nav=push]:starting:opacity-0 data-[nav=pop]:starting:-translate-x-2 data-[nav=pop]:starting:opacity-0"
      >
        {children}
      </div>
      <div className="flex-col hidden" />
    </div>
  )
}

export function MenuContent({
  className,
  children,
  ...props
}: Omit<ComponentProps<typeof MenuContentPart>, "children"> & { children: ReactNode }) {
  return (
    <MenuContentPart sideOffset={4} data-slot="menu-content" className={cn(MENU_CONTENT, className)} {...props}>
      <MenuList>{children}</MenuList>
    </MenuContentPart>
  )
}

export function MenuItemBody({ icon, shortcut, children }: { icon?: ReactNode; shortcut?: string; children: ReactNode }) {
  return (
    <>
      {icon === undefined ? null : (
        <span className="flex size-(--icon-sm) shrink-0 items-center justify-center text-icon-muted in-data-[intent=danger]:text-destructive">
          {icon}
        </span>
      )}
      {shortcut === undefined ? (
        children
      ) : (
        <>
          <span className="mask-fade-r min-w-0 flex-1 overflow-hidden whitespace-nowrap">{children}</span>
          <span className="ml-auto flex shrink-0 items-center gap-1.5 text-sm font-normal text-muted-foreground-1">{shortcut}</span>
        </>
      )}
    </>
  )
}

export function MenuItem({
  className,
  danger,
  icon,
  keys,
  children,
  ...props
}: Omit<ComponentProps<typeof MenuItemPart>, "children"> & { danger?: boolean; icon?: ReactNode; keys?: string; children: ReactNode }) {
  return (
    <MenuItemPart
      data-slot="menu-item"
      data-intent={danger ? "danger" : undefined}
      className={cn(menuItemClass(danger), className)}
      {...props}
    >
      <MenuItemBody icon={icon} shortcut={keys}>
        {children}
      </MenuItemBody>
    </MenuItemPart>
  )
}

const SEPARATOR =
  "-mx-1 my-1 h-px bg-border-1 [[data-menu-list]>&:first-child]:hidden [[data-menu-list]>&:last-child]:hidden [[data-slot=menu-separator]+&]:hidden"

export function MenuSeparator() {
  return <div role="separator" data-orientation="horizontal" aria-orientation="horizontal" data-slot="menu-separator" className={SEPARATOR} />
}

export function MenuRule() {
  return <div data-slot="menu-separator" className={`${SEPARATOR} shrink-0`} />
}

const itemAfter = (row: HTMLElement) =>
  [...(row.closest("[data-slot=menu-content]")?.querySelectorAll<HTMLElement>("[data-slot=menu-item]:not([data-disabled])") ?? [])].find(
    (item) => (row.compareDocumentPosition(item) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
  )

export function MenuSearch({ label, value, onValueChange }: { label: string; value: string; onValueChange: (value: string) => void }) {
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const frame = requestAnimationFrame(() => input.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [])
  return (
    <div
      data-slot="menu-search-row"
      className="flex shrink-0 items-center"
      onKeyDownCapture={(event) => {
        if (event.key !== "Enter" || event.nativeEvent.isComposing || value.trim() === "") return
        const first = itemAfter(event.currentTarget)
        if (first === undefined) return
        event.preventDefault()
        first.click()
      }}
    >
      <input
        ref={input}
        aria-label={label}
        placeholder={label}
        value={value}
        onChange={(event) => onValueChange(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key !== "Escape" && event.key !== "ArrowDown" && event.key !== "ArrowUp" && (event.key !== "ArrowLeft" || value !== ""))
            event.stopPropagation()
        }}
        className="h-(--h-menu-row) w-full min-w-0 bg-transparent px-2 text-sm font-normal text-foreground outline-none placeholder:text-muted-foreground-3"
      />
    </div>
  )
}

export function MenuCheck() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24px" height="24px" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="ml-auto size-(--icon-sm) shrink-0 text-foreground">
      <path d="M5 12.75L10 19L19 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export const MENU_LABEL = "mask-fade-r min-w-0 flex-1 overflow-hidden whitespace-nowrap"
