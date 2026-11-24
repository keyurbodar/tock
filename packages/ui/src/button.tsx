import { cva, type VariantProps } from "class-variance-authority"
import type { ComponentProps } from "react"
import { cn } from "./cn"

const SELECTED = "data-[selected]:bg-secondary data-[selected]:text-foreground"
const QUIET_SELECTED =
  "data-[popup-open]:text-[var(--intent-text-hover,var(--fg))] data-[selected]:bg-secondary data-[selected]:data-[unfocused]:bg-secondary/50 data-[selected]:data-[unfocused]:hover:bg-secondary data-[selected]:data-[unfocused]:hover:text-foreground data-[selected]:data-[unfocused]:text-muted-foreground-1 data-[selected]:text-foreground"

export const buttonVariants = cva(
  "group/button relative inline-flex shrink-0 cursor-pointer items-center justify-center rounded border-[0.5px] font-medium text-nowrap whitespace-nowrap outline-none select-none [text-box-trim:trim-both] transition-colors duration-100 focus-visible:outline-ring-inset disabled:pointer-events-none disabled:cursor-not-allowed pointer-coarse:after:absolute pointer-coarse:after:top-1/2 pointer-coarse:after:left-1/2 pointer-coarse:after:size-full pointer-coarse:after:min-h-11 pointer-coarse:after:min-w-11 pointer-coarse:after:-translate-x-1/2 pointer-coarse:after:-translate-y-1/2 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        ghost: `border-transparent bg-transparent text-[var(--intent-text,var(--muted-foreground-1))] hover:bg-[var(--intent-bg-hover,var(--secondary))] hover:text-[var(--intent-text-hover,var(--fg))] active:brightness-97 disabled:opacity-55 ${QUIET_SELECTED}`,
        soft: `border-transparent bg-[var(--intent-bg-soft,var(--secondary))] text-[var(--intent-text,var(--fg))] hover:bg-[var(--intent-bg-soft-hover,var(--secondary-hover))] active:brightness-97 disabled:opacity-55 ${SELECTED}`,
        outline: `border-[var(--intent-border,var(--border-2))] bg-transparent text-[var(--intent-text,var(--fg))] hover:bg-[var(--intent-bg-hover,var(--secondary))] active:brightness-97 disabled:opacity-55 ${SELECTED}`,
        solid: `border-[var(--intent-border-solid,var(--intent-border,var(--border-2)))] bg-[var(--intent-bg,var(--button))] text-[var(--intent-text-on-bg,var(--fg))] shadow-[inset_0_1px_var(--intent-highlight,var(--highlight-top)),var(--sh-plate)] [--focus-ring:var(--intent-text-on-bg,var(--ring))] hover:bg-[var(--intent-bg-solid-hover,var(--button-hover))] active:shadow-none active:brightness-97 disabled:opacity-55 ${SELECTED}`,
        inverse:
          "border-transparent bg-[var(--intent-bg,var(--inverse))] text-[var(--intent-text-on-bg,var(--inverse-text))] hover:bg-[var(--intent-bg-solid-hover,var(--inverse-hover))] active:brightness-95 disabled:opacity-50 data-[selected]:bg-[var(--intent-bg,var(--inverse))] data-[selected]:text-[var(--intent-text-on-bg,var(--inverse-text))]",
        link: `border-transparent bg-transparent text-[var(--intent-text,var(--text-link))] underline-offset-2 hover:underline disabled:opacity-40 ${SELECTED}`,
        segment:
          "border-transparent bg-transparent text-[var(--intent-text,var(--segmented-foreground))] hover:text-[var(--intent-text-hover,var(--fg))] active:brightness-97 disabled:opacity-55 data-[selected]:bg-[var(--intent-bg,var(--card))] data-[selected]:text-[var(--intent-text-hover,var(--fg))] data-[selected]:shadow-card",
        bare: "border-transparent bg-transparent text-[var(--intent-text,var(--muted-foreground-1))] hover:text-[var(--intent-text-hover,var(--fg))] active:brightness-97 disabled:opacity-40 data-[popup-open]:text-[var(--intent-text-hover,var(--fg))] data-[selected]:bg-transparent data-[selected]:text-[var(--intent-text-hover,var(--fg))]",
      },
      intent: {
        none: "",
        accent:
          "[--intent-bg-hover:var(--primary-soft)] [--intent-bg-soft-hover:var(--primary-soft-hover)] [--intent-bg-soft:var(--primary-soft)] [--intent-bg-solid-hover:color-mix(in_oklch,var(--primary)_92%,black)] [--intent-bg:var(--primary)] [--intent-border-solid:color-mix(in_oklch,var(--primary)_80%,black)] [--intent-border:var(--border-2)] [--intent-highlight:oklch(1_0_0_/_0.12)] [--intent-text-hover:var(--primary-ink)] [--intent-text-on-bg:var(--primary-text)] [--intent-text:var(--primary-ink)]",
        destructive:
          "[--intent-bg-hover:var(--destructive-soft)] [--intent-bg-soft-hover:var(--destructive-soft-hover)] [--intent-bg-soft:var(--destructive-soft)] [--intent-bg-solid-hover:color-mix(in_oklch,var(--destructive)_92%,white)] [--intent-bg:var(--destructive)] [--intent-border-solid:color-mix(in_oklch,var(--destructive)_80%,black)] [--intent-border:var(--border-2)] [--intent-highlight:oklch(1_0_0_/_0.12)] [--intent-text-hover:var(--destructive)] [--intent-text-on-bg:var(--destructive-text)] [--intent-text:var(--destructive)]",
      },
      size: {
        xs: "h-(--h-control-xs) w-fit gap-1.5 px-2 text-xs [&_svg:first-of-type]:-ml-0.5 [&_svg:last-of-type]:-mr-0.5 [&_svg:not([class*='size-'])]:size-(--icon-xs)",
        sm: "h-(--h-control-sm) w-fit gap-1.5 px-2.5 text-xs md:px-2 [&_svg:first-of-type]:-ml-0.5 [&_svg:last-of-type]:-mr-0.5 [&_svg:not([class*='size-'])]:size-(--icon-sm)",
        base: "h-(--h-control-base) w-fit gap-2 px-3 text-sm md:px-2.5 [&_svg:first-of-type]:-ml-0.5 [&_svg:last-of-type]:-mr-0.5 [&_svg:not([class*='size-'])]:size-(--icon-base)",
        lg: "h-(--h-control-lg) w-fit gap-2 px-4 text-sm [&_svg:first-of-type]:-ml-0.5 [&_svg:last-of-type]:-mr-0.5 [&_svg:not([class*='size-'])]:size-(--icon-base)",
        "icon-xs": "size-(--h-control-xs) [&_svg:not([class*='size-'])]:size-(--icon-xs)",
        "icon-sm": "size-(--h-control-sm) [&_svg:not([class*='size-'])]:size-(--icon-sm)",
        "icon-base": "size-(--h-control-base) [&_svg:not([class*='size-'])]:size-(--icon-base)",
        inline: "w-fit p-1 [&_svg:not([class*='size-'])]:size-(--icon-sm)",
      },
    },
    defaultVariants: { variant: "ghost", intent: "none", size: "sm" },
  },
)

export type ButtonVariants = VariantProps<typeof buttonVariants>

export function Button({
  variant,
  intent,
  size,
  selected,
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & ButtonVariants & { selected?: boolean }) {
  return (
    <button
      type={type}
      data-slot="button"
      data-selected={selected ? "" : undefined}
      className={cn(buttonVariants({ variant, intent, size }), className)}
      {...props}
    />
  )
}
