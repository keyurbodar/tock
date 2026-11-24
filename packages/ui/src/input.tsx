import type { ComponentProps, ReactNode } from "react"
import { cn } from "./cn"

const FIELD =
  "min-w-0 rounded text-sm font-normal text-foreground placeholder:text-muted-foreground-3 selection:bg-primary-20 outline-none disabled:cursor-not-allowed disabled:opacity-55 aria-invalid:border-destructive bg-input border-[0.5px] border-border-2 focus-visible:outline-ring-inset"

const INPUT_SIZE = {
  sm: { field: "h-(--h-control-sm) px-2", inset: "pl-7", icon: "left-2" },
  base: { field: "h-(--h-control-base) px-2.5", inset: "pl-8", icon: "left-2.5" },
}

export function Input({
  className,
  icon,
  size = "base",
  ...props
}: Omit<ComponentProps<"input">, "size"> & { icon?: ReactNode; size?: keyof typeof INPUT_SIZE }) {
  const sized = INPUT_SIZE[size]
  if (icon === undefined) return <input data-slot="input" className={cn("w-full", FIELD, sized.field, className)} {...props} />
  return (
    <span data-slot="input-group" className="relative inline-flex w-full">
      <span
        aria-hidden="true"
        className={cn("pointer-events-none absolute top-1/2 -translate-y-1/2 text-icon-muted [&_svg]:size-(--icon-sm)", sized.icon)}
      >
        {icon}
      </span>
      <input data-slot="input" className={cn("w-full", FIELD, sized.field, sized.inset, className)} {...props} />
    </span>
  )
}

export function Textarea({ className, mono, ...props }: ComponentProps<"textarea"> & { mono?: boolean }) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "w-full min-w-0 resize-none text-foreground outline-none selection:bg-primary-20 placeholder:text-muted-foreground-3 disabled:cursor-not-allowed disabled:opacity-55 aria-invalid:border-destructive rounded bg-input px-2.5 text-sm font-normal border-[0.5px] border-border-2 focus-visible:outline-ring-inset field-sizing-content min-h-(--h-control-base) py-[calc((var(--h-control-base)-1lh-1px)/2)]",
        mono && "font-mono text-xs",
        className,
      )}
      {...props}
    />
  )
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn("flex w-fit select-none items-center gap-1.5 text-sm font-medium text-foreground", className)}
      {...props}
    />
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
      {hint ? <p className="text-xs font-normal text-muted-foreground-2">{hint}</p> : null}
    </div>
  )
}

const BADGE =
  "inline-flex items-center justify-center w-fit min-w-8 rounded-full text-xs font-normal [text-box-trim:trim-both] [&_svg]:shrink-0 border-[0.5px] border-(--border-2) bg-(--button) text-[var(--intent-text,var(--fg))]"
const BADGE_ACCENT =
  "[--intent-text:var(--primary-ink)] [--intent-text-hover:color-mix(in_oklch,var(--primary-ink)_80%,transparent)] [--intent-bg:var(--primary)] [--intent-text-on-bg:var(--primary-text)] [--intent-border-solid:color-mix(in_oklch,var(--primary)_80%,black)] [--intent-highlight:oklch(1_0_0_/_0.12)]"
const BADGE_BASE = "h-(--h-badge-base) px-2 gap-1 [&_svg:not([class*='size-'])]:size-(--icon-sm) [&_svg:first-of-type]:-ml-0.5 select-none"

const BADGE_SUCCESS =
  "[--intent-text:light-dark(var(--success),color-mix(in_oklch,var(--success)_72%,white))] [--intent-text-hover:color-mix(in_oklch,var(--success)_80%,transparent)] [--intent-bg:var(--success)] [--intent-text-on-bg:light-dark(var(--fg),var(--bg))]"

export function Badge({ children, tone, className }: { children: React.ReactNode; tone?: "accent" | "success"; className?: string }) {
  return (
    <div
      data-slot="badge"
      className={cn(BADGE, tone === "accent" && BADGE_ACCENT, tone === "success" && BADGE_SUCCESS, BADGE_BASE, className)}
    >
      {children}
    </div>
  )
}
