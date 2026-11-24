import type { CSSProperties, ReactNode } from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip"

export const SWATCH_GRID = "grid grid-cols-3 gap-4 p-4 @md:grid-cols-4 @2xl:grid-cols-6"

export function ThemePreview({ mode, theme, style }: { mode: "light" | "dark"; theme: string; style?: CSSProperties }) {
  return (
    <span
      aria-hidden="true"
      data-color-theme={theme}
      data-theme-preview={mode}
      style={style}
      className={`${mode === "dark" ? "dark " : ""}relative flex h-full w-full bg-(--bg)`}
    >
      <span className="flex w-[22%] shrink-0 flex-col px-[3.5%] pt-[9%]">
        <span className="h-[9%] w-full rounded-sm bg-(--secondary)" />
      </span>
      <span className="my-[5%] mr-[4%] flex min-w-0 flex-1 flex-col justify-between rounded border-[0.5px] border-(--border-1) bg-(--panel) p-[6%]">
        <span className="flex flex-col gap-0.5">
          <span className="h-1.5 w-[42%] self-end rounded-sm bg-(--secondary)" />
          <span className="mt-0.5 h-0.5 w-[72%] rounded-full bg-(--muted-foreground-3)" />
          <span className="h-0.5 w-[48%] rounded-full bg-(--muted-foreground-3)" />
        </span>
        <span className="flex h-[26%] items-center justify-end rounded border-[0.5px] border-(--border-2) bg-(--card) pr-[4%]">
          <span className="size-1.5 shrink-0 rounded-(--radius-inner) bg-(--primary)" />
        </span>
      </span>
    </span>
  )
}

export function SwatchChoice({
  label,
  checked,
  onSelect,
  children,
}: {
  label: string
  checked: boolean
  onSelect: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      aria-label={label}
      onClick={onSelect}
      className="group flex min-w-0 cursor-pointer flex-col items-center gap-2 outline-none disabled:pointer-events-none disabled:opacity-55"
    >
      <span className="relative block aspect-[3/2] w-full overflow-hidden rounded-(--radius-card) border-[0.5px] border-border-2 group-focus-visible:outline-ring-inset group-aria-checked:border-primary">
        {children}
      </span>
      <span className="max-w-full truncate text-xs text-muted-foreground-1 group-aria-checked:font-medium group-aria-checked:text-foreground">
        {label}
      </span>
    </button>
  )
}

export function ModeButton({
  label,
  pressed,
  onSelect,
  children,
}: {
  label: string
  pressed: boolean
  onSelect: () => void
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={label}
            aria-pressed={pressed}
            onClick={onSelect}
            className="relative block aspect-[4/3] w-20 min-w-0 shrink cursor-pointer overflow-hidden rounded-(--radius-card) border-[0.5px] border-border-2 outline-none disabled:pointer-events-none disabled:opacity-55 focus-visible:outline-ring-inset aria-pressed:border-primary"
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

export function SplitPreview({ light, dark }: { light: ReactNode; dark: ReactNode }) {
  return (
    <>
      <span className="absolute inset-0 [clip-path:inset(0_50%_0_0)]">{light}</span>
      <span className="absolute inset-0 [clip-path:inset(0_0_0_50%)]">{dark}</span>
    </>
  )
}
