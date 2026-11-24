import type { ComponentProps } from "react"
import { cn } from "./cn"

const FIELD =
  "min-w-0 rounded border-[0.5px] border-border-2 bg-input text-sm font-normal text-foreground outline-none selection:bg-primary-20 placeholder:text-muted-foreground-3 focus-visible:outline-ring-inset disabled:cursor-not-allowed disabled:opacity-55 aria-invalid:border-destructive"

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input data-slot="input" className={cn(FIELD, "h-(--h-control-base) px-2.5", className)} {...props} />
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
