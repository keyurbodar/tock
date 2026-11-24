import { useState, type ComponentProps } from "react"
import { cn } from "./cn"
import { MENU_LABEL, Menu, MenuCheck, MenuContent, MenuItem, MenuRule, MenuSearch, MenuTrigger } from "./menu"

const TRIGGER =
  "cursor-pointer relative inline-flex items-center shrink-0 whitespace-nowrap rounded [text-box-trim:trim-both] text-nowrap border-[0.5px] font-medium transition-colors duration-100 outline-none select-none focus-visible:outline-ring-inset pointer-coarse:after:absolute pointer-coarse:after:top-1/2 pointer-coarse:after:left-1/2 pointer-coarse:after:size-full pointer-coarse:after:min-h-11 pointer-coarse:after:min-w-11 pointer-coarse:after:-translate-x-1/2 pointer-coarse:after:-translate-y-1/2 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-55 [&_svg]:pointer-events-none [&_svg]:shrink-0 data-[selected]:bg-secondary data-[selected]:text-foreground group/button bg-[var(--intent-bg,var(--button))] border-[var(--intent-border-solid,var(--intent-border,var(--border-2)))] text-[var(--intent-text-on-bg,var(--fg))] [--focus-ring:var(--intent-text-on-bg,var(--ring))] shadow-[inset_0_1px_var(--intent-highlight,var(--highlight-top)),var(--sh-plate)] hover:bg-[var(--intent-bg-solid-hover,var(--button-hover))] active:shadow-none active:brightness-97 h-(--h-control-sm) px-2.5 md:px-2 text-xs gap-1.5 [&_svg:not([class*='size-'])]:size-(--icon-sm) [&_svg:first-of-type]:-ml-0.5 [&_svg:last-of-type]:-mr-0.5 justify-between data-[placeholder]:text-muted-foreground-3"

export function MenuSelectButton({ className, children, ...props }: ComponentProps<"button">) {
  return (
    <button type="button" {...props} data-slot="menu-select-trigger" className={cn(TRIGGER, className)}>
      <span data-slot="menu-select-value">{children}</span>
      <span aria-hidden="true">
        <svg xmlns="http://www.w3.org/2000/svg" width="24px" height="24px" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="size-(--icon-sm) shrink-0 text-muted-foreground-3">
          <path d="M8 10L10.9393 12.9393C11.5251 13.5251 12.4749 13.5251 13.0607 12.9393L16 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </button>
  )
}

export function MenuSelect<T extends string>({
  value,
  options,
  onChange,
  placeholder,
  searchLabel,
  className,
  label: name,
}: {
  label?: string
  value: T | null
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
  placeholder?: string
  searchLabel?: string
  className?: string
}) {
  const [query, setQuery] = useState("")
  const needle = query.trim().toLowerCase()
  const label = options.find((option) => option.value === value)?.label
  return (
    <Menu onOpenChange={(open) => (open ? undefined : setQuery(""))}>
      <MenuTrigger render={<MenuSelectButton aria-label={name} className={className} data-placeholder={label === undefined ? "" : undefined} />}>
        {label ?? placeholder}
      </MenuTrigger>
      <MenuContent align="start" className={className}>
        {searchLabel ? (
          <>
            <MenuSearch label={searchLabel} value={query} onValueChange={setQuery} />
            <MenuRule />
          </>
        ) : null}
        {options
          .filter((option) => option.label.toLowerCase().includes(needle))
          .map((option) => (
            <MenuItem key={option.value} onSelect={() => onChange(option.value)}>
              <span className={MENU_LABEL}>{option.label}</span>
              {option.value === value ? <MenuCheck /> : null}
            </MenuItem>
          ))}
      </MenuContent>
    </Menu>
  )
}
