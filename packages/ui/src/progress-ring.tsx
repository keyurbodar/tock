import { cn } from "./cn"

export function ProgressRing({ value, label, className }: { value: number; label: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("size-5 text-muted-foreground-1", className)}
      role="progressbar"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <circle cx="12" cy="12" r="9" fill="none" stroke="var(--border-3)" strokeWidth="2" />
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        pathLength="100"
        strokeDasharray={`${value} 100`}
        transform="rotate(-90 12 12)"
      />
    </svg>
  )
}
