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
  if (icon === undefined) return <input data-slot="input" className={cn(FIELD, sized.field, className)} {...props} />
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
        FIELD,
        "field-sizing-content min-h-(--h-control-base) w-full resize-none px-2.5 py-1.5",
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
      className={cn("flex w-fit items-center gap-1.5 text-sm font-medium text-foreground select-none", className)}
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

export function Badge({ children, tone }: { children: React.ReactNode; tone?: "accent" | "destructive" }) {
  return (
    <div
      data-slot="badge"
      className={cn(
        "inline-flex h-(--h-badge-base) w-fit min-w-8 items-center justify-center gap-1 rounded-full border-[0.5px] border-(--border-2) bg-(--button) px-2 text-xs font-normal text-[var(--intent-text,var(--fg))] select-none [text-box-trim:trim-both]",
        tone === "accent" && "[--intent-text:var(--primary-ink)]",
        tone === "destructive" && "[--intent-text:var(--destructive)]",
      )}
    >
      {children}
    </div>
  )
}
